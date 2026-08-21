"""Persistencia PostgreSQL de los trabajos de fondo.

Gemelo de `SqliteTrabajosRepository`. Mismas consultas, dialecto distinto:
marcadores `%s` y `ON CONFLICT … DO UPDATE` en vez de `INSERT OR REPLACE`.
"""

from __future__ import annotations

import logging

from src.domain.entities import TrabajoFondo
from src.domain.ports import TrabajosRepositoryPort
from src.infrastructure.adapters.postgres_support import connect

logger = logging.getLogger(__name__)


class PostgresTrabajosRepository(TrabajosRepositoryPort):
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._init_db()

    def _init_db(self) -> None:
        with connect(self._dsn) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS trabajos (
                    id             TEXT PRIMARY KEY,
                    tipo           TEXT NOT NULL,
                    dueno          TEXT NOT NULL DEFAULT '',
                    estado         TEXT NOT NULL,
                    progreso       TEXT NOT NULL DEFAULT '',
                    resultado      TEXT NOT NULL DEFAULT '',
                    creado_en      TEXT NOT NULL,
                    actualizado_en TEXT NOT NULL
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_trabajos_dueno "
                "ON trabajos(dueno, creado_en)"
            )

    # ---- escritura ----
    def guardar(self, trabajo: TrabajoFondo) -> None:
        """Upsert por id: cada transición sobreescribe la foto completa."""
        with connect(self._dsn) as conn:
            conn.execute(
                "INSERT INTO trabajos "
                "(id, tipo, dueno, estado, progreso, resultado, creado_en, actualizado_en) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (id) DO UPDATE SET "
                "tipo = EXCLUDED.tipo, dueno = EXCLUDED.dueno, estado = EXCLUDED.estado, "
                "progreso = EXCLUDED.progreso, resultado = EXCLUDED.resultado, "
                "creado_en = EXCLUDED.creado_en, actualizado_en = EXCLUDED.actualizado_en",
                (trabajo.id, trabajo.tipo, trabajo.dueno, trabajo.estado,
                 trabajo.progreso, trabajo.resultado,
                 trabajo.creado_en, trabajo.actualizado_en),
            )

    # ---- lectura ----
    def obtener(self, id: str) -> TrabajoFondo | None:  # noqa: A002 - el puerto lo llama así
        with connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT * FROM trabajos WHERE id = %s", (id,)
            ).fetchone()
        return self._row_to_trabajo(row) if row else None

    def listar_de(self, dueno: str, limite: int = 20) -> list[TrabajoFondo]:
        """Los del dueño + los sin dueño (mismo criterio que `es_suyo`)."""
        with connect(self._dsn) as conn:
            rows = conn.execute(
                "SELECT * FROM trabajos WHERE dueno = %s OR dueno = '' "
                "ORDER BY creado_en DESC LIMIT %s",
                (dueno, limite),
            ).fetchall()
        return [self._row_to_trabajo(r) for r in rows]

    @staticmethod
    def _row_to_trabajo(row: dict) -> TrabajoFondo:
        return TrabajoFondo(
            id=row["id"],
            tipo=row["tipo"],
            dueno=row["dueno"] or "",
            estado=row["estado"],
            progreso=row["progreso"] or "",
            resultado=row["resultado"] or "",
            creado_en=row["creado_en"],
            actualizado_en=row["actualizado_en"],
        )
