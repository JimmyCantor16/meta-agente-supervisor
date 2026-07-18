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

# Límites pensados para respetar el tier GRATIS (p. ej. Groq: 12.000 tokens/min).
# Cada llamada debe quedar bien por debajo de ese tope.
_MAX_FILES = 8
_MAX_CONTEXT_CHARS = 6_000  # contexto de archivos previos (~1.5k tokens)
_MAX_REPAIR_CHARS = 18_000  # si el proyecto es mayor, se omite la reparación global

# Detecta imports de Python al inicio de línea (from X import ... | import X).
_LOCAL_IMPORT_RE = re.compile(
    r"^\s*(?:from\s+([a-zA-Z_][\w.]*)\s+import|import\s+([a-zA-Z_][\w.]*))",
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
- Entre 6 y 12 archivos. Rutas SIEMPRE relativas (nunca absolutas ni con '..').
- Incluye SIEMPRE: docker-compose.yml, README.md, .env.example, CONFIGURE.md y
  DEPLOY.md (guía de despliegue paso a paso para alguien sin experiencia:
  hosting gratuito y cómo conectar un dominio).
- Divide el código en módulos coherentes (NO todo en un solo archivo).
- CRÍTICO: si un archivo va a importar otro módulo local, ESE módulo DEBE estar
  en la lista. Incluye explícitamente los archivos base que suelen olvidarse:
  configuración/conexión de base de datos (p. ej. database.py), inyección de
  dependencias (dependencies.py) y un __init__.py por cada paquete/carpeta.
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
"""

_REPAIR_SYS = """\
Eres un revisor de código riguroso. Recibes TODOS los archivos de un proyecto y
detectas lo que IMPIDE ejecutarlo: imports faltantes, funciones/variables/clases
no definidas, errores de sintaxis e incoherencias entre archivos (nombres, rutas,
firmas). También corrige inseguridades obvias (p. ej. contraseñas en texto plano).

Corrige SOLO lo necesario y devuelve EXCLUSIVAMENTE un JSON válido:
{ "files": [ { "path": "ruta", "content": "contenido corregido COMPLETO" } ] }

Incluye únicamente los archivos que cambiaste (completos, no diffs). Si no hay
nada que corregir, devuelve { "files": [] }.
"""


class IterativeProjectGenerator(ProjectGeneratorPort):
    """Genera proyectos por fases (planificar → escribir → reparar)."""

    def __init__(self, settings: Settings | None = None) -> None:
        # Cliente multi-modelo: prueba varios proveedores gratis con fallback.
        self._llm = MultiModelLLM()

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
        for i, spec in enumerate(specs, start=1):
            content = self._write_file(prompt, manifest, spec, context, language)
            files.append(GeneratedFile(path=spec["path"], content=content))
            block = f"--- {spec['path']} ---\n{content}\n"
            if len(context) + len(block) <= _MAX_CONTEXT_CHARS:
                context += block
            logger.info("Escrito %d/%d: %s", i, len(specs), spec["path"])

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

            # 2) Busca imports locales que no tengan archivo.
            missing: list[str] = []
            for f in files:
                if not f.path.endswith(".py"):
                    continue
                for match in _LOCAL_IMPORT_RE.finditer(f.content):
                    module = match.group(1) or match.group(2)
                    if not module or module.split(".")[0] not in roots:
                        continue  # stdlib / dependencia externa: se ignora
                    rel = module.replace(".", "/")
                    if f"{rel}.py" in paths or f"{rel}/__init__.py" in paths:
                        continue
                    target = f"{rel}.py"
                    if target not in missing and target not in paths:
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
    # Cliente LLM (multi-modelo con fallback)
    # ------------------------------------------------------------------
    def _chat(self, system: str, user: str) -> dict:
        """Llama al LLM (con fallback entre proveedores) y devuelve JSON."""
        try:
            return self._llm.chat_json(system, user, temperature=0.2)
        except LLMError as exc:
            raise ProjectGenerationError(str(exc)) from exc
