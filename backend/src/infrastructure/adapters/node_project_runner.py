"""Arranca proyectos Node/Express generados y expone su URL.

Gemelo de `LocalProjectRunner` (que solo sabe de uvicorn/Python). Sin esto, un
proyecto Node se entregaba sin URL: el usuario recibía código en disco en vez
del sistema funcionando, que es justo lo que el producto promete evitar.

Reutiliza el verificador de Node, que ya dejó las dependencias instaladas.
"""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

from src.domain.ports import ProjectRunnerPort
from src.infrastructure.adapters.node_project_verifier import (
    NodeProjectVerifier,
    _free_port,
    _terminar,
    _wait_http,
)

logger = logging.getLogger(__name__)

_STARTUP_TIMEOUT = 40


class NodeProjectRunner(ProjectRunnerPort):
    """Levanta el servidor Node en un puerto libre del host."""

    def __init__(self, public_host: str = "localhost") -> None:
        self._host = public_host
        self._running: dict[str, subprocess.Popen] = {}

    # ------------------------------------------------------------------
    @staticmethod
    def detecta(project_dir: str) -> bool:
        """Indica si este runner sabe arrancar el proyecto."""
        return NodeProjectVerifier.detecta(project_dir)

    def start(self, project_dir: str, project_name: str) -> str | None:
        root = Path(project_dir).resolve()
        if not root.is_dir():
            return None

        pkg_dir = NodeProjectVerifier._find_package(root)  # noqa: SLF001
        if pkg_dir is None:
            return None

        entry = NodeProjectVerifier._find_entry(pkg_dir)  # noqa: SLF001
        if entry is None:
            logger.warning(
                "SIN URL para '%s': no se encontró el archivo que arranca el servidor Node.",
                project_name,
            )
            return None

        self.stop(project_name)

        port = _free_port()
        if port is None:
            logger.warning("Sin puertos libres para arrancar '%s'.", project_name)
            return None

        # El servidor debe leer el puerto de PORT (así lo exige el planificador).
        env = {**os.environ, "PORT": str(port), "NODE_ENV": "production"}
        try:
            process = subprocess.Popen(
                ["node", entry.name],
                cwd=str(pkg_dir), env=env,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        except OSError as exc:
            logger.warning("No se pudo arrancar '%s': %s", project_name, exc)
            return None

        url = f"http://{self._host}:{port}"
        if not _wait_http(f"http://127.0.0.1:{port}/", process, _STARTUP_TIMEOUT):
            logger.warning("'%s' no respondió a tiempo; se detiene.", project_name)
            _terminar(process)
            return None

        self._running[project_name] = process
        logger.info("Proyecto Node '%s' corriendo en %s", project_name, url)
        return url

    def stop(self, project_name: str) -> None:
        process = self._running.pop(project_name, None)
        if process is not None:
            _terminar(process)
            logger.info("Proyecto '%s' detenido.", project_name)
