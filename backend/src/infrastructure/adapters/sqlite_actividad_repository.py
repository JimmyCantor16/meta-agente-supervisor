"""Persistencia SQLite de la actividad diaria del alumno (la señal del hábito).

Una fila por (usuario, día): registrar dos veces el mismo día es un no-op
(INSERT OR IGNORE). No se guarda QUÉ hizo el alumno — eso ya vive en cursos,
chat y despliegues — solo QUE ese día estuvo. De aquí salen la racha y el
mapa semanal que calcula `CaminoAlumnoUseCase`.

Sigue el patrón de `sqlite_despliegues_repository.py`: una tabla, conexión
por operación y filas accesibles por nombre.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import date

from src.domain.ports import ActividadRepositoryPort

logger = logging.getLogger(__name__)


class SqliteActividadRepository(ActividadRepositoryPort):
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
                CREATE TABLE IF NOT EXISTS actividad_alumno (
                    usuario TEXT NOT NULL,
                    fecha   TEXT NOT NULL,
                    PRIMARY KEY (usuario, fecha)
                )
            """)

    # ---- escritura ----
    def registrar(self, usuario: str, fecha_iso: str) -> None:
        """Marca que un usuario estuvo activo un día. Idempotente.

        Acepta 'yyyy-mm-dd' o un datetime ISO completo (se queda con el día):
        la señal de hábito no debe romperse porque quien registra pase el
        timestamp entero. Una entrada ilegible se descarta con warning — el
        registro de actividad es una señal secundaria y NUNCA debe tumbar el
        flujo que la emite (verificar una clase, publicar, etc.).
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
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO actividad_alumno (usuario, fecha) VALUES (?, ?)",
                (usuario, dia),
            )

    # ---- lectura ----
    def fechas_de(self, usuario: str, limite_dias: int = 120) -> list[str]:
        """Días con actividad del usuario ('yyyy-mm-dd'), el más reciente primero.

        El límite acota la ventana que carga el cálculo de racha: 120 días
        cubre de sobra la racha visible sin arrastrar todo el historial.
        """
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT fecha FROM actividad_alumno WHERE usuario = ? "
                "ORDER BY fecha DESC LIMIT ?",
                (usuario, limite_dias),
            ).fetchall()
        return [r["fecha"] for r in rows]
