"""Adaptador de DeepSeek: implementación de `PromptEvaluatorPort`.

Traduce el contrato del dominio a llamadas concretas de la API de DeepSeek
(mediante el SDK de OpenAI). Aquí viven el system prompt del "Ingeniero de
Requerimientos Senior", el JSON mode, los reintentos y el logging de cada
análisis. Ningún detalle de este archivo se filtra al dominio.
"""

from __future__ import annotations

import logging

from pydantic import ValidationError

from src.config import Settings
from src.domain.entities import (
    AgentEvaluation,
    DeveloperPrompt,
    FewShotExample,
    ResponseLanguage,
)
from src.domain.ports import PromptEvaluationError, PromptEvaluatorPort
from src.infrastructure.adapters.skills_loader import skill
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM

logger = logging.getLogger(__name__)


# -----------------------------------------------------------------------------
# SYSTEM PROMPT — constante FIJA y reutilizable (habilita Prompt Caching).
# Define la persona de un revisor de requerimientos senior e implacable y fija
# el contrato JSON de salida de forma inequívoca.
# -----------------------------------------------------------------------------
SYSTEM_PROMPT = """\
Eres un Ingeniero de Requerimientos y Arquitecto de Software Senior, implacable
y meticuloso. Tu trabajo es recibir una idea o prompt de desarrollo de un
usuario y prepararla para que un AGENTE DE CÓDIGO AUTÓNOMO la ejecute sin
ambigüedades y sin desperdiciar tokens.

Tu proceso mental (no lo muestres, solo aplícalo):
1. Evalúa la viabilidad técnica y las reglas de negocio de la idea.
2. Detecta ambigüedades, lógica omitida, riesgos de arquitectura, requisitos no
   funcionales faltantes (seguridad, escalabilidad, manejo de errores, datos).
3. Reescribe la idea como un prompt de grado de ingeniería: explícito,
   estructurado, con stack sugerido, restricciones, criterios de aceptación y
   entregables concretos, pero SIN relleno innecesario.

Debes responder EXCLUSIVAMENTE con un objeto JSON válido (sin markdown, sin
texto fuera del JSON) con exactamente estas claves:

{
  "status": "aprobado" | "sugerir_ajustes",
  "analisis_critico": "Evaluación técnica de la viabilidad de la idea y sus reglas de negocio.",
  "sugerencias_mejora": ["Sugerencia concreta 1", "Sugerencia concreta 2"],
  "preguntas_para_el_usuario": [
    {
      "texto": "¿Qué métodos de pago aceptarás?",
      "opciones": ["Tarjeta de crédito", "Nequi", "DaviPlata", "Efectivo contra entrega"],
      "permite_otro": true
    }
  ],
  "plantillas": [
    {
      "nombre": "Artesanal cálida",
      "descripcion": "Tarjetas grandes con fotos, tipografía redondeada, mucho aire.",
      "estilo": "acogedor y hecho a mano",
      "colores": ["#8B4513", "#EFEBE9", "#C2185B", "#FFF8F0"]
    }
  ],
  "prompt_final_optimizado": "El prompt de grado de ingeniería listo para inyectar en un modelo de generación de código autónomo."
}

Reglas estrictas:
- VIABILIDAD PRIMERO (aterrizaje a la realidad). Clasifica la idea en silencio:
  a) SOFTWARE VIABLE como MVP web → procede normal.
  b) VIABLE PERO FUERA DE ALCANCE HOY (app móvil nativa, hardware/IoT,
     integraciones que exigen credenciales de terceros, tiempo real masivo):
     status "sugerir_ajustes", explica el límite SIN tecnicismos y reformula el
     prompt final hacia la versión web del MVP que SÍ se puede entregar hoy
     (p. ej. "app móvil de citas" → web responsive instalable que se ve
     perfecta en el teléfono). El usuario debe sentir que avanza, no que lo
     rechazan.
  c) NO ES SOFTWARE o es físicamente imposible ("llévame a la luna", "hazme
     rico", "cúrame"): status "sugerir_ajustes", dilo con honestidad y calidez
     en "analisis_critico" (una frase, sin burlas), y OFRECE el software más
     cercano que sí aterriza su deseo (p. ej. "no puedo llevarte a la luna,
     pero puedo construirte una web interactiva para explorar el sistema solar
     o un planificador de metas"). El prompt final describe ESA alternativa y
     "preguntas_para_el_usuario" pregunta cuál versión quiere. NUNCA generes
     un prompt para algo imposible ni finjas que se puede.
- "status" es "aprobado" solo si la idea ya es clara y ejecutable; en cuanto
  detectes ambigüedad relevante o lógica faltante, usa "sugerir_ajustes".
- "sugerencias_mejora" debe ir vacía ([]) únicamente cuando el status sea
  "aprobado" y no queden mejoras materiales.
- "preguntas_para_el_usuario" son EXCLUSIVAMENTE datos que SOLO el usuario puede
  aportar y que, si faltan, el sistema tendría que INVENTAR relleno: nombres
  reales de personas o marcas, enlaces (GitHub, redes), productos y precios
  reales, textos propios, credenciales de servicios. NO son preguntas técnicas
  de arquitectura (eso decídelo tú). Máximo 4, concretas y fáciles de responder.
  Cada pregunta lleva "opciones": 2-6 respuestas PROBABLES y marcables (el
  usuario puede marcar varias), pensadas para que responder cueste un clic; y
  "permite_otro": true casi siempre, para que pueda escribir algo distinto.
  Déjala vacía ([]) si la idea no necesita datos personales del usuario.
- "plantillas": SIEMPRE que la idea tenga interfaz visible, propone entre 3 y 5
  plantillas visuales CLARAMENTE DISTINTAS entre sí (no variaciones del mismo
  look). Cada una declara su paleta en "colores" (3-5 hex reales y armónicos) y
  su "estilo" en pocas palabras. El usuario podrá elegir una, combinar varias, o
  aportar su propia referencia (una URL de una página que le guste o un texto);
  tu prompt final debe estar escrito para aceptar esa decisión posterior.
  Déjala vacía ([]) solo si la idea no tiene interfaz (una API pura, un script).
- "prompt_final_optimizado" SIEMPRE debe entregarse, incluso si el status es
  "aprobado" (en ese caso, es la versión pulida de la idea original).
- MODO INQUIETO (por defecto): no te limites a transcribir lo pedido. Explora
  más allá: propone en el prompt final los detalles que el usuario no pidió pero
  va a agradecer — responsive real, accesibilidad, estados vacíos cuidados,
  micro-interacciones, semillas de datos creíbles, escalabilidad razonable.
  Marca esos extras como "mejoras del agente". Si el usuario dice explícitamente
  que NO quiere extras o que no seas inquieto, OBEDECE y limítate a lo pedido.
- Redacta TODOS los valores de texto del JSON en el idioma que se te indique al
  inicio del mensaje del usuario (por defecto, español).
- No inventes requisitos absurdos; infiere lo razonable y márcalo como asunción.
"""


