"""Adaptador de persistencia: implementación de `EvaluationRepositoryPort` con SQLite.

Usa el módulo `sqlite3` de la librería estándar (sin dependencias extra). Es la
"memoria" del agente: guarda cada evaluación, registra el feedback y recupera
los mejores ejemplos históricos para el aprendizaje.

La similitud se calcula con `difflib` (coincidencia de texto), lo que evita
depender de embeddings o de un servicio externo. Es una heurística simple pero
efectiva para arrancar; más adelante puede sustituirse por embeddings sin tocar
el resto del sistema (esa es la ventaja del puerto).
"""

from __future__ import annotations

import logging
import sqlite3
from difflib import SequenceMatcher

from src.domain.entities import AgentEvaluation, EvaluationRecord, ResponseLanguage
from src.domain.ports import EvaluationRepositoryPort

logger = logging.getLogger(__name__)


class SqliteEvaluationRepository(EvaluationRepositoryPort):
    """Repositorio de evaluaciones respaldado por un archivo SQLite."""

    def __init__(self, db_path: str) -> None:
        """Inicializa el repositorio y crea la tabla si no existe.

        Args:
            db_path: Ruta del archivo de base de datos SQLite.
        """
        self._db_path = db_path
        self._init_db()
        logger.debug("SqliteEvaluationRepository listo en '%s'.", db_path)

    def _connect(self) -> sqlite3.Connection:
        """Abre una conexión con filas accesibles por nombre de columna."""
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Crea el esquema si aún no existe (idempotente)."""
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS evaluations (
                    id              TEXT PRIMARY KEY,
                    prompt          TEXT NOT NULL,
                    language        TEXT NOT NULL,
                    evaluation_json TEXT NOT NULL,
                    helpful         INTEGER,          -- NULL | 0 | 1
                    created_at      TEXT NOT NULL
                )
                """
            )

    def save(self, record: EvaluationRecord) -> None:
        """Inserta una nueva evaluación en la base de datos."""
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO evaluations
                    (id, prompt, language, evaluation_json, helpful, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id,
                    record.prompt,
                    record.language.value,
                    record.evaluation.model_dump_json(),
                    None if record.helpful is None else int(record.helpful),
                    record.created_at,
                ),
            )
        logger.debug("Evaluación %s persistida.", record.id)

    def set_feedback(self, evaluation_id: str, helpful: bool) -> bool:
        """Actualiza el voto de utilidad de una evaluación existente."""
        with self._connect() as conn:
            cursor = conn.execute(
                "UPDATE evaluations SET helpful = ? WHERE id = ?",
                (int(helpful), evaluation_id),
            )
            # rowcount = 0 significa que no existía ninguna evaluación con ese id.
            return cursor.rowcount > 0

    def find_similar_helpful(
        self, prompt: str, limit: int = 3
    ) -> list[EvaluationRecord]:
        """Devuelve las evaluaciones ÚTILES más parecidas al prompt dado."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM evaluations WHERE helpful = 1"
            ).fetchall()

        if not rows:
            return []

        # Rankeamos por similitud textual (0..1) y tomamos las mejores.
        scored: list[tuple[float, sqlite3.Row]] = []
        for row in rows:
            ratio = SequenceMatcher(None, prompt.lower(), row["prompt"].lower()).ratio()
            scored.append((ratio, row))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        top = [self._row_to_record(row) for _, row in scored[:limit]]

        logger.debug(
            "find_similar_helpful: %d candidata(s) útil(es), devolviendo %d.",
            len(rows),
            len(top),
        )
        return top

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> EvaluationRecord:
        """Reconstruye una entidad `EvaluationRecord` desde una fila SQLite."""
        return EvaluationRecord(
            id=row["id"],
            prompt=row["prompt"],
            language=ResponseLanguage(row["language"]),
            evaluation=AgentEvaluation.model_validate_json(row["evaluation_json"]),
            helpful=None if row["helpful"] is None else bool(row["helpful"]),
            created_at=row["created_at"],
        )
