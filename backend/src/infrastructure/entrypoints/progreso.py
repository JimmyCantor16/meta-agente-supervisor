"""Progreso de la generación EN VIVO por WebSocket.

La generación tarda minutos y hasta hoy el usuario miraba un spinner mudo.
Aquí cada log INFO relevante del pipeline (planificar, escribir, verificar,
arrancar, gate de render) se difunde a los navegadores conectados: el usuario
VE a su sistema construirse, paso a paso, en su idioma.

Diseño: la generación corre en un hilo trabajador (endpoint síncrono), así que
el handler de logging empuja a las colas asyncio de cada socket con
`call_soon_threadsafe` sobre el loop capturado al conectar. Si no hay nadie
escuchando, no cuesta nada.
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import re

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

# Solo estas fuentes hablan con el usuario (lo demás es ruido interno).
_FUENTES = (
    "src.application.generate_project",
    "src.infrastructure.adapters.iterative_project_generator",
    "src.infrastructure.adapters.instanciador_bases",
    "src.infrastructure.adapters.node_project_verifier",
    "src.infrastructure.adapters.project_verifier",
    "src.infrastructure.adapters.static_site",
    "src.infrastructure.adapters.node_project_runner",
    "src.infrastructure.adapters.validacion_navegador",
    "src.application.aplicar_ajuste",
    "src.application.mejorar_proyecto",
    "src.infrastructure.adapters.multimodel_llm",
    # El agente experto (IA de pago): quien paga tiene derecho a VER en qué
    # momento entró y qué hizo. Si no se ve, no se distingue de no tenerlo.
    "src.application.experto",
    "src.infrastructure.adapters.skeleton_generator",
)

# Los mensajes técnicos se traducen a pasos que un no-programador entiende.
_AMIGABLES = (
    (re.compile(r"clasificada como arquetipo '(\w+)'", re.I), "🧬 Tu idea calza en un sistema base «{0}»: construyendo sobre cimientos probados…"),
    (re.compile(r"Sin arquetipo claro", re.I), "🧠 Idea única: diseñando tu sistema desde cero…"),
    (re.compile(r"Plan: (\d+) archivo", re.I), "📐 Plano listo: {0} archivos por construir."),
    (re.compile(r"Escrito (\d+)/(\d+): (.+)", re.I), "✍️ Escribiendo {0} de {1}: {2}"),
    (re.compile(r"Instalando dependencias", re.I), "📦 Instalando las dependencias del proyecto…"),
    (re.compile(r"Compilando el frontend", re.I), "🏗️ Compilando la interfaz…"),
    (re.compile(r"Verificación superada", re.I), "✅ ¡Verificación superada! Tu sistema compila y arranca."),
    (re.compile(r"Verificación falló \(intento (\d+)", re.I), "🔧 Algo falló (intento {0}); reparando con el error real…"),
    (re.compile(r"corriendo en (http\S+)", re.I), "🚀 ¡Tu sistema está VIVO en {0}!"),
    (re.compile(r"render validado", re.I), "🛡️ El navegador confirmó que tu página SE VE perfecta."),
    (re.compile(r"URL RETENIDA", re.I), "🛡️ La página no pasó la inspección del navegador: no se entrega rota."),
    (re.compile(r"Arreglo automático en (\S+)", re.I), "🩹 Arreglo automático aplicado en {0}"),
    # Entrega en rama: el aviso que despierta a las 3 apps para revisar.
    (
        re.compile(r"ENTREGA LISTA PARA REVISION en la rama '(.+?)'", re.I),
        "📬 REVISIÓN PENDIENTE · el agente entregó su trabajo en la rama «{0}» con su informe",
    ),
    # --- Agente experto (IA de pago): se anuncia su entrada y lo que resolvió ---
    (
        re.compile(r"ENTRÓ EL AGENTE EXPERTO: (.+)", re.I),
        "🧠 Entró el AGENTE EXPERTO: {0}",
    ),
    (
        re.compile(r"El experto REPLANTEÓ la respuesta: de '(\w+)' a '(\w+)'", re.I),
        "🧠 El experto REPLANTEÓ el encargo: esto no era «{0}», es «{1}».",
    ),
    (
        re.compile(r"Experto en el diseño: (.+)", re.I),
        "🧠 El experto revisó el diseño: {0}",
    ),
    (
        re.compile(r"Experto NO entra en '(\w+)'", re.I),
        "· El experto no participa en «{0}» con tu plan.",
    ),
    # --- Cerebro IA: qué proveedor gratis respondió / cuál falló (fallback) ---
    (re.compile(r"OK con '(.+?)' \[rol=(.+?)\]", re.I), "🤖 IA «{0}» respondió (rol {1})"),
    (re.compile(r"Proveedor '(.+?)' falló", re.I), "⚠️ IA «{0}» falló → salto a la siguiente"),
    (re.compile(r"Proveedor '(.+?)' devolvió respuesta vacía", re.I), "⚠️ IA «{0}» sin respuesta → siguiente"),
    (re.compile(r"Proveedor '(.+?)' cortó la respuesta", re.I), "⚠️ IA «{0}» respuesta cortada → siguiente"),
    (re.compile(r"Proveedor '(.+?)' devolvió JSON inválido", re.I), "⚠️ IA «{0}» formato inválido → siguiente"),
    (re.compile(r"con (\d+) proveedor", re.I), "🧠 Cerebro IA listo: {0} modelos en cadena"),
    (re.compile(r"Todos los proveedores.*fallaron", re.I), "🛑 Todos los proveedores de IA fallaron"),
)

logger = logging.getLogger(__name__)


#: De quién es el trabajo que se está ejecutando AHORA en este hilo.
#:
#: Es un ContextVar y no un parámetro porque el progreso lo emite el sistema de
#: logging, a metros de distancia de quien pidió la generación: pasar el usuario
#: a mano por veinte funciones solo para poder etiquetar una línea de log sería
#: peor. FastAPI copia el contexto al hilo del threadpool, así que un endpoint
#: síncrono que tarda minutos conserva su dueño.
DUENO_ACTUAL: contextvars.ContextVar[str] = contextvars.ContextVar("dueno_actual", default="")

#: Las fases del pipeline, en orden. Sirven para pintar "vas por la 3 de 5" sin
#: que el frontend tenga que adivinarlo de un texto.
FASES = ("entender", "planificar", "escribir", "verificar", "publicar")


class _Difusor(logging.Handler):
    """Handler de logging que reparte cada mensaje a los sockets suscritos."""

    def __init__(self) -> None:
        super().__init__(level=logging.INFO)
        # Cada suscriptor apunta a (loop, dueño). El dueño decide qué ve.
        self._suscriptores: dict[asyncio.Queue, tuple[asyncio.AbstractEventLoop, str]] = {}

    def suscribir(self, cola: asyncio.Queue, loop: asyncio.AbstractEventLoop, dueno: str) -> None:
        self._suscriptores[cola] = (loop, dueno)

    def desuscribir(self, cola: asyncio.Queue) -> None:
        self._suscriptores.pop(cola, None)

    def _repartir(self, texto: str, dueno: str) -> int:
        """Entrega a quien le corresponde.

        Un evento SIN dueño (arranque, tareas de fondo) lo ve todo el mundo.
        Uno CON dueño lo ve solo él: antes se difundía a todos los conectados,
        así que un usuario veía los nombres de proyecto y las ideas de otro.
        """
        enviados = 0
        for cola, (loop, suscriptor) in list(self._suscriptores.items()):
            if dueno and suscriptor != dueno:
                continue
            try:
                loop.call_soon_threadsafe(cola.put_nowait, texto)
                enviados += 1
            except RuntimeError:
                self._suscriptores.pop(cola, None)
        return enviados

    def emit(self, record: logging.LogRecord) -> None:
        if not self._suscriptores or not record.name.startswith(_FUENTES):
            return
        try:
            texto = _traducir(record.getMessage())
        except Exception:  # noqa: BLE001 - el progreso jamás rompe el pipeline
            return
        if not texto:
            return
        try:
            self._repartir(texto, DUENO_ACTUAL.get(""))
        except Exception:  # noqa: BLE001
            return

    def fase(self, nombre: str, detalle: str = "", paso: int = 0, de: int = 0) -> None:
        """Anuncia un cambio de FASE, con estructura.

        Va como JSON en una línea. El frontend que sepa leerlo pinta una barra
        de verdad ("Verificando · intento 3 de 7"); el que no, lo ignora y sigue
        con las frases de siempre. Así se puede mejorar la vista sin coordinar
        un despliegue de las tres apps a la vez.
        """
        if nombre not in FASES:
            return
        evento = {
            "t": "fase",
            "fase": nombre,
            "indice": FASES.index(nombre) + 1,
            "total": len(FASES),
            "detalle": (detalle or "")[:160],
        }
        if de:
            evento["paso"] = paso
            evento["de"] = de
        try:
            self._repartir(json.dumps(evento, ensure_ascii=False), DUENO_ACTUAL.get(""))
        except Exception:  # noqa: BLE001 - el progreso jamás rompe el pipeline
            pass

    def difundir(self, texto: str, dueno: str = "") -> int:
        """Empuja un texto YA formado a los sockets, sin pasar por logging.

        Lo usa el reenvío entre canales: cuando generas contra el backend de tu
        portátil, el móvil no puede verlo (no alcanza tu localhost). El navegador
        que sí lo ve reenvía cada paso aquí, al backend compartido, y entonces
        los tres aparatos cuentan la misma historia.
        """
        return self._repartir(texto, dueno)


def sanear_evento(texto: str) -> str | None:
    """Limpia un evento que llega de fuera antes de repartirlo.

    Viene de un cliente autenticado, pero autenticado no es lo mismo que
    confiable: se recorta, se quita todo carácter de control y se descartan los
    saltos de línea (el canal es una línea por paso).
    """
    limpio = "".join(c for c in (texto or "") if c == " " or (c.isprintable() and c not in "\r\n"))
    limpio = limpio.strip()[:200]
    return limpio or None


def _traducir(mensaje: str) -> str | None:
    for patron, plantilla in _AMIGABLES:
        m = patron.search(mensaje)
        if m:
            return plantilla.format(*m.groups())
    # Sin traducción conocida: solo pasan los mensajes cortos y legibles.
    return mensaje if len(mensaje) <= 140 and "\n" not in mensaje else None


DIFUSOR = _Difusor()
logging.getLogger("src").addHandler(DIFUSOR)


def _dueno_del_socket(token: str) -> str:
    """Identifica al oyente. Cadena vacía = anónimo (solo eventos sin dueño).

    No rechaza la conexión sin sesión, la limita: la vista de progreso es útil
    aunque no haya nada tuyo corriendo, y cerrar el socket obligaría al frontend
    a distinguir «no hay sesión» de «el servidor está dormido», que en el plan
    gratuito tarda ~50 s en despertar y ya cuesta bastante.
    """
    token = (token or "").strip()
    if not token:
        return ""
    try:
        from src.infrastructure.entrypoints.auth_github import leer_sesion

        propia = leer_sesion(token)
        if propia is not None:
            return str(propia.get("sub") or "")

        from src.infrastructure.entrypoints.auth import verify_google_token

        return str(verify_google_token(token).get("sub") or "")
    except Exception:  # noqa: BLE001 - un token malo escucha como anónimo
        return ""

router_ws = APIRouter()


@router_ws.websocket("/api/v1/ws/progreso")
async def ws_progreso(websocket: WebSocket) -> None:
    """Canal de progreso: el cliente conecta y solo escucha."""
    # Un navegador no puede poner cabeceras al abrir un WebSocket, así que la
    # sesión viaja como parámetro. Sin sesión válida se escucha en modo ANÓNIMO:
    # solo llegan los eventos sin dueño (arranque, avisos generales). Los pasos
    # de una generación pertenecen a quien la pidió; antes se difundían a todos
    # los conectados y un usuario veía los nombres de proyecto de otro.
    dueno = _dueno_del_socket(websocket.query_params.get("token", ""))

    await websocket.accept()
    cola: asyncio.Queue = asyncio.Queue(maxsize=500)
    DIFUSOR.suscribir(cola, asyncio.get_running_loop(), dueno)
    try:
        await websocket.send_text("👋 Conectado: te iré contando cada paso.")
        while True:
            mensaje = await cola.get()
            await websocket.send_text(mensaje)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 - un socket caído no es un error del sistema
        pass
    finally:
        DIFUSOR.desuscribir(cola)
