"""Verificador de proyectos Python generados (auto-verificación, sin Docker).

Estrategia (ligera y segura, "opción B"):
  1. COMPILAR todos los .py -> caza errores de sintaxis.
  2. IMPORTAR el módulo de entrada en un subproceso -> caza errores reales de
     ejecución: imports inválidos (`from typing import list`), recursión
     infinita, nombres no definidos, incoherencias entre módulos…

El error capturado se devuelve tal cual para que el agente lo corrija con el
traceback real (no a ciegas).
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from src.domain.ports import ProjectVerifierPort
from src.infrastructure.adapters.db_verificacion import (
    motor_requerido,
    url_de_verificacion,
    variables_de_entorno,
)

logger = logging.getLogger(__name__)

# Cuántos endpoints fallidos se reportan (enteros) al agente reparador.
_MAX_PROBLEMS = 3


def _slug_bd(nombre: str) -> str:
    """Nombre de base de datos válido y propio de cada proyecto."""
    limpio = re.sub(r"[^a-zA-Z0-9_]", "_", nombre).strip("_").lower()
    return f"v_{limpio}"[:60] or "verificacion"


def _cola(texto: str, limite: int) -> str:
    """Recorta conservando el FINAL del texto.

    En un traceback de Python lo decisivo (`ValueError: ...`) está en la última
    línea. Recortar por el principio dejaba fuera precisamente el diagnóstico.
    """
    texto = texto.strip()
    if len(texto) <= limite:
        return texto
    return "[...]\n" + texto[-limite:]

# Candidatos habituales de módulo de entrada, en orden de preferencia.
_ENTRY_CANDIDATES = [
    "backend/main.py",
    "app/main.py",
    "src/main.py",
    "main.py",
    "backend/app.py",
    "app.py",
]

# Script que ejercita la app real: recorre el ESQUEMA OPENAPI (más fiable que
# app.routes), construye cuerpos válidos a partir del schema para no chocar con
# la validación (422) y reporta cualquier 500. Escribe el informe en un archivo
# para que los logs de la app no lo ensucien.
_SMOKE_SCRIPT = '''
import json, traceback, sys

REPORT = sys.argv[1]
problems = []

def dummy(schema, defs, depth=0):
    """Genera un valor de ejemplo a partir de un schema OpenAPI."""
    if depth > 4 or not isinstance(schema, dict):
        return "x"
    if "$ref" in schema:
        name = schema["$ref"].split("/")[-1]
        return dummy(defs.get(name, {}), defs, depth + 1)
    for key in ("anyOf", "oneOf", "allOf"):
        if key in schema and schema[key]:
            return dummy(schema[key][0], defs, depth + 1)
    t = schema.get("type")
    if t == "object" or "properties" in schema:
        props = schema.get("properties", {})
        required = schema.get("required", list(props))
        return {k: dummy(v, defs, depth + 1) for k, v in props.items() if k in required}
    if t == "array":
        return []
    if t == "integer":
        return 1
    if t == "number":
        return 1.0
    if t == "boolean":
        return True
    return "prueba"

try:
    import __ENTRY_MODULE__ as entry
    from fastapi.testclient import TestClient

    app = getattr(entry, "app", None)
    if app is None:
        json.dump([], open(REPORT, "w")); sys.exit(0)

    spec = app.openapi()
    defs = spec.get("components", {}).get("schemas", {})
    client = TestClient(app)

    for path, ops in spec.get("paths", {}).items():
        for method, op in ops.items():
            if method.upper() not in ("GET", "POST", "PUT", "DELETE"):
                continue
            url = path
            # Rellena parámetros de ruta con un valor plausible.
            for param in op.get("parameters", []):
                if param.get("in") == "path":
                    url = url.replace("{" + param["name"] + "}", "1")
            if "{" in url:
                continue
            body = None
            rb = op.get("requestBody", {}).get("content", {}).get("application/json", {})
            if rb.get("schema"):
                body = dummy(rb["schema"], defs)
            try:
                # raise_server_exceptions=False devuelve el 500; con True obtenemos
                # la excepción real (mucho más útil para que el agente la corrija).
                try:
                    r = client.request(method.upper(), url, json=body)
                except Exception:
                    problems.append(
                        method.upper() + " " + url + " fallo con esta excepcion REAL:\\n"
                        + traceback.format_exc()[-1800:]
                    )
                    continue
                if r.status_code >= 500:
                    detail = r.text[:200]
                    # Reintenta dejando propagar la excepción para ver el traceback.
                    try:
                        strict = TestClient(app, raise_server_exceptions=True)
                        strict.request(method.upper(), url, json=body)
                    except Exception:
                        detail = traceback.format_exc()[-1800:]
                    problems.append(
                        method.upper() + " " + url + " -> HTTP " + str(r.status_code)
                        + "\\n" + detail
                    )
            except Exception:
                problems.append(
                    method.upper() + " " + url + " lanzo excepcion:\\n" + traceback.format_exc()[-1500:]
                )
except Exception:
    problems.append("La app no se pudo ejercitar:\\n" + traceback.format_exc()[-1500:])

json.dump(problems, open(REPORT, "w"))
'''

_TIMEOUT = 90  # segundos por comprobación de import/compilación
_VENV_TIMEOUT = 120  # crear el entorno aislado
_PIP_TIMEOUT = 420  # instalar dependencias del proyecto


class PythonProjectVerifier(ProjectVerifierPort):
    """Verifica sintaxis e importabilidad real del proyecto generado."""

    @staticmethod
    def _entorno(root: Path) -> dict[str, str]:
        """Entorno para los subprocesos, con la base de datos que el proyecto pida.

        Si el MVP necesita PostgreSQL o MySQL, se le presta el del entorno de
        verificación. Antes fallaba al conectar y el error real quedaba oculto
        tras un traceback de conexión que no decía nada del código.

        IMPORTANTE: se parte de un entorno MÍNIMO (lista blanca). El código que
        se instala y ejecuta aquí lo escribió un modelo a partir del prompt de un
        usuario, así que no debe ver las claves de los proveedores de IA ni la
        base de datos del backend.
        """
        from src.infrastructure.adapters.entorno_seguro import entorno_minimo

        entorno = entorno_minimo()
        motor = motor_requerido(str(root))
        if motor:
            url = url_de_verificacion(motor, _slug_bd(root.name))
            if url:
                entorno.update(variables_de_entorno(motor, url))
                logger.info("Inyectada base de datos %s para verificar '%s'.", motor, root.name)
        return entorno

    def verify(self, project_dir: str) -> str | None:
        # Resolvemos a ruta ABSOLUTA: los subprocesos corren con cwd=root y las
        # rutas relativas dejarían de resolver.
        root = Path(project_dir).resolve()
        if not root.is_dir():
            return f"El directorio del proyecto no existe: {project_dir}"

        py_files = [p for p in root.rglob("*.py") if "__pycache__" not in p.parts]
        if not py_files:
            # OJO: devolver None significa "verificado y correcto", y eso era una
            # MENTIRA para un proyecto que no es Python (p. ej. Node): no se
            # revisaba nada y aun así se reportaba OK. Se avisa en voz alta.
            logger.warning(
                "NO VERIFICADO: '%s' no contiene archivos .py, así que no se ha "
                "comprobado nada. El proyecto se entrega SIN garantía de que ejecute.",
                root.name,
            )
            return None

        # 1) Sintaxis
        syntax_error = self._check_syntax(root, py_files)
        if syntax_error:
            return syntax_error

        # 2) Import real del módulo de entrada
        import_error = self._check_import(root)
        if import_error:
            return import_error

        # 3) Ejecutar los endpoints de verdad (caza errores en runtime)
        return self._check_runtime(root)

    # ------------------------------------------------------------------
    def _check_syntax(self, root: Path, py_files: list[Path]) -> str | None:
        """Compila los .py y devuelve TODOS los errores de sintaxis a la vez.

        `py_compile` se detiene en el primer archivo roto, así que reportaba uno
        por pasada. Con varios archivos rotos el bucle gastaba un intento por
        cada uno y no llegaba a converger nunca. Darlos todos juntos permite
        arreglarlos en una sola corrección.
        """
        errores: list[str] = []
        for archivo in py_files:
            try:
                compile(archivo.read_text(encoding="utf-8", errors="ignore"),
                        str(archivo), "exec")
            except SyntaxError as exc:
                errores.append(
                    f"--- {archivo.relative_to(root)} ---\n"
                    f"línea {exc.lineno}: {exc.msg}\n{(exc.text or '').rstrip()}"
                )
            except (OSError, ValueError):
                continue

        if not errores:
            return None

        logger.info("Verificación: %d archivo(s) con error de SINTAXIS.", len(errores))
        return (
            f"ERRORES DE SINTAXIS en {len(errores)} archivo(s). "
            f"Corrígelos TODOS en una sola respuesta:\n\n" + "\n\n".join(errores)
        )

    def _check_import(self, root: Path) -> str | None:
        """Instala dependencias en un entorno aislado e importa el proyecto."""
        entry = self._find_entry(root)
        if not entry:
            logger.info("Verificación: sin módulo de entrada reconocible; se omite el import.")
            return None

        python = self._prepare_env(root)
        module = entry.replace("/", ".").removesuffix(".py")

        try:
            result = subprocess.run(
                [python, "-c", f"import {module}"],
                capture_output=True,
                text=True,
                timeout=_TIMEOUT,
                cwd=str(root),
                env=self._entorno(root),
            )
        except subprocess.TimeoutExpired:
            return f"El proyecto se colgó al importar `{module}` (posible bucle infinito)."

        if result.returncode == 0:
            logger.info("Verificación OK: '%s' importa sin errores.", module)
            return None

        stderr = (result.stderr or "").strip()
        logger.info("Verificación: error real al importar '%s'.", module)
        # Cola, no cabeza: el tipo y el mensaje de la excepción van al FINAL.
        return f"ERROR REAL al importar `{module}` del proyecto generado:\n{_cola(stderr, 3000)}"

    def _check_runtime(self, root: Path) -> str | None:
        """Llama de verdad a los endpoints con TestClient de FastAPI.

        El import solo detecta errores de carga; muchos bugs (recursión en las
        dependencias, sesiones de BD mal montadas, etc.) solo aparecen al
        ATENDER una petición. Aquí ejercitamos la app real.
        """
        entry = self._find_entry(root)
        if not entry:
            return None
        module = entry.replace("/", ".").removesuffix(".py")
        python = self._prepare_env(root)

        script = _SMOKE_SCRIPT.replace("__ENTRY_MODULE__", module)

        report = Path(tempfile.gettempdir()) / f"smoke-{root.name}.json"
        if report.exists():
            report.unlink()

        try:
            result = subprocess.run(
                [python, "-c", script, str(report)],
                capture_output=True,
                text=True,
                timeout=_TIMEOUT,
                cwd=str(root),
                env=self._entorno(root),
            )
        except subprocess.TimeoutExpired:
            return "La app se colgó al atender una petición (posible bucle/recursión infinita)."

        if not report.exists():
            output = ((result.stdout or "") + (result.stderr or "")).strip()
            if result.returncode != 0:
                return f"ERROR al ejercitar la app:\n{_cola(output, 3000)}"
            return None

        try:
            problems = json.loads(report.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

        if problems:
            logger.info("Verificación runtime: %d endpoint(s) fallando.", len(problems))
            # Se reportan pocos problemas pero ENTEROS. Antes se unían todos y se
            # cortaba por el final (`[:2500]`), justo donde Python escribe el tipo
            # y el mensaje de la excepción: el agente reparador recibía un
            # traceback decapitado y corregía a ciegas.
            seleccion = problems[:_MAX_PROBLEMS]
            message = (
                "ERRORES EN TIEMPO DE EJECUCIÓN al llamar a los endpoints:\n"
                + "\n\n".join(_cola(p, 2000) for p in seleccion)
            )
            if len(problems) > len(seleccion):
                message += f"\n\n(y {len(problems) - len(seleccion)} endpoint(s) más con fallos)"

            # Muchas apps atrapan la excepción en un middleware y solo devuelven
            # un 500 genérico; el traceback real queda en SUS LOGS. Lo adjuntamos.
            logs = ((result.stdout or "") + (result.stderr or "")).strip()
            if "Traceback" in logs:
                start = logs.find("Traceback")
                message += "\n\nTRACEBACK REAL (de los logs de la app):\n" + _cola(logs[start:], 2500)
            return message

        logger.info("Verificación runtime OK: los endpoints responden sin error 500.")
        return None

    def _prepare_env(self, root: Path) -> str:
        """Crea un venv aislado (fuera del proyecto) e instala requirements.txt.

        Sin las dependencias instaladas no se puede distinguir un bug del código
        de una simple librería ausente. El venv va en un temporal para NO
        ensuciar el proyecto que se entrega al usuario.
        """
        venv_dir = Path(tempfile.gettempdir()) / f"verify-venv-{root.name}"
        python = (
            venv_dir / "Scripts" / "python.exe"
            if sys.platform == "win32"
            else venv_dir / "bin" / "python"
        )

        if not python.exists():
            logger.info("Creando entorno de verificación en %s ...", venv_dir)
            subprocess.run(
                [sys.executable, "-m", "venv", str(venv_dir)],
                capture_output=True,
                timeout=_VENV_TIMEOUT,
            )

        if not python.exists():
            logger.warning("No se pudo crear el venv; se usa el intérprete actual.")
            return sys.executable

        # El requirements.txt no siempre está en la raíz: los proyectos con
        # frontend + backend suelen ponerlo en `backend/`. Buscarlo solo en la
        # raíz dejaba el entorno vacío y todo fallaba con un ImportError de
        # fastapi que parecía un bug del código generado.
        requirements = [
            p for p in root.rglob("requirements.txt")
            if not {"node_modules", ".git", "__pycache__"}.intersection(p.parts)
        ]
        for archivo in requirements:
            logger.info("Instalando dependencias de %s...", archivo.relative_to(root))
            subprocess.run(
                [str(python), "-m", "pip", "install", "-q", "-r", str(archivo)],
                capture_output=True,
                timeout=_PIP_TIMEOUT,
            )
        if not requirements:
            logger.warning("El proyecto no trae requirements.txt: el entorno quedará incompleto.")

        # Dependencias que necesita NUESTRO verificador (no del proyecto):
        # TestClient de FastAPI requiere httpx para ejercitar los endpoints.
        marker = venv_dir / ".verifier-deps-ok"
        if not marker.exists():
            subprocess.run(
                [str(python), "-m", "pip", "install", "-q", "httpx", "httpx2"],
                capture_output=True,
                timeout=_PIP_TIMEOUT,
            )
            try:
                marker.write_text("ok", encoding="utf-8")
            except OSError:
                pass

        return str(python)

    @staticmethod
    def _find_entry(root: Path) -> str | None:
        for candidate in _ENTRY_CANDIDATES:
            if (root / candidate).is_file():
                return candidate
        return None

    @staticmethod
    def _is_local_module_error(stderr: str, root: Path) -> bool:
        """True si el módulo no encontrado pertenece al propio proyecto."""
        local_roots = {p.name for p in root.iterdir() if p.is_dir()}
        for line in stderr.splitlines():
            if "ModuleNotFoundError" in line and "No module named" in line:
                name = line.split("No module named")[-1].strip().strip("'\"")
                if name.split(".")[0] in local_roots:
                    return True
        return False
