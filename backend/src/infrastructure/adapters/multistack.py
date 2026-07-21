"""Despachadores que eligen el verificador/runner según el stack del proyecto.

El generador puede producir un proyecto Python (FastAPI) o Node (Express). Antes
el sistema solo sabía tratar el primero, y con el segundo callaba: lo daba por
"verificado" sin mirarlo y lo entregaba sin URL.

Estos despachadores cumplen los mismos puertos (`ProjectVerifierPort`,
`ProjectRunnerPort`), así que el caso de uso no cambia: sigue pidiendo "verifica"
y "arranca" sin saber en qué lenguaje está escrito el proyecto.
"""

from __future__ import annotations

import logging
from pathlib import Path

from src.domain.ports import ProjectRunnerPort, ProjectVerifierPort
from src.infrastructure.adapters.node_project_runner import NodeProjectRunner
from src.infrastructure.adapters.node_project_verifier import NodeProjectVerifier
from src.infrastructure.adapters.project_runner import LocalProjectRunner
from src.infrastructure.adapters.project_verifier import PythonProjectVerifier

logger = logging.getLogger(__name__)


_ENTRADAS_PYTHON = ("backend/main.py", "app/main.py", "src/main.py", "main.py",
                    "backend/app.py", "app.py")
_IGNORAR = {"__pycache__", "node_modules", ".git", "dist", "build"}


def _es_python(project_dir: str) -> bool:
    """True si el proyecto es realmente un proyecto Python.

    Antes bastaba con que existiera UN archivo .py, y eso resultó desastroso:
    un proyecto Node al que el planificador le coló dos `__init__.py` vacíos se
    enviaba al verificador de Python, que no encontraba módulo de entrada, se
    saltaba todas las comprobaciones y devolvía "correcto". El proyecto se
    entregaba sin que nadie hubiera ejecutado una sola línea.

    Ahora manda el PUNTO DE ENTRADA, y si no hay ninguno claro, quién domina.
    """
    root = Path(project_dir).resolve()

    # 1) Un punto de entrada Python real decide sin ambigüedad.
    for candidato in _ENTRADAS_PYTHON:
        ruta = root / candidato
        if ruta.is_file() and "app" in ruta.read_text(encoding="utf-8", errors="ignore"):
            return True

    # 2) Si hay un package.json con servidor, es Node aunque haya .py sueltos.
    if any(p for p in root.rglob("package.json") if not _IGNORAR.intersection(p.parts)):
        logger.info("Se detecta package.json: el proyecto se trata como Node.")
        return False

    # 3) Sin entrada ni package.json: gana quien tenga más código propio. Los
    #    `__init__.py` no cuentan, porque suelen ir vacíos y no son señal.
    py = [
        p for p in root.rglob("*.py")
        if not _IGNORAR.intersection(p.parts) and p.name != "__init__.py"
    ]
    js = [p for p in root.rglob("*.js") if not _IGNORAR.intersection(p.parts)]
    return len(py) >= len(js) and bool(py)


class MultiStackProjectVerifier(ProjectVerifierPort):
    """Verifica el proyecto con el verificador que corresponda a su stack."""

    def __init__(self) -> None:
        self._python = PythonProjectVerifier()
        self._node = NodeProjectVerifier()

    def verify(self, project_dir: str) -> str | None:
        if _es_python(project_dir):
            logger.info("Verificando como proyecto Python.")
            return self._python.verify(project_dir)

        if NodeProjectVerifier.detecta(project_dir):
            logger.info("Verificando como proyecto Node.")
            return self._node.verify(project_dir)

        # Ni Python ni Node: se dice claramente, en vez de fingir que está bien.
        logger.warning(
            "NO VERIFICADO: no se reconoce el stack de '%s'. Se entrega sin "
            "comprobar que ejecute.",
            Path(project_dir).name,
        )
        return None


class MultiStackProjectRunner(ProjectRunnerPort):
    """Arranca el proyecto con el runner que corresponda a su stack."""

    def __init__(self, public_host: str = "localhost") -> None:
        self._python = LocalProjectRunner(public_host)
        self._node = NodeProjectRunner(public_host)

    def start(self, project_dir: str, project_name: str) -> str | None:
        if _es_python(project_dir):
            return self._python.start(project_dir, project_name)
        if NodeProjectRunner.detecta(project_dir):
            return self._node.start(project_dir, project_name)

        logger.warning(
            "SIN URL para '%s': no se reconoce el stack, no se sabe cómo arrancarlo.",
            project_name,
        )
        return None

    def stop(self, project_name: str) -> None:
        # No sabemos cuál lo tenía; ambos ignoran los nombres desconocidos.
        self._python.stop(project_name)
        self._node.stop(project_name)
