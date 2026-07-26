"""Adaptador PostgreSQL para el uso y la licencia (tabla clave-valor simple).

Gemelo de `SqliteUsageRepository`. Reutiliza la misma base de datos que las
evaluaciones y las cuentas.
"""

from __future__ import annotations

import logging

from src.domain.ports import UsageRepositoryPort
from src.infrastructure.adapters.postgres_support import connect

logger = logging.getLogger(__name__)

_GENERATIONS_KEY = "generations_used"
_LICENSE_KEY = "active_license"


class PostgresUsageRepository(UsageRepositoryPort):
    """Guarda el contador de uso y la licencia en una tabla clave-valor."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._init_db()

    def _init_db(self) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)"
            )

    def _get(self, key: str) -> str | None:
        with connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT value FROM app_meta WHERE key = %s", (key,)
            ).fetchone()
        return row["value"] if row else None

    def _set(self, key: str, value: str) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                "INSERT INTO app_meta (key, value) VALUES (%s, %s) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
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
