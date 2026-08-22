"""Prueba: cada repositorio PostgreSQL se comporta igual que su gemelo SQLite.

Sin disco persistente en el plan gratuito, PostgreSQL es el ÚNICO sitio donde la
memoria del sistema sobrevive a un deploy. Pero durante meses solo tres de los
nueve repositorios tenían gemelo Postgres: encender `DATABASE_URL` sin los otros
seis habría partido el estado en dos almacenes —el usuario en Postgres y su
curso en un SQLite que se borra— sin que nada fallara a la vista.

Este guion los pone a los dos a hacer EXACTAMENTE lo mismo y compara resultados.
No mira el SQL: mira la conducta, que es lo que promete el puerto.

    cd backend
    set DATABASE_URL=postgresql://usuario:clave@host:5432/base   (o export)
    PYTHONIOENCODING=utf-8 python pruebas/postgres_gemelos.py

Sin `DATABASE_URL` no falla: avisa y se salta la parte Postgres, para que siga
sirviendo en una máquina sin base a mano. Para una base desechable en local:

    docker run -d --name pg-gemelos -p 55432:5432 -e POSTGRES_PASSWORD=gemelos
        -e POSTGRES_USER=gemelos -e POSTGRES_DB=gemelos postgres:16-alpine
    DATABASE_URL=postgresql://gemelos:gemelos@127.0.0.1:55432/gemelos
        python pruebas/postgres_gemelos.py

(las dos órdenes van en una sola línea cada una)

Usa un esquema propio (`gemelos_prueba`) y lo BORRA al terminar: nunca escribe
en las tablas de nadie.
"""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.domain.entities import (  # noqa: E402
    CasoGeneracion,
    EstadoMVP,
    InfoDespliegue,
    MensajeChat,
    MetaProceso,
    ProgresoCurso,
    Syllabus,
    TrabajoFondo,
)
from src.infrastructure.adapters.sqlite_actividad_repository import SqliteActividadRepository  # noqa: E402
from src.infrastructure.adapters.sqlite_caso_repository import SqliteCasoRepository  # noqa: E402
from src.infrastructure.adapters.sqlite_curso_repository import SqliteCursoRepository  # noqa: E402
from src.infrastructure.adapters.sqlite_despliegues_repository import SqliteDespliegueRepository  # noqa: E402
from src.infrastructure.adapters.sqlite_meta_repository import SqliteMetaRepository  # noqa: E402
from src.infrastructure.adapters.sqlite_trabajos_repository import SqliteTrabajosRepository  # noqa: E402

ESQUEMA = "gemelos_prueba"
fallos: list[str] = []


def comprobar(condicion: bool, mensaje: str) -> None:
    print(("  OK   " if condicion else "  FALLA") + " " + mensaje)
    if not condicion:
        fallos.append(mensaje)


# ---------------------------------------------------------------------------
# Los guiones: lo mismo se le pide a los dos gemelos y se compara la respuesta.
# ---------------------------------------------------------------------------
def guion_trabajos(repo) -> list:
    ahora = "2026-08-21T10:00:00+00:00"
    repo.guardar(TrabajoFondo(id="t1", tipo="publicacion", dueno="ana", estado="en_curso",
                              progreso="subiendo", resultado="", creado_en=ahora, actualizado_en=ahora))
    repo.guardar(TrabajoFondo(id="t1", tipo="publicacion", dueno="ana", estado="listo",
                              progreso="listo", resultado="https://x", creado_en=ahora,
                              actualizado_en="2026-08-21T10:05:00+00:00"))
    repo.guardar(TrabajoFondo(id="t2", tipo="revision", dueno="", estado="en_curso",
                              progreso="", resultado="", creado_en=ahora, actualizado_en=ahora))
    repo.guardar(TrabajoFondo(id="t3", tipo="revision", dueno="beto", estado="en_curso",
                              progreso="", resultado="", creado_en=ahora, actualizado_en=ahora))
    uno = repo.obtener("t1")
    de_ana = [t.id for t in repo.listar_de("ana")]
    return [uno.estado, uno.resultado, sorted(de_ana), repo.obtener("no-existe")]


def guion_actividad(repo) -> list:
    repo.registrar("ana", "2026-08-20")
    repo.registrar("ana", "2026-08-20")
    repo.registrar("ana", "2026-08-21T09:30:00+00:00")
    repo.registrar("", "2026-08-21")
    repo.registrar("beto", "fecha-mala")
    return [repo.fechas_de("ana"), repo.fechas_de("beto"), repo.fechas_de("ana", 1)]


