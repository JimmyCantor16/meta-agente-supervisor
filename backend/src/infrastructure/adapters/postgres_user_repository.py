"""Adaptador PostgreSQL para cuentas de usuario (login por usuario + licencia).

Gemelo de `SqliteUserRepository` para despliegues en la nube. Sin esto, cada
deploy en Render borraría los usuarios, sus cupos consumidos y sus licencias
aprobadas, porque el disco del contenedor es efímero.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from src.domain.entities import UserAccount
from src.domain.ports import UserRepositoryPort
from src.infrastructure.adapters.postgres_support import connect

logger = logging.getLogger(__name__)


class PostgresUserRepository(UserRepositoryPort):
    """Persiste las cuentas de usuario en la tabla `users`."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._init_db()

    def _init_db(self) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    sub              TEXT PRIMARY KEY,
                    email            TEXT,
                    name             TEXT,
                    plan             TEXT DEFAULT 'free',
                    requested_plan   TEXT DEFAULT '',
                    paid             BOOLEAN DEFAULT FALSE,
                    status           TEXT DEFAULT 'active',
                    generations_used INTEGER DEFAULT 0,
                    lessons_used     INTEGER DEFAULT 0,
                    approved_by      TEXT DEFAULT '',
                    created_at       TEXT
                )
                """
            )
            # Migración suave, equivalente al PRAGMA del adaptador SQLite.
            conn.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_plan TEXT DEFAULT ''"
            )
            # El nivel vive EN EL USUARIO (no solo en cada curso): sin esta
            # columna, en los despliegues con DATABASE_URL el nivel medido se
            # perdía en cada deploy y el profesor re-preguntaba lo ya sabido.
            conn.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS nivel TEXT DEFAULT 'desconocido'"
            )

    @staticmethod
    def _to_account(row: dict[str, Any]) -> UserAccount:
        return UserAccount(
            sub=row["sub"],
            email=row["email"] or "",
            name=row["name"] or "",
            plan=row["plan"] or "free",
            requested_plan=row.get("requested_plan") or "",
            paid=bool(row["paid"]),
            status=row["status"] or "active",
            generations_used=row["generations_used"] or 0,
            lessons_used=row["lessons_used"] or 0,
            approved_by=row["approved_by"] or "",
            created_at=row["created_at"] or "",
            nivel=row.get("nivel") or "desconocido",
        )

    def get(self, sub: str) -> UserAccount | None:
        with connect(self._dsn) as conn:
            row = conn.execute("SELECT * FROM users WHERE sub = %s", (sub,)).fetchone()
        return self._to_account(row) if row else None

    def upsert_profile(self, sub: str, email: str, name: str) -> UserAccount:
        with connect(self._dsn) as conn:
            conn.execute(
                """
                INSERT INTO users (sub, email, name, created_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
                """,
                (sub, email, name, datetime.now(timezone.utc).isoformat()),
            )
        return self.get(sub)  # type: ignore[return-value]

    # ---- nivel del alumno (vive en el usuario, no solo en cada curso) ----
    #: Los únicos valores válidos; cualquier otra cosa del LLM se descarta.
    _NIVELES = ("desconocido", "bajo", "medio", "alto")

    def get_nivel(self, sub: str) -> str:
        """Nivel vigente del usuario, o 'desconocido' si nunca se midió."""
        with connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT nivel FROM users WHERE sub = %s", (sub,)
            ).fetchone()
        return (row.get("nivel") if row else "") or "desconocido"

    def set_nivel(self, sub: str, nivel: str) -> None:
        """Persiste el nivel medido/reajustado. Un valor inválido se ignora."""
        nivel = (nivel or "").strip().lower()
        if nivel not in self._NIVELES:
            logger.warning("Nivel inválido '%s' para %s: se ignora.", nivel, sub)
            return
        with connect(self._dsn) as conn:
            conn.execute("UPDATE users SET nivel = %s WHERE sub = %s", (nivel, sub))

    def increment_generation(self, sub: str) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                "UPDATE users SET generations_used = generations_used + 1 WHERE sub = %s",
                (sub,),
            )

    def increment_lesson(self, sub: str) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                "UPDATE users SET lessons_used = lessons_used + 1 WHERE sub = %s", (sub,)
            )

    def set_pending(self, sub: str, requested_plan: str) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                "UPDATE users SET status = 'pending_payment', requested_plan = %s WHERE sub = %s",
                (requested_plan, sub),
            )

    def approve(self, sub: str, plan: str, admin_email: str) -> bool:
        with connect(self._dsn) as conn:
            cur = conn.execute(
                "UPDATE users SET paid = TRUE, plan = %s, requested_plan = '', "
                "status = 'active', approved_by = %s WHERE sub = %s",
                (plan, admin_email, sub),
            )
            return cur.rowcount > 0

    def list_pending(self) -> list[UserAccount]:
        with connect(self._dsn) as conn:
            rows = conn.execute(
                "SELECT * FROM users WHERE status = 'pending_payment' ORDER BY created_at"
            ).fetchall()
        return [self._to_account(r) for r in rows]
