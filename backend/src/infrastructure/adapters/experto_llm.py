"""Experto sobre un modelo RESERVADO de la cadena gratuita.

La idea: no hace falta pagar para que el experto sea real. Basta con **apartar
el mejor modelo que ya tienes** y no dejar que la construcción normal lo toque.

Cómo se reserva: en `LLM_PROVIDERS`, al proveedor elegido se le pone
`"roles": ["experto"]`. Con eso desaparece de la cadena de construcción —los
roles 'prompt' y 'code' dejan de verlo— y solo responde en los tres momentos de
juicio. La diferencia entre planes deja de ser una promesa: el plan gratuito
literalmente **no tiene acceso** a ese modelo.

Es lo que permite probar la Fase 7 hoy, sin clave y sin coste, con un juicio de
verdad en vez de uno escrito a mano. No sustituye a Claude —un modelo gratuito
razona peor— pero convierte la pregunta «¿se nota la diferencia?» en algo que se
mide en vez de suponerse.

Si nadie declara el rol 'experto', este adaptador se declara NO disponible a
propósito: sin reserva, el experto usaría los mismos modelos que la construcción
y la diferencia entre planes sería puro teatro.
"""

from __future__ import annotations

import logging

from src.config import get_settings
from src.domain.experto import AgenteExpertoPort, AporteExperto, MomentoExperto
from src.infrastructure.adapters.claude_experto import _INSTRUCCIONES, _json_o_vacio
from src.infrastructure.adapters.multimodel_llm import MultiModelLLM

logger = logging.getLogger(__name__)

#: Nombre del rol que aparta a un proveedor para el experto.
ROL_EXPERTO = "experto"


def hay_modelo_reservado() -> bool:
    """True si algún proveedor está apartado para el experto.

    Se comprueba explícitamente porque `MultiModelLLM`, cuando nadie declara el
    rol pedido, cae hacia atrás y usa TODOS los proveedores. Ese respaldo es
    bueno para construir y pésimo aquí: haría que el «experto» fuese el mismo
    modelo que ya escribió el proyecto.
    """
    return any(
        ROL_EXPERTO in (p.roles or []) for p in get_settings().resolved_providers
    )


class ExpertoLLM(AgenteExpertoPort):
    """Agente experto sobre el modelo gratuito que se apartó para juzgar."""

    def __init__(self) -> None:
        self._llm: MultiModelLLM | None = None

    @property
    def disponible(self) -> bool:
        return hay_modelo_reservado()

    def _cliente(self) -> MultiModelLLM:
        # Perezoso: montar la cadena en el arranque obligaría a tener la
        # configuración resuelta antes de saber si el experto se va a usar.
        if self._llm is None:
            self._llm = MultiModelLLM(role=ROL_EXPERTO)
        return self._llm

    def aportar(self, momento: MomentoExperto, contexto: dict) -> AporteExperto:
        if not self.disponible:
            return AporteExperto(momento=momento, resumen="Sin modelo reservado para el experto.")

        import json

        peticion = json.dumps(contexto, ensure_ascii=False)[:12000]
        try:
            datos = self._cliente().chat_json(_INSTRUCCIONES[momento], peticion, temperature=0.2)
        except Exception as exc:  # noqa: BLE001 - el experto nunca tumba la construcción
            logger.warning("El modelo reservado no pudo juzgar '%s': %s", momento.value, exc)
            return AporteExperto(momento=momento, resumen="El experto no pudo responder.")

        if not isinstance(datos, dict):
            datos = _json_o_vacio(str(datos))
        resumen = str(datos.pop("resumen", "")).strip()

        return AporteExperto(
            momento=momento,
            resumen=resumen or "Intervención del agente experto.",
            datos=datos,
            # Coste cero: el modelo reservado es gratuito. Se deja explícito para
            # que el registro de gasto no invente cifras que nadie pagó.
            coste_usd=0.0,
            modelo=self._nombre_modelo(),
        )

    @staticmethod
    def _nombre_modelo() -> str:
        """Qué modelo respondió, para enseñarlo en el Monitor.

        Importa que se vea: quien mira el panel tiene que poder distinguir «entró
        DeepSeek reservado» de «entró Claude», porque no son lo mismo y la
        calidad del juicio tampoco.
        """
        reservados = [
            p.name for p in get_settings().resolved_providers if ROL_EXPERTO in (p.roles or [])
        ]
        return " → ".join(reservados) if reservados else "experto"
