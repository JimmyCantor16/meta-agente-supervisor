"""Verificador de proyectos Node/Express: comprueba que ejecutan de verdad.

Gemelo de `PythonProjectVerifier` para el otro stack que genera el agente. Sin
esto, un proyecto Node se entregaba SIN verificar (el verificador de Python no
encontraba archivos .py y devolvía "correcto"), de modo que el usuario recibía
código que nadie había comprobado.

Mismo enfoque que su gemelo: no se fía del código, lo ejecuta.
  1. Sintaxis de cada archivo .js (`node --check`).
  2. Instalación real de dependencias (`npm install`).
  3. Arranque del servidor y petición HTTP real; si algo peta, se devuelve el
     ERROR REAL para que el agente lo repare con información concreta.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import subprocess
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from src.domain.ports import ProjectVerifierPort

logger = logging.getLogger(__name__)

_TIMEOUT = 240  # segundos para `npm install` (puede tardar)
_BOOT_TIMEOUT = 35  # segundos esperando a que el servidor levante
_IGNORAR = {"node_modules", ".git", "dist", "build"}


class NodeProjectVerifier(ProjectVerifierPort):
    """Verifica proyectos Node ejecutándolos en el propio contenedor."""

    # ------------------------------------------------------------------
    @staticmethod
    def detecta(project_dir: str) -> bool:
        """Indica si el proyecto parece Node (tiene un package.json usable)."""
        return NodeProjectVerifier._find_package(Path(project_dir).resolve()) is not None

    def verify(self, project_dir: str) -> str | None:
        root = Path(project_dir).resolve()
        if not root.is_dir():
            return f"El directorio del proyecto no existe: {project_dir}"

        pkg_dir = self._find_package(root)
        if pkg_dir is None:
            logger.info("Verificación Node: no hay package.json en '%s'.", root.name)
            return None

        js_files = [p for p in root.rglob("*.js") if not _ignorado(p)]
        if not js_files:
            return None

        # 1) Sintaxis
        if error := self._check_syntax(js_files):
            return error

        # 2) Dependencias reales
        if error := self._install(pkg_dir):
            return error

        # 3) Arranque + petición real
        return self._check_runtime(pkg_dir)

    # ------------------------------------------------------------------
    @staticmethod
    def _find_package(root: Path) -> Path | None:
        """Carpeta del package.json del SERVIDOR (no el del frontend)."""
        candidatos = [p for p in root.rglob("package.json") if not _ignorado(p)]
        if not candidatos:
            return None

        def puntua(path: Path) -> tuple[int, int]:
            # Preferimos el que declare un script `start` y el que esté en
            # `backend/`: el frontend suele traer su propio package.json.
            try:
                data = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
            except json.JSONDecodeError:
                data = {}
            tiene_start = "start" in (data.get("scripts") or {})
            en_backend = "backend" in path.parts or "server" in path.parts
            return (not tiene_start, not en_backend)  # menor es mejor

        return sorted(candidatos, key=puntua)[0].parent

    def _check_syntax(self, js_files: list[Path]) -> str | None:
        """`node --check` sobre cada archivo; devuelve el primer error."""
        for archivo in js_files:
            result = subprocess.run(
                ["node", "--check", str(archivo)],
                capture_output=True, text=True, timeout=60,
            )
            if result.returncode != 0:
                error = (result.stderr or result.stdout).strip()
                logger.warning("Error de sintaxis en %s", archivo.name)
                return f"Error de sintaxis en {archivo.name}:\n{error}"
        return None

    def _install(self, pkg_dir: Path) -> str | None:
        """Instala dependencias de verdad: es donde salen los paquetes inventados."""
        logger.info("Instalando dependencias Node en %s...", pkg_dir.name)
        try:
            result = subprocess.run(
                ["npm", "install", "--no-audit", "--no-fund", "--loglevel=error"],
                cwd=str(pkg_dir), capture_output=True, text=True, timeout=_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            return "npm install superó el tiempo máximo."

        if result.returncode != 0:
            error = (result.stderr or result.stdout).strip()
            return f"Fallo instalando dependencias (npm install):\n{error[-3000:]}"
        return None

    def _check_runtime(self, pkg_dir: Path) -> str | None:
        """Levanta el servidor y le hace una petición real."""
        entry = self._find_entry(pkg_dir)
        if entry is None:
            logger.info("Verificación Node: sin punto de entrada reconocible.")
            return None

        port = _free_port()
        if port is None:
            return None  # sin puerto libre no podemos afirmar que falle

        env = {**os.environ, "PORT": str(port), "NODE_ENV": "development"}
        process = subprocess.Popen(
            ["node", entry.name],
            cwd=str(pkg_dir), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )

        try:
            arranco = _wait_http(f"http://127.0.0.1:{port}/", process, _BOOT_TIMEOUT)
            if not arranco:
                # El proceso murió o nunca respondió: su salida ES el error real.
                salida = _leer_salida(process)
                if process.poll() is not None:
                    return f"El servidor Node murió al arrancar:\n{salida[-3000:]}"
                return f"El servidor Node no respondió en {_BOOT_TIMEOUT}s:\n{salida[-2000:]}"
        finally:
            _terminar(process)

        return None

    @staticmethod
    def _find_entry(pkg_dir: Path) -> Path | None:
        """Archivo que arranca el servidor, según package.json o convención."""
        pkg = pkg_dir / "package.json"
        try:
            data = json.loads(pkg.read_text(encoding="utf-8", errors="ignore"))
        except (OSError, json.JSONDecodeError):
            data = {}

        candidatos = []
        if isinstance(data.get("main"), str):
            candidatos.append(data["main"])
        candidatos += ["server.js", "app.js", "index.js", "src/server.js", "src/app.js", "src/index.js"]

        for nombre in candidatos:
            ruta = pkg_dir / nombre
            if ruta.is_file():
                return ruta
        return None


# ----------------------------------------------------------------------
# Utilidades compartidas con el runner de Node
# ----------------------------------------------------------------------
def _ignorado(path: Path) -> bool:
    """True si la ruta está dentro de una carpeta que no debe inspeccionarse."""
    return bool(_IGNORAR.intersection(path.parts))


def _free_port(inicio: int = 8100, fin: int = 8300) -> int | None:
    for port in range(inicio, fin):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return None


def _wait_http(url: str, process: subprocess.Popen, timeout: int) -> bool:
    """Espera a que el servidor conteste algo por HTTP."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return False
        try:
            with urlopen(url, timeout=2):
                return True
        except HTTPError:
            return True  # 404 también significa que el servidor está vivo
        except URLError:
            pass
        except Exception:  # noqa: BLE001
            return True
        time.sleep(1)
    return False


def _leer_salida(process: subprocess.Popen) -> str:
    """Recupera lo que el proceso escribió (ahí está el error real)."""
    try:
        if process.poll() is not None and process.stdout is not None:
            return process.stdout.read() or "(sin salida)"
    except Exception:  # noqa: BLE001
        pass
    return "(sin salida)"


def _terminar(process: subprocess.Popen) -> None:
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
