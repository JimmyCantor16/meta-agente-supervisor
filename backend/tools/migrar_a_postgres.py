"""Mueve la memoria del sistema del SQLite a PostgreSQL, sin perder una fila.

Encender `DATABASE_URL` no migra nada por sí solo: la aplicación empezaría a
escribir en Postgres con la base vacía y el usuario se encontraría sin cuenta,
sin curso y sin despliegues, con sus datos intactos pero invisibles en un
archivo que además se borra en el siguiente deploy. Este guion es el puente.

Uso:

    python -m tools.migrar_a_postgres --ensayo          # solo cuenta, no escribe
    python -m tools.migrar_a_postgres
    python -m tools.migrar_a_postgres --desde copia.db --a postgresql://…

Por defecto lee `DB_PATH` y `DATABASE_URL` de la configuración. Es idempotente:
las filas que ya estén (misma clave primaria) se actualizan, así que puede
correrse dos veces sin duplicar nada.
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import get_settings  # noqa: E402
from src.infrastructure.adapters.postgres_support import connect  # noqa: E402

logger = logging.getLogger(__name__)

#: (tabla, claves primarias). El orden no importa: no hay claves foráneas.
TABLAS: list[tuple[str, tuple[str, ...]]] = [
    ("evaluations", ("id",)),
    ("users", ("sub",)),
    ("app_meta", ("key",)),
    ("cursos", ("curso_id",)),
    ("curso_progreso", ("curso_id",)),
    ("curso_chat", ()),          # su id lo pone Postgres (BIGSERIAL)
    ("trabajos", ("id",)),
    ("actividad_alumno", ("usuario", "fecha")),
    ("despliegues", ("slug",)),
    ("metas_proceso", ("id",)),
    ("casos_generacion", ("id",)),
]

#: Columnas que en Postgres son TIMESTAMPTZ y en SQLite venían como texto UTC
#: sin zona. Sin marcarlas, PostgreSQL las interpretaría en la zona de la sesión
#: y el inicio de cada clase se movería de hora — con él, los commits del alumno
#: dejarían de contar por estar "antes" de que la clase empezara.
COLUMNAS_UTC = {("curso_chat", "creado_en")}


def _crear_esquema(dsn: str) -> None:
    """Deja las tablas creadas usando los propios adaptadores (única verdad)."""
    from src.infrastructure.adapters.postgres_actividad_repository import PostgresActividadRepository
    from src.infrastructure.adapters.postgres_caso_repository import PostgresCasoRepository
    from src.infrastructure.adapters.postgres_curso_repository import PostgresCursoRepository
    from src.infrastructure.adapters.postgres_despliegues_repository import PostgresDespliegueRepository
    from src.infrastructure.adapters.postgres_meta_repository import PostgresMetaRepository
    from src.infrastructure.adapters.postgres_repository import PostgresEvaluationRepository
    from src.infrastructure.adapters.postgres_trabajos_repository import PostgresTrabajosRepository
    from src.infrastructure.adapters.postgres_usage_repository import PostgresUsageRepository
    from src.infrastructure.adapters.postgres_user_repository import PostgresUserRepository

    for clase in (
        PostgresEvaluationRepository, PostgresUserRepository, PostgresUsageRepository,
        PostgresCursoRepository, PostgresTrabajosRepository, PostgresActividadRepository,
        PostgresDespliegueRepository, PostgresMetaRepository, PostgresCasoRepository,
    ):
        clase(dsn)


def _tablas_de(sqlite_conn: sqlite3.Connection) -> set[str]:
    filas = sqlite_conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).fetchall()
    return {f[0] for f in filas}


def migrar(origen: str, dsn: str, ensayo: bool = False) -> dict[str, int]:
    conteo: dict[str, int] = {}
    sqlite_conn = sqlite3.connect(f"file:{origen}?mode=ro", uri=True)
    sqlite_conn.row_factory = sqlite3.Row
    existentes = _tablas_de(sqlite_conn)

    if not ensayo:
        _crear_esquema(dsn)

    try:
        for tabla, claves in TABLAS:
            if tabla not in existentes:
                continue
            filas = sqlite_conn.execute(f"SELECT * FROM {tabla}").fetchall()  # noqa: S608 - lista fija
            if not filas:
                conteo[tabla] = 0
                continue
            columnas = [c for c in filas[0].keys() if not (tabla == "curso_chat" and c == "id")]
            if ensayo:
                conteo[tabla] = len(filas)
                continue
            marcadores = ", ".join("%s" for _ in columnas)
            nombres = ", ".join(columnas)
            if claves:
                asignaciones = ", ".join(
                    f"{c} = EXCLUDED.{c}" for c in columnas if c not in claves
                )
                conflicto = (
                    f"ON CONFLICT ({', '.join(claves)}) DO UPDATE SET {asignaciones}"
                    if asignaciones else f"ON CONFLICT ({', '.join(claves)}) DO NOTHING"
                )
            else:
                conflicto = ""
            with connect(dsn) as conn:
                for fila in filas:
                    valores = []
                    for columna in columnas:
                        valor = fila[columna]
                        if (tabla, columna) in COLUMNAS_UTC and isinstance(valor, str) and valor:
                            texto = valor.strip().replace(" ", "T")
                            if not texto.endswith("Z") and "+" not in texto[10:]:
                                texto += "+00:00"
                            valor = texto
                        valores.append(valor)
                    conn.execute(
                        f"INSERT INTO {tabla} ({nombres}) VALUES ({marcadores}) {conflicto}",  # noqa: S608
                        valores,
                    )
            conteo[tabla] = len(filas)
    finally:
        sqlite_conn.close()
    return conteo


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    parser = argparse.ArgumentParser(description="SQLite -> PostgreSQL, sin perder filas.")
    parser.add_argument("--desde", help="Archivo SQLite de origen (por defecto, DB_PATH).")
    parser.add_argument("--a", dest="destino", help="DSN de PostgreSQL (por defecto, DATABASE_URL).")
    parser.add_argument("--ensayo", action="store_true", help="Solo cuenta filas; no escribe nada.")
    args = parser.parse_args()

    settings = get_settings()
    origen = args.desde or settings.db_path
    dsn = args.destino or settings.database_url
    if not Path(origen).is_file():
        print(f"No encuentro el SQLite de origen: {origen}", file=sys.stderr)
        return 1
    if not dsn:
        print("Falta el destino: pon DATABASE_URL o usa --a postgresql://…", file=sys.stderr)
        return 1

    print(f"Origen : {origen}")
    print(f"Destino: {dsn.split('@')[-1] if '@' in dsn else dsn}")
    if args.ensayo:
        print("(ensayo: no se escribe nada)")

    conteo = migrar(origen, dsn, ensayo=args.ensayo)
    if not conteo:
        print("No hay ninguna tabla conocida en el origen.")
        return 0
    for tabla, filas in conteo.items():
        print(f"  {tabla:20} {filas:6} fila(s)")
    print(f"Total: {sum(conteo.values())} filas en {len(conteo)} tablas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
