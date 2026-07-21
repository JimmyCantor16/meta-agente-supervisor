"""Entidades del dominio: modelos puros del negocio.

Se modelan con Pydantic v2 porque además de estructurar datos necesitamos
validación estricta del contrato de salida del LLM. Aun así, estas clases no
conocen nada sobre HTTP, DeepSeek ni FastAPI: pertenecen al núcleo del dominio.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


class EvaluationStatus(str, Enum):
    """Veredicto del meta-agente sobre el prompt del usuario."""

    APROBADO = "aprobado"
    SUGERIR_AJUSTES = "sugerir_ajustes"


class ResponseLanguage(str, Enum):
    """Idioma en el que el agente debe redactar su respuesta.

    Añadir un idioma nuevo aquí (p. ej. PT = "pt") es el único cambio necesario
    en el dominio; el adaptador se encarga de traducirlo a una instrucción.
    """

    ES = "es"
    EN = "en"


class DeveloperPrompt(BaseModel):
    """Prompt original de desarrollo enviado por el usuario.

    Es la entrada del caso de uso. Validamos que no venga vacío y acotamos su
    longitud para proteger el consumo de tokens.
    """

    content: str = Field(
        ...,
        min_length=10,
        max_length=8000,
        description="Idea o prompt de desarrollo en lenguaje natural.",
    )
    language: ResponseLanguage = Field(
        default=ResponseLanguage.ES,
        description="Idioma deseado para la respuesta del agente.",
    )

    def normalized(self) -> str:
        """Devuelve el contenido saneado (sin espacios sobrantes)."""
        return self.content.strip()


class AgentEvaluation(BaseModel):
    """Resultado estructurado de la evaluación del meta-agente.

    Este modelo ES el contrato JSON que el backend garantiza a sus clientes.
    Cualquier respuesta del LLM que no cumpla esta forma se rechaza.
    """

    status: EvaluationStatus = Field(
        ...,
        description="'aprobado' o 'sugerir_ajustes'.",
    )
    analisis_critico: str = Field(
        ...,
        min_length=1,
        description="Evaluación técnica de la viabilidad de la idea y sus reglas.",
    )
    sugerencias_mejora: list[str] = Field(
        default_factory=list,
        description="Lista de mejoras de arquitectura o lógica omitida.",
    )
    prompt_final_optimizado: str = Field(
        ...,
        min_length=1,
        description="Prompt de grado de ingeniería listo para el agente de código.",
    )

    model_config = {
        "use_enum_values": True,  # Serializa el enum como su valor string.
        "extra": "ignore",  # Ignora claves extra que devuelva el modelo.
    }


class FewShotExample(BaseModel):
    """Ejemplo recuperado del historial (prompt + su evaluación) para guiar al LLM.

    Es el vehículo del "aprendizaje": las evaluaciones que el usuario marcó como
    útiles se reinyectan como ejemplos para que el agente imite su criterio.
    """

    prompt: str = Field(..., description="Prompt original de una evaluación pasada.")
    evaluation: AgentEvaluation = Field(..., description="La evaluación que se consideró útil.")


class EvaluationRecord(BaseModel):
    """Evaluación PERSISTIDA, con metadatos e (opcionalmente) feedback del usuario.

    Es la memoria del agente: cada evaluación se guarda y puede recibir un voto
    de utilidad que alimenta el aprendizaje futuro.
    """

    # Identificador único generado al crear el registro.
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    prompt: str = Field(..., description="Prompt normalizado que originó la evaluación.")
    language: ResponseLanguage = Field(default=ResponseLanguage.ES)
    evaluation: AgentEvaluation = Field(..., description="Resultado del agente.")
    # None = sin feedback; True = 👍 útil; False = 👎 no útil.
    helpful: bool | None = Field(default=None, description="Voto de utilidad del usuario.")
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Marca temporal ISO-8601 de creación.",
    )


class GeneratedFile(BaseModel):
    """Un archivo del proyecto generado: ruta relativa + contenido.

    La ruta es relativa a la raíz del proyecto (p. ej. "backend/main.py").
    """

    path: str = Field(..., min_length=1, description="Ruta relativa dentro del proyecto.")
    content: str = Field(default="", description="Contenido textual del archivo.")


class GeneratedProject(BaseModel):
    """Proyecto de software generado por el agente-que-construye.

    Es el resultado de convertir una idea/prompt en un conjunto de archivos
    listos para clonar y ejecutar.
    """

    name: str = Field(..., min_length=1, description="Nombre del proyecto (se usa como carpeta).")
    summary: str = Field(default="", description="Descripción breve de lo generado.")
    files: list[GeneratedFile] = Field(..., description="Archivos que componen el proyecto.")
    run_instructions: str = Field(
        default="",
        description="Cómo instalar/ejecutar el proyecto tras clonarlo.",
    )

    model_config = {"extra": "ignore"}

    def slug(self) -> str:
        """Convierte el nombre en un slug seguro para nombre de carpeta."""
        return slugify(self.name)


def slugify(name: str) -> str:
    """Convierte un nombre en un slug seguro para carpeta (minúsculas, guiones)."""
    cleaned = [c.lower() if c.isalnum() else "-" for c in name.strip()]
    slug = "".join(cleaned).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "proyecto-generado"


class ImprovementSuggestion(BaseModel):
    """Una sugerencia de mejora emitida por el agente auditor."""

    title: str = Field(..., description="Resumen corto de la mejora.")
    category: str = Field(
        default="general",
        description="Categoría: seguridad, rendimiento, mantenibilidad, tests, arquitectura…",
    )
    priority: str = Field(default="media", description="Prioridad: alta | media | baja.")
    file: str = Field(default="", description="Archivo afectado (si aplica).")
    rationale: str = Field(default="", description="Por qué importa esta mejora.")
    suggestion: str = Field(default="", description="Qué hacer concretamente.")

    model_config = {"extra": "ignore"}


class AuditReport(BaseModel):
    """Informe de auditoría del agente sobre un proyecto/sistema."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    target: str = Field(..., description="Proyecto/sistema auditado.")
    summary: str = Field(default="", description="Diagnóstico general en 1-2 frases.")
    suggestions: list[ImprovementSuggestion] = Field(default_factory=list)
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
    )

    model_config = {"extra": "ignore"}


