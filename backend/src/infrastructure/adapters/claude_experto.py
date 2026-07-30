"""El agente experto real: Claude, vía la API de Anthropic.

Queda enchufado y probado en su mecánica, pero **inerte sin clave**: si no hay
`ANTHROPIC_API_KEY`, `disponible` es False y el sistema entero sigue funcionando
con los modelos gratuitos. Encenderlo es pegar la clave, nada más.

Dos decisiones que importan para el negocio:

· **Se mide lo que cuesta.** Cada respuesta trae los tokens consumidos y aquí se
  convierten a dólares con la tarifa del modelo. Sin eso, el tope de gasto por
  plan sería un adorno.

· **Entra poco y donde duele.** Se le dan contextos pequeños y se le piden
  decisiones, no volumen de código. Es lo que mantiene el coste por generación
  en céntimos en vez de dólares.
"""

from __future__ import annotations

import json
import logging

from src.domain.experto import AgenteExpertoPort, AporteExperto, MomentoExperto

logger = logging.getLogger(__name__)

#: Tarifa del modelo por millón de tokens (entrada, salida), en dólares.
_TARIFAS: dict[str, tuple[float, float]] = {
    "claude-opus-4-8": (5.0, 25.0),
    "claude-sonnet-5": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
}

_INSTRUCCIONES = {
    MomentoExperto.DISENO: (
        "Eres el ingeniero senior del equipo. Recibes el encargo original de un "
        "cliente y lo que un modelo gratuito propuso construir. Tu trabajo es "
        "replantearlo si hace falta.\n"
        "\n"
        "PRIMERO, lo más importante: ¿el encargo pedía VARIOS subsistemas y se "
        "está respondiendo con uno solo? Es el error más caro que existe aquí: el "
        "cliente pide facturación, nómina e inventario y recibe un CRUD de "
        "facturas sin que nadie le diga que faltan dos terceras partes. Si es el "
        "caso, devuelve tipo 'por_clases' con un temario: qué se entrega hoy "
        "(lo que más duela) y en qué orden viene el resto. Cada clase debe dejar "
        "algo que funcione por sí solo.\n"
        "\n"
        "SEGUNDO, el modelo de datos: campos que faltan y sin los que la "
        "aplicación no sirve, tipos mal elegidos, cálculos que respondan la "
        "pregunta real del negocio (y que NO mientan: una etiqueta 'Total "
        "adeudado' sobre una suma de kilos es peor que no poner nada). No lo "
        "infles: máximo 8 campos, cada uno justificado.\n"
        "\n"
        "Operaciones disponibles para los cálculos: suma, promedio, maximo, "
        "minimo, conteo. Son sobre UN campo, sin filtros: si un número no se "
        "puede expresar así, cambia el modelo para que sí se pueda.\n"
        "\n"
        'Devuelve SOLO JSON: {"tipo": "crud_login|por_clases", '
        '"dominio": {…igual estructura que recibes…}, '
        '"temario": {"titulo":…, "resumen":…, "motivo":…, "clases":[{"numero":1,'
        '"titulo":…,"entregable":…,"porque":…}]}, '
        '"resumen": "qué cambiaste y por qué, en una frase"}\n'
        "Omite 'temario' si mantienes crud_login. Omite 'tipo' si no lo cambias."
    ),
    MomentoExperto.RESCATE: (
        "Eres quien saca a un equipo de un bucle. Un agente automático lleva "
        "varios intentos aplicando el mismo arreglo sin que el error cambie: "
        "está tratando el síntoma. Encuentra la CAUSA y da el arreglo concreto.\n"
        'Devuelve SOLO JSON: {"diagnostico": "la causa real", '
        '"archivo": "ruta a corregir", "contenido": "contenido completo corregido '
        'del archivo, o cadena vacía si basta el diagnóstico", '
        '"resumen": "una frase"}'
    ),
    MomentoExperto.REPASO: (
        "Eres el revisor final. Mira la lista de archivos y el resumen de lo "
        "entregado y di qué falta para que esto no parezca una plantilla. "
        "Concreto y accionable: nada de «mejorar la calidad».\n"
        'Devuelve SOLO JSON: {"mejoras": ["…", "…"], "resumen": "una frase"}'
    ),
}


class ClaudeAgenteExperto(AgenteExpertoPort):
    """Adaptador del experto sobre la API de Anthropic."""

    def __init__(
        self,
        api_key: str = "",
        modelo: str = "claude-opus-4-8",
        max_tokens: int = 4096,
    ) -> None:
        self._api_key = (api_key or "").strip()
        self._modelo = modelo
        self._max_tokens = max_tokens
        self._cliente = None

    @property
    def disponible(self) -> bool:
        """False sin clave: el sistema debe funcionar igual, solo sin experto."""
        return bool(self._api_key)

    def _obtener_cliente(self):
        """Crea el cliente la primera vez que se usa de verdad.

        Perezoso a propósito: importar el SDK en el arranque obligaría a tenerlo
        instalado incluso en despliegues que nunca usan el experto.
        """
        if self._cliente is None:
            from anthropic import Anthropic

            self._cliente = Anthropic(api_key=self._api_key)
        return self._cliente

    def _coste(self, entrada: int, salida: int) -> float:
        tarifa_in, tarifa_out = _TARIFAS.get(self._modelo, (5.0, 25.0))
        return (entrada / 1_000_000) * tarifa_in + (salida / 1_000_000) * tarifa_out

    def aportar(self, momento: MomentoExperto, contexto: dict) -> AporteExperto:
        if not self.disponible:
            return AporteExperto(momento=momento, resumen="Experto sin configurar.")

        cliente = self._obtener_cliente()
        peticion = json.dumps(contexto, ensure_ascii=False)[:12000]
        respuesta = cliente.messages.create(
            model=self._modelo,
            max_tokens=self._max_tokens,
            thinking={"type": "adaptive"},
            system=_INSTRUCCIONES[momento],
            messages=[{"role": "user", "content": peticion}],
        )

        texto = "".join(
            bloque.text for bloque in respuesta.content if getattr(bloque, "type", "") == "text"
        )
        datos = _json_o_vacio(texto)
        uso = getattr(respuesta, "usage", None)
        coste = self._coste(
            getattr(uso, "input_tokens", 0) or 0, getattr(uso, "output_tokens", 0) or 0
        )
        resumen = str(datos.pop("resumen", "")).strip()

        return AporteExperto(
            momento=momento,
            resumen=resumen or "Intervención del agente experto.",
            datos=datos,
            coste_usd=coste,
            modelo=self._modelo,
        )


def _json_o_vacio(texto: str) -> dict:
    """Extrae el JSON de la respuesta. Vacío si no se puede: quien llama sigue igual."""
    limpio = (texto or "").strip()
    if limpio.startswith("```"):
        limpio = limpio.split("```")[1] if "```" in limpio[3:] else limpio[3:]
        limpio = limpio.removeprefix("json").strip()
    try:
        datos = json.loads(limpio)
        return datos if isinstance(datos, dict) else {}
    except ValueError:
        inicio, fin = limpio.find("{"), limpio.rfind("}")
        if 0 <= inicio < fin:
            try:
                datos = json.loads(limpio[inicio : fin + 1])
                return datos if isinstance(datos, dict) else {}
            except ValueError:
                pass
        logger.warning("El experto no devolvió JSON utilizable.")
        return {}