def guion_despliegues(repo) -> list:
    repo.guardar(InfoDespliegue(slug="tienda", nombre_servicio="tienda-web", url="https://a",
                                repo="r", estado="en_curso", detalle="", actualizado_en="2026-08-21T10:00:00"))
    repo.guardar(InfoDespliegue(slug="tienda", nombre_servicio="tienda-web", url="https://a",
                                repo="r", estado="vivo", detalle="ok", actualizado_en="2026-08-21T11:00:00",
                                ultimo_chequeo="2026-08-21T11:05:00"))
    repo.guardar(InfoDespliegue(slug="citas", nombre_servicio="citas-web", url="https://b",
                                repo="r2", estado="caido", detalle="502", actualizado_en="2026-08-21T09:00:00"))
    return [repo.obtener("tienda").estado, repo.obtener("tienda").ultimo_chequeo,
            [d.slug for d in repo.listar()], repo.obtener("fantasma")]


def guion_metas(repo) -> list:
    meta = MetaProceso(id="m1", usuario_sub="ana", objetivo="publicar",
                       created_at="2026-08-21T10:00:00")
    repo.guardar(meta)
    repo.guardar(meta.model_copy(update={"objetivo": "publicar y medir"}))
    otra = MetaProceso(id="m2", usuario_sub="beto", objetivo="aprender",
                       created_at="2026-08-20T10:00:00")
    repo.guardar(otra)
    return [repo.cargar("m1").objetivo, [m.id for m in repo.de_usuario("ana")],
            [m.id for m in repo.de_usuario("beto")], repo.cargar("m9")]


def guion_casos(repo) -> list:
    caso = CasoGeneracion(id="c1", idea="una tienda de zapatos con carrito", arquetipo="tienda",
                          slug="zapatos", estado_mvp=EstadoMVP.FUNCIONA, tuvo_url=True,
                          relanzado=False, problemas=["stock"], lecciones=["sembrar datos"],
                          num_archivos=30, created_at="2026-08-21T10:00:00")
    repo.guardar(caso)
    repo.guardar(caso.model_copy(update={"num_archivos": 31}))
    repo.guardar(caso.model_copy(update={"id": "c2", "idea": "agenda de citas medicas",
                                         "slug": "citas", "created_at": "2026-08-20T10:00:00"}))
    similares = [c.id for c in repo.similares("una tienda de zapatos con carrito")]
    ultimo = repo.ultimo_por_slug("zapatos")
    return [similares, ultimo.num_archivos, ultimo.problemas, [c.id for c in repo.todos()],
            repo.ultimo_por_slug("nada")]


def guion_curso(repo) -> list:
    syllabus = Syllabus(proyecto="zapatos", titulo_curso="Tu tienda", resumen="ocho clases")
    repo.guardar_curso("k1", "ana", syllabus)
    repo.guardar_curso("k1", "ana", syllabus)
    progreso = ProgresoCurso(curso_id="k1", usuario_sub="ana", proyecto="zapatos",
                             clase_actual=2, completadas=[1], total_clases=8, graduado=False,
                             nivel="medio", racha_primeras=1, fallos_seguidos=0, clase_fallando=0)
    repo.guardar_progreso(progreso)
    repo.guardar_progreso(progreso.model_copy(update={"clase_actual": 3, "completadas": [1, 2]}))
    repo.guardar_mensaje("k1", 1, MensajeChat(rol="profesor", texto="hola"))
    repo.guardar_mensaje("k1", 1, MensajeChat(rol="alumno", texto="qué tal"))
    repo.guardar_mensaje("k1", 2, MensajeChat(rol="profesor", texto="segunda clase"))
    cargado = repo.cargar_progreso("k1")
    inicio = repo.inicio_clase("k1", 1)
    # La marca exacta no puede coincidir entre gemelos (son relojes distintos):
    # lo que se compara es que traiga zona horaria y que la clase sin abrir dé None.
    return [
        repo.cargar_syllabus("k1").proyecto,
        repo.curso_de("ana", "zapatos"),
        [cargado.clase_actual, cargado.completadas, cargado.nivel, cargado.racha_primeras],
        [(m.rol, m.texto) for m in repo.historial("k1", 1)],
        [c.curso_id for c in repo.cursos_de("ana")],
        bool(inicio) and ("+" in inicio[10:] or inicio.endswith("Z")),
        repo.inicio_clase("k1", 9),
    ]


