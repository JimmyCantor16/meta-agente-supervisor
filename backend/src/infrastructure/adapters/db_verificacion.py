"""Conexión de base de datos que se presta a los proyectos generados al verificarlos.

Un MVP que pide PostgreSQL debe comprobarse CON PostgreSQL. Degradarlo a SQLite
para que arranque en el entorno de pruebas sería entregar algo distinto de lo
que el usuario pidió, y el fallo aparecería más tarde y peor.

Estas bases de datos son de USAR Y TIRAR: viven en el entorno de verificación y
no guardan nada del usuario final. Cuando el proyecto se ejecute en la máquina
del usuario, apuntará a SU base de datos, con las credenciales que él aporte en
el diagnóstico de entorno.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# Pistas de que el proyecto necesita cada motor. Se buscan en las dependencias
# y en el código, no en lo que el proyecto DIGA de sí mismo.
_PISTAS = {
    "postgres": (
        "psycopg", "psycopg2", "asyncpg", '"pg"', "'pg'", "postgresql://",
        "postgres://", "pg8000", "sequelize.*postgres",
    ),
    "mysql": (
        "mysqlclient", "pymysql", "mysql2", "mysql://", "aiomysql", "mariadb",
    ),
}

_ARCHIVOS_DEPENDENCIAS = ("requirements.txt", "package.json")
_IGNORAR = {"node_modules", ".git", "__pycache__", "dist", "build"}


def motor_requerido(project_dir: str) -> str | None:
    """Motor de base de datos externo que el proyecto necesita, si lo hay.

    Devuelve "postgres", "mysql" o None (SQLite u otro sin servicio aparte).

    MANDA LO DECLARADO, Y SU SILENCIO TAMBIÉN. Si el proyecto trae manifiesto
    de dependencias, su veredicto es definitivo: sin el driver instalado, la
    aplicación NO puede hablar con ese motor por mucho que su código nombre uno.
    El código solo se mira cuando no hay manifiesto ninguno.

    Antes se mezclaba todo en un mismo texto, y una cadena suelta en el código
    bastaba para decidir. Un `db.py` que normaliza prefijos de varios motores
    —algo perfectamente razonable— se leía como «este proyecto es de
    PostgreSQL»: se le prestaba el motor equivocado y moría al arrancar con
    `ModuleNotFoundError`, porque el driver instalado era el otro.
    """
    root = Path(project_dir).resolve()
    if not root.is_dir():
        return None

    manifiestos = [
        a for nombre in _ARCHIVOS_DEPENDENCIAS
        for a in root.rglob(nombre)
        if not _IGNORAR.intersection(a.parts)
    ]
    if manifiestos:
        deps = "\n".join(a.read_text(encoding="utf-8", errors="ignore") for a in manifiestos)
        for motor, pistas in _PISTAS.items():
            if any(re.search(p, deps, re.I) for p in pistas):
                logger.info(
                    "El proyecto declara %s en sus dependencias; se le prestará el de verificación.",
                    motor,
                )
                return motor
        return None

    # Sin manifiesto no hay nada que declarar: toca deducirlo del código.
    codigo = _texto_codigo(root)
    for motor, pistas in _PISTAS.items():
        if any(re.search(p, codigo, re.I) for p in pistas):
            logger.info("El código apunta a %s; se le prestará el de verificación.", motor)
            return motor
    return None


def url_de_verificacion(motor: str, nombre_bd: str | None = None) -> str | None:
    """URL de conexión que se presta al proyecto para verificarlo."""
    variable = {"postgres": "VERIFY_POSTGRES_URL", "mysql": "VERIFY_MYSQL_URL"}.get(motor)
    url = os.environ.get(variable or "", "").strip()
    if not url:
        logger.warning(
            "El proyecto necesita %s pero no hay base de datos de verificación "
            "configurada (%s). No se podrá comprobar que arranca.", motor, variable,
        )
        return None

    # Cada proyecto usa su propio esquema/base para no pisarse con los demás.
    if nombre_bd:
        url = re.sub(r"/[^/?]+(\?|$)", f"/{nombre_bd}\\1", url)
        _asegurar_base(motor, url, nombre_bd)
    return url


def _asegurar_base(motor: str, url: str, nombre_bd: str) -> None:
    """Crea la base de datos del proyecto si aún no existe.

    Se prestaba la URL con un nombre de base propio (`v_<proyecto>`) pero nunca
    se creaba, así que el servidor arrancaba y moría con `database does not
    exist`. Cada motor se conecta a su base de administración para crearla.
    """
    try:
        if motor == "postgres":
            import psycopg
            admin = re.sub(r"/[^/?]+(\?|$)", "/postgres\\1", url)
            with psycopg.connect(admin, autocommit=True, connect_timeout=10) as con:
                existe = con.execute(
                    "SELECT 1 FROM pg_database WHERE datname = %s", (nombre_bd,)
                ).fetchone()
                if not existe:
                    con.execute(f'CREATE DATABASE "{nombre_bd}"')
                    logger.info("Base de verificación creada: %s", nombre_bd)
        elif motor == "mysql":
            import pymysql
            m = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/", url)
            if m:
                con = pymysql.connect(user=m.group(1), password=m.group(2),
                                      host=m.group(3), port=int(m.group(4)), connect_timeout=10)
                with con.cursor() as cur:
                    cur.execute(f"CREATE DATABASE IF NOT EXISTS `{nombre_bd}`")
                con.close()
                logger.info("Base de verificación MySQL asegurada: %s", nombre_bd)
    except Exception as exc:  # noqa: BLE001 - si no se puede, el proyecto dirá por qué
        logger.warning("No se pudo crear la base de verificación '%s': %s", nombre_bd, exc)


def variables_de_entorno(motor: str, url: str) -> dict[str, str]:
    """Variables que se inyectan al proyecto para que encuentre la base de datos.

    Se cubren los nombres habituales porque cada proyecto generado elige el
    suyo: adivinar solo uno dejaría fuera a la mitad.
    """
    partes = re.match(
        r"^(?P<esquema>\w+)://(?P<usuario>[^:]+):(?P<clave>[^@]+)@"
        r"(?P<host>[^:/]+):(?P<puerto>\d+)/(?P<base>[^?]+)",
        url,
    )
    entorno = {
        "DATABASE_URL": url,
        "DB_URL": url,
        "POSTGRES_URL" if motor == "postgres" else "MYSQL_URL": url,
    }
    if partes:
        d = partes.groupdict()
        entorno.update({
            "DB_HOST": d["host"], "DB_PORT": d["puerto"], "DB_NAME": d["base"],
            "DB_USER": d["usuario"], "DB_PASSWORD": d["clave"],
            "PGHOST": d["host"], "PGPORT": d["puerto"], "PGDATABASE": d["base"],
            "PGUSER": d["usuario"], "PGPASSWORD": d["clave"],
        })
    return entorno


# ----------------------------------------------------------------------
def _texto_codigo(root: Path) -> str:
    """El código. Señal débil: solo se consulta si las dependencias callan."""
    trozos: list[str] = []
    for patron in ("*.py", "*.js"):
        for archivo in root.rglob(patron):
            if _IGNORAR.intersection(archivo.parts):
                continue
            trozos.append(archivo.read_text(encoding="utf-8", errors="ignore")[:4000])
            if len(trozos) > 60:
                break
    return "\n".join(trozos)
