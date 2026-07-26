"""Adaptador del agente auditor con IA (vía OpenAI SDK: DeepSeek/Groq/OpenRouter).

Envía el código del proyecto al modelo pidiéndole que actúe como revisor senior
y devuelva un informe estructurado de mejoras priorizadas.
"""

from __future__ import annotations

import logging

from pydantic import ValidationError

from src.config import Settings
from src.domain.entities import AuditReport, GeneratedFile
from src.domain.ports import AuditError, CodeAuditorPort
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """\
Eres un revisor de código y arquitecto de software senior, implacable y
constructivo. Recibes los archivos de un proyecto y devuelves un informe de
mejoras priorizadas para llevarlo de "funciona" a "grado de producción".

Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin texto extra):

{
  "summary": "Diagnóstico general en 1-2 frases.",
  "suggestions": [
    {
      "title": "Mejora concreta y corta",
      "category": "seguridad | rendimiento | mantenibilidad | tests | arquitectura | dependencias | documentacion",
      "priority": "alta | media | baja",
      "file": "archivo afectado (o vacío si es general)",
      "rationale": "Por qué importa.",
      "suggestion": "Qué hacer concretamente."
    }
  ]
}

Reglas:
- Prioriza por impacto real (seguridad y correctitud primero).
- Sé específico y accionable; nada de generalidades vacías.
- Máximo 8 sugerencias, las más importantes.
- Redacta en el idioma indicado.
"""


class LLMCodeAuditor(CodeAuditorPort):
    """Auditor respaldado por el modelo configurado (Groq/DeepSeek/OpenRouter)."""

    def __init__(self, settings: Settings | None = None) -> None:
        # Rol "code": aunque su salida es un análisis, le entra el proyecto
        # entero, así que necesita la misma ventana grande que el generador.
        self._llm = MultiModelLLM(role="code")

    def audit(
        self,
        target_name: str,
        files: list[GeneratedFile],
        language: str = "es",
    ) -> AuditReport:
        code_context = self._build_context(files)
        user_content = (
            f"[Idioma del informe: {language}]\n\n"
            f"Proyecto: {target_name}\n\n"
            f"=== ARCHIVOS DEL PROYECTO ===\n{code_context}"
        )

        try:
            payload = self._llm.chat_json(SYSTEM_PROMPT, user_content, temperature=0.2)
        except LLMError as exc:
            raise AuditError(str(exc)) from exc

        return self._validate(target_name, payload)

    @staticmethod
    def _build_context(files: list[GeneratedFile]) -> str:
        """Concatena los archivos en un bloque legible para el modelo."""
        parts = []
        for f in files:
            parts.append(f"--- {f.path} ---\n{f.content}")
        return "\n\n".join(parts)

    @staticmethod
    def _validate(target_name: str, payload: dict) -> AuditReport:
        # Inyectamos el target (el modelo no tiene por qué saberlo).
        payload["target"] = target_name
        try:
            return AuditReport.model_validate(payload)
        except ValidationError as exc:
            raise AuditError("El informe no cumple la estructura esperada.") from exc
