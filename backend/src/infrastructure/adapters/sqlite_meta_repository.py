"""Persistencia SQLite de las metas de proceso (objetivo + mapa de hitos).

Guarda la meta como JSON para no acoplar el esquema a la forma de los hitos:
así el mapa puede evolucionar sin migraciones. Vive en el mismo archivo local
que el resto de los datos del usuario.
"""

from __future__ import annotations

import logging
import sqlite3

from src.domain.entities import MetaProceso
from src.domain.ports import MetaRepositoryPort

logger = logging.getLogger(__name__)


class SqliteMetaRepository(MetaRepositoryPort):
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
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO metas_proceso "
                "(id, usuario_sub, objetivo, meta_json, created_at) VALUES (?, ?, ?, ?, ?)",
                (meta.id, meta.usuario_sub, meta.objetivo,
                 meta.model_dump_json(), meta.created_at),
            )

    def cargar(self, meta_id: str) -> MetaProceso | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT meta_json FROM metas_proceso WHERE id = ?", (meta_id,)
            ).fetchone()
        if not row:
            return None
        try:
            return MetaProceso.model_validate_json(row["meta_json"])
        except Exception:  # noqa: BLE001
            logger.warning("Meta corrupta para %s", meta_id)
            return None

    def de_usuario(self, usuario_sub: str) -> list[MetaProceso]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT meta_json FROM metas_proceso WHERE usuario_sub = ? "
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
