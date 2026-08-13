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
                    graduado      INTEGER NOT NULL DEFAULT 0,
                    nivel         TEXT NOT NULL DEFAULT 'desconocido',
                    racha_primeras  INTEGER NOT NULL DEFAULT 0,
                    fallos_seguidos INTEGER NOT NULL DEFAULT 0,
                    clase_fallando  INTEGER NOT NULL DEFAULT 0
                )
            """)
            # Migración para bases existentes: añade columnas si faltan (idempotente).
            cols = {r["name"] for r in conn.execute("PRAGMA table_info(curso_progreso)")}
            if "nivel" not in cols:
                conn.execute(
                    "ALTER TABLE curso_progreso ADD COLUMN nivel TEXT NOT NULL "
                    "DEFAULT 'desconocido'"
                )
            # Contadores del NIVEL VIVO: racha de clases al primer intento y
            # fallos consecutivos en la misma clase (con qué clase se cuentan).
            for columna in ("racha_primeras", "fallos_seguidos", "clase_fallando"):
                if columna not in cols:
                    conn.execute(
                        f"ALTER TABLE curso_progreso ADD COLUMN {columna} "
                        "INTEGER NOT NULL DEFAULT 0"
                    )
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
                "(curso_id, usuario_sub, proyecto, clase_actual, completadas, total_clases, graduado, nivel, "
                "racha_primeras, fallos_seguidos, clase_fallando) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (progreso.curso_id, progreso.usuario_sub, progreso.proyecto,
                 progreso.clase_actual, json.dumps(progreso.completadas),
                 progreso.total_clases, 1 if progreso.graduado else 0,
                 progreso.nivel.value if hasattr(progreso.nivel, "value") else progreso.nivel,
                 progreso.racha_primeras, progreso.fallos_seguidos, progreso.clase_fallando),
            )

    def cargar_progreso(self, curso_id) -> ProgresoCurso | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM curso_progreso WHERE curso_id = ?", (curso_id,)
            ).fetchone()
        if not row:
            return None
        return self._row_to_progreso(row)

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
        return [self._row_to_progreso(r) for r in rows]

    @staticmethod
    def _row_to_progreso(row: sqlite3.Row) -> ProgresoCurso:
        claves = row.keys()
        nivel = row["nivel"] if "nivel" in claves else "desconocido"

        def entero(nombre: str) -> int:
            return int(row[nombre] or 0) if nombre in claves else 0

        return ProgresoCurso(
            curso_id=row["curso_id"], usuario_sub=row["usuario_sub"],
            proyecto=row["proyecto"], clase_actual=row["clase_actual"],
            completadas=json.loads(row["completadas"] or "[]"),
            total_clases=row["total_clases"], graduado=bool(row["graduado"]),
            nivel=nivel or "desconocido",
            racha_primeras=entero("racha_primeras"),
            fallos_seguidos=entero("fallos_seguidos"),
            clase_fallando=entero("clase_fallando"),
        )

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

    def inicio_clase(self, curso_id, numero_clase) -> str | None:
        """Cuándo se abrió la clase (ISO UTC), o None si nunca se abrió.

        Es el primer mensaje del chat de esa clase (la bienvenida del profesor).
        Lo usa la verificación con git: solo cuentan los commits del alumno
        POSTERIORES al inicio de la clase — un cambio de hace un mes no supera
        la clase de hoy.
        """
        with self._connect() as conn:
            row = conn.execute(
                "SELECT MIN(creado_en) AS inicio FROM curso_chat "
                "WHERE curso_id = ? AND numero_clase = ?",
                (curso_id, numero_clase),
            ).fetchone()
        inicio = (row["inicio"] if row else None) or None
        if not inicio:
            return None
        # SQLite guarda "YYYY-MM-DD HH:MM:SS" en UTC pero sin zona; se devuelve
        # en ISO con zona explícita para que `git log --since` no lo lea en hora
        # local y descarte commits válidos.
        texto = str(inicio).strip().replace(" ", "T")
        if not texto.endswith(("Z", "+00:00")) and "+" not in texto[10:]:
            texto += "+00:00"
        return texto
