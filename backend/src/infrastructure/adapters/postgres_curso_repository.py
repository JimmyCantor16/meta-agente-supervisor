"""Persistencia PostgreSQL del curso: syllabus, progreso e historial de chat.

Gemelo de `SqliteCursoRepository`. Dos diferencias que importan:

- El id del chat es `BIGSERIAL` (no `AUTOINCREMENT`) y `creado_en` es
  `TIMESTAMPTZ DEFAULT now()`, así que la marca de tiempo ya trae zona horaria.
  `inicio_clase` la devuelve en ISO **con zona explícita**: sin ella,
  `git log --since` la leería en hora local y descartaría commits válidos del
  alumno — la clase de tipo `cambio` dejaría de superarse sin motivo aparente.
- Las columnas del nivel vivo se añaden con `ADD COLUMN IF NOT EXISTS`, que en
  PostgreSQL es idempotente y evita el baile de `PRAGMA table_info`.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from src.domain.entities import MensajeChat, ProgresoCurso, Syllabus
from src.domain.ports import CursoRepositoryPort
from src.infrastructure.adapters.postgres_support import connect

logger = logging.getLogger(__name__)


class PostgresCursoRepository(CursoRepositoryPort):
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._init_db()

    def _init_db(self) -> None:
        with connect(self._dsn) as conn:
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
            conn.execute(
                "ALTER TABLE curso_progreso ADD COLUMN IF NOT EXISTS nivel TEXT "
                "NOT NULL DEFAULT 'desconocido'"
            )
            for columna in ("racha_primeras", "fallos_seguidos", "clase_fallando"):
                conn.execute(
                    f"ALTER TABLE curso_progreso ADD COLUMN IF NOT EXISTS {columna} "
                    "INTEGER NOT NULL DEFAULT 0"
                )
            conn.execute("""
                CREATE TABLE IF NOT EXISTS curso_chat (
                    id           BIGSERIAL PRIMARY KEY,
                    curso_id     TEXT NOT NULL,
                    numero_clase INTEGER NOT NULL,
                    rol          TEXT NOT NULL,
                    texto        TEXT NOT NULL,
                    creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_chat ON curso_chat(curso_id, numero_clase, id)"
            )

    # ---- syllabus ----
    def guardar_curso(self, curso_id, usuario_sub, syllabus) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                "INSERT INTO cursos (curso_id, usuario_sub, proyecto, syllabus) "
                "VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (curso_id) DO UPDATE SET "
                "usuario_sub = EXCLUDED.usuario_sub, proyecto = EXCLUDED.proyecto, "
                "syllabus = EXCLUDED.syllabus",
                (curso_id, usuario_sub, syllabus.proyecto, syllabus.model_dump_json()),
            )

    def cargar_syllabus(self, curso_id) -> Syllabus | None:
        with connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT syllabus FROM cursos WHERE curso_id = %s", (curso_id,)
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
        with connect(self._dsn) as conn:
            conn.execute(
                "INSERT INTO curso_progreso "
                "(curso_id, usuario_sub, proyecto, clase_actual, completadas, total_clases, "
                "graduado, nivel, racha_primeras, fallos_seguidos, clase_fallando) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (curso_id) DO UPDATE SET "
                "usuario_sub = EXCLUDED.usuario_sub, proyecto = EXCLUDED.proyecto, "
                "clase_actual = EXCLUDED.clase_actual, completadas = EXCLUDED.completadas, "
                "total_clases = EXCLUDED.total_clases, graduado = EXCLUDED.graduado, "
                "nivel = EXCLUDED.nivel, racha_primeras = EXCLUDED.racha_primeras, "
                "fallos_seguidos = EXCLUDED.fallos_seguidos, clase_fallando = EXCLUDED.clase_fallando",
                (progreso.curso_id, progreso.usuario_sub, progreso.proyecto,
                 progreso.clase_actual, json.dumps(progreso.completadas),
                 progreso.total_clases, 1 if progreso.graduado else 0,
                 progreso.nivel.value if hasattr(progreso.nivel, "value") else progreso.nivel,
                 progreso.racha_primeras, progreso.fallos_seguidos, progreso.clase_fallando),
            )

    def cargar_progreso(self, curso_id) -> ProgresoCurso | None:
        with connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT * FROM curso_progreso WHERE curso_id = %s", (curso_id,)
            ).fetchone()
        if not row:
            return None
        return self._row_to_progreso(row)

    def curso_de(self, usuario_sub, proyecto) -> str | None:
        with connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT curso_id FROM cursos WHERE usuario_sub = %s AND proyecto = %s",
                (usuario_sub, proyecto),
            ).fetchone()
        return row["curso_id"] if row else None

    def cursos_de(self, usuario_sub) -> list[ProgresoCurso]:
        with connect(self._dsn) as conn:
            rows = conn.execute(
                "SELECT * FROM curso_progreso WHERE usuario_sub = %s", (usuario_sub,)
            ).fetchall()
        return [self._row_to_progreso(r) for r in rows]

    @staticmethod
    def _row_to_progreso(row: dict) -> ProgresoCurso:
        def entero(nombre: str) -> int:
            return int(row.get(nombre) or 0)

        return ProgresoCurso(
            curso_id=row["curso_id"], usuario_sub=row["usuario_sub"],
            proyecto=row["proyecto"], clase_actual=row["clase_actual"],
            completadas=json.loads(row["completadas"] or "[]"),
            total_clases=row["total_clases"], graduado=bool(row["graduado"]),
            nivel=row.get("nivel") or "desconocido",
            racha_primeras=entero("racha_primeras"),
            fallos_seguidos=entero("fallos_seguidos"),
            clase_fallando=entero("clase_fallando"),
        )

    # ---- chat ----
    def guardar_mensaje(self, curso_id, numero_clase, mensaje: MensajeChat) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                "INSERT INTO curso_chat (curso_id, numero_clase, rol, texto) "
                "VALUES (%s, %s, %s, %s)",
                (curso_id, numero_clase, mensaje.rol, mensaje.texto),
            )

    def historial(self, curso_id, numero_clase) -> list[MensajeChat]:
        with connect(self._dsn) as conn:
            rows = conn.execute(
                "SELECT rol, texto FROM curso_chat WHERE curso_id = %s AND numero_clase = %s "
                "ORDER BY id",
                (curso_id, numero_clase),
            ).fetchall()
        return [MensajeChat(rol=r["rol"], texto=r["texto"]) for r in rows]

    def inicio_clase(self, curso_id, numero_clase) -> str | None:
        """Cuándo se abrió la clase (ISO con zona), o None si nunca se abrió.

        Es el primer mensaje del chat de esa clase (la bienvenida del profesor).
        Lo usa la verificación con git: solo cuentan los commits del alumno
        POSTERIORES al inicio de la clase.
        """
        with connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT MIN(creado_en) AS inicio FROM curso_chat "
                "WHERE curso_id = %s AND numero_clase = %s",
                (curso_id, numero_clase),
            ).fetchone()
        inicio = (row["inicio"] if row else None) or None
        if not inicio:
            return None
        if isinstance(inicio, datetime):
            marca = inicio if inicio.tzinfo else inicio.replace(tzinfo=timezone.utc)
            return marca.isoformat()
        texto = str(inicio).strip().replace(" ", "T")
        if not texto.endswith(("Z", "+00:00")) and "+" not in texto[10:]:
            texto += "+00:00"
        return texto
