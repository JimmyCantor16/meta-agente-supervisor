"""Generador de proyectos ITERATIVO con auto-reparación.

Resuelve el problema del "un solo disparo": en vez de pedir todo el proyecto en
una respuesta (que se trunca y sale código roto), procede en 3 fases:

  1. PLANIFICAR  -> el modelo diseña la lista de archivos (manifiesto).
  2. ESCRIBIR    -> genera CADA archivo en su propia llamada (queda completo).
  3. REPARAR     -> un pase final detecta y corrige lo que impide ejecutar
                    (imports faltantes, funciones no definidas, incoherencias).

Cada archivo se genera viendo los ya escritos, para mantener coherencia. Usa el
mismo cliente compatible con OpenAI (Groq/DeepSeek/OpenRouter).
"""

from __future__ import annotations

import logging
import re

from src.config import Settings
from src.domain.entities import GeneratedFile, GeneratedProject
from src.domain.ports import ProjectGenerationError, ProjectGeneratorPort
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM

logger = logging.getLogger(__name__)

# Límites del generador. Con la cadena multi-proveedor (GPT-4.1, Codestral,
# DeepSeek V4...) podemos permitirnos proyectos bastante más completos que
# cuando dependíamos solo del tier mínimo de Groq.
_MAX_FILES = 22  # suficiente para frontend + backend + infra
_MAX_CONTEXT_CHARS = 24_000  # contexto de archivos previos (coherencia)
_MAX_REPAIR_CHARS = 90_000  # tamaño máximo del proyecto para el pase de reparación

# Detecta imports de Python al inicio de línea (from X import ... | import X).
_LOCAL_IMPORT_RE = re.compile(
    r"^\s*(?:from\s+([a-zA-Z_][\w.]*)\s+import|import\s+([a-zA-Z_][\w.]*))",
    re.MULTILINE,
)

# Captura `from [.]* modulo import a, b, c` (incluye imports RELATIVOS).
_FROM_IMPORT_RE = re.compile(
    r"^\s*from\s+(\.*)([\w.]*)\s+import\s+([^\n#]+)",
    re.MULTILINE,
)


_PLANNER_SYS = """\
Eres un arquitecto de software senior. Dado un prompt de ingeniería, diseñas la
lista de archivos de un proyecto EJECUTABLE y COMPLETO (no un boceto).

Devuelve EXCLUSIVAMENTE un JSON válido:
{
  "name": "nombre-del-proyecto",
  "summary": "qué hace, en 1-2 frases",
  "run_instructions": "cómo ejecutarlo tras clonar (comandos)",
  "files": [ { "path": "ruta/relativa", "purpose": "qué contiene y por qué" } ]
}

Reglas:
- Entre 10 y 20 archivos. Rutas SIEMPRE relativas (nunca absolutas ni con '..').
- Si el proyecto es una APLICACIÓN WEB, DEBES incluir **frontend Y backend**:
  una carpeta `frontend/` con su interfaz (HTML/JS o React) y una `backend/` con
  la API. Nunca entregues solo el backend cuando piden una app web.
- Incluye SIEMPRE: docker-compose.yml, README.md, .env.example, CONFIGURE.md,
  DEPLOY.md (despliegue paso a paso para alguien sin experiencia) y **MANUAL.md**.
- **MANUAL.md** es el manual de usuario final (no técnico): para qué sirve el
  sistema, cómo entrar, **USUARIOS DE PRUEBA con sus credenciales** y un paseo
  por las funciones principales, paso a paso.
- Si el sistema tiene login, incluye **datos semilla** (seed) que creen esos
  usuarios de prueba al arrancar (p. ej. admin/admin123 y user/user123), para
  que se pueda probar el MVP de inmediato sin registrarse.
- OBLIGATORIO — ARCHIVOS DE DEPENDENCIAS (se olvidan y rompen el build):
  * Python: `requirements.txt` (con TODAS las librerías que importe el código).
  * Node/JS: `package.json`.
  * Si hay un Dockerfile que haga `COPY X`, ESE archivo X debe estar en la lista.
- Divide el código en módulos coherentes (NO todo en un solo archivo).
- CRÍTICO — COHERENCIA DE IMPORTS (el error más común, evítalo):
  * Si un archivo importará `paquete.modulo`, ESE `paquete/modulo.py` DEBE estar
    en la lista de archivos.
  * NUNCA planifiques a la vez un archivo `X.py` y un paquete `X/` (colisionan).
    Si necesitas varios routers, planifica el PAQUETE: `backend/routers/__init__.py`,
    `backend/routers/users.py`, `backend/routers/tasks.py`, etc.
  * Incluye un `__init__.py` por cada carpeta de paquete Python.
  * Incluye los archivos base que suelen olvidarse: `database.py`, `models.py`,
    `schemas.py`, `auth.py`, `dependencies.py` según aplique.
- No dejes ningún import local sin su archivo correspondiente.
"""

