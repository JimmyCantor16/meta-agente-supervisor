"""Adaptador SQLite para el uso y la licencia (tabla clave-valor simple).

Persiste cuántas generaciones se han hecho y la licencia activa. Reutiliza el
mismo archivo SQLite que las evaluaciones.
"""

from __future__ import annotations

import logging
import sqlite3

from src.domain.ports import UsageRepositoryPort

logger = logging.getLogger(__name__)

_GENERATIONS_KEY = "generations_used"
_LICENSE_KEY = "active_license"


class SqliteUsageRepository(UsageRepositoryPort):
    """Guarda el contador de uso y la licencia en una tabla clave-valor."""

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path)

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)"
            )

    def _get(self, key: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute("SELECT value FROM app_meta WHERE key = ?", (key,)).fetchone()
        return row[0] if row else None

    def _set(self, key: str, value: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO app_meta (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def generations_used(self) -> int:
        raw = self._get(_GENERATIONS_KEY)
        return int(raw) if raw and raw.isdigit() else 0

    def record_generation(self) -> None:
        self._set(_GENERATIONS_KEY, str(self.generations_used() + 1))

    def active_license(self) -> str | None:
        return self._get(_LICENSE_KEY)

    def set_license(self, key: str) -> None:
        self._set(_LICENSE_KEY, key)
