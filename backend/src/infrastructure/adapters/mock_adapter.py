"""Adaptador simulado: implementación de `PromptEvaluatorPort` SIN llamar a DeepSeek.

Sirve para probar TODO el flujo (memoria, feedback, aprendizaje, UI) sin gastar
saldo de la API. Se activa con la variable de entorno `USE_MOCK_LLM=true`.

Devuelve una evaluación determinista y coherente, e informa cuántos ejemplos
históricos recibió, para que el efecto del RAG sea observable en la respuesta.
"""

from __future__ import annotations

import logging

from src.domain.entities import (
    AgentEvaluation,
    DeveloperPrompt,
    EvaluationStatus,
    FewShotExample,
    ResponseLanguage,
)
from src.domain.ports import PromptEvaluatorPort

logger = logging.getLogger(__name__)


class MockPromptEvaluator(PromptEvaluatorPort):
    """Evaluador falso y determinista para desarrollo/pruebas sin coste."""

    def evaluate(
        self,
        prompt: DeveloperPrompt,
        examples: list[FewShotExample] | None = None,
    ) -> AgentEvaluation:
        """Genera una evaluación simulada basada en el prompt y los ejemplos."""
        n_examples = len(examples or [])
        idea = prompt.normalized()
        # Recorte breve de la idea para incrustarlo en el texto simulado.
        snippet = (idea[:80] + "…") if len(idea) > 80 else idea

        logger.info(
            "[MOCK] Evaluando sin DeepSeek (idioma=%s, %d ejemplo(s)).",
            prompt.language.value,
            n_examples,
        )

        if prompt.language is ResponseLanguage.EN:
            return self._english(snippet, n_examples)
        return self._spanish(snippet, n_examples)

    @staticmethod
    def _spanish(snippet: str, n_examples: int) -> AgentEvaluation:
        contexto = (
            f"He considerado {n_examples} evaluación(es) previa(s) marcada(s) como útil(es). "
            if n_examples
            else "No había ejemplos previos útiles en memoria. "
        )
        return AgentEvaluation(
            status=EvaluationStatus.SUGERIR_AJUSTES,
            analisis_critico=(
                f"[RESPUESTA SIMULADA] {contexto}"
                f"La idea «{snippet}» es viable, pero le faltan requisitos no "
                f"funcionales (seguridad, manejo de errores, criterios de aceptación)."
            ),
            sugerencias_mejora=[
                "Definir el stack tecnológico y la estructura de datos.",
                "Especificar la estrategia de autenticación y autorización.",
                "Añadir criterios de aceptación medibles para cada funcionalidad.",
            ],
            preguntas_para_el_usuario=[
                "¿Cuál es el nombre real del negocio o marca que debe aparecer en pantalla?",
                "¿Tienes logo o colores de marca, o el sistema propone unos?",
            ],
            prompt_final_optimizado=(
                f"Construye el siguiente sistema con calidad de producción: {snippet}. "
                f"Incluye arquitectura por capas, validación de entradas, manejo de "
                f"errores, pruebas y documentación mínima. Entrega código modular y "
                f"listo para ejecutar."
            ),
        )

    @staticmethod
    def _english(snippet: str, n_examples: int) -> AgentEvaluation:
        context = (
            f"I considered {n_examples} previous evaluation(s) marked as helpful. "
            if n_examples
            else "There were no helpful prior examples in memory. "
        )
        return AgentEvaluation(
            status=EvaluationStatus.SUGERIR_AJUSTES,
            analisis_critico=(
                f"[SIMULATED RESPONSE] {context}"
                f"The idea “{snippet}” is viable, but it lacks non-functional "
                f"requirements (security, error handling, acceptance criteria)."
            ),
            sugerencias_mejora=[
                "Define the tech stack and the data model.",
                "Specify the authentication and authorization strategy.",
                "Add measurable acceptance criteria for each feature.",
            ],
            preguntas_para_el_usuario=[
                "What is the real business or brand name that should appear on screen?",
                "Do you have a logo or brand colors, or should the system propose them?",
            ],
            prompt_final_optimizado=(
                f"Build the following system with production quality: {snippet}. "
                f"Include layered architecture, input validation, error handling, "
                f"tests and minimal documentation. Deliver modular, ready-to-run code."
            ),
        )
