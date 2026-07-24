"""Banco de casos de generación respaldado por SQLite.

Es la memoria que hace al agente mejor con cada proyecto: guarda qué se pidió,
qué salió y qué se aprendió. Ante una idea nueva, `similares` recupera los casos
más parecidos (por similitud textual con `difflib`, igual que la memoria de
evaluaciones — sin embeddings ni servicios externos) para reinyectar lo que
funcionó y evitar lo que falló.

Vive donde de verdad ocurre la generación con URL (local/escritorio); por eso
usa el mismo archivo SQLite que el resto de datos locales.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from difflib import SequenceMatcher

from src.domain.entities import CasoGeneracion, EstadoMVP
from src.domain.ports import CasoRepositoryPort

logger = logging.getLogger(__name__)


class SqliteCasoRepository(CasoRepositoryPort):
    """Repositorio del banco de casos respaldado por un archivo SQLite."""

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._init_db()
        logger.debug("SqliteCasoRepository listo en '%s'.", db_path)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS casos_generacion (
                    id            TEXT PRIMARY KEY,
                    idea          TEXT NOT NULL,
                    arquetipo     TEXT NOT NULL,
                    slug          TEXT NOT NULL,
                    estado_mvp    TEXT NOT NULL,
                    tuvo_url      INTEGER NOT NULL,
                    relanzado     INTEGER NOT NULL,
                    problemas     TEXT NOT NULL,   -- JSON list
                    lecciones     TEXT NOT NULL,   -- JSON list
                    num_archivos  INTEGER NOT NULL,
                    created_at    TEXT NOT NULL
                )
                """
            )

    def guardar(self, caso: CasoGeneracion) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO casos_generacion
                    (id, idea, arquetipo, slug, estado_mvp, tuvo_url, relanzado,
                     problemas, lecciones, num_archivos, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    caso.id,
                    caso.idea,
                    caso.arquetipo,
                    caso.slug,
                    caso.estado_mvp.value if hasattr(caso.estado_mvp, "value") else caso.estado_mvp,
                    int(caso.tuvo_url),
                    int(caso.relanzado),
                    json.dumps(caso.problemas, ensure_ascii=False),
                    json.dumps(caso.lecciones, ensure_ascii=False),
                    caso.num_archivos,
                    caso.created_at,
                ),
            )
        logger.debug("Caso %s (%s) guardado en el banco.", caso.id, caso.slug)

    def similares(self, idea: str, limit: int = 3) -> list[CasoGeneracion]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM casos_generacion").fetchall()
        if not rows:
            return []
        objetivo = (idea or "").lower()
        scored: list[tuple[float, sqlite3.Row]] = []
        for row in rows:
            ratio = SequenceMatcher(None, objetivo, (row["idea"] or "").lower()).ratio()
            scored.append((ratio, row))
        scored.sort(key=lambda par: par[0], reverse=True)
        # Solo casos con parecido real: por debajo de 0.2 es ruido.
        top = [self._row_to_caso(r) for ratio, r in scored[:limit] if ratio >= 0.2]
        logger.debug("similares('%s'): %d candidato(s), devolviendo %d.",
                     idea[:40], len(rows), len(top))
        return top

    def todos(self, limit: int = 500) -> list[CasoGeneracion]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM casos_generacion ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [self._row_to_caso(r) for r in rows]

    @staticmethod
    def _row_to_caso(row: sqlite3.Row) -> CasoGeneracion:
        return CasoGeneracion(
            id=row["id"],
            idea=row["idea"],
            arquetipo=row["arquetipo"],
            slug=row["slug"],
            estado_mvp=EstadoMVP(row["estado_mvp"]),
            tuvo_url=bool(row["tuvo_url"]),
            relanzado=bool(row["relanzado"]),
            problemas=json.loads(row["problemas"] or "[]"),
            lecciones=json.loads(row["lecciones"] or "[]"),
            num_archivos=int(row["num_archivos"]),
            created_at=row["created_at"],
        )
