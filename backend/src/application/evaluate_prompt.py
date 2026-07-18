"""Casos de uso: evaluar/optimizar un prompt y registrar feedback.

Orquestan el flujo de negocio sin conocer NINGÚN detalle de infraestructura:
reciben los puertos por inyección de dependencias. Esto los hace trivialmente
testeables y desacoplados de DeepSeek o SQLite.
"""

from __future__ import annotations

import logging

from src.domain.entities import (
    DeveloperPrompt,
    EvaluationRecord,
    FewShotExample,
    ResponseLanguage,
)
from src.domain.ports import EvaluationRepositoryPort, PromptEvaluatorPort

logger = logging.getLogger(__name__)

# Cuántos ejemplos históricos útiles se inyectan como contexto (RAG).
_MAX_EXAMPLES = 3


class EvaluatePromptUseCase:
    """Orquesta la revisión crítica y la mejora de un prompt de desarrollo.

    Flujo con memoria y aprendizaje:
      1. Recupera del repositorio evaluaciones pasadas ÚTILES y similares.
      2. Se las pasa al evaluador como ejemplos (few-shot / RAG).
      3. Persiste la nueva evaluación para nutrir futuras consultas.
    """

    def __init__(
        self,
        evaluator: PromptEvaluatorPort,
        repository: EvaluationRepositoryPort,
    ) -> None:
        """Inyecta los puertos de evaluación y de persistencia.

        Args:
            evaluator: Motor de evaluación (DeepSeek o mock).
            repository: Memoria de evaluaciones (SQLite u otro).
        """
        self._evaluator = evaluator
        self._repository = repository

    def execute(self, raw_prompt: str, language: str = "es") -> EvaluationRecord:
        """Ejecuta el caso de uso completo con memoria y aprendizaje.

        Args:
            raw_prompt: Texto crudo del prompt enviado por el usuario.
            language: Código de idioma deseado para la respuesta ('es' | 'en').

        Returns:
            El registro persistido (incluye `id` para asociar feedback después).

        Raises:
            ValueError: Si el prompt o el idioma no superan la validación.
            PromptEvaluationError: Si el evaluador falla (propagada al entrypoint).
        """
        # La construcción de la entidad valida longitud, contenido e idioma.
        prompt = DeveloperPrompt(content=raw_prompt, language=ResponseLanguage(language))
        normalized = prompt.normalized()

        # 1) APRENDIZAJE: recuperar ejemplos útiles del historial.
        similar = self._repository.find_similar_helpful(normalized, limit=_MAX_EXAMPLES)
        examples = [
            FewShotExample(prompt=record.prompt, evaluation=record.evaluation)
            for record in similar
        ]

        logger.info(
            "Evaluando (%d caracteres, idioma=%s) con %d ejemplo(s) de contexto.",
            len(normalized),
            prompt.language.value,
            len(examples),
        )

        # 2) EVALUACIÓN: el agente critica y optimiza, guiado por los ejemplos.
        evaluation = self._evaluator.evaluate(prompt, examples)

        # 3) MEMORIA: persistir la evaluación (sin feedback aún).
        record = EvaluationRecord(
            prompt=normalized,
            language=prompt.language,
            evaluation=evaluation,
        )
        self._repository.save(record)

        logger.info("Evaluación %s guardada con status='%s'.", record.id, evaluation.status)
        return record


class RegisterFeedbackUseCase:
    """Registra el voto de utilidad del usuario sobre una evaluación.

    Este feedback es la señal de aprendizaje: solo las evaluaciones marcadas como
    útiles se reutilizan como ejemplos en futuras consultas.
    """

    def __init__(self, repository: EvaluationRepositoryPort) -> None:
        self._repository = repository

    def execute(self, evaluation_id: str, helpful: bool) -> bool:
        """Guarda el feedback.

        Args:
            evaluation_id: Identificador de la evaluación votada.
            helpful: True si fue útil (👍), False si no (👎).

        Returns:
            True si se registró; False si la evaluación no existe.
        """
        updated = self._repository.set_feedback(evaluation_id, helpful)
        logger.info(
            "Feedback para %s: helpful=%s (encontrada=%s).",
            evaluation_id,
            helpful,
            updated,
        )
        return updated
