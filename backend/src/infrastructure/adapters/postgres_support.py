"""Utilidades compartidas por los adaptadores PostgreSQL.

Centraliza la apertura de conexiones para que los nueve repositorios no repitan
la misma lógica. Se usa `psycopg` (v3) con filas accesibles por nombre de
columna, igual que `sqlite3.Row`, de modo que el código de los adaptadores queda
casi idéntico al de sus gemelos SQLite.

**Las conexiones se reutilizan (pool).** Cada operación abría la suya, que
contra un SQLite en el mismo disco no costaba nada — pero contra una base
gestionada al otro lado del país son varios viajes de ida y vuelta solo para el
saludo TLS y la autenticación, ANTES de la primera consulta. Con el pool se paga
una vez y las siguientes van directas.

El pool valida la conexión antes de entregarla (`check_connection`): las bases
gratuitas se suspenden por inactividad y cortan lo que tenían abierto, así que
sin esa comprobación la primera consulta tras un rato de silencio fallaría. Esa
validación cuesta un viaje de ida y vuelta; abrir una conexión nueva costaba
cuatro. Medido contra la base real (Neon, Ohio): consulta 147 ms, conexión nueva
578 ms.

**Dos cosas que exige un endpoint agrupado (PgBouncer, como el `-pooler` de
Neon) y que costaron un fallo real:**

1. No admite parámetros de arranque (`options=-csearch_path=…`): la conexión se
   rechaza entera. Por eso el esquema no viaja en la cadena sino que se aplica
   con `SET search_path` en cada conexión nueva, con nuestro propio parámetro
   `esquema=` que se recorta antes de llamar a libpq.
2. Las sentencias preparadas de psycopg (a partir de la quinta ejecución igual)
   pueden no existir en la sesión que reparte el agrupador. Se desactivan
   (`prepare_threshold=None`): estas consultas son cortas y simples, y el ahorro
   no compensa una caída intermitente imposible de reproducir en local.

Si `psycopg_pool` no estuviera instalado, se cae a la conexión directa de
siempre: más lento, pero nunca roto.
"""

from __future__ import annotations

import logging
import threading
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg
from psycopg.rows import dict_row

try:  # pragma: no cover - depende del entorno
    from psycopg_pool import ConnectionPool
except ImportError:  # pragma: no cover
    ConnectionPool = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

#: Un pool por (cadena, esquema), compartido por todos los adaptadores.
_pools: dict[str, "ConnectionPool"] = {}
_lock = threading.Lock()
#: Techo bajo a propósito: los planes gratuitos limitan las conexiones y este
#: backend hace ráfagas cortas, no consultas largas en paralelo.
_MAX_CONEXIONES = 4
#: Parámetro propio (no de libpq) para elegir esquema: `…?esquema=metaagente`.
_PARAM_ESQUEMA = "esquema"
_KWARGS = {"row_factory": dict_row, "prepare_threshold": None}


def normalize_dsn(url: str) -> str:
    """Normaliza la URL de conexión que entrega el proveedor de hosting.

    Render (y Heroku) exponen la cadena como `postgres://...`, un esquema que
    algunas librerías no reconocen. libpq acepta ambos, pero normalizamos a
    `postgresql://` para evitar sorpresas.
    """
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def partir_esquema(url: str) -> tuple[str, str]:
    """Separa nuestro parámetro `esquema=` del resto de la cadena.

    libpq no lo conoce: si viajara hasta él, la conexión fallaría.
    """
    dsn = normalize_dsn(url)
    partes = urlsplit(dsn)
    if _PARAM_ESQUEMA + "=" not in (partes.query or ""):
        return dsn, ""
    resto = [(k, v) for k, v in parse_qsl(partes.query, keep_blank_values=True)
             if k != _PARAM_ESQUEMA]
    esquema = next(
        (v for k, v in parse_qsl(partes.query, keep_blank_values=True) if k == _PARAM_ESQUEMA),
        "",
    )
    limpio = urlunsplit((partes.scheme, partes.netloc, partes.path, urlencode(resto), partes.fragment))
    return limpio, esquema


def _sentencia_search_path(esquema: str) -> str:
    """`SET search_path` con el identificador entrecomillado."""
    return 'SET search_path TO "' + esquema.replace('"', '""') + '", public'


def _pool(dsn: str, esquema: str) -> "ConnectionPool":
    """Pool de esa combinación, creado la primera vez que hace falta."""
    clave = dsn + "|" + esquema
    with _lock:
        existente = _pools.get(clave)
        if existente is not None:
            return existente

        def configurar(conn) -> None:
            if esquema:
                conn.execute(_sentencia_search_path(esquema))
                conn.commit()

        creado = ConnectionPool(
            dsn,
            min_size=1,
            max_size=_MAX_CONEXIONES,
            kwargs=dict(_KWARGS),
            configure=configurar,
            check=ConnectionPool.check_connection,
            # Por debajo de la suspensión por inactividad de las bases free (5
            # min): así el pool recicla lo que va a quedar muerto en vez de
            # descubrirlo en la petición de un usuario.
            max_idle=240,
            timeout=20,
            open=True,
        )
        _pools[clave] = creado
        return creado


def connect(dsn: str):
    """Conexión a PostgreSQL con filas tipo diccionario.

    Se usa SIEMPRE como contexto (`with connect(dsn) as conn:`): al salir se
    confirma la transacción y, con pool, la conexión vuelve al pool en vez de
    cerrarse.
    """
    limpio, esquema = partir_esquema(dsn)
    if ConnectionPool is None:
        conexion = psycopg.connect(limpio, **_KWARGS)
        if esquema:
            conexion.execute(_sentencia_search_path(esquema))
            conexion.commit()
        return conexion
    return _pool(limpio, esquema).connection()


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
