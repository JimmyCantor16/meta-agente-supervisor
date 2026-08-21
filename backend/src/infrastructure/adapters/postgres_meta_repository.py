"""Persistencia PostgreSQL de las metas de proceso (objetivo + mapa de hitos).

Gemelo de `SqliteMetaRepository`: la meta se guarda como JSON para no acoplar el
esquema a la forma de los hitos, así el mapa puede evolucionar sin migraciones.
"""

from __future__ import annotations

import logging

from src.domain.entities import MetaProceso
from src.domain.ports import MetaRepositoryPort
from src.infrastructure.adapters.postgres_support import connect

logger = logging.getLogger(__name__)


class PostgresMetaRepository(MetaRepositoryPort):
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._init_db()

    def _init_db(self) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS metas_proceso (
                    id           TEXT PRIMARY KEY,
                    usuario_sub  TEXT NOT NULL,
                    objetivo     TEXT NOT NULL,
                    meta_json    TEXT NOT NULL,
                    created_at   TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_metas_usuario ON metas_proceso(usuario_sub)"
            )

    def guardar(self, meta: MetaProceso) -> None:
        with connect(self._dsn) as conn:
            conn.execute(
                "INSERT INTO metas_proceso (id, usuario_sub, objetivo, meta_json, created_at) "
                "VALUES (%s, %s, %s, %s, %s) "
                "ON CONFLICT (id) DO UPDATE SET "
                "usuario_sub = EXCLUDED.usuario_sub, objetivo = EXCLUDED.objetivo, "
                "meta_json = EXCLUDED.meta_json, created_at = EXCLUDED.created_at",
                (meta.id, meta.usuario_sub, meta.objetivo,
                 meta.model_dump_json(), meta.created_at),
            )

    def cargar(self, meta_id: str) -> MetaProceso | None:
        with connect(self._dsn) as conn:
            row = conn.execute(
                "SELECT meta_json FROM metas_proceso WHERE id = %s", (meta_id,)
            ).fetchone()
        if not row:
            return None
        try:
            return MetaProceso.model_validate_json(row["meta_json"])
        except Exception:  # noqa: BLE001
            logger.warning("Meta corrupta para %s", meta_id)
            return None

    def de_usuario(self, usuario_sub: str) -> list[MetaProceso]:
        with connect(self._dsn) as conn:
            rows = conn.execute(
                "SELECT meta_json FROM metas_proceso WHERE usuario_sub = %s "
                "ORDER BY created_at DESC",
                (usuario_sub,),
            ).fetchall()
        metas: list[MetaProceso] = []
        for r in rows:
            try:
                metas.append(MetaProceso.model_validate_json(r["meta_json"]))
            except Exception:  # noqa: BLE001
                continue
        return metas
