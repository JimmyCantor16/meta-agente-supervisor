"""Adaptador del agente PROFESOR con IA (multi-modelo con fallback).

En vez de hacer el trabajo, EXPLICA el proyecto y guía al aprendiz para que lo
entienda y lo complete por sí mismo.
"""

from __future__ import annotations

import logging

from pydantic import ValidationError

from src.config import Settings
from src.domain.entities import GeneratedFile, TeachingGuide
from src.domain.ports import AuditError, CodeTeacherPort
from src.infrastructure.adapters.skills_loader import skill
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
Eres un PROFESOR de programación paciente y claro, para aprendices con
conocimientos básicos. Recibes el código de un proyecto y tu objetivo es
ENSEÑAR, no hacer el trabajo: explicas cómo funciona y guías al alumno para que
lo entienda y lo complete por sí mismo.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown):
{
  "summary": "Explicación general del proyecto en lenguaje sencillo (2-4 frases).",
  "steps": ["Paso 1 para entender el proyecto", "Paso 2", "..."],
  "concepts": ["Concepto clave 1 que aprenderá", "Concepto 2", "..."],
  "next_steps": ["Reto práctico 1 para que lo intente el alumno", "Reto 2"]
}

Reglas:
- Lenguaje simple, sin jerga innecesaria; cuando uses un término técnico, explícalo.
- Enfoque didáctico: qué mirar, en qué orden, y por qué.
- 'next_steps' deben ser retos que el ALUMNO haga (no los resuelvas tú).
- Redacta en el idioma indicado. Máximo 6 elementos por lista.
"""


class LLMCodeTeacher(CodeTeacherPort):
    """Profesor respaldado por el cliente multi-modelo."""

    def __init__(self, settings: Settings | None = None) -> None:
        # Rol "prompt": explicar, no escribir código.
        self._llm = MultiModelLLM(role="prompt")

    def teach(
        self,
        target_name: str,
        files: list[GeneratedFile],
        language: str = "es",
    ) -> TeachingGuide:
        context = "\n\n".join(f"--- {f.path} ---\n{f.content}" for f in files)
        user = (
            f"[Idioma: {language}]\n\n"
            f"Proyecto: {target_name}\n\n"
            f"=== ARCHIVOS ===\n{context}"
        )
        try:
            payload = self._llm.chat_json(
                SYSTEM_PROMPT + "\n\n" + skill("profesor_paciente.md"),
                user,
                temperature=0.3,
                # Contrato dentro del bucle: una guía con la forma equivocada la
                # reintenta el siguiente proveedor. `target` lo ponemos nosotros.
                validar=lambda d: TeachingGuide.model_validate({**d, "target": target_name}),
            )
        except LLMError as exc:
            raise AuditError(str(exc)) from exc

        payload["target"] = target_name
        try:
            return TeachingGuide.model_validate(payload)
        except ValidationError as exc:
            raise AuditError("La guía no cumple la estructura esperada.") from exc
