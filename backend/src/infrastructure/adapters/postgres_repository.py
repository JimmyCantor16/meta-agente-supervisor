"""Adaptador de persistencia: `EvaluationRepositoryPort` sobre PostgreSQL.

Es el gemelo de `SqliteEvaluationRepository` para despliegues en la nube (Render),
donde el sistema de archivos es efímero y un archivo SQLite se perdería en cada
deploy. Cumple exactamente el mismo puerto, así que el resto de la aplicación no
se entera de cuál de los dos está en uso.
"""

from __future__ import annotations

import logging
from difflib import SequenceMatcher
from typing import Any

from src.domain.entities import AgentEvaluation, EvaluationRecord, ResponseLanguage
from src.domain.ports import EvaluationRepositoryPort
from src.infrastructure.adapters.postgres_support import connect

logger = logging.getLogger(__name__)


class PostgresEvaluationRepository(EvaluationRepositoryPort):
    """Repositorio de evaluaciones respaldado por PostgreSQL."""

    def __init__(self, dsn: str) -> None:
        """Inicializa el repositorio y crea la tabla si no existe."""
        self._dsn = dsn
        self._init_db()
        logger.debug("PostgresEvaluationRepository listo.")

    def _init_db(self) -> None:
        """Crea el esquema si aún no existe (idempotente)."""
        with connect(self._dsn) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS evaluations (
                    id              TEXT PRIMARY KEY,
                    prompt          TEXT NOT NULL,
                    language        TEXT NOT NULL,
                    evaluation_json TEXT NOT NULL,
                    helpful         BOOLEAN,
                    created_at      TEXT NOT NULL
                )
                """
            )

    def save(self, record: EvaluationRecord) -> None:
        """Inserta una nueva evaluación en la base de datos."""
        with connect(self._dsn) as conn:
            conn.execute(
                """
                INSERT INTO evaluations
                    (id, prompt, language, evaluation_json, helpful, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                (
                    record.id,
                    record.prompt,
                    record.language.value,
                    record.evaluation.model_dump_json(),
                    record.helpful,
                    record.created_at,
                ),
            )
        logger.debug("Evaluación %s persistida.", record.id)

    def set_feedback(self, evaluation_id: str, helpful: bool) -> bool:
        """Actualiza el voto de utilidad de una evaluación existente."""
        with connect(self._dsn) as conn:
            cursor = conn.execute(
                "UPDATE evaluations SET helpful = %s WHERE id = %s",
                (helpful, evaluation_id),
            )
            return cursor.rowcount > 0

    def find_similar_helpful(
        self, prompt: str, limit: int = 3
    ) -> list[EvaluationRecord]:
        """Devuelve las evaluaciones ÚTILES más parecidas al prompt dado."""
        with connect(self._dsn) as conn:
            rows = conn.execute(
                "SELECT * FROM evaluations WHERE helpful IS TRUE"
            ).fetchall()

        if not rows:
            return []

        # Mismo ranking por similitud textual que el adaptador SQLite.
        scored = [
            (SequenceMatcher(None, prompt.lower(), row["prompt"].lower()).ratio(), row)
            for row in rows
        ]
        scored.sort(key=lambda pair: pair[0], reverse=True)
        top = [self._row_to_record(row) for _, row in scored[:limit]]

        logger.debug(
            "find_similar_helpful: %d candidata(s) útil(es), devolviendo %d.",
            len(rows),
            len(top),
        )
        return top

    @staticmethod
    def _row_to_record(row: dict[str, Any]) -> EvaluationRecord:
        """Reconstruye una entidad `EvaluationRecord` desde una fila."""
        return EvaluationRecord(
            id=row["id"],
            prompt=row["prompt"],
            language=ResponseLanguage(row["language"]),
            evaluation=AgentEvaluation.model_validate_json(row["evaluation_json"]),
            helpful=row["helpful"],
            created_at=row["created_at"],
        )
