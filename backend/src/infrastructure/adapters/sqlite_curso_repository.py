"""Persistencia SQLite del curso: syllabus, progreso e historial de chat."""

from __future__ import annotations

import json
import logging
import sqlite3

from src.domain.entities import MensajeChat, ProgresoCurso, Syllabus
from src.domain.ports import CursoRepositoryPort

logger = logging.getLogger(__name__)


class SqliteCursoRepository(CursoRepositoryPort):
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
                CREATE TABLE IF NOT EXISTS cursos (
                    curso_id     TEXT PRIMARY KEY,
                    usuario_sub  TEXT NOT NULL,
                    proyecto     TEXT NOT NULL,
                    syllabus     TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS curso_progreso (
                    curso_id      TEXT PRIMARY KEY,
                    usuario_sub   TEXT NOT NULL,
                    proyecto      TEXT NOT NULL,
                    clase_actual  INTEGER NOT NULL DEFAULT 1,
                    completadas   TEXT NOT NULL DEFAULT '[]',
                    total_clases  INTEGER NOT NULL DEFAULT 0,
                    graduado      INTEGER NOT NULL DEFAULT 0
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS curso_chat (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    curso_id     TEXT NOT NULL,
                    numero_clase INTEGER NOT NULL,
                    rol          TEXT NOT NULL,
                    texto        TEXT NOT NULL,
                    creado_en    TEXT DEFAULT (datetime('now'))
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_chat ON curso_chat(curso_id, numero_clase, id)"
            )

    # ---- syllabus ----
    def guardar_curso(self, curso_id, usuario_sub, syllabus) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO cursos (curso_id, usuario_sub, proyecto, syllabus) "
                "VALUES (?, ?, ?, ?)",
                (curso_id, usuario_sub, syllabus.proyecto,
                 syllabus.model_dump_json()),
            )

    def cargar_syllabus(self, curso_id) -> Syllabus | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT syllabus FROM cursos WHERE curso_id = ?", (curso_id,)
            ).fetchone()
        if not row:
            return None
        try:
            return Syllabus.model_validate_json(row["syllabus"])
        except Exception:  # noqa: BLE001
            logger.warning("Syllabus corrupto para %s", curso_id)
            return None

    # ---- progreso ----
    def guardar_progreso(self, progreso: ProgresoCurso) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO curso_progreso "
                "(curso_id, usuario_sub, proyecto, clase_actual, completadas, total_clases, graduado) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (progreso.curso_id, progreso.usuario_sub, progreso.proyecto,
                 progreso.clase_actual, json.dumps(progreso.completadas),
                 progreso.total_clases, 1 if progreso.graduado else 0),
            )

    def cargar_progreso(self, curso_id) -> ProgresoCurso | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM curso_progreso WHERE curso_id = ?", (curso_id,)
            ).fetchone()
        if not row:
            return None
        return ProgresoCurso(
            curso_id=row["curso_id"], usuario_sub=row["usuario_sub"],
            proyecto=row["proyecto"], clase_actual=row["clase_actual"],
            completadas=json.loads(row["completadas"] or "[]"),
            total_clases=row["total_clases"], graduado=bool(row["graduado"]),
        )

    def curso_de(self, usuario_sub, proyecto) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT curso_id FROM cursos WHERE usuario_sub = ? AND proyecto = ?",
                (usuario_sub, proyecto),
            ).fetchone()
        return row["curso_id"] if row else None

    def cursos_de(self, usuario_sub) -> list[ProgresoCurso]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM curso_progreso WHERE usuario_sub = ?", (usuario_sub,)
            ).fetchall()
        return [
            ProgresoCurso(
                curso_id=r["curso_id"], usuario_sub=r["usuario_sub"], proyecto=r["proyecto"],
                clase_actual=r["clase_actual"], completadas=json.loads(r["completadas"] or "[]"),
                total_clases=r["total_clases"], graduado=bool(r["graduado"]),
            ) for r in rows
        ]

    # ---- chat ----
    def guardar_mensaje(self, curso_id, numero_clase, mensaje: MensajeChat) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO curso_chat (curso_id, numero_clase, rol, texto) VALUES (?, ?, ?, ?)",
                (curso_id, numero_clase, mensaje.rol, mensaje.texto),
            )

    def historial(self, curso_id, numero_clase) -> list[MensajeChat]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT rol, texto FROM curso_chat WHERE curso_id = ? AND numero_clase = ? ORDER BY id",
                (curso_id, numero_clase),
            ).fetchall()
        return [MensajeChat(rol=r["rol"], texto=r["texto"]) for r in rows]
