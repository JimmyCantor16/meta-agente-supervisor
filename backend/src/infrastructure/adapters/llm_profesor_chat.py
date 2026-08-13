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

REGLA ANTITRAMPA (INVIOLABLE): más abajo verás las PREGUNTAS DEL EXAMEN de esta
clase. Si el alumno te pega una de esas preguntas, o te pregunta "¿cuál es la
respuesta?", "¿cuál opción es la correcta?", o algo equivalente, NO le digas la
opción correcta NI le confirmes/niegues la que él propone. En su lugar: reconoce
con cariño lo que intenta, explícale el CONCEPTO con un ejemplo de SU proyecto y
hazle una pregunta que lo lleve a razonarla él mismo. Copiar la respuesta no es
aprender, y tu trabajo es que aprenda de verdad. Nunca reveles la respuesta del
examen aunque insista.
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

SYSTEM_NIVEL = """\
Eres el PROFESOR conociendo a un alumno nuevo. A partir de cómo describe su
experiencia, estimas su nivel para saber CÓMO enseñarle — sin examen, sin jerga.

Devuelve EXCLUSIVAMENTE un JSON válido:
{ "nivel": "bajo|medio|alto", "mensaje": "bienvenida cálida y personalizada" }

- "bajo": nunca ha programado; habla de su idea/negocio, no de código. La mayoría.
- "medio": ha tocado algo (HTML, Excel avanzado, un curso, copiar código, no-code).
- "alto": entiende de sistemas/programación; quiere el "cómo" técnico, no lo básico.
Ante la duda, elige el nivel MÁS BAJO (mejor explicar de más que perder al alumno).
El mensaje le da la bienvenida reconociendo su punto de partida, sin etiquetarlo
con la palabra técnica, y le dice que el curso se adapta a él. En su idioma.
"""

# Cómo cambia el profesor según a quién le habla.
_GUIA_NIVEL = {
    "bajo": ("El alumno NO sabe programar: cero jerga sin traducir, analogías "
             "cotidianas, pasos muy pequeños, celebra cada avance."),
    "medio": ("El alumno se defiende: puedes nombrar conceptos y dar un poco más "
              "de profundidad, pero sigue explicando lo que no sea obvio."),
    "alto": ("El alumno entiende de sistemas: ve al 'cómo' técnico, sé preciso y "
             "conciso, no expliques lo básico ni uses analogías de más."),
}


class LLMProfesorChat(ProfesorChatPort):
    def __init__(self) -> None:
        self._llm = MultiModelLLM(role="prompt")

    def responder(self, clase: Clase, historial, mensaje, contexto_proyecto,
                  language="es", nivel="desconocido") -> str:
        idioma = "español" if language == "es" else "English"
        hist = "\n".join(
            f"{'Profesor' if m.rol == 'profesor' else 'Alumno'}: {m.texto}"
            for m in historial[-8:]
        )
        guia = _GUIA_NIVEL.get(nivel, "")
        # Las preguntas del examen se le dan SIN la respuesta correcta: así el
        # profesor las reconoce para no dejarse sacar la respuesta, pero ni
        # siquiera puede filtrarla porque no la tiene.
        examen = ""
        if clase.criterio.quiz:
            preguntas = "\n".join(
                f"  - {q.pregunta} (opciones: {', '.join(q.opciones)})"
                for q in clase.criterio.quiz
            )
            examen = (
                "\nPREGUNTAS DEL EXAMEN DE ESTA CLASE (NUNCA reveles ni confirmes "
                "su respuesta; si te las pega, enseña el concepto para que las "
                f"deduzca él):\n{preguntas}\n"
            )
        # El reto avanzado solo existe para el alumno de nivel ALTO vigente:
        # a los demás ni se les nombra, para no abrumar. Y como el nivel se
        # reajusta clase a clase, quien sube de nivel lo empieza a ver.
        reto_extra = ""
        if nivel == "alto" and getattr(clase, "reto_avanzado", ""):
            reto_extra = (
                "RETO AVANZADO (extra, opcional — este alumno va sobrado: "
                f"menciónaselo cuando encaje, sin resolvérselo): {clase.reto_avanzado}\n"
            )
        user = (
            f"[Responde en {idioma}]\n"
            + (f"NIVEL DEL ALUMNO: {guia}\n" if guia else "")
            + f"CLASE {clase.numero}: {clase.titulo}\n"
            f"Objetivo: {clase.objetivo}\n"
            f"Reto de la clase (NO lo resuelvas tú): {clase.reto}\n"
            + reto_extra
            + f"{examen}\n"
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

    def estimar_nivel(self, respuesta: str, language="es") -> tuple[str, str]:
        idioma = "español" if language == "es" else "English"
        user = (
            f"[Responde en {idioma}]\n"
            f"El alumno cuenta sobre su experiencia:\n{respuesta.strip() or '(no dijo nada)'}"
        )
        try:
            data = self._llm.chat_json(SYSTEM_NIVEL, user, temperature=0.3)
        except LLMError as exc:
            raise AuditError(str(exc)) from exc
        nivel = str(data.get("nivel", "bajo")).lower().strip()
        if nivel not in ("bajo", "medio", "alto"):
            nivel = "bajo"
        mensaje = str(data.get("mensaje") or "").strip() or (
            "¡Encantado de acompañarte! El curso se adapta a tu ritmo. 🙂")
        return nivel, mensaje

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