_WRITER_SYS = """\
Eres un ingeniero de software senior. Escribes el contenido COMPLETO, correcto y
EJECUTABLE de UN solo archivo, coherente con el resto del proyecto.

Devuelve EXCLUSIVAMENTE un JSON válido: { "content": "contenido completo del archivo" }

Reglas:
- Sin placeholders, sin 'TODO', sin '...'. Código real y funcional.
- Imports correctos y COMPLETOS. No uses funciones/variables/clases que no existan.
- Coherente con los archivos ya escritos (mismos nombres de módulos, rutas, modelos).
- Si es código, debe ejecutarse sin errores de import ni de sintaxis.
- COHERENCIA DE VERSIONES (error frecuente y fatal):
  * Python: usa imagen base **python:3.12-slim** o superior en el Dockerfile.
    Si usas sintaxis moderna (`X | None`, `list[str]`, `dict[str, int]`), la
    imagen DEBE ser 3.10+. Nunca pongas python:3.9 con esa sintaxis.
  * En `requirements.txt` NO fijes versiones antiguas: usa rangos modernos
    (p. ej. `fastapi>=0.111`, `pydantic>=2.7`). Si usas Pydantic v2, el código
    debe usar sintaxis v2 (`model_config`, `model_validate`), no la v1.
  * Nunca definas una función que se llame a sí misma sin caso base.
"""

_REPAIR_SYS = """\
Eres un revisor de código riguroso. Recibes TODOS los archivos de un proyecto y
detectas lo que IMPIDE ejecutarlo.

VERIFICA ESPECIALMENTE (son los fallos más frecuentes):
1. Cada `from X import a, b, c`: ¿existe X entre los archivos? ¿define/contiene
   realmente `a`, `b` y `c`? Si no, corrígelo (ajusta el import o crea el contenido).
2. Imports circulares o de un módulo a sí mismo (p. ej. `routers.py` haciendo
   `from .routers import ...`). Corrígelos.
2b. RECURSIÓN INFINITA: una función que se llama a sí misma sin caso base.
   Error típico y GRAVE: `def get_db(): db = next(get_db())` — debe usar la
   sesión real (p. ej. `SessionLocal()`) con try/finally, NO invocarse a sí misma.
   Revisa TODAS las funciones: si el cuerpo llama a la misma función, corrígelo.
2c. Archivos referenciados pero inexistentes: si el Dockerfile hace
   `COPY requirements.txt`, ese archivo debe existir (créalo con las
   dependencias reales que importa el código).
2d. COHERENCIA DE VERSIONES (error fatal frecuente): si el código usa sintaxis
   moderna (`X | None`, `list[str]`), el Dockerfile NO puede usar python:3.9 —
   súbelo a **python:3.12-slim**. Y si `requirements.txt` fija versiones viejas
   (fastapi 0.95, pydantic 1.x) mientras el código usa Pydantic v2, corrige el
   requirements a versiones modernas (`fastapi>=0.111`, `pydantic>=2.7`).
3. Que dos archivos no se contradigan: si `app.py` incluye routers `users, tasks`,
   el módulo de routers debe exponer exactamente esos.
4. Funciones/clases/variables usadas pero nunca definidas; errores de sintaxis.
5. Inseguridades obvias (contraseñas en texto plano, secretos hardcodeados).

Corrige SOLO lo necesario y devuelve EXCLUSIVAMENTE un JSON válido:
{ "files": [ { "path": "ruta", "content": "contenido corregido COMPLETO" } ] }

Incluye únicamente los archivos que cambiaste (completos, no diffs). Si no hay
nada que corregir, devuelve { "files": [] }.
"""