GUIONES = [
    ("trabajos", guion_trabajos, SqliteTrabajosRepository, "PostgresTrabajosRepository"),
    ("actividad", guion_actividad, SqliteActividadRepository, "PostgresActividadRepository"),
    ("despliegues", guion_despliegues, SqliteDespliegueRepository, "PostgresDespliegueRepository"),
    ("metas", guion_metas, SqliteMetaRepository, "PostgresMetaRepository"),
    ("casos", guion_casos, SqliteCasoRepository, "PostgresCasoRepository"),
    ("curso", guion_curso, SqliteCursoRepository, "PostgresCursoRepository"),
]


def _clase_postgres(nombre: str):
    modulo = {
        "PostgresTrabajosRepository": "postgres_trabajos_repository",
        "PostgresActividadRepository": "postgres_actividad_repository",
        "PostgresDespliegueRepository": "postgres_despliegues_repository",
        "PostgresMetaRepository": "postgres_meta_repository",
        "PostgresCasoRepository": "postgres_caso_repository",
        "PostgresCursoRepository": "postgres_curso_repository",
    }[nombre]
    import importlib

    return getattr(importlib.import_module(f"src.infrastructure.adapters.{modulo}"), nombre)


def main() -> int:
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        print("Sin DATABASE_URL: no hay base contra la que comparar.")
        print("Ejemplo: DATABASE_URL=postgresql://user:clave@localhost:5432/postgres")
        return 0

    from src.infrastructure.adapters.postgres_support import connect, normalize_dsn  # noqa: PLC0415

    # Todo ocurre en un esquema propio que se crea y se borra: jamás se tocan
    # las tablas de nadie, ni siquiera en una base compartida.
    with connect(dsn) as conn:
        conn.execute(f"DROP SCHEMA IF EXISTS {ESQUEMA} CASCADE")
        conn.execute(f"CREATE SCHEMA {ESQUEMA}")
    # El esquema viaja en NUESTRO parámetro `esquema=`, no en `options=` de
    # libpq: un endpoint agrupado (el `-pooler` de Neon es PgBouncer) rechaza
    # los parámetros de arranque y la conexión ni se abre.
    separador = "&" if "?" in normalize_dsn(dsn) else "?"
    dsn_aislado = f"{normalize_dsn(dsn)}{separador}esquema={ESQUEMA}"

    try:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as carpeta:
            for nombre, guion, clase_sqlite, clase_pg in GUIONES:
                print(f"\n{nombre}")
                esperado = guion(clase_sqlite(str(Path(carpeta) / f"{nombre}.db")))
                obtenido = guion(_clase_postgres(clase_pg)(dsn_aislado))
                iguales = esperado == obtenido
                comprobar(iguales, f"el gemelo Postgres responde igual que el SQLite")
                if not iguales:
                    for i, (a, b) in enumerate(zip(esperado, obtenido)):
                        if a != b:
                            print(f"     paso {i}: sqlite={a!r} postgres={b!r}")
        print("\nmigracion")
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as carpeta:
            origen = str(Path(carpeta) / "memoria.db")
            guion_trabajos(SqliteTrabajosRepository(origen))
            guion_actividad(SqliteActividadRepository(origen))
            guion_despliegues(SqliteDespliegueRepository(origen))
            guion_curso(SqliteCursoRepository(origen))

            from tools.migrar_a_postgres import migrar  # noqa: PLC0415

            conteo = migrar(origen, dsn_aislado)
            comprobar(conteo.get("trabajos") == 3, f"migra los 3 trabajos (llegaron {conteo.get('trabajos')})")
            comprobar(conteo.get("curso_chat") == 3, f"migra los 3 mensajes (llegaron {conteo.get('curso_chat')})")

            trabajos_pg = _clase_postgres("PostgresTrabajosRepository")(dsn_aislado)
            comprobar(trabajos_pg.obtener("t1").resultado == "https://x", "el trabajo migrado se lee igual")
            curso_pg = _clase_postgres("PostgresCursoRepository")(dsn_aislado)
            inicio = curso_pg.inicio_clase("k1", 1)
            comprobar(bool(inicio) and ("+" in inicio[10:] or inicio.endswith("Z")),
                      "el inicio de clase migrado conserva la zona horaria")
            # Idempotente: correrla dos veces no duplica ni rompe.
            migrar(origen, dsn_aislado)
            comprobar(len(trabajos_pg.listar_de("ana")) == 2, "migrar dos veces no duplica filas")

    finally:
        with connect(dsn) as conn:
            conn.execute(f"DROP SCHEMA IF EXISTS {ESQUEMA} CASCADE")

    print("\n" + ("=== FIN OK ===" if not fallos else "=== FALLOS: %d ===" % len(fallos)))
    for fallo in fallos:
        print(" - " + fallo)
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
