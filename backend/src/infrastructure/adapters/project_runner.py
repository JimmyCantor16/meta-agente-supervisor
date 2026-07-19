"""Arranca proyectos generados y expone su URL (entregable listo para usar).

El objetivo del producto: que el usuario final NO tenga que instalar Docker ni
saber programar. Recibe una **URL viva** de su sistema y un manual con usuarios
de prueba.

Reutiliza el mismo entorno aislado que crea el verificador (venv + dependencias
del proyecto), levanta uvicorn en un puerto libre y espera a que responda.
"""

from __future__ import annotations

import logging
import socket
import subprocess
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from src.domain.ports import ProjectRunnerPort
from src.infrastructure.adapters.project_verifier import PythonProjectVerifier

logger = logging.getLogger(__name__)

_STARTUP_TIMEOUT = 40  # segundos esperando a que la app responda
_PORT_RANGE = (8100, 8300)  # rango donde publicamos los proyectos generados


class LocalProjectRunner(ProjectRunnerPort):
    """Levanta el proyecto con uvicorn en un puerto libre del host."""

    def __init__(self, public_host: str = "localhost") -> None:
        self._host = public_host
        # Procesos vivos por nombre de proyecto, para poder reiniciar/parar.
        self._running: dict[str, subprocess.Popen] = {}
        self._urls: dict[str, str] = {}

    # ------------------------------------------------------------------
    def start(self, project_dir: str, project_name: str) -> str | None:
        root = Path(project_dir).resolve()
        if not root.is_dir():
            return None

        entry = self._find_asgi_entry(root)
        if not entry:
            logger.info("No se encontró app ASGI en '%s'; no se arranca.", project_name)
            return None

        self.stop(project_name)  # si ya corría una versión anterior

        port = self._free_port()
        if port is None:
            logger.warning("Sin puertos libres para arrancar '%s'.", project_name)
            return None

        # Mismo entorno que usa el verificador (ya tiene las dependencias).
        python = PythonProjectVerifier()._prepare_env(root)  # noqa: SLF001

        try:
            process = subprocess.Popen(
                [python, "-m", "uvicorn", entry, "--host", "0.0.0.0", "--port", str(port)],
                cwd=str(root),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except OSError as exc:
            logger.warning("No se pudo arrancar '%s': %s", project_name, exc)
            return None

        url = f"http://{self._host}:{port}"
        if not self._wait_until_up(url, process):
            logger.warning("'%s' no respondió a tiempo; se detiene.", project_name)
            process.terminate()
            return None

        self._running[project_name] = process
        self._urls[project_name] = url
        logger.info("Proyecto '%s' corriendo en %s", project_name, url)
        return url

    def stop(self, project_name: str) -> None:
        process = self._running.pop(project_name, None)
        self._urls.pop(project_name, None)
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
            logger.info("Proyecto '%s' detenido.", project_name)

    # ------------------------------------------------------------------
    @staticmethod
    def _find_asgi_entry(root: Path) -> str | None:
        """Devuelve el import string de uvicorn (p. ej. 'backend.main:app')."""
        for candidate in (
            "backend/main.py",
            "app/main.py",
            "src/main.py",
            "main.py",
            "backend/app.py",
            "app.py",
        ):
            path = root / candidate
            if path.is_file() and "app" in path.read_text(encoding="utf-8", errors="ignore"):
                module = candidate.replace("/", ".").removesuffix(".py")
                return f"{module}:app"
        return None

    @staticmethod
    def _free_port() -> int | None:
        for port in range(*_PORT_RANGE):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                if sock.connect_ex(("127.0.0.1", port)) != 0:
                    return port
        return None

    @staticmethod
    def _wait_until_up(url: str, process: subprocess.Popen) -> bool:
        deadline = time.monotonic() + _STARTUP_TIMEOUT
        while time.monotonic() < deadline:
            if process.poll() is not None:
                return False  # el proceso murió
            try:
                with urlopen(f"{url}/docs", timeout=2):
                    return True
            except URLError:
                pass
            except Exception:  # noqa: BLE001 - cualquier respuesta HTTP sirve
                return True
            time.sleep(1)
        return False