class UserAccount(BaseModel):
    """Cuenta de un usuario (identificado por su login de Google).

    Modelo de negocio: gratis puede ver el MVP y recibir algunas clases; para
    seguir debe pagar, y un super-admin marca el pago (`paid`) para desbloquearlo
    según el plan adquirido.
    """

    sub: str = Field(..., description="ID único de Google.")
    email: str = Field(default="")
    name: str = Field(default="")
    plan: str = Field(default="free", description="Plan actual: free | pro | business")
    requested_plan: str = Field(default="", description="Plan que el usuario solicitó comprar.")
    paid: bool = Field(default=False, description="El super-admin confirmó el pago.")
    status: str = Field(default="active", description="active | pending_payment")
    generations_used: int = Field(default=0)
    lessons_used: int = Field(default=0)
    approved_by: str = Field(default="", description="Email del super-admin que aprobó.")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    model_config = {"extra": "ignore"}


class TeachingGuide(BaseModel):
    """Guía didáctica del agente en 'Modo Profesor': enseña, no hace todo.

    En vez de entregar el trabajo terminado, explica el proyecto y guía al
    aprendiz para que lo entienda y lo complete por sí mismo.
    """

    target: str = Field(..., description="Proyecto explicado.")
    summary: str = Field(default="", description="Explicación general para un principiante.")
    steps: list[str] = Field(default_factory=list, description="Pasos para entender el proyecto.")
    concepts: list[str] = Field(default_factory=list, description="Conceptos que aprenderá.")
    next_steps: list[str] = Field(default_factory=list, description="Retos para practicar.")

    model_config = {"extra": "ignore"}


class NivelAutonomia(str, Enum):
    """Cuánto hace la IA por el aprendiz en un ajuste de la clase.

    La promesa del producto es ENSEÑAR: si la IA lo hace todo por defecto, el
    aprendiz no aprende. Por eso `PROPONER` es el nivel recomendado —muestra el
    cambio y el alumno decide— y `EJECUTAR` es una elección explícita.
    """

    EXPLICAR = "explicar"   # solo explica; el aprendiz escribe el código
    PROPONER = "proponer"   # genera el cambio y lo muestra para aprobar
    EJECUTAR = "ejecutar"   # lo aplica y lo verifica ejecutando


class CambioArchivo(BaseModel):
    """Un archivo que el ajuste modifica, con su diff para poder revisarlo."""

    path: str = Field(..., description="Ruta del archivo dentro del proyecto.")
    contenido_nuevo: str = Field(..., description="Contenido completo propuesto.")
    diff: str = Field(default="", description="Diff unificado contra lo que había.")
    es_nuevo: bool = Field(default=False, description="El archivo no existía antes.")

    model_config = {"extra": "ignore"}


class ResultadoAjuste(BaseModel):
    """Qué pasó al pedir un ajuste de módulo en la clase.

    Es deliberadamente explícito sobre el fracaso: si el cambio se aplicó pero
    la verificación falló, se revierte y se dice. El sistema no declara éxito
    sin haberlo comprobado ejecutando.
    """

    proyecto: str = Field(..., description="Proyecto sobre el que se trabajó.")
    ajuste: str = Field(..., description="El ajuste solicitado, en palabras del alumno.")
    nivel: NivelAutonomia = Field(..., description="Nivel de autonomía usado.")
    explicacion: str = Field(default="", description="Por qué se hace y qué se aprende.")
    concepto: str = Field(default="", description="Concepto técnico que enseña este ajuste.")
    cambios: list[CambioArchivo] = Field(
        default_factory=list, description="Cambios propuestos o aplicados."
    )
    aplicado: bool = Field(default=False, description="Se escribió en disco.")
    verificado: bool = Field(default=False, description="La verificación por ejecución pasó.")
    revertido: bool = Field(default=False, description="Se deshizo por fallar la verificación.")
    detalle: str = Field(default="", description="Error/traceback real si algo falló.")

    model_config = {"extra": "ignore"}
