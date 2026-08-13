"""Persistencia SQLite de los trabajos de fondo.

Es la tabla que generaliza el patrón "estado.json" de ripor: todo trabajo
largo (una publicación, la revisión de una entrega, futuras generaciones)
queda registrado y consultable, y sobrevive a un refresh del navegador o a
un reinicio del proceso.

Sigue el patrón de `sqlite_despliegues_repository.py`: una tabla, conexión
por operación y filas accesibles por nombre.
"""

from __future__ import annotations

import logging
import sqlite3

from src.domain.entities import TrabajoFondo
from src.domain.ports import TrabajosRepositoryPort

logger = logging.getLogger(__name__)


class SqliteTrabajosRepository(TrabajosRepositoryPort):
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
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO trabajos "
                "(id, tipo, dueno, estado, progreso, resultado, creado_en, actualizado_en) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (trabajo.id, trabajo.tipo, trabajo.dueno, trabajo.estado,
                 trabajo.progreso, trabajo.resultado,
                 trabajo.creado_en, trabajo.actualizado_en),
            )

    # ---- lectura ----
    def obtener(self, id: str) -> TrabajoFondo | None:  # noqa: A002 - el puerto lo llama así
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM trabajos WHERE id = ?", (id,)
            ).fetchone()
        return self._row_to_trabajo(row) if row else None

    def listar_de(self, dueno: str, limite: int = 20) -> list[TrabajoFondo]:
        """Los del dueño + los sin dueño.

        Un trabajo con dueño '' es visible para todos: mismo criterio que
        `es_suyo()` con los proyectos sin marca (negar acceso a lo que no
        tiene propietario sería romper trabajo ajeno por un cambio nuestro).
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM trabajos WHERE dueno = ? OR dueno = '' "
                "ORDER BY creado_en DESC LIMIT ?",
                (dueno, limite),
            ).fetchall()
        return [self._row_to_trabajo(r) for r in rows]

    @staticmethod
    def _row_to_trabajo(row: sqlite3.Row) -> TrabajoFondo:
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
