"""Adaptador SQLite para cuentas de usuario (login por usuario + licencia)."""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone

from src.domain.entities import UserAccount
from src.domain.ports import UserRepositoryPort

logger = logging.getLogger(__name__)

#: Columnas de la compra de un plan (todas texto, vacías por defecto). Las
#: comparte la migración y la lectura; el gemelo Postgres tiene la misma lista.
_COLUMNAS_PAGO = ("payment_ref", "payment_receipt", "requested_at", "approved_at", "rejection_reason")


class SqliteUserRepository(UserRepositoryPort):
    """Persiste las cuentas de usuario en la tabla `users`."""

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    sub              TEXT PRIMARY KEY,
                    email            TEXT,
                    name             TEXT,
                    plan             TEXT DEFAULT 'free',
                    requested_plan   TEXT DEFAULT '',
                    paid             INTEGER DEFAULT 0,
                    status           TEXT DEFAULT 'active',
                    generations_used INTEGER DEFAULT 0,
                    lessons_used     INTEGER DEFAULT 0,
                    approved_by      TEXT DEFAULT '',
                    created_at       TEXT,
                    nivel            TEXT DEFAULT 'desconocido',
                    payment_ref      TEXT DEFAULT '',
                    payment_receipt  TEXT DEFAULT '',
                    requested_at     TEXT DEFAULT '',
                    approved_at      TEXT DEFAULT '',
                    rejection_reason TEXT DEFAULT ''
                )
                """
            )
            # Migración suave: agrega la columna si la tabla ya existía sin ella.
            cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
            if "requested_plan" not in cols:
                conn.execute("ALTER TABLE users ADD COLUMN requested_plan TEXT DEFAULT ''")
            # El nivel vive EN EL USUARIO (no solo en cada curso): así un curso
            # nuevo no re-pregunta lo que el sistema ya midió, y el reajuste por
            # evidencia (clases superadas/falladas) lo sigue a todas partes.
            if "nivel" not in cols:
                conn.execute(
                    "ALTER TABLE users ADD COLUMN nivel TEXT DEFAULT 'desconocido'"
                )
            # Compra de un plan: referencia, comprobante y fechas para conciliar.
            for col in _COLUMNAS_PAGO:
                if col not in cols:
                    conn.execute(f"ALTER TABLE users ADD COLUMN {col} TEXT DEFAULT ''")

    @staticmethod
    def _to_account(row: sqlite3.Row) -> UserAccount:
        keys = row.keys()
        return UserAccount(
            sub=row["sub"],
            email=row["email"] or "",
            name=row["name"] or "",
            plan=row["plan"] or "free",
            requested_plan=(row["requested_plan"] if "requested_plan" in keys else "") or "",
            paid=bool(row["paid"]),
            status=row["status"] or "active",
            generations_used=row["generations_used"] or 0,
            lessons_used=row["lessons_used"] or 0,
            approved_by=row["approved_by"] or "",
            created_at=row["created_at"] or "",
            nivel=(row["nivel"] if "nivel" in keys else "desconocido") or "desconocido",
            **{c: (row[c] if c in keys else "") or "" for c in _COLUMNAS_PAGO},
        )

    def get(self, sub: str) -> UserAccount | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE sub = ?", (sub,)).fetchone()
        return self._to_account(row) if row else None

    def upsert_profile(self, sub: str, email: str, name: str) -> UserAccount:
        """Crea o actualiza el perfil en UNA sola sentencia atómica.

        Antes se comprobaba y luego se insertaba, y en el primer login el
        frontend lanza varias peticiones a la vez (sesión, cuenta, proyectos):
        todas veían "no existe" y todas insertaban, así que saltaba
        `UNIQUE constraint failed: users.sub`. Le ocurría al 100% de los
        usuarios nuevos. `ON CONFLICT` lo resuelve sin condición de carrera.
        """
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO users (sub, email, name, created_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(sub) DO UPDATE SET email = excluded.email, name = excluded.name",
                (sub, email, name, datetime.now(timezone.utc).isoformat()),
            )
        return self.get(sub)  # type: ignore[return-value]

    # ---- nivel del alumno (vive en el usuario, no solo en cada curso) ----
    #: Los únicos valores válidos; cualquier otra cosa del LLM se descarta.
    _NIVELES = ("desconocido", "bajo", "medio", "alto")

    def get_nivel(self, sub: str) -> str:
        """Nivel vigente del usuario, o 'desconocido' si nunca se midió."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT nivel FROM users WHERE sub = ?", (sub,)
            ).fetchone()
        return (row["nivel"] if row else "") or "desconocido"

    def set_nivel(self, sub: str, nivel: str) -> None:
        """Persiste el nivel medido/reajustado. Un valor inválido se ignora."""
        nivel = (nivel or "").strip().lower()
        if nivel not in self._NIVELES:
            logger.warning("Nivel inválido '%s' para %s: se ignora.", nivel, sub)
            return
        with self._connect() as conn:
            conn.execute("UPDATE users SET nivel = ? WHERE sub = ?", (nivel, sub))

    def increment_generation(self, sub: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE users SET generations_used = generations_used + 1 WHERE sub = ?", (sub,)
            )

    def increment_lesson(self, sub: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE users SET lessons_used = lessons_used + 1 WHERE sub = ?", (sub,))

    def set_pending(
        self, sub: str, requested_plan: str, payment_ref: str = "", requested_at: str = ""
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE users SET status = 'pending_payment', requested_plan = ?, "
                "payment_ref = ?, requested_at = ?, payment_receipt = '', rejection_reason = '' "
                "WHERE sub = ?",
                (requested_plan, payment_ref, requested_at, sub),
            )

    def approve(self, sub: str, plan: str, admin_email: str, approved_at: str = "") -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE users SET paid = 1, plan = ?, requested_plan = '', "
                "status = 'active', approved_by = ?, approved_at = ?, rejection_reason = '' "
                "WHERE sub = ?",
                (plan, admin_email, approved_at, sub),
            )
            return cur.rowcount > 0

    def list_pending(self) -> list[UserAccount]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM users WHERE status = 'pending_payment' ORDER BY created_at"
            ).fetchall()
        return [self._to_account(r) for r in rows]

    def set_payment_receipt(self, sub: str, receipt: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE users SET payment_receipt = ? "
                "WHERE sub = ? AND status = 'pending_payment'",
                (receipt, sub),
            )
            return cur.rowcount > 0

    def clear_request(self, sub: str, reason: str = "") -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE users SET status = 'active', requested_plan = '', payment_ref = '', "
                "payment_receipt = '', requested_at = '', rejection_reason = ? "
                "WHERE sub = ? AND status = 'pending_payment'",
                (reason, sub),
            )
            return cur.rowcount > 0

    def revoke(self, sub: str, reason: str = "") -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE users SET paid = 0, plan = 'free', approved_at = '', "
                "rejection_reason = ? WHERE sub = ? AND paid = 1",
                (reason, sub),
            )
            return cur.rowcount > 0

    def list_paid(self) -> list[UserAccount]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM users WHERE paid = 1 ORDER BY created_at"
            ).fetchall()
        return [self._to_account(r) for r in rows]

    def find_by_email(self, email: str) -> UserAccount | None:
        if not (email or "").strip():
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE LOWER(email) = LOWER(?) ORDER BY created_at LIMIT 1",
                (email.strip(),),
            ).fetchone()
        return self._to_account(row) if row else None
