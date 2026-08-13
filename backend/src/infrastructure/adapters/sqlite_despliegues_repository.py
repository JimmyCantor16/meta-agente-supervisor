"""Persistencia SQLite de los despliegues publicados (upsert por slug).

Sigue el patrón de `sqlite_curso_repository.py`: una tabla, conexión por
operación y filas accesibles por nombre. Aquí vive la lista que alimenta
GET /agent/despliegues y que la auditoría periódica revisa y actualiza.
"""

from __future__ import annotations

import logging
import sqlite3

from src.domain.entities import InfoDespliegue
from src.domain.ports import DespliegueRepositoryPort

logger = logging.getLogger(__name__)


class SqliteDespliegueRepository(DespliegueRepositoryPort):
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
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
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO despliegues "
                "(slug, nombre_servicio, url, repo, estado, detalle, actualizado_en, ultimo_chequeo) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (info.slug, info.nombre_servicio, info.url, info.repo,
                 info.estado, info.detalle, info.actualizado_en, info.ultimo_chequeo),
            )

    # ---- lectura ----
    def obtener(self, slug: str) -> InfoDespliegue | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM despliegues WHERE slug = ?", (slug,)
            ).fetchone()
        return self._row_to_info(row) if row else None

    def listar(self) -> list[InfoDespliegue]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM despliegues ORDER BY actualizado_en DESC"
            ).fetchall()
        return [self._row_to_info(r) for r in rows]

    @staticmethod
    def _row_to_info(row: sqlite3.Row) -> InfoDespliegue:
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
