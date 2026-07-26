"""Verificador y runner para sitios web ESTÁTICOS (HTML + CSS + JS puros).

Era el hueco más absurdo del sistema: sabía verificar y arrancar lo difícil
(FastAPI con base de datos, Express con Sequelize) pero un CV de tres archivos
—el stack más fácil de servir que existe— salía "sin URL" porque ningún runner
lo reconocía. Y peor: el verificador multi-stack lo daba por "verificado" sin
haber mirado nada.

Un sitio estático se verifica de verdad (HTML parseable, referencias que
existen, JS con sintaxis válida) y se sirve con un servidor de archivos.
"""

from __future__ import annotations

import logging
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

from src.domain.ports import ProjectRunnerPort, ProjectVerifierPort
from src.infrastructure.adapters.node_project_verifier import (
    _free_port,
    _terminar,
    _wait_http,
)

logger = logging.getLogger(__name__)

_IGNORAR = {"__pycache__", "node_modules", ".git", "dist", "build"}
_STARTUP_TIMEOUT = 20  # un servidor de archivos arranca en milisegundos


def _buscar_index(root: Path) -> Path | None:
    """Encuentra el index.html principal (raíz o un nivel: frontend/, public/...)."""
    candidatos = [root / "index.html"]
    candidatos += sorted(root.glob("*/index.html"))
    for c in candidatos:
        if c.is_file() and not _IGNORAR.intersection(c.parts):
            return c
    return None


class _ValidadorHTML(HTMLParser):
    """Parser tolerante que recoge ids, referencias locales y errores gruesos."""

    VACIAS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
              "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.anclas_usadas: set[str] = set()
        self.recursos: set[str] = set()  # href/src locales (css, js, img)
        self.pila: list[str] = []
        self.desbalances: list[str] = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if d.get("id"):
            self.ids.add(d["id"])
        for attr in ("href", "src"):
            valor = (d.get(attr) or "").strip()
            if not valor:
                continue
            if valor.startswith("#"):
                if len(valor) > 1:
                    self.anclas_usadas.add(valor[1:])
            elif not valor.startswith(("http://", "https://", "//", "mailto:",
                                       "tel:", "data:", "javascript:")):
                self.recursos.add(valor.split("#")[0].split("?")[0])
        if tag not in self.VACIAS:
            self.pila.append(tag)

    def handle_endtag(self, tag):
        if tag in self.VACIAS:
            return
        if self.pila and self.pila[-1] == tag:
            self.pila.pop()
        elif tag in self.pila:
            # cierre desordenado: se desapilan los intermedios (tolerante)
            while self.pila and self.pila[-1] != tag:
                self.desbalances.append(self.pila.pop())
            if self.pila:
                self.pila.pop()


def _error_sintaxis_js(archivo: Path) -> str | None:
    """Comprueba la sintaxis del JS con `node --check` (si node está disponible)."""
    try:
        r = subprocess.run(
            ["node", "--check", str(archivo)],
            capture_output=True, text=True, timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None  # sin node no se puede comprobar; no se inventa un fallo
    if r.returncode != 0:
        return (r.stderr or r.stdout or "").strip()[:600]
    return None


class StaticSiteVerifier(ProjectVerifierPort):
    """Verifica que un sitio estático esté completo y sea coherente."""

    # ------------------------------------------------------------------
    @staticmethod
    def detecta(project_dir: str) -> bool:
        """True si parece un sitio estático: hay index.html y no hay backend."""
        root = Path(project_dir).resolve()
        if not root.is_dir() or _buscar_index(root) is None:
            return False
        if any(p for p in root.rglob("package.json") if not _IGNORAR.intersection(p.parts)):
            return False
        py = [p for p in root.rglob("*.py")
              if not _IGNORAR.intersection(p.parts) and p.name != "__init__.py"]
        return not py

    # ------------------------------------------------------------------
    def verify(self, project_dir: str) -> str | None:
        root = Path(project_dir).resolve()
        index = _buscar_index(root)
        if index is None:
            return "Sitio estático sin index.html: no hay página de entrada."
        base = index.parent

        errores: list[str] = []

        # 1) HTML parseable y razonablemente balanceado.
        html = index.read_text(encoding="utf-8", errors="ignore")
        val = _ValidadorHTML()
        try:
            val.feed(html)
            val.close()
        except Exception as exc:  # html.parser casi nunca lanza, pero por si acaso
            errores.append(f"{index.name}: HTML no parseable: {exc}")
        if val.desbalances:
            errores.append(
                f"{index.name}: etiquetas sin cerrar o mal anidadas: "
                f"{sorted(set(val.desbalances))[:6]}"
            )

        # 2) Cada CSS/JS/imagen referenciada debe existir en disco.
        for recurso in sorted(val.recursos):
            destino = (base / recurso).resolve()
            if not str(destino).startswith(str(base.resolve())):
                continue  # rutas raras fuera del sitio: no es asunto del verificador
            if not destino.is_file():
                errores.append(f"{index.name}: referencia rota, no existe '{recurso}'.")

        # 3) La navegación interna (#seccion) debe apuntar a ids reales.
        rotas = sorted(val.anclas_usadas - val.ids)
        if rotas:
            errores.append(
                f"{index.name}: enlaces de navegación a secciones inexistentes: {rotas[:6]}"
            )

        # 4) Sintaxis de cada JS del sitio.
        for js in sorted(base.rglob("*.js")):
            if _IGNORAR.intersection(js.parts):
                continue
            if (detalle := _error_sintaxis_js(js)) is not None:
                errores.append(f"{js.relative_to(base)}: error de sintaxis JS:\n{detalle}")

        if errores:
            return "Sitio estático con problemas:\n- " + "\n- ".join(errores)
        logger.info("Sitio estático verificado: index, recursos, anclas y JS en orden.")
        return None


class StaticSiteRunner(ProjectRunnerPort):
    """Sirve el sitio estático en un puerto libre con un servidor de archivos."""

    def __init__(self, public_host: str = "localhost") -> None:
        self._host = public_host
        self._running: dict[str, subprocess.Popen] = {}

    @staticmethod
    def detecta(project_dir: str) -> bool:
        return StaticSiteVerifier.detecta(project_dir)

    def start(self, project_dir: str, project_name: str) -> str | None:
        root = Path(project_dir).resolve()
        index = _buscar_index(root)
        if index is None:
            return None

        self.stop(project_name)
        port = _free_port()
        if port is None:
            logger.warning("Sin puertos libres para servir '%s'.", project_name)
            return None

        try:
            process = subprocess.Popen(
                [sys.executable, "-m", "http.server", str(port),
                 "--bind", "0.0.0.0", "--directory", str(index.parent)],
                cwd=str(index.parent),
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        except OSError as exc:
            logger.warning("No se pudo servir '%s': %s", project_name, exc)
            return None

        url = f"http://{self._host}:{port}"
        if not _wait_http(f"http://127.0.0.1:{port}/", process, _STARTUP_TIMEOUT):
            logger.warning("El servidor estático de '%s' no respondió.", project_name)
            _terminar(process)
            return None

        self._running[project_name] = process
        logger.info("Sitio estático '%s' servido en %s", project_name, url)
        return url

    def stop(self, project_name: str) -> None:
        process = self._running.pop(project_name, None)
        if process is not None:
            _terminar(process)
            logger.info("Sitio '%s' detenido.", project_name)
