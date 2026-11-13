"""Puente local: PROD le encarga trabajo de IA a una máquina del equipo.

Por qué existe. Render no tiene el binario `claude` ni el servicio
`deepseek-web-chat`: viven en el PC del equipo. Y Render no puede LLAMAR a ese
PC (no tiene IP pública, y abrir un túnel expondría la máquina). Así que se hace
al revés: un trabajador en el PC (`scripts/puente_local.py`) pregunta a PROD
«¿hay algo para mí?» con una espera larga, lo resuelve con su motor local y
devuelve el resultado. Solo conexiones salientes desde el PC.

Piezas:
  · `PuenteHub` (uno por proceso, `HUB`): la cola en memoria. El backend corre
    con UN solo worker de uvicorn, así que la memoria del proceso basta; un
    encargo vive segundos o minutos, no necesita sobrevivir a un reinicio.
  · `PuenteLocalClient`: imita la forma del SDK de OpenAI (como
    `DeepSeekWebClient` y `OpenCodeCliClient`) para que `MultiModelLLM` lo trate
    como un proveedor más: mismo fallback, mismo `validar`, mismo monitor.
  · `puente_aplica()`: el puente solo entra en la cadena de quien PAGA el plan
    que lo incluye. Para los demás ni se le nombra (no es un fallo, es que no
    les toca).

Si el trabajador no está conectado, el encargo falla AL INSTANTE (no se espera
a que alguien aparezca) y la cadena sigue con la IA gratis: la construcción de
nadie depende de que el PC del equipo esté encendido.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from types import SimpleNamespace

from src.infrastructure.adapters.deepseek_web_client import componer_prompt

logger = logging.getLogger(__name__)

#: Sin un sondeo en este tiempo, el trabajador se da por desconectado. Su espera
#: larga dura ~25 s, así que 45 s deja margen para un sondeo lento.
VIVO_SI_SONDEO_HACE_SEG = 45.0

#: Motores que un trabajador puede anunciar. Lo que no esté aquí se ignora.
MOTORES_CONOCIDOS = ("claude", "deepseek")

#: Nombre legible de cada motor: es lo que se ve en el monitor.
NOMBRE_MOTOR = {"claude": "Claude Code", "deepseek": "DeepSeek"}


class PuenteError(Exception):
    """El encargo no se pudo resolver por el puente (sin trabajador, error, tiempo)."""


@dataclass
class Encargo:
    """Un trabajo pendiente para la máquina local."""

    id: str
    motor: str
    system: str
    user: str
    want_json: bool
    tipo: str = "chat"
    creado: float = field(default_factory=time.monotonic)
    listo: threading.Event = field(default_factory=threading.Event)
    contenido: str = ""
    error: str = ""
    segundos: float = 0.0

    def para_trabajador(self) -> dict:
        return {
            "id": self.id,
            "motor": self.motor,
            "tipo": self.tipo,
            "system": self.system,
            "user": self.user,
            "want_json": self.want_json,
        }


class PuenteHub:
    """Cola de encargos entre los hilos que construyen y el trabajador local."""

    def __init__(self) -> None:
        self._cond = threading.Condition()
        self._pendientes: deque[Encargo] = deque()
        self._en_curso: dict[str, Encargo] = {}
        self._ultimo_sondeo = 0.0
        self._motores: tuple[str, ...] = ()
        self._equipo = ""
        self._hechos = 0

    # --- Estado ----------------------------------------------------------
    def conectado(self, motor: str | None = None) -> bool:
        vivo = (time.monotonic() - self._ultimo_sondeo) < VIVO_SI_SONDEO_HACE_SEG
        if not vivo:
            return False
        return motor is None or motor in self._motores

    def estado(self) -> dict:
        conectado = self.conectado()
        return {
            "conectado": conectado,
            "motores": [NOMBRE_MOTOR.get(m, m) for m in self._motores] if conectado else [],
            "equipo": self._equipo if conectado else "",
            "en_cola": len(self._pendientes),
            "en_curso": len(self._en_curso),
            "resueltos": self._hechos,
        }

    # --- Lado de PROD (quien construye) -----------------------------------
    def encargar(
        self, motor: str, system: str, user: str, want_json: bool,
        espera: float, tipo: str = "chat",
    ) -> Encargo:
        """Encola un trabajo y bloquea hasta que el trabajador lo resuelva."""
        if not self.conectado(motor):
            raise PuenteError(
                f"la terminal del equipo no está conectada con {NOMBRE_MOTOR.get(motor, motor)}"
            )
        encargo = Encargo(
            id=uuid.uuid4().hex[:12], motor=motor, system=system, user=user,
            want_json=want_json, tipo=tipo,
        )
        with self._cond:
            self._pendientes.append(encargo)
            self._cond.notify_all()

        if not encargo.listo.wait(timeout=espera):
            with self._cond:
                # Si nadie lo llegó a tomar, se retira de la cola: que no lo
                # resuelva luego para nadie.
                try:
                    self._pendientes.remove(encargo)
                except ValueError:
                    pass
                self._en_curso.pop(encargo.id, None)
            raise PuenteError(f"la terminal no respondió en {espera:.0f}s")
        if encargo.error:
            raise PuenteError(encargo.error)
        return encargo

    # --- Lado del trabajador local ----------------------------------------
    def tomar(self, motores: tuple[str, ...], equipo: str, espera: float) -> Encargo | None:
        """Espera larga: devuelve el siguiente encargo que el trabajador sabe hacer."""
        fin = time.monotonic() + espera
        with self._cond:
            while True:
                self._ultimo_sondeo = time.monotonic()
                self._motores = motores
                self._equipo = equipo
                for encargo in list(self._pendientes):
                    if encargo.motor in motores:
                        self._pendientes.remove(encargo)
                        self._en_curso[encargo.id] = encargo
                        return encargo
                restante = fin - time.monotonic()
                if restante <= 0:
                    return None
                self._cond.wait(timeout=min(restante, 5.0))

    def entregar(self, encargo_id: str, contenido: str, error: str, segundos: float) -> bool:
        with self._cond:
            encargo = self._en_curso.pop(encargo_id, None)
            self._ultimo_sondeo = time.monotonic()
        if encargo is None:
            return False  # llegó tarde: quien lo pidió ya siguió con la IA gratis
        encargo.contenido = contenido or ""
        encargo.error = error or ("" if contenido else "respuesta vacía")
        encargo.segundos = segundos
        self._hechos += 1
        encargo.listo.set()
        return True


HUB = PuenteHub()


def puente_aplica() -> bool:
    """¿Le toca el puente a la construcción que está corriendo AHORA?

    Solo a los planes con experto TOTAL (Business): ahí la terminal escribe el
    proyecto. Studio la recibe por el agente experto, en los momentos difíciles,
    no en cada archivo. Sin experto en el contexto (petición anónima, pruebas),
    no aplica.
    """
    from src.application.experto_contexto import experto_actual

    servicio = experto_actual()
    return bool(servicio is not None and servicio.plan.ia_experta == "total")


class PuenteLocalClient:
    """Cliente con la forma mínima del SDK de OpenAI que usa `MultiModelLLM`."""

    def __init__(self, motor: str, espera: float, hub: PuenteHub | None = None) -> None:
        self._motor = motor
        self._espera = espera
        self._hub = hub or HUB
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, model: str, messages: list[dict], temperature: float = 0.2,
                response_format: dict | None = None, **_: object) -> SimpleNamespace:
        system = "\n\n".join(m["content"] for m in messages if m.get("role") == "system")
        user = "\n\n".join(m["content"] for m in messages if m.get("role") != "system")
        if not system:
            user = componer_prompt(messages, want_json=bool(response_format))
        encargo = self._hub.encargar(
            self._motor, system, user, want_json=bool(response_format), espera=self._espera
        )
        logger.info(
            "La terminal resolvió con %s en %.0fs.", NOMBRE_MOTOR.get(self._motor, self._motor),
            encargo.segundos,
        )
        texto = encargo.contenido
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=texto), finish_reason="stop")],
            usage=SimpleNamespace(total_tokens=(len(system) + len(user) + len(texto)) // 4),
        )
