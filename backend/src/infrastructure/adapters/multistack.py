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


def _es_python(project_dir: str) -> bool:
    """True si el proyecto tiene código Python que verificar."""
    root = Path(project_dir).resolve()
    return any(p for p in root.rglob("*.py") if "__pycache__" not in p.parts)


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