_FIX_SYS = """\
Eres un ingeniero depurando un proyecto que NO ARRANCA. Recibes el error REAL
(traceback) y los archivos del proyecto.

Tu tarea: identificar la causa EXACTA del error y corregirla.

Devuelve EXCLUSIVAMENTE un JSON válido:
{ "files": [ { "path": "ruta", "content": "contenido corregido COMPLETO" } ] }

Reglas:
- Incluye SOLO los archivos que modificas, con su contenido COMPLETO (no diffs).
- Ataca la causa raíz del traceback, no síntomas.
- Errores típicos y su arreglo:
  * `from typing import list` -> usar `list` nativo (Python 3.9+) o `List` de typing.
  * `RecursionError` -> una función se llama a sí misma; usa la implementación real.
  * ALIAS QUE SE PISA (causa oculta de RecursionError, MUY común): un módulo hace
    `from x import f`, define `def g(): ... f() ...` y al final escribe `f = g`.
    Esa reasignación hace que dentro de `g` la llamada `f()` apunte a `g` ->
    recursión infinita. SOLUCIÓN: elimina el alias, o importa el módulo y llama
    cualificado (`from backend import database` … `database.get_session()`), o
    importa con otro nombre (`from x import f as _f`). NUNCA reasignes al mismo
    nombre que importaste si lo llamas dentro de la función.
  * `ImportError: cannot import name X` -> X no existe en ese módulo: créalo o corrige el import.
  * `TypeError: unsupported operand type(s) for |` -> la imagen Python es < 3.10:
    sube el Dockerfile a python:3.12-slim (o usa Optional[...]).
- No cambies cosas que no tengan que ver con el error.
"""


