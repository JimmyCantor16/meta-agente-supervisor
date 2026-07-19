"""Utilidades compartidas por los adaptadores PostgreSQL.

Centraliza la apertura de conexiones para que los tres repositorios (evaluaciones,
usuarios y uso) no repitan la misma lógica. Se usa `psycopg` (v3) con filas
accesibles por nombre de columna, igual que `sqlite3.Row`, de modo que el código
de los adaptadores queda casi idéntico al de sus gemelos SQLite.
"""

from __future__ import annotations

import logging

import psycopg
from psycopg.rows import dict_row

logger = logging.getLogger(__name__)


def normalize_dsn(url: str) -> str:
    """Normaliza la URL de conexión que entrega el proveedor de hosting.

    Render (y Heroku) exponen la cadena como `postgres://...`, un esquema que
    algunas librerías no reconocen. libpq acepta ambos, pero normalizamos a
    `postgresql://` para evitar sorpresas.
    """
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def connect(dsn: str) -> psycopg.Connection:
    """Abre una conexión a PostgreSQL con filas tipo diccionario."""
    return psycopg.connect(normalize_dsn(dsn), row_factory=dict_row)


def is_postgres(url: str) -> bool:
    """Indica si la URL corresponde a PostgreSQL."""
    return url.startswith(("postgres://", "postgresql://"))