# Mapa de código de idioma -> nombre legible para la instrucción del modelo.
# Vive en el adaptador (infraestructura) porque es un detalle de cómo hablamos
# con el LLM, no una regla del dominio.
_LANGUAGE_NAMES: dict[ResponseLanguage, str] = {
    ResponseLanguage.ES: "español",
    ResponseLanguage.EN: "inglés (English)",
}


class DeepSeekPromptEvaluator(PromptEvaluatorPort):
    """Evaluador de prompts respaldado por DeepSeek (`deepseek-chat`)."""

    def __init__(self, settings: Settings | None = None) -> None:
        """Inicializa el evaluador con el cliente multi-modelo (fallback)."""
        # Rol "prompt": analizar y reescribir la idea. Son peticiones cortas con
        # mucho razonamiento, ideales para los modelos pequeños y rápidos.
        self._llm = MultiModelLLM(role="prompt")

    def evaluate(
        self,
        prompt: DeveloperPrompt,
        examples: list[FewShotExample] | None = None,
    ) -> AgentEvaluation:
        """Evalúa y optimiza el prompt del usuario contra DeepSeek.

        Args:
            prompt: Prompt de desarrollo validado por el dominio.
            examples: Evaluaciones pasadas útiles para guiar al modelo (RAG).

        Returns:
            Evaluación estructurada y validada (`AgentEvaluation`).

        Raises:
            PromptEvaluationError: Ante fallos de red/API, JSON inválido o
                respuestas que no cumplen el contrato del dominio.
        """
        user_prompt = prompt.normalized()
        language_name = _LANGUAGE_NAMES.get(prompt.language, "español")
        examples_block = self._build_examples_block(examples or [])
        logger.info(
            "Analizando prompt (%d caracteres, idioma=%s, %d ejemplo(s))...",
            len(user_prompt),
            prompt.language.value,
            len(examples or []),
        )

        # La instrucción de idioma y los ejemplos se anteponen al contenido del
        # usuario. Así el SYSTEM_PROMPT permanece 100% idéntico entre peticiones y
        # se sirve desde la caché de DeepSeek (prompt caching).
        user_content = (
            f"[Idioma de respuesta: {language_name}. "
            f"Redacta en ese idioma todos los valores de texto del JSON.]\n\n"
            f"{examples_block}"
            f"---\n\n"
            f"NUEVA IDEA A EVALUAR:\n{user_prompt}"
        )

        payload = self._request_json(user_content)
        evaluation = self._validate(payload)

        logger.info(
            "Análisis completado -> status=%s, %d sugerencia(s).",
            evaluation.status,
            len(evaluation.sugerencias_mejora),
        )
        return evaluation

    # ---------------------------------------------------------------------
    # Helpers privados
    # ---------------------------------------------------------------------

    @staticmethod
    def _build_examples_block(examples: list[FewShotExample]) -> str:
        """Construye el bloque de ejemplos históricos para el few-shot / RAG.

        Cada ejemplo muestra un prompt pasado y la evaluación (en JSON) que el
        usuario consideró útil, para que el modelo replique ese criterio.
        Devuelve cadena vacía si no hay ejemplos.
        """
        if not examples:
            return ""

        parts = [
            "EJEMPLOS DE EVALUACIONES ANTERIORES QUE EL USUARIO MARCÓ COMO ÚTILES.",
            "Úsalos como guía de estilo y criterio (no los copies literalmente):\n",
        ]
        for i, ex in enumerate(examples, start=1):
            # Serializamos la evaluación tal como debería lucir la salida.
            example_json = ex.evaluation.model_dump_json()
            parts.append(f"[Ejemplo {i}]")
            parts.append(f"Idea: {ex.prompt}")
            parts.append(f"Evaluación útil: {example_json}\n")

        return "\n".join(parts) + "\n"

    def _request_json(self, user_content: str) -> dict:
        """Llama al LLM (multi-modelo con fallback) y devuelve el JSON."""
        try:
            return self._llm.chat_json(SYSTEM_PROMPT + "\n\n" + skill("profesor_paciente.md"), user_content, temperature=0.2)
        except LLMError as exc:
            logger.error("Fallo del LLM al evaluar: %s", exc)
            raise PromptEvaluationError(str(exc)) from exc

    @staticmethod
    def _validate(payload: dict) -> AgentEvaluation:
        """Valida el JSON contra el contrato del dominio."""
        try:
            return AgentEvaluation.model_validate(payload)
        except ValidationError as exc:
            logger.error("La respuesta no cumple el esquema AgentEvaluation: %s", exc)
            raise PromptEvaluationError("La respuesta del modelo no cumple el contrato esperado.") from exc
