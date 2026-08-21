"""Persistencia PostgreSQL de los despliegues publicados (upsert por slug).

Gemelo de `SqliteDespliegueRepository`. Aquí vive la lista que alimenta
`GET /agent/despliegues` y que la auditoría periódica revisa y actualiza.
"""

from __future__ import annotations

import logging

from src.domain.entities import InfoDespliegue
from src.domain.ports import DespliegueRepositoryPort
from src.infrastructure.adapters.postgres_support import connect

logger = logging.getLogger(__name__)


class PostgresDespliegueRepository(DespliegueRepositoryPort):
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._init_db()

    def _init_db(self) -> None:
        with connect(self._dsn) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS despliegues (
                    slug            TEXT PRIMARY KEY,
                    nombre_servicio TEXT NOT NULL,
                    url             TEXT NOT NULL DEFAULT '',
                    repo            TEXT NOT NULL DEFAULT '',
                    estado          TEXT NOT NULL,
                    detalle         TEXT NOT NULL DEFAULT '',
                    actualizado_en  TEXT NOT NULL,
                    ultimo_chequeo  TEXT
                )
            """)

    # ---- escritura ----
    def guardar(self, info: InfoDespliegue) -> None:
        """Upsert por slug: cada proyecto tiene UN despliegue (el vigente)."""
        with connect(self._dsn) as conn:
            conn.execute(
                "INSERT INTO despliegues "
                "(slug, nombre_servicio, url, repo, estado, detalle, actualizado_en, ultimo_chequeo) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (slug) DO UPDATE SET "
                "nombre_servicio = EXCLUDED.nombre_servicio, url = EXCLUDED.url, "
                "repo = EXCLUDED.repo, estado = EXCLUDED.estado, detalle = EXCLUDED.detalle, "
                "actualizado_en = EXCLUDED.actualizado_en, ultimo_chequeo = EXCLUDED.ultimo_chequeo",
                (info.slug, info.nombre_servicio, info.url, info.repo,
                 info.estado, info.detalle, info.actualizado_en, info.ultimo_chequeo),
            )

    # ---- lectura ----
    def obtener(self, slug: str) -> InfoDespliegue | None:
        with connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT * FROM despliegues WHERE slug = %s", (slug,)
            ).fetchone()
        return self._row_to_info(row) if row else None

    def listar(self) -> list[InfoDespliegue]:
        with connect(self._dsn) as conn:
            rows = conn.execute(
                "SELECT * FROM despliegues ORDER BY actualizado_en DESC"
            ).fetchall()
        return [self._row_to_info(r) for r in rows]

    @staticmethod
    def _row_to_info(row: dict) -> InfoDespliegue:
        return InfoDespliegue(
            slug=row["slug"],
            nombre_servicio=row["nombre_servicio"],
            url=row["url"] or "",
            repo=row["repo"] or "",
            estado=row["estado"],
            detalle=row["detalle"] or "",
            actualizado_en=row["actualizado_en"],
            ultimo_chequeo=row["ultimo_chequeo"],
        )
