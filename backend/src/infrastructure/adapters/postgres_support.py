"""Utilidades compartidas por los adaptadores PostgreSQL.

Centraliza la apertura de conexiones para que los nueve repositorios no repitan
la misma lógica. Se usa `psycopg` (v3) con filas accesibles por nombre de
columna, igual que `sqlite3.Row`, de modo que el código de los adaptadores queda
casi idéntico al de sus gemelos SQLite.

**Las conexiones se reutilizan (pool).** Cada operación abría la suya, que
contra un SQLite en el mismo disco no costaba nada — pero contra una base
gestionada al otro lado del país son varios viajes de ida y vuelta solo para el
saludo TLS y la autenticación, ANTES de la primera consulta. Con la base en
Ohio y el servicio en Oregon eso son ~200 ms regalados en cada lectura; con el
pool se paga una vez y las siguientes van directas.

El pool valida la conexión antes de entregarla (`check_connection`): las bases
gratuitas se suspenden por inactividad y cortan lo que tenían abierto, así que
sin esa comprobación la primera consulta tras un rato de silencio fallaría.

Si `psycopg_pool` no estuviera instalado, se cae a la conexión directa de
siempre: más lento, pero nunca roto.
"""

from __future__ import annotations

import logging
import threading

import psycopg
from psycopg.rows import dict_row

try:  # pragma: no cover - depende del entorno
    from psycopg_pool import ConnectionPool
except ImportError:  # pragma: no cover
    ConnectionPool = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

#: Un pool por cadena de conexión, compartido por todos los adaptadores.
_pools: dict[str, "ConnectionPool"] = {}
_lock = threading.Lock()
#: Techo bajo a propósito: los planes gratuitos limitan las conexiones y este
#: backend hace ráfagas cortas, no consultas largas en paralelo.
_MAX_CONEXIONES = 4


def normalize_dsn(url: str) -> str:
    """Normaliza la URL de conexión que entrega el proveedor de hosting.

    Render (y Heroku) exponen la cadena como `postgres://...`, un esquema que
    algunas librerías no reconocen. libpq acepta ambos, pero normalizamos a
    `postgresql://` para evitar sorpresas.
    """
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def _pool(dsn: str) -> "ConnectionPool":
    """Pool de ese DSN, creado la primera vez que hace falta."""
    with _lock:
        existente = _pools.get(dsn)
        if existente is not None:
            return existente
        creado = ConnectionPool(
            dsn,
            min_size=1,
            max_size=_MAX_CONEXIONES,
            kwargs={"row_factory": dict_row},
            check=ConnectionPool.check_connection,
            timeout=20,
            open=True,
        )
        _pools[dsn] = creado
        return creado


def connect(dsn: str):
    """Conexión a PostgreSQL con filas tipo diccionario.

    Se usa SIEMPRE como contexto (`with connect(dsn) as conn:`), igual que
    antes: al salir se confirma la transacción, y con pool la conexión vuelve al
    pool en vez de cerrarse.
    """
    normalizado = normalize_dsn(dsn)
    if ConnectionPool is None:
        return psycopg.connect(normalizado, row_factory=dict_row)
    return _pool(normalizado).connection()


def cerrar_pools() -> None:
    """Cierra los pools abiertos (para pruebas y apagados ordenados)."""
    with _lock:
        for pool in _pools.values():
            try:
                pool.close()
            except Exception:  # noqa: BLE001 - cerrar es best-effort
                logger.debug("No se pudo cerrar un pool de PostgreSQL", exc_info=True)
        _pools.clear()


def is_postgres(url: str) -> bool:
    """Indica si la URL corresponde a PostgreSQL."""
    return url.startswith(("postgres://", "postgresql://"))
