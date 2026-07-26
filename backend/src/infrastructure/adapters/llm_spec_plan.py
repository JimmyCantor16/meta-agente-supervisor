"""Adaptador con IA que diseña el CONTRATO (spec + plan) antes de generar.

Inspirado en Spec-Driven Development (github/spec-kit): convertir la idea en un
qué y un cómo explícitos hace la generación más predecible y verificable. En
particular fija los ENDPOINTS del backend para que el frontend no pida rutas que
no existen, y los CRITERIOS VISIBLES para no entregar un 'JSON muerto'.
"""

from __future__ import annotations

import logging

from src.domain.entities import SpecPlan
from src.domain.ports import PromptEvaluationError, SpecPlanPort
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
Eres un ARQUITECTO que convierte la idea de un usuario NO técnico en un contrato
claro para el generador de código. No escribes código: defines el qué y el cómo.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown):
{
  "resumen": "1-2 frases de qué se construye",
  "pantallas": ["Nombres de las vistas que el usuario verá"],
  "entidades": ["Los datos del sistema, ej: Proyecto, Recurso, Costo"],
  "endpoints": ["Rutas del backend, ej: GET /api/resources, POST /api/projects"],
  "criterios_visibles": ["Qué debe VER un usuario para considerarlo funcional (pantallas con datos, no un JSON)"],
  "stack_sugerido": "Stack recomendado en una frase"
}

REGLAS:
- Los ENDPOINTS deben cubrir EXACTAMENTE lo que las pantallas necesitan mostrar:
  si hay una pantalla de 'Recursos', debe existir 'GET /api/resources'. El
  frontend NO debe pedir rutas que no estén en esta lista.
- criterios_visibles SIEMPRE en términos de lo que se VE (tarjetas con números,
  una tabla con filas, una gráfica), nunca 'una API que responde'.
- Si la idea pide datos externos (Azure, etc.) que aún no se pueden conectar,
  incluye 'datos de ejemplo realistas' como criterio visible.
- Todo en el idioma indicado, claro y concreto.
"""


class LLMSpecPlan(SpecPlanPort):
    def __init__(self) -> None:
        self._llm = MultiModelLLM(role="prompt")

    def disenar(self, idea: str, contexto: str = "", language: str = "es") -> SpecPlan:
        idioma = "español" if language == "es" else "English"
        user = (
            f"[Responde TODO en {idioma}]\n"
            f"IDEA DEL USUARIO:\n{idea}\n"
            + (f"\nCONTEXTO:\n{contexto}\n" if contexto else "")
        )
        try:
            data = self._llm.chat_json(SYSTEM_PROMPT, user, temperature=0.3)
        except LLMError as exc:
            raise PromptEvaluationError(str(exc)) from exc

        def lst(clave: str, cap: int) -> list[str]:
            return [str(x).strip() for x in (data.get(clave) or []) if str(x).strip()][:cap]

        return SpecPlan(
            resumen=str(data.get("resumen") or "").strip()[:400],
            pantallas=lst("pantallas", 12),
            entidades=lst("entidades", 12),
            endpoints=lst("endpoints", 20),
            criterios_visibles=lst("criterios_visibles", 10),
            stack_sugerido=str(data.get("stack_sugerido") or "").strip()[:200],
        )
