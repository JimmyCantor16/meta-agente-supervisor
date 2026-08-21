"""Persistencia PostgreSQL de la actividad diaria del alumno (la señal del hábito).

Gemelo de `SqliteActividadRepository`: una fila por (usuario, día), y registrar
dos veces el mismo día es un no-op (`ON CONFLICT DO NOTHING`, el equivalente del
`INSERT OR IGNORE` de SQLite).
"""

from __future__ import annotations

import logging
from datetime import date

from src.domain.ports import ActividadRepositoryPort
from src.infrastructure.adapters.postgres_support import connect

logger = logging.getLogger(__name__)


class PostgresActividadRepository(ActividadRepositoryPort):
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._init_db()

    def _init_db(self) -> None:
        with connect(self._dsn) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS actividad_alumno (
                    usuario TEXT NOT NULL,
                    fecha   TEXT NOT NULL,
                    PRIMARY KEY (usuario, fecha)
                )
            """)

    # ---- escritura ----
    def registrar(self, usuario: str, fecha_iso: str) -> None:
        """Marca que un usuario estuvo activo un día. Idempotente.

        Acepta 'yyyy-mm-dd' o un datetime ISO completo (se queda con el día), y
        una entrada ilegible se descarta con warning: la actividad es una señal
        secundaria y NUNCA debe tumbar el flujo que la emite.
        """
        usuario = (usuario or "").strip()
        dia = (fecha_iso or "").strip()[:10]
        if not usuario:
            logger.warning("Actividad sin usuario: se ignora (fecha=%r).", fecha_iso)
            return
        try:
            date.fromisoformat(dia)
        except ValueError:
            logger.warning("Fecha de actividad ilegible %r: se ignora.", fecha_iso)
            return
        with connect(self._dsn) as conn:
            conn.execute(
                "INSERT INTO actividad_alumno (usuario, fecha) VALUES (%s, %s) "
                "ON CONFLICT (usuario, fecha) DO NOTHING",
                (usuario, dia),
            )

    # ---- lectura ----
    def fechas_de(self, usuario: str, limite_dias: int = 120) -> list[str]:
        """Días con actividad del usuario ('yyyy-mm-dd'), el más reciente primero."""
        with connect(self._dsn) as conn:
            rows = conn.execute(
                "SELECT fecha FROM actividad_alumno WHERE usuario = %s "
                "ORDER BY fecha DESC LIMIT %s",
                (usuario, limite_dias),
            ).fetchall()
        return [r["fecha"] for r in rows]
