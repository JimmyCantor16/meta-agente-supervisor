"""Banco de casos de generación respaldado por PostgreSQL.

Gemelo de `SqliteCasoRepository`: la memoria que hace al agente mejor con cada
proyecto. La similitud se sigue calculando en Python con `difflib` —sin
embeddings ni servicios externos—, así que la única diferencia real con el
gemelo es el dialecto SQL.
"""

from __future__ import annotations

import json
import logging
from difflib import SequenceMatcher

from src.domain.entities import CasoGeneracion, EstadoMVP
from src.domain.ports import CasoRepositoryPort
from src.infrastructure.adapters.postgres_support import connect

logger = logging.getLogger(__name__)


class PostgresCasoRepository(CasoRepositoryPort):
    """Repositorio del banco de casos respaldado por PostgreSQL."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._init_db()
        logger.debug("PostgresCasoRepository listo.")

    def _init_db(self) -> None:
        with connect(self._dsn) as conn:
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
                    problemas     TEXT NOT NULL,
                    lecciones     TEXT NOT NULL,
                    num_archivos  INTEGER NOT NULL,
                    created_at    TEXT NOT NULL
                )
                """
            )

    def guardar(self, caso: CasoGeneracion) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                """
                INSERT INTO casos_generacion
                    (id, idea, arquetipo, slug, estado_mvp, tuvo_url, relanzado,
                     problemas, lecciones, num_archivos, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    idea = EXCLUDED.idea, arquetipo = EXCLUDED.arquetipo,
                    slug = EXCLUDED.slug, estado_mvp = EXCLUDED.estado_mvp,
                    tuvo_url = EXCLUDED.tuvo_url, relanzado = EXCLUDED.relanzado,
                    problemas = EXCLUDED.problemas, lecciones = EXCLUDED.lecciones,
                    num_archivos = EXCLUDED.num_archivos, created_at = EXCLUDED.created_at
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
        with connect(self._dsn) as conn:
            rows = conn.execute("SELECT * FROM casos_generacion").fetchall()
        if not rows:
            return []
        objetivo = (idea or "").lower()
        scored = [
            (SequenceMatcher(None, objetivo, (row["idea"] or "").lower()).ratio(), row)
            for row in rows
        ]
        scored.sort(key=lambda par: par[0], reverse=True)
        # Solo casos con parecido real: por debajo de 0.2 es ruido.
        top = [self._row_to_caso(r) for ratio, r in scored[:limit] if ratio >= 0.2]
        logger.debug("similares('%s'): %d candidato(s), devolviendo %d.",
                     idea[:40], len(rows), len(top))
        return top

    def todos(self, limit: int = 500) -> list[CasoGeneracion]:
        with connect(self._dsn) as conn:
            rows = conn.execute(
                "SELECT * FROM casos_generacion ORDER BY created_at DESC LIMIT %s",
                (limit,),
            ).fetchall()
        return [self._row_to_caso(r) for r in rows]

    def ultimo_por_slug(self, slug: str) -> CasoGeneracion | None:
        with connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT * FROM casos_generacion WHERE slug = %s "
                "ORDER BY created_at DESC LIMIT 1",
                (slug,),
            ).fetchone()
        return self._row_to_caso(row) if row else None

    @staticmethod
    def _row_to_caso(row: dict) -> CasoGeneracion:
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
