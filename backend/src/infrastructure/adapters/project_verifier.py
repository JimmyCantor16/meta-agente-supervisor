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
import subprocess
import sys
import tempfile
from pathlib import Path

from src.domain.ports import ProjectVerifierPort

logger = logging.getLogger(__name__)

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

    def verify(self, project_dir: str) -> str | None:
        # Resolvemos a ruta ABSOLUTA: los subprocesos corren con cwd=root y las
        # rutas relativas dejarían de resolver.
        root = Path(project_dir).resolve()
        if not root.is_dir():
            return f"El directorio del proyecto no existe: {project_dir}"

        py_files = [p for p in root.rglob("*.py") if "__pycache__" not in p.parts]
        if not py_files:
            return None  # No es un proyecto Python: nada que verificar aquí.

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
        """Compila todos los .py; devuelve el error de sintaxis si lo hay."""
        result = subprocess.run(
            [sys.executable, "-m", "py_compile", *[str(p.resolve()) for p in py_files]],
            capture_output=True,
            text=True,
            timeout=_TIMEOUT,
            cwd=str(root),
        )
        if result.returncode != 0:
            error = (result.stderr or result.stdout).strip()
            logger.info("Verificación: error de SINTAXIS detectado.")
            return f"ERROR DE SINTAXIS al compilar el proyecto:\n{error[:3000]}"
        return None

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
            )
        except subprocess.TimeoutExpired:
            return f"El proyecto se colgó al importar `{module}` (posible bucle infinito)."

        if result.returncode == 0:
            logger.info("Verificación OK: '%s' importa sin errores.", module)
            return None

        stderr = (result.stderr or "").strip()
        logger.info("Verificación: error real al importar '%s'.", module)
        return f"ERROR REAL al importar `{module}` del proyecto generado:\n{stderr[:3000]}"

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
            )
        except subprocess.TimeoutExpired:
            return "La app se colgó al atender una petición (posible bucle/recursión infinita)."

        if not report.exists():
            output = ((result.stdout or "") + (result.stderr or "")).strip()
            if result.returncode != 0:
                return f"ERROR al ejercitar la app:\n{output[:3000]}"
            return None

        try:
            problems = json.loads(report.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

        if problems:
            logger.info("Verificación runtime: %d endpoint(s) fallando.", len(problems))
            message = (
                "ERRORES EN TIEMPO DE EJECUCIÓN al llamar a los endpoints:\n"
                + "\n".join(problems)[:2500]
            )
            # Muchas apps atrapan la excepción en un middleware y solo devuelven
            # un 500 genérico; el traceback real queda en SUS LOGS. Lo adjuntamos.
            logs = ((result.stdout or "") + (result.stderr or "")).strip()
            if "Traceback" in logs:
                start = logs.find("Traceback")
                message += "\n\nTRACEBACK REAL (de los logs de la app):\n" + logs[start:][:2500]
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

        requirements = root / "requirements.txt"
        if requirements.is_file():
            logger.info("Instalando dependencias del proyecto para verificarlo...")
            subprocess.run(
                [str(python), "-m", "pip", "install", "-q", "-r", str(requirements)],
                capture_output=True,
                timeout=_PIP_TIMEOUT,
            )

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
