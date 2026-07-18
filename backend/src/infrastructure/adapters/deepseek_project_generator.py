"""Adaptador DeepSeek para el "agente que construye".

Pide a `deepseek-chat` que devuelva un proyecto completo como JSON estructurado
(lista de archivos con su contenido). Reutiliza el mismo cliente y patrón de
manejo de errores del evaluador.
"""

from __future__ import annotations

import json
import logging

from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    OpenAI,
    RateLimitError,
)
from pydantic import ValidationError

from src.config import Settings, get_settings
from src.domain.entities import GeneratedProject
from src.domain.ports import ProjectGenerationError, ProjectGeneratorPort

logger = logging.getLogger(__name__)


# System prompt fijo (cacheable) que define al generador de proyectos.
SYSTEM_PROMPT = """\
Eres un generador de proyectos de software de grado de producción. Recibes un
prompt de ingeniería y devuelves un proyecto COMPLETO y EJECUTABLE.

Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin texto extra) con
esta forma exacta:

{
  "name": "nombre-del-proyecto",
  "summary": "Qué hace el proyecto en 1-2 frases.",
  "files": [
    { "path": "ruta/relativa/archivo.ext", "content": "contenido completo del archivo" }
  ],
  "run_instructions": "Pasos exactos para instalar y ejecutar tras clonar."
}

Reglas estrictas:
- Rutas SIEMPRE relativas (nunca absolutas ni con '..').
- El proyecto debe incluir front, back y base de datos cuando aplique, además de
  un docker-compose.yml para levantarlo con un solo comando.
- Incluye un archivo CONFIGURE.md con el prompt/instrucciones para que otra IA
  termine la configuración (claves, dominios, ajustes finos).
- Incluye README.md con los comandos de instalación y ejecución.
- Código real y funcional, sin placeholders vacíos ni "TODO" sin implementar.
- No incluyas secretos reales; usa .env.example con valores de ejemplo.
"""


class DeepSeekProjectGenerator(ProjectGeneratorPort):
    """Generador de proyectos respaldado por DeepSeek."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client = OpenAI(
            api_key=self._settings.deepseek_api_key,
            base_url=self._settings.deepseek_base_url,
            timeout=self._settings.request_timeout,
            max_retries=self._settings.max_retries,
        )

    def generate(self, prompt: str, language: str = "es") -> GeneratedProject:
        """Genera el proyecto pidiéndoselo a DeepSeek."""
        user_content = (
            f"[Idioma para nombres y documentación: {language}]\n\n"
            f"PROMPT DE INGENIERÍA A CONSTRUIR:\n{prompt}"
        )
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        try:
            response = self._client.chat.completions.create(
                model=self._settings.deepseek_model,
                messages=messages,  # type: ignore[arg-type]
                temperature=0.2,
                response_format={"type": "json_object"},
            )
        except APITimeoutError as exc:
            raise ProjectGenerationError("Timeout generando el proyecto.") from exc
        except RateLimitError as exc:
            raise ProjectGenerationError("Rate limit al generar el proyecto.") from exc
        except APIConnectionError as exc:
            raise ProjectGenerationError("Error de conexión generando el proyecto.") from exc
        except APIError as exc:
            raise ProjectGenerationError(f"La API devolvió un error: {exc}") from exc

        if not response.choices or not response.choices[0].message.content:
            raise ProjectGenerationError("DeepSeek devolvió una respuesta vacía.")

        if response.usage is not None:
            logger.info(
                "Proyecto generado. Tokens total: %s.", response.usage.total_tokens
            )

        return self._parse(response.choices[0].message.content)

    @staticmethod
    def _parse(raw: str) -> GeneratedProject:
        """Parsea y valida el JSON del proyecto."""
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ProjectGenerationError("El modelo devolvió un JSON malformado.") from exc
        try:
            return GeneratedProject.model_validate(payload)
        except ValidationError as exc:
            raise ProjectGenerationError("El proyecto no cumple la estructura esperada.") from exc
