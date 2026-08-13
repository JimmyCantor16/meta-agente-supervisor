"""Prueba de la revisión de entregas (FASE 2) con el agente CLI SIMULADO.

Nace de un fallo real visto en el contenedor, en vivo:

    WARNING | src.application.revision_entregas | Revisión de
    'una-lista-de-tareas-simple' FALLIDA: El agente no devolvió un veredicto
    JSON con la forma pedida.

La función estrella del orquestador estaba muerta al 100 %, también con el CLI
real: el caso de uso esperaba que ``ejecutar(..., validar=…)`` le devolviera la
entidad, pero el contrato del puerto dice —y ambos adaptadores cumplen— que el
retorno de ``validar`` se DESCARTA y lo que vuelve es el dict crudo. El
``isinstance(resultado, VeredictoRevision)`` no podía dar True jamás.

Lo que se comprueba aquí, corriendo de verdad sobre un repo git temporal:

  1. CAMINO FELIZ: se emite el veredicto, se archivan ``REVISION.md`` y
     ``REVISION.json`` en la rama de entrega, y el trabajo de fondo queda
     'listo' (no 'fallido').
  2. Los campos que NO decide el modelo los pone el worker: el ``slug`` es el
     que se encargó (no el que el agente se invente) y ``publicado`` es False.
  3. FALLO CONTROLADO: si el agente responde texto plano o un JSON con la forma
     equivocada, no revienta hacia arriba: veredicto con ``aprobar=False``,
     motivo en el resumen y trabajo 'fallido'.

Offline: no toca la red ni gasta cupo de ningún modelo.

    cd backend
    PYTHONIOENCODING=utf-8 python pruebas/revision_de_la_entrega.py
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.application.revision_entregas import RevisionEntregasUseCase  # noqa: E402
from src.application.trabajos import TrabajosUseCase  # noqa: E402
from src.domain.ports import AgenteCliPort  # noqa: E402
from src.infrastructure.adapters.git_util import correr_git  # noqa: E402
from src.infrastructure.adapters.mock_claude_cli import MockClaudeCli  # noqa: E402
from src.infrastructure.adapters.sqlite_trabajos_repository import (  # noqa: E402
    SqliteTrabajosRepository,
)

SLUG = "una-lista-de-tareas-simple"
RAMA = f"agente/{SLUG}"

#: Autoría fija para el commit de partida: la máquina que corra esto puede no
#: tener `user.name` global y `git commit` se negaría.
_ENV_AUTOR = {
    "GIT_AUTHOR_NAME": "Constructor",
    "GIT_AUTHOR_EMAIL": "constructor@jamz.local",
    "GIT_COMMITTER_NAME": "Constructor",
    "GIT_COMMITTER_EMAIL": "constructor@jamz.local",
}

INFORME = """# Informe de la entrega

Lista de tareas simple: backend FastAPI con SQLite y una pantalla única.

## Qué se construyó
- CRUD completo de tareas con 10 registros de semilla.
- Login y registro en pantallas separadas.

ENTREGA LISTA PARA REVISION
"""

MAIN_PY = '''"""API de la lista de tareas."""

from fastapi import FastAPI

app = FastAPI(title="Lista de tareas")

TAREAS = [{"id": 1, "titulo": "Comprar pan", "hecha": False}]


@app.get("/api/tareas")
def listar():
    return TAREAS
'''

INDEX_HTML = """<!doctype html>
<html lang="es">
  <head><meta charset="utf-8" /><title>Lista de tareas</title></head>
  <body><main id="app">Cargando tus tareas…</main></body>
