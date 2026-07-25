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

import hashlib
import json
import logging
import os
import re
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from src.domain.ports import ProjectVerifierPort
from src.infrastructure.adapters.db_verificacion import (
    motor_requerido,
    url_de_verificacion,
    variables_de_entorno,
)
from src.infrastructure.adapters.python_syntax_fixes import revisar_simbolos_js

logger = logging.getLogger(__name__)


_RE_ENDPOINT = re.compile(r"\b(GET)\s+(/\S+)", re.IGNORECASE)


def _endpoints_de_spec(root: Path) -> list[str]:
    """Extrae los endpoints GET del contrato SPEC.md (rutas /api a probar).

    Solo GET: son los que se pueden pedir sin cuerpo. Devuelve rutas únicas.
    """
    spec = root / "SPEC.md"
    if not spec.is_file():
        return []
    rutas: list[str] = []
    try:
        for m in _RE_ENDPOINT.finditer(spec.read_text(encoding="utf-8", errors="ignore")):
            ruta = m.group(2).strip().rstrip(".,;)")
            # Se saltan rutas con parámetros (ej /api/x/:id) — no sabemos el id.
            if ruta.startswith("/") and ":" not in ruta and "{" not in ruta and ruta not in rutas:
                rutas.append(ruta)
    except OSError:
        return []
    return rutas[:12]


def espejo_local(original: Path, reutilizar: bool = False) -> Path:
    """Copia el proyecto a disco local del contenedor y devuelve esa ruta.

    Los proyectos generados viven en una carpeta compartida con el host (bind
    mount). Instalar y sobre todo LEER `node_modules` ahí es lentísimo. Se copia
    el código a `/tmp` (disco nativo), donde `npm install`, el build y el
    arranque van a velocidad normal.

    Con `reutilizar=True` (el runner), si ya existe la copia que dejó el
    verificador —con `node_modules` instalado y un punto de entrada—, se usa tal
    cual: así el servidor arranca con sus dependencias en vez de sin ellas.
    """
    destino = Path(tempfile.gettempdir()) / f"exec-{original.name}"

    if reutilizar and destino.exists():
        tiene_deps = (destino / "backend" / "node_modules").exists() or \
            (destino / "node_modules").exists()
        tiene_entrada = any((destino).rglob("server.js")) or any((destino).rglob("main.js"))
        if tiene_deps and tiene_entrada:
            logger.info("Runner: reutiliza la copia ya preparada por el verificador: %s", destino)
            return destino

    if destino.exists():
        shutil.rmtree(destino, ignore_errors=True)

    # Se copia SIEMPRE limpio (solo ~1 s): reutilizar arriesgaba quedarse con
    # una copia parcial. `node_modules` no se copia; se instala en local.
    def ignorar(_dir, nombres):
        return [n for n in nombres if n in _IGNORAR]

    try:
        shutil.copytree(original, destino, ignore=ignorar)
        logger.info("Proyecto copiado a disco local para ejecutarlo rápido: %s", destino)
        return destino
    except OSError as exc:
        logger.warning("No se pudo copiar a disco local (%s); se usa el original.", exc)
        return original


def entorno_con_bd(directorio: Path) -> dict[str, str]:
    """Entorno con la base de datos que el proyecto pida, si necesita una.

    Se busca desde la carpeta del proyecto (no solo la del package.json) porque
    el motor puede declararse en cualquier parte del repositorio.
    """
    entorno = dict(os.environ)
    raiz = directorio.parent if directorio.name == "backend" else directorio
    motor = motor_requerido(str(raiz))
    if motor:
        nombre = re.sub(r"[^a-zA-Z0-9_]", "_", raiz.name).strip("_").lower()
        url = url_de_verificacion(motor, f"v_{nombre}"[:60])
        if url:
            entorno.update(variables_de_entorno(motor, url))
            logger.info("Inyectada base de datos %s para '%s'.", motor, raiz.name)
    return entorno