class IterativeProjectGenerator(ProjectGeneratorPort):
    """Genera proyectos por fases (planificar → escribir → reparar)."""

    def __init__(self, settings: Settings | None = None) -> None:
        # Rol "code": escribir y reparar archivos. Necesita ventana grande y
        # modelos especializados en código (Codestral), no los de 8k.
        self._llm = MultiModelLLM(role="code")

    def generate(self, prompt: str, language: str = "es") -> GeneratedProject:
        # 1) PLANIFICAR
        manifest = self._plan(prompt, language)
        specs = [f for f in manifest.get("files", []) if f.get("path")][:_MAX_FILES]
        if not specs:
            raise ProjectGenerationError("El planificador no devolvió archivos válidos.")
        logger.info("Plan: %d archivo(s) -> %s", len(specs), [s["path"] for s in specs])

        # 2) ESCRIBIR archivo por archivo (con contexto de los ya escritos)
        files: list[GeneratedFile] = []
        context = ""
        fallidos: list[str] = []
        for i, spec in enumerate(specs, start=1):
            try:
                content = self._write_file(prompt, manifest, spec, context, language)
            except (ProjectGenerationError, LLMError) as exc:
                # Un archivo que falla NO debe tirar el proyecto entero: se
                # anota y se sigue. El pase de completitud lo genera después,
                # igual que hace con los módulos importados que faltan.
                logger.warning("Falló %s (%s). Se intentará en el pase de completitud.",
                               spec["path"], exc)
                fallidos.append(spec["path"])
                continue

            files.append(GeneratedFile(path=spec["path"], content=content))
            block = f"--- {spec['path']} ---\n{content}\n"
            if len(context) + len(block) <= _MAX_CONTEXT_CHARS:
                context += block
            logger.info("Escrito %d/%d: %s", i, len(specs), spec["path"])

        if not files:
            raise ProjectGenerationError("No se pudo escribir ningún archivo del proyecto.")
        if fallidos:
            logger.warning("%d archivo(s) pendientes tras la escritura: %s", len(fallidos), fallidos)

        # 3) COMPLETAR (generar módulos importados pero no creados + __init__.py)
        files = self._ensure_complete(prompt, manifest, files, language)

        # 4) REPARAR (auto-corrección de lo que rompe la ejecución)
        files = self._repair(files, language)

        return GeneratedProject(
            name=manifest.get("name", "proyecto-generado"),
            summary=manifest.get("summary", ""),
            files=files,
            run_instructions=manifest.get("run_instructions", ""),
        )

    # ------------------------------------------------------------------
    # Fases
    # ------------------------------------------------------------------
    def _plan(self, prompt: str, language: str) -> dict:
        user = f"[Idioma: {language}]\n\nPROMPT DE INGENIERÍA:\n{prompt}"
        data = self._chat(_PLANNER_SYS, user)
        if "files" not in data:
            raise ProjectGenerationError("El plan no incluye la clave 'files'.")
        return data

    def _write_file(
        self, prompt: str, manifest: dict, spec: dict, context: str, language: str
    ) -> str:
        structure = "\n".join(
            f"- {f.get('path')}: {f.get('purpose', '')}" for f in manifest.get("files", [])
        )
        user = (
            f"[Idioma: {language}]\n\n"
            f"PROYECTO: {manifest.get('name')} — {manifest.get('summary')}\n\n"
            f"OBJETIVO GLOBAL (prompt original):\n{prompt}\n\n"
            f"ESTRUCTURA COMPLETA:\n{structure}\n\n"
            f"ARCHIVOS YA ESCRITOS (mantén coherencia):\n{context or '(ninguno todavía)'}\n\n"
            f"Escribe AHORA el contenido completo de: {spec['path']}\n"
            f"Propósito: {spec.get('purpose', '')}"
        )
        data = self._chat(_WRITER_SYS, user)
        content = data.get("content")
        if content is None:
            raise ProjectGenerationError(f"No se generó contenido para {spec['path']}.")
        return content

    def _ensure_complete(
        self, prompt: str, manifest: dict, files: list[GeneratedFile], language: str
    ) -> list[GeneratedFile]:
        """Detecta imports locales sin archivo y los genera; añade __init__.py.

        Cierra el hueco típico: main.py importa app.database / app.services… que
        el planificador olvidó crear. Repite hasta que no falte nada (acotado).
        """
        files = list(files)

        for _round in range(3):
            paths = {f.path for f in files}
            # Raíces de paquetes locales = primeras carpetas que contienen archivos.
            roots = {p.split("/")[0] for p in paths if "/" in p}

            # 1) Asegura __init__.py en cada carpeta de paquete con .py.
            for path in list(paths):
                if path.endswith(".py") and "/" in path:
                    parts = path.split("/")[:-1]
                    for i in range(len(parts)):
                        pkg = "/".join(parts[: i + 1])
                        init_path = f"{pkg}/__init__.py"
                        if pkg.split("/")[0] in roots and init_path not in paths:
                            files.append(GeneratedFile(path=init_path, content=""))
                            paths.add(init_path)

            # 2) Busca imports locales (absolutos Y relativos) sin su archivo.
            missing: list[str] = []
            for f in files:
                if not f.path.endswith(".py"):
                    continue

                for match in _FROM_IMPORT_RE.finditer(f.content):
                    dots, module, names_raw = match.group(1), match.group(2), match.group(3)

                    if dots:
                        # Import relativo: resolvemos desde la carpeta del archivo.
                        parts = f.path.split("/")[:-1]
                        up = len(dots) - 1
                        if up:
                            parts = parts[:-up] if up <= len(parts) else []
                        rel = "/".join(parts + ([module.replace(".", "/")] if module else []))
                    else:
                        if not module or module.split(".")[0] not in roots:
                            continue  # stdlib o dependencia externa
                        rel = module.replace(".", "/")

                    rel = rel.strip("/")
                    if not rel:
                        continue

                    # ¿El módulo importado existe (como archivo o como paquete)?
                    is_package = any(p.startswith(rel + "/") for p in paths)
                    if f"{rel}.py" not in paths and not is_package:
                        target = f"{rel}.py"
                        if target not in missing:
                            missing.append(target)
                        continue

                    # Si es un paquete, los nombres importados pueden ser submódulos.
                    if is_package:
                        names = [
                            n.strip().split(" as ")[0].strip().strip("()")
                            for n in names_raw.split(",")
                        ]
                        for name in names:
                            if not name or not name.isidentifier():
                                continue
                            sub = f"{rel}/{name}.py"
                            if sub not in paths and f"{rel}/{name}/__init__.py" not in paths:
                                if sub not in missing:
                                    missing.append(sub)

            # 3) Archivos que un Dockerfile copia (COPY x) pero no existen.
            #    Caso típico: `COPY requirements.txt` sin haberlo generado.
            for f in files:
                if not f.path.endswith("Dockerfile") and "Dockerfile" not in f.path:
                    continue
                for line in f.content.splitlines():
                    stripped = line.strip()
                    if not stripped.upper().startswith("COPY "):
                        continue
                    parts = stripped.split()[1:]
                    if len(parts) < 2:
                        continue
                    src = parts[0].lstrip("./")
                    # Solo archivos concretos (con extensión), no carpetas ni comodines.
                    if not src or "*" in src or "." not in src.split("/")[-1]:
                        continue
                    base_dir = "/".join(f.path.split("/")[:-1])
                    candidates = [src, f"{base_dir}/{src}".lstrip("/")] if base_dir else [src]
                    if not any(c in paths for c in candidates):
                        target = candidates[-1]
                        if target not in missing:
                            missing.append(target)

            if not missing:
                break

            for target in missing[:6]:  # acotado para respetar el tier gratis
                logger.info("Completando módulo faltante: %s", target)
                content = self._write_missing(prompt, manifest, files, target, language)
                files.append(GeneratedFile(path=target, content=content))

        return files

    def _write_missing(
        self, prompt: str, manifest: dict, files: list[GeneratedFile], target: str, language: str
    ) -> str:
        """Genera el contenido de un módulo que otros archivos importan."""
        context = ""
        for f in files:
            block = f"--- {f.path} ---\n{f.content}\n"
            if len(context) + len(block) <= _MAX_CONTEXT_CHARS:
                context += block
        user = (
            f"[Idioma: {language}]\n\n"
            f"PROYECTO: {manifest.get('name')} — {manifest.get('summary')}\n\n"
            f"OBJETIVO GLOBAL:\n{prompt}\n\n"
            f"ARCHIVOS EXISTENTES (mantén coherencia con ellos):\n{context}\n\n"
            f"FALTA el archivo '{target}': otros módulos lo importan pero no existe. "
            f"Escribe su contenido COMPLETO y coherente para que el proyecto se ejecute "
            f"(imports correctos, nombres que coincidan con quienes lo usan)."
        )
        data = self._chat(_WRITER_SYS, user)
        return data.get("content") or ""

    def _repair(self, files: list[GeneratedFile], language: str) -> list[GeneratedFile]:
        blob = "\n\n".join(f"--- {f.path} ---\n{f.content}" for f in files)
        if len(blob) > _MAX_REPAIR_CHARS:
            logger.warning("Proyecto grande; se omite el pase de reparación.")
            return files

        try:
            data = self._chat(_REPAIR_SYS, f"[Idioma: {language}]\n\nARCHIVOS:\n{blob}")
        except ProjectGenerationError as exc:
            logger.warning("Pase de reparación falló (%s); se entrega sin reparar.", exc)
            return files

        by_path = {f.path: f for f in files}
        for fix in data.get("files", []):
            path, content = fix.get("path"), fix.get("content")
            if path and content is not None:
                by_path[path] = GeneratedFile(path=path, content=content)
                logger.info("Reparado: %s", path)
        return list(by_path.values())

    # ------------------------------------------------------------------
    # Auto-verificación: corregir con el ERROR REAL de ejecución
    # ------------------------------------------------------------------
    def repair_with_error(self, project: GeneratedProject, error: str) -> GeneratedProject:
        """Corrige el proyecto usando el traceback real que produjo al ejecutarse."""
        blob = "\n\n".join(f"--- {f.path} ---\n{f.content}" for f in project.files)
        if len(blob) > _MAX_REPAIR_CHARS:
            # Si el proyecto es enorme, mandamos solo los .py (donde está el fallo).
            blob = "\n\n".join(
                f"--- {f.path} ---\n{f.content}"
                for f in project.files
                if f.path.endswith(".py")
            )[:_MAX_REPAIR_CHARS]

        user = (
            f"El proyecto FALLÓ al ejecutarse. Este es el error REAL:\n\n"
            f"```\n{error}\n```\n\n"
            f"ARCHIVOS DEL PROYECTO:\n{blob}\n\n"
            f"Corrige EXACTAMENTE la causa de ese error."
        )

        try:
            data = self._chat(_FIX_SYS, user)
        except ProjectGenerationError as exc:
            logger.warning("No se pudo corregir con el error real (%s); se deja igual.", exc)
            return project

        by_path = {f.path: f for f in project.files}
        for fix in data.get("files", []):
            path, content = fix.get("path"), fix.get("content")
            if path and content is not None:
                by_path[path] = GeneratedFile(path=path, content=content)
                logger.info("Auto-corregido con error real: %s", path)

        return GeneratedProject(
            name=project.name,
            summary=project.summary,
            files=list(by_path.values()),
            run_instructions=project.run_instructions,
        )

    # ------------------------------------------------------------------
    # Cliente LLM (multi-modelo con fallback)
    # ------------------------------------------------------------------
    def _chat(self, system: str, user: str) -> dict:
        """Llama al LLM (con fallback entre proveedores) y devuelve JSON."""
        try:
            return self._llm.chat_json(system, user, temperature=0.2)
        except LLMError as exc:
            raise ProjectGenerationError(str(exc)) from exc