</html>
"""


# ----------------------------------------------------------------------
# Agentes de pega para los caminos tristes (el feliz usa el mock de verdad)
# ----------------------------------------------------------------------
class AgenteQueDevuelveTexto(AgenteCliPort):
    """El puerto puede devolver texto plano: eso NO es un veredicto."""

    def disponible(self) -> bool:
        return True

    def probar(self) -> str | None:
        return None

    def ejecutar(self, system: str, user: str, validar: Any = None, cwd: Any = None,
                 timeout_s: int = 300, **_kw: Any) -> Any:
        return "Claro, aquí tienes mi opinión sobre el proyecto…"

    def ejecutar_stream(self, system: str, user: str, al_evento: Any,
                        validar: Any = None, cwd: Any = None,
                        timeout_s: int = 600, **_kw: Any) -> Any:
        return self.ejecutar(system, user, validar, cwd, timeout_s)


class AgenteConFormaEquivocada(AgenteQueDevuelveTexto):
    """JSON impecable, forma inventada: el modo de fallo típico del gratis."""

    def ejecutar(self, system: str, user: str, validar: Any = None, cwd: Any = None,
                 timeout_s: int = 300, **_kw: Any) -> Any:
        # `calidad` fuera de rango (1-10) y sin resumen: no pasa el contrato.
        return {"aprobar": "puede ser", "calidad": 42, "mejoras": "varias"}


# ----------------------------------------------------------------------
def sep(titulo: str) -> None:
    print(f"\n{'=' * 66}\n{titulo}\n{'=' * 66}")


def git(repo: Path, *args: str, env: dict[str, str] | None = None) -> tuple[bool, str]:
    return correr_git(repo, *args, env_extra=env)


def preparar_repo(raiz: Path) -> Path:
    """Un repo git como el que deja `EntregaEnRama`: rama `agente/<slug>`."""
    repo = raiz / SLUG
    (repo / "backend").mkdir(parents=True)
    (repo / "INFORME.md").write_text(INFORME, encoding="utf-8")
    (repo / "backend" / "main.py").write_text(MAIN_PY, encoding="utf-8")
    (repo / "index.html").write_text(INDEX_HTML, encoding="utf-8")

    ok, salida = git(repo, "init", "-b", RAMA)
    assert ok, f"git init falló: {salida}"
    ok, salida = git(repo, "add", "-A")
    assert ok, f"git add falló: {salida}"
    ok, salida = git(repo, "commit", "-m", "entrega del agente", env=_ENV_AUTOR)
    assert ok, f"git commit falló: {salida}"
    return repo


def montar_caso(raiz: Path, agente: AgenteCliPort) -> tuple[RevisionEntregasUseCase, TrabajosUseCase, list[str]]:
    trabajos = TrabajosUseCase(SqliteTrabajosRepository(str(raiz / "trabajos.db")))
    avisos: list[str] = []
    caso = RevisionEntregasUseCase(
        agente_cli=agente,
        trabajos=trabajos,
        publicar=None,  # sin publicación automática: aquí se juzga la revisión
        repo_root=raiz,
        al_avisar=avisos.append,
        publicar_si_calidad=0,
    )
    return caso, trabajos, avisos


def ultimo_trabajo(trabajos: TrabajosUseCase, dueno: str):
    lista = trabajos.listar_de(dueno, 5)
    assert lista, "no se registró ningún trabajo de fondo"
    return lista[0]


def main() -> int:
    fallos: list[str] = []

    # `ignore_cleanup_errors`: en Windows el .db de sqlite y los objetos de git
    # pueden quedar un instante tomados y el borrado del temporal reventaría al
    # final, convirtiendo una prueba VERDE en roja por pura plomería del SO.
    with tempfile.TemporaryDirectory(
        prefix="prueba-revision-", ignore_cleanup_errors=True
    ) as tmp:
        raiz = Path(tmp)
        repo = preparar_repo(raiz)

        # ------------------------------------------------------------------
        sep("1. CAMINO FELIZ: el agente devuelve el dict crudo (como el CLI real)")
        caso, trabajos, avisos = montar_caso(raiz, MockClaudeCli())
        veredicto = caso.revisar(SLUG, dueno="alumno-1")

        print(f"slug      : {veredicto.slug}")
        print(f"aprobar   : {veredicto.aprobar}")
        print(f"calidad   : {veredicto.calidad}/10")
        print(f"publicado : {veredicto.publicado}")
        print(f"resumen   : {veredicto.resumen}")
        print(f"mejoras   : {len(veredicto.mejoras)}")
        print(f"aviso WS  : {avisos[-1] if avisos else '(ninguno)'}")

        if "no se pudo completar" in veredicto.resumen.lower():
            fallos.append("la revisión terminó en el veredicto de fallo controlado")
        if veredicto.slug != SLUG:
            fallos.append(f"el slug lo puso el agente ({veredicto.slug}) y no el worker")
        if veredicto.publicado:
            fallos.append("publicado=True sin publicador: lo decide el worker, no el modelo")
        if not (1 <= veredicto.calidad <= 10):
            fallos.append(f"calidad fuera de rango: {veredicto.calidad}")

        sep("2. EL VEREDICTO QUEDÓ ARCHIVADO EN LA RAMA DE ENTREGA")
        ok_md, revision_md = git(repo, "show", f"{RAMA}:REVISION.md")
        ok_json, revision_json = git(repo, "show", f"{RAMA}:REVISION.json")
        print(f"REVISION.md   : {'sí' if ok_md else 'NO'} ({len(revision_md)} bytes)")
        print(f"REVISION.json : {'sí' if ok_json else 'NO'} ({len(revision_json)} bytes)")
        if not ok_md:
            fallos.append(f"REVISION.md no está en la rama: {revision_md[:120]}")
        if not ok_json:
            fallos.append(f"REVISION.json no está en la rama: {revision_json[:120]}")
        if ok_md:
            print("--- primeras líneas de REVISION.md ---")
            for linea in revision_md.splitlines()[:8]:
                print(f"  {linea}")
            if SLUG not in revision_md:
                fallos.append("REVISION.md no menciona el proyecto revisado")
        if ok_json:
            datos = json.loads(revision_json)
            print(f"--- REVISION.json: slug={datos['slug']} calidad={datos['calidad']} ---")
            if datos["slug"] != veredicto.slug or datos["calidad"] != veredicto.calidad:
                fallos.append("REVISION.json no coincide con el veredicto devuelto")

        sep("3. EL TRABAJO DE FONDO QUEDÓ 'LISTO' (no 'fallido')")
        trabajo = ultimo_trabajo(trabajos, "alumno-1")
        print(f"tipo     : {trabajo.tipo}")
        print(f"estado   : {trabajo.estado}")
        print(f"progreso : {trabajo.progreso[:100]}")
        if trabajo.estado != "listo":
            fallos.append(f"el trabajo quedó '{trabajo.estado}' y no 'listo'")
        if trabajo.resultado:
            resultado = json.loads(trabajo.resultado)
            print(f"resultado: slug={resultado['slug']} aprobar={resultado['aprobar']}")
            if resultado["slug"] != SLUG:
                fallos.append("el resultado guardado no es el veredicto de este proyecto")
        else:
            fallos.append("el trabajo listo no guardó el veredicto como resultado")

        # ------------------------------------------------------------------
        sep("4. FALLO CONTROLADO: respuestas que NO son un veredicto")
        for nombre, agente in (
            ("texto plano", AgenteQueDevuelveTexto()),
            ("JSON con la forma equivocada", AgenteConFormaEquivocada()),
        ):
            caso_malo, trabajos_malo, _ = montar_caso(raiz, agente)
            malo = caso_malo.revisar(SLUG, dueno=f"alumno-{nombre}")
            trabajo_malo = ultimo_trabajo(trabajos_malo, f"alumno-{nombre}")
            print(f"\n[{nombre}]")
            print(f"  aprobar : {malo.aprobar} · calidad {malo.calidad}/10")
            print(f"  resumen : {malo.resumen[:120]}")
            print(f"  trabajo : {trabajo_malo.estado}")
            if malo.aprobar:
                fallos.append(f"[{nombre}] aprobó una respuesta que no es un veredicto")
            if "no se pudo completar" not in malo.resumen.lower():
                fallos.append(f"[{nombre}] el motivo del fallo no quedó en el resumen")
            if trabajo_malo.estado != "fallido":
                fallos.append(f"[{nombre}] el trabajo quedó '{trabajo_malo.estado}'")

    sep("RESULTADO")
    if fallos:
        for f in fallos:
            print(f"  ✗ {f}")
        print(f"\n=== FIN CON {len(fallos)} FALLO(S) ===")
        return 1
    print("  ✓ El veredicto se emite, se archiva en la rama y el trabajo queda 'listo'.")
    print("  ✓ Una respuesta que no es un veredicto falla controlada, sin reventar.")
    print("\n=== FIN OK ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
