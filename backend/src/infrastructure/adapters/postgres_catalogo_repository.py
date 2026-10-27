"""Persistencia PostgreSQL del catálogo de cursos escritos y del progreso.

Gemelo de `SqliteCatalogoRepository`: mismas tablas, mismo JSON en `datos` y
la misma conducta (lo comprueba `pruebas/postgres_gemelos.py`). Sin este
gemelo, encender `DATABASE_URL` dejaría el progreso de los cursos en un SQLite
que se borra en cada deploy mientras el usuario vive en Postgres.
"""

from __future__ import annotations

from src.domain.catalogo import CursoCatalogo, ProgresoCatalogo
from src.domain.ports import CatalogoCursosRepositoryPort
from src.infrastructure.adapters.postgres_support import connect


class PostgresCatalogoRepository(CatalogoCursosRepositoryPort):
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._init_db()

    def _init_db(self) -> None:
        with connect(self._dsn) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS catalogo_cursos (
                    id          TEXT PRIMARY KEY,
                    version     INTEGER NOT NULL,
                    datos       TEXT NOT NULL,
                    actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
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
        with connect(self._dsn) as conn:
            rows = conn.execute("SELECT datos FROM catalogo_cursos ORDER BY id").fetchall()
        return [CursoCatalogo.model_validate_json(r["datos"]) for r in rows]

    def obtener(self, curso_id: str) -> CursoCatalogo | None:
        with connect(self._dsn) as conn:
            row = conn.execute("SELECT datos FROM catalogo_cursos WHERE id = %s", (curso_id,)).fetchone()
        return CursoCatalogo.model_validate_json(row["datos"]) if row else None

    def guardar(self, curso: CursoCatalogo) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                "INSERT INTO catalogo_cursos (id, version, datos, actualizado) "
                "VALUES (%s, %s, %s, now()) "
                "ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, "
                "datos = EXCLUDED.datos, actualizado = EXCLUDED.actualizado",
                (curso.id, curso.version, curso.model_dump_json()),
            )

    # ---- progreso ----
    def obtener_progreso(self, usuario: str, curso_id: str) -> ProgresoCatalogo | None:
        with connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT datos FROM catalogo_progreso WHERE usuario = %s AND curso_id = %s",
                (usuario, curso_id),
            ).fetchone()
        return ProgresoCatalogo.model_validate_json(row["datos"]) if row else None

    def guardar_progreso(self, progreso: ProgresoCatalogo) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                "INSERT INTO catalogo_progreso (usuario, curso_id, datos, actualizado) "
                "VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (usuario, curso_id) DO UPDATE SET datos = EXCLUDED.datos, "
                "actualizado = EXCLUDED.actualizado",
                (progreso.usuario, progreso.curso_id, progreso.model_dump_json(), progreso.actualizado),
            )

    def progresos_de(self, usuario: str) -> list[ProgresoCatalogo]:
        with connect(self._dsn) as conn:
            rows = conn.execute(
                "SELECT datos FROM catalogo_progreso WHERE usuario = %s ORDER BY actualizado DESC",
                (usuario,),
            ).fetchall()
        return [ProgresoCatalogo.model_validate_json(r["datos"]) for r in rows]
