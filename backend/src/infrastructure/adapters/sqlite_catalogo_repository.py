"""Persistencia SQLite del catálogo de cursos escritos y del progreso por alumno.

Dos tablas. El curso se guarda ENTERO como JSON (`datos`): siempre se lee
completo, se escribe de una vez desde la semilla y no se consulta por dentro,
así que partirlo en módulos/lecciones/preguntas solo añadiría joins. El
progreso, una fila por (usuario, curso), también en JSON.

Gemelo PostgreSQL: `postgres_catalogo_repository.py`.
"""

from __future__ import annotations

import sqlite3

from src.domain.catalogo import CursoCatalogo, ProgresoCatalogo
from src.domain.ports import CatalogoCursosRepositoryPort


class SqliteCatalogoRepository(CatalogoCursosRepositoryPort):
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
                CREATE TABLE IF NOT EXISTS catalogo_cursos (
                    id         TEXT PRIMARY KEY,
                    version    INTEGER NOT NULL,
                    datos      TEXT NOT NULL,
                    actualizado TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS catalogo_progreso (
                    usuario     TEXT NOT NULL,
                    curso_id    TEXT NOT NULL,
                    datos       TEXT NOT NULL,
                    actualizado TEXT NOT NULL,
                    PRIMARY KEY (usuario, curso_id)
                )
            """)

    # ---- cursos ----
    def listar(self) -> list[CursoCatalogo]:
        with self._connect() as conn:
            rows = conn.execute("SELECT datos FROM catalogo_cursos ORDER BY id").fetchall()
        return [CursoCatalogo.model_validate_json(r["datos"]) for r in rows]

    def obtener(self, curso_id: str) -> CursoCatalogo | None:
        with self._connect() as conn:
            row = conn.execute("SELECT datos FROM catalogo_cursos WHERE id = ?", (curso_id,)).fetchone()
        return CursoCatalogo.model_validate_json(row["datos"]) if row else None

    def guardar(self, curso: CursoCatalogo) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO catalogo_cursos (id, version, datos, actualizado) "
                "VALUES (?, ?, ?, datetime('now')) "
                "ON CONFLICT(id) DO UPDATE SET version = excluded.version, "
                "datos = excluded.datos, actualizado = excluded.actualizado",
                (curso.id, curso.version, curso.model_dump_json()),
            )

    # ---- progreso ----
    def obtener_progreso(self, usuario: str, curso_id: str) -> ProgresoCatalogo | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT datos FROM catalogo_progreso WHERE usuario = ? AND curso_id = ?",
                (usuario, curso_id),
            ).fetchone()
        return ProgresoCatalogo.model_validate_json(row["datos"]) if row else None

    def guardar_progreso(self, progreso: ProgresoCatalogo) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO catalogo_progreso (usuario, curso_id, datos, actualizado) "
                "VALUES (?, ?, ?, ?) "
                "ON CONFLICT(usuario, curso_id) DO UPDATE SET datos = excluded.datos, "
                "actualizado = excluded.actualizado",
                (progreso.usuario, progreso.curso_id, progreso.model_dump_json(), progreso.actualizado),
            )

    def progresos_de(self, usuario: str) -> list[ProgresoCatalogo]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT datos FROM catalogo_progreso WHERE usuario = ? ORDER BY actualizado DESC",
                (usuario,),
            ).fetchall()
        return [ProgresoCatalogo.model_validate_json(r["datos"]) for r in rows]