# `npm install` de un React completo escribe decenas de miles de archivos. Si
# el proyecto está en una carpeta compartida con el host (bind mount), esa
# escritura es MUY lenta y 4 minutos se quedaban cortos: se agotaba el tiempo y
# el fallo parecía del proyecto cuando era del entorno.
_TIMEOUT = 900
# Los `node_modules` de los proyectos generados viven en una carpeta compartida
# con el host (bind mount). Cargar una librería como Sequelize —que abre cientos
# de archivos pequeños con `require`— a través de ese puente tarda ~20 s, no por
# lentitud del código sino del sistema de archivos. Por eso el arranque necesita
# un margen amplio. (Mejora pendiente: ejecutar fuera del bind mount.)
_BOOT_TIMEOUT = 90  # segundos esperando a que el servidor levante
_IGNORAR = {"node_modules", ".git", "dist", "build"}


class NodeProjectVerifier(ProjectVerifierPort):
    """Verifica proyectos Node ejecutándolos en el propio contenedor."""

    # ------------------------------------------------------------------
    @staticmethod
    def detecta(project_dir: str) -> bool:
        """Indica si el proyecto parece Node (tiene un package.json usable)."""
        return NodeProjectVerifier._find_package(Path(project_dir).resolve()) is not None

    def verify(self, project_dir: str) -> str | None:
        original = Path(project_dir).resolve()
        if not original.is_dir():
            return f"El directorio del proyecto no existe: {project_dir}"

        # Se trabaja sobre una copia en DISCO LOCAL del contenedor, no en la
        # carpeta compartida con el host: leer `node_modules` a través del bind
        # mount tarda 40-90 s (solo cargar express son 12 s), y eso hacía que el
        # arranque pareciera colgado. En disco local, todo carga en 1-2 s.
        root = espejo_local(original)

        pkg_dir = self._find_package(root)
        if pkg_dir is None:
            logger.info("Verificación Node: no hay package.json en '%s'.", root.name)
            return None

        # Los archivos de un frontend con bundler (React/Vite) NO se comprueban
        # con `node --check`: contienen JSX y sintaxis de módulos que Node no
        # entiende, y darían errores falsos. A esos los valida `npm run build`,
        # que es su compilador de verdad.
        compilada = self._carpeta_compilada(root, pkg_dir)
        js_files = [
            p for p in root.rglob("*.js")
            if not _ignorado(p) and not (compilada and compilada in p.parents)
        ]

        # 1) Sintaxis de lo que sí ejecuta Node o el navegador directamente
        if js_files and (error := self._check_syntax(js_files)):
            return error

        # 1b) Imports que apuntan a símbolos inexistentes. Se comprueba ANTES de
        #     arrancar: si no, el servidor muere con `X is not a function` y el
        #     mensaje no dice de dónde debía venir ese símbolo.
        fuentes = {
            str(p.relative_to(root)).replace("\\", "/"): p.read_text(encoding="utf-8", errors="ignore")
            for p in root.rglob("*.js*") if not _ignorado(p) and p.suffix in (".js", ".jsx")
        }
        if error := revisar_simbolos_js(fuentes):
            return error

        # 2) Dependencias reales
        if error := self._install(pkg_dir):
            return error

        # 2b) Compilar el frontend si trae su propio build (React, Vite…).
        #     `npm install`/`npm run build` son COMANDOS, no archivos generados:
        #     por eso el plan declara dependencias y aquí se materializan.
        if error := self._construir_frontend(root, pkg_dir):
            return error

        # 3) Arranque + petición real (a '/' y a los endpoints del contrato)
        return self._check_runtime(pkg_dir, root)

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
        """`node --check` sobre cada archivo; devuelve TODOS los errores.

        Antes se devolvía solo el primero, y eso hacía imposible converger: con
        5 archivos rotos y 3 intentos de reparación, cada intento arreglaba uno
        y descubría el siguiente. Reportarlos todos de golpe permite que una
        sola pasada los corrija.
        """
        errores: list[str] = []
        for archivo in js_files:
            result = subprocess.run(
                ["node", "--check", str(archivo)],
                capture_output=True, text=True, timeout=60,
            )
            if result.returncode != 0:
                detalle = (result.stderr or result.stdout).strip()
                errores.append(f"--- {archivo.name} ---\n{detalle[-800:]}")

        if not errores:
            return self._check_frontend_navegador(js_files)

        logger.warning("Errores de sintaxis en %d archivo(s): %s",
                       len(errores), [e.split(" ")[1] for e in errores])
        return (
            f"ERRORES DE SINTAXIS en {len(errores)} archivo(s). "
            f"Corrígelos TODOS en una sola respuesta:\n\n" + "\n\n".join(errores)
        )

    @staticmethod
    def _check_frontend_navegador(js_files: list[Path]) -> str | None:
        """El JavaScript del frontend debe funcionar en un NAVEGADOR.

        El generador escribe el frontend como si fuera Node: `require(...)` y
        `module.exports`. Eso compila sin error —por eso pasaba desapercibido—
        pero en un navegador revienta con `require is not defined`, y el usuario
        recibe una interfaz que no arranca.
        """
        # Solo aplica al frontend SIN bundler: en un React con Vite los módulos
        # son normales y el compilador se encarga.
        culpables: list[str] = []
        for archivo in js_files:
            if "frontend" not in archivo.parts and "public" not in archivo.parts:
                continue
            if "src" in archivo.parts and (archivo.parents[1] / "package.json").is_file():
                continue
            texto = archivo.read_text(encoding="utf-8", errors="ignore")
            if re.search(r"\brequire\s*\(|\bmodule\.exports\b", texto):
                culpables.append(str(archivo.name))

        if not culpables:
            return None

        logger.warning("Frontend con sintaxis de Node: %s", culpables)
        return (
            "EL FRONTEND USA SINTAXIS DE NODE Y NO FUNCIONARÁ EN UN NAVEGADOR.\n"
            f"Archivos afectados: {', '.join(culpables)}.\n"
            "Usan `require(...)` o `module.exports`, que no existen en el navegador "
            "(dan `require is not defined`). Reescríbelos como scripts de navegador: "
            "las funciones se declaran directamente y se comparten por el ámbito "
            "global, porque el HTML los carga con varias etiquetas <script>. "
            "No declares dos veces el mismo nombre."
        )

    def _install(self, pkg_dir: Path) -> str | None:
        """Instala dependencias de verdad: es donde salen los paquetes inventados.

        Se reinstalaba en CADA intento de reparación —3 minutos cada vez— aunque
        las dependencias no hubieran cambiado. Ahora se recuerda la huella del
        package.json y solo se reinstala si de verdad cambió.
        """
        huella = pkg_dir / "node_modules" / ".huella-verificacion"
        actual = hashlib.sha256(
            (pkg_dir / "package.json").read_bytes()
        ).hexdigest() if (pkg_dir / "package.json").is_file() else ""

        if huella.is_file() and actual and huella.read_text(encoding="utf-8").strip() == actual:
            logger.info("Dependencias ya instaladas y sin cambios; se omite npm install.")
            return None

        logger.info("Instalando dependencias Node en %s...", pkg_dir.name)
        error = self._npm_install(pkg_dir)

        # Un node_modules a medias (copia reutilizada, instalación interrumpida)
        # hace que npm reviente sobre el filesystem de Docker con ENOTEMPTY/ENOENT
        # al intentar reescribir un paquete a medio borrar. NO es culpa del
        # proyecto: se borra node_modules y se reinstala LIMPIO una vez.
        if error and any(m in error for m in ("ENOTEMPTY", "ENOENT", "EEXIST")):
            logger.warning(
                "npm falló por node_modules corrupto en %s; se borra y reinstala limpio.",
                pkg_dir.name,
            )
            shutil.rmtree(pkg_dir / "node_modules", ignore_errors=True)
            (pkg_dir / "package-lock.json").unlink(missing_ok=True)
            error = self._npm_install(pkg_dir)

        if error:
            return f"Fallo instalando dependencias (npm install):\n{error[-3000:]}"

        if actual:
            huella.parent.mkdir(parents=True, exist_ok=True)
            huella.write_text(actual, encoding="utf-8")
        return None

    @staticmethod
    def _npm_install(pkg_dir: Path) -> str | None:
        """Corre `npm install` una vez. Devuelve el error (texto) o None si OK."""
        try:
            result = subprocess.run(
                # `--prefer-offline` reutiliza la caché entre proyectos y
                # `--no-package-lock` evita reescribir un archivo enorme en la
                # carpeta compartida, que es donde se va el tiempo.
                ["npm", "install", "--no-audit", "--no-fund", "--loglevel=error",
                 "--prefer-offline", "--no-package-lock"],
                cwd=str(pkg_dir), capture_output=True, text=True, timeout=_TIMEOUT,
                env={**os.environ, "npm_config_cache": "/tmp/npm-cache"},
            )
        except subprocess.TimeoutExpired:
            return "npm install superó el tiempo máximo."
        if result.returncode != 0:
            return (result.stderr or result.stdout).strip()
        return None

    @staticmethod
    def _carpeta_compilada(root: Path, backend_dir: Path) -> Path | None:
        """Carpeta del frontend que se compila con su propio bundler, si la hay."""
        for pkg in root.rglob("package.json"):
            if _ignorado(pkg) or pkg.parent == backend_dir:
                continue
            try:
                datos = json.loads(pkg.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if "build" in (datos.get("scripts") or {}):
                return pkg.parent
        return None

    def _construir_frontend(self, root: Path, backend_dir: Path) -> str | None:
        """Instala y compila el frontend si tiene su propio `package.json`.

        Un React sin compilar no es una interfaz: es código fuente que ningún
        navegador entiende. Si el proyecto declara un build, hay que ejecutarlo
        antes de dar el sistema por bueno.
        """
        candidatos = [
            p.parent for p in root.rglob("package.json")
            if not _ignorado(p) and p.parent != backend_dir
        ]
        if not candidatos:
            return None

        front = candidatos[0]
        try:
            datos = json.loads((front / "package.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if "build" not in (datos.get("scripts") or {}):
            return None  # Sin script de build no hay nada que compilar.

        if error := self._install(front):
            return f"Fallo instalando dependencias del frontend:\n{error}"

        logger.info("Compilando el frontend (npm run build) en %s...", front.name)
        try:
            result = subprocess.run(
                ["npm", "run", "build"],
                cwd=str(front), capture_output=True, text=True, timeout=_TIMEOUT,
                env={**os.environ, "CI": "true"},
            )
        except subprocess.TimeoutExpired:
            return "La compilación del frontend superó el tiempo máximo."

        if result.returncode != 0:
            salida = (result.stderr or result.stdout).strip()
            logger.warning("El frontend NO compila.")
            return (
                "EL FRONTEND NO COMPILA (`npm run build`). Sin esto no hay "
                "interfaz que entregar:\n" + salida[-3000:]
            )

        destino = next((front / n for n in ("dist", "build") if (front / n).is_dir()), None)
        if destino is None:
            return (
                "`npm run build` terminó sin errores pero no generó carpeta "
                "`dist` ni `build`. Revisa la configuración de salida del bundler."
            )
        logger.info("Frontend compilado en %s.", destino.relative_to(root))
        return None

    def _check_runtime(self, pkg_dir: Path, root: Path | None = None) -> str | None:
        """Levanta el servidor y le hace una petición real."""
        entry = self._find_entry(pkg_dir)
        if entry is None:
            logger.info("Verificación Node: sin punto de entrada reconocible.")
            return None

        port = _free_port()
        if port is None:
            # No poder comprobarlo NO es lo mismo que estar bien: si se
            # devolviera None, el proyecto se daría por verificado sin haberlo
            # arrancado nunca.
            return ("No quedaban puertos libres para arrancar el proyecto, así "
                    "que NO se ha podido comprobar que funcione.")

        env = {**entorno_con_bd(pkg_dir), "PORT": str(port), "NODE_ENV": "development"}
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

                # Vivo, sin escuchar y sin decir nada: casi siempre es el mismo
                # patrón, y sin esta pista el reparador no tiene por dónde empezar.
                if salida.strip() in ("", "(sin salida)"):
                    return (
                        f"El servidor sigue vivo pero NUNCA llegó a escuchar en el "
                        f"puerto {port}, y no imprimió NADA en {_BOOT_TIMEOUT}s.\n"
                        f"Causa habitual: `app.listen()` está dentro de un "
                        f"`.then()` de la base de datos que nunca se resuelve, y "
                        f"sin `.catch()` el fallo queda mudo.\n"
                        f"ARRÉGLALO ASÍ: llama a `app.listen(PORT)` SIEMPRE, en el "
                        f"nivel superior, y conecta la base de datos aparte con su "
                        f"`.catch()` que registre el error. El servidor debe "
                        f"levantar aunque la base de datos falle, y debe imprimir "
                        f"un mensaje al arrancar."
                    )
                return f"El servidor Node no respondió en {_BOOT_TIMEOUT}s:\n{salida[-2000:]}"

            # El servidor sirve '/' (el index.html), pero eso NO prueba que la
            # API funcione: una tabla/dashboard sin sus datos es una pantalla
            # rota. Se ejercitan los endpoints del contrato (SPEC.md) y se exige
            # que respondan JSON de verdad, no un 500 ni el HTML del fallback SPA.
            if root is not None:
                error_api = self._probar_endpoints(port, root, process)
                if error_api:
                    return error_api
        finally:
            _terminar(process)

        return None

    def _probar_endpoints(self, port: int, root: Path, process) -> str | None:
        """Prueba los endpoints declarados en SPEC.md; exige JSON real."""
        endpoints = _endpoints_de_spec(root)
        if not endpoints:
            return None  # sin contrato no hay nada que exigir (compatibilidad)

        import json as _json
        import urllib.error
        import urllib.request

        fallos: list[str] = []
        for path in endpoints:
            url = f"http://127.0.0.1:{port}{path}"
            try:
                with urllib.request.urlopen(url, timeout=6) as resp:
                    status = resp.status
                    cuerpo = resp.read(1500).decode("utf-8", "ignore")
            except urllib.error.HTTPError as exc:
                status = exc.code
                cuerpo = ""
            except Exception as exc:  # noqa: BLE001 - si el server murió, se reporta
                if process.poll() is not None:
                    return (f"El servidor Node murió al pedir {path}:\n"
                            f"{_leer_salida(process)[-2000:]}")
                fallos.append(f"{path}: no respondió ({exc})")
                continue

            recorte = cuerpo.strip()[:120]
            if status >= 500:
                fallos.append(f"{path}: HTTP {status} (error del servidor) -> {recorte}")
            elif status == 404:
                fallos.append(f"{path}: HTTP 404, la ruta NO existe en el backend")
            elif recorte.startswith("<"):
                # Le llegó el index.html del fallback SPA: la ruta de API no está
                # implementada con ese nombre exacto (desajuste frontend/backend).
                fallos.append(f"{path}: devolvió HTML en vez de JSON (la ruta de API no existe)")
            else:
                try:
                    _json.loads(cuerpo)
                except ValueError:
                    fallos.append(f"{path}: la respuesta no es JSON válido -> {recorte}")

        if fallos:
            return (
                "El sistema arranca y sirve la página, pero su API NO entrega los "
                "datos que la interfaz necesita (el usuario vería pantallas vacías "
                "o rotas). Estas rutas del contrato del proyecto fallan:\n- "
                + "\n- ".join(fallos[:8])
                + "\n\nARRÉGLALO: implementa en el backend EXACTAMENTE esas rutas "
                "(mismo nombre y método) devolviendo JSON con datos de ejemplo "
                "(las semillas). El frontend debe pedir esas mismas rutas. No dejes "
                "que el fallback que sirve index.html tape las rutas /api."
            )
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


def _free_port(inicio: int = 8100, fin: int = 8120) -> int | None:
    """Puerto libre del rango publicado en docker-compose (ver project_runner)."""
    for port in range(inicio, fin):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return None


def _wait_http(url: str, process: subprocess.Popen, timeout: int) -> bool:
    """Espera a que el servidor conteste algo por HTTP.

    Solo una RESPUESTA HTTP real cuenta como servidor vivo. Antes había un
    `except Exception: return True` que convertía cualquier fallo inesperado
    —incluido un timeout de conexión, que significa justo lo contrario— en un
    "sí, funciona". Así se dio por buena una verificación de un servidor que
    nunca llegó a escuchar.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return False  # el proceso murió
        try:
            with urlopen(url, timeout=3):
                return True
        except HTTPError:
            return True  # un 404 también lo devuelve un servidor vivo
        except Exception:  # noqa: BLE001 - conexión rechazada, timeout, etc.
            pass  # sigue sin estar listo: se reintenta hasta agotar el plazo
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
