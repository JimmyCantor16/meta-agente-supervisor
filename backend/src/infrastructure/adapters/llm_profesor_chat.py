"""Adaptador del PROFESOR conversacional (chat dentro de una clase).

Responde al alumno en el contexto de una clase concreta, con memoria del
historial y del código de su proyecto. Guía sin resolver el reto por él, y
juzga con criterio pedagógico si una reflexión demuestra comprensión.
"""

from __future__ import annotations

import logging

from src.domain.entities import Clase, MensajeChat
from src.domain.ports import AuditError, ProfesorChatPort
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM
from src.infrastructure.adapters.skills_loader import skill

logger = logging.getLogger(__name__)

SYSTEM_CHAT = """\
Eres el PROFESOR del Meta-Agente conversando con un alumno que NO sabe
programar, dentro de UNA clase de su curso. Su proyecto real es el material.

Tu forma de enseñar:
- Respondes SU pregunta, corto y claro (2-5 frases), en su idioma.
- Usas el nombre de su proyecto, sus archivos, sus datos reales.
- Analogías cotidianas; si usas un término técnico, lo explicas en la misma frase.
- GUÍAS hacia la respuesta del reto, NO se la das hecha: preguntas, pistas, el
  siguiente paso pequeño. El logro debe sentirlo suyo.
- Si se atasca o se frustra, calma y ánimo. Celebras cada avance.
- Nunca sarcasmo, nunca "como ya te dije".
Responde SOLO con el texto del mensaje (sin JSON, sin markdown de encabezados).
"""

SYSTEM_EVAL = """\
Eres el PROFESOR evaluando si la respuesta de un alumno (que no sabe programar)
demuestra que ENTENDIÓ el punto de su clase. Sé justo pero generoso: buscas
comprensión real con SUS palabras, no una definición perfecta.

Devuelve EXCLUSIVAMENTE un JSON válido:
{ "aprobado": true|false, "mensaje": "tu respuesta al alumno, cálida y concreta" }

- aprobado=true si capta la idea esencial, aunque lo diga simple.
- aprobado=false solo si no responde, está en blanco o es claramente incorrecto;
  en ese caso el mensaje explica con cariño qué le falta y lo invita a reintentar.
- Nunca humilles. Celebra lo que sí entendió.
"""


class LLMProfesorChat(ProfesorChatPort):
    def __init__(self) -> None:
        self._llm = MultiModelLLM(role="prompt")

    def responder(self, clase: Clase, historial, mensaje, contexto_proyecto, language="es") -> str:
        idioma = "español" if language == "es" else "English"
        hist = "\n".join(
            f"{'Profesor' if m.rol == 'profesor' else 'Alumno'}: {m.texto}"
            for m in historial[-8:]
        )
        user = (
            f"[Responde en {idioma}]\n"
            f"CLASE {clase.numero}: {clase.titulo}\n"
            f"Objetivo: {clase.objetivo}\n"
            f"Reto de la clase (NO lo resuelvas tú): {clase.reto}\n\n"
            f"CONTEXTO DEL PROYECTO DEL ALUMNO:\n{contexto_proyecto}\n\n"
            f"CONVERSACIÓN:\n{hist}\n\n"
            f"Responde al último mensaje del alumno como su profesor."
        )
        try:
            data = self._llm.chat_json(
                SYSTEM_CHAT + "\n\n" + skill("profesor_paciente.md")
                + '\n\nDevuelve un JSON: {"mensaje": "tu respuesta"}',
                user, temperature=0.5,
            )
            return str(data.get("mensaje") or data.get("texto") or "").strip() or _fallback()
        except LLMError as exc:
            raise AuditError(str(exc)) from exc

    def evaluar_reflexion(self, clase: Clase, respuesta: str, language="es") -> tuple[bool, str]:
        idioma = "español" if language == "es" else "English"
        user = (
            f"[Responde en {idioma}]\n"
            f"CLASE {clase.numero}: {clase.titulo}\n"
            f"Concepto que debía entender: {clase.concepto_clave or clase.objetivo}\n"
            f"Lo que se le pidió: {clase.criterio.descripcion}\n\n"
            f"RESPUESTA DEL ALUMNO:\n{respuesta}"
        )
        try:
            data = self._llm.chat_json(SYSTEM_EVAL, user, temperature=0.3)
            aprobado = bool(data.get("aprobado"))
            mensaje = str(data.get("mensaje") or "").strip()
            return aprobado, mensaje or ("¡Bien! Lo entendiste." if aprobado
                                         else "Cuéntame un poco más y lo reviso de nuevo. 🙂")
        except LLMError as exc:
            raise AuditError(str(exc)) from exc


def _fallback() -> str:
    return ("Buena pregunta. Vamos por partes: dime qué archivo estás mirando "
            "o qué parte no te cuadra, y lo desmenuzamos juntos. 🙂")
