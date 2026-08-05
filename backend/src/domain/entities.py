"""Entidades del dominio: modelos puros del negocio.

Se modelan con Pydantic v2 porque además de estructurar datos necesitamos
validación estricta del contrato de salida del LLM. Aun así, estas clases no
conocen nada sobre HTTP, DeepSeek ni FastAPI: pertenecen al núcleo del dominio.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field, field_validator


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


class PreguntaUsuario(BaseModel):
    """Pregunta de aterrizaje con opciones marcables (checkbox) + campo libre.

    El usuario responde marcando opciones; `permite_otro` habilita un campo
    de texto final por si ninguna opción encaja o quiere añadir algo.
    """

    texto: str = Field(..., min_length=1)
    opciones: list[str] = Field(
        default_factory=list,
        description="2-6 respuestas probables, marcables (varias a la vez).",
    )
    permite_otro: bool = Field(
        default=True,
        description="Si el usuario puede escribir una respuesta libre adicional.",
    )


class PlantillaPropuesta(BaseModel):
    """Una plantilla visual propuesta junto al plan, con su paleta declarada."""

    nombre: str = Field(..., min_length=1)
    descripcion: str = Field(..., min_length=1)
    estilo: str = Field(default="", description="Vibe en pocas palabras.")
    colores: list[str] = Field(
        default_factory=list,
        description="3-5 colores hex de la paleta (p. ej. '#0F1220').",
    )


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
    preguntas_para_el_usuario: list[PreguntaUsuario] = Field(
        default_factory=list,
        description=(
            "Preguntas de aterrizaje: datos que SOLO el usuario puede aportar "
            "(nombres reales, enlaces, productos, precios). Vacía si no faltan."
        ),
    )
    plantillas: list[PlantillaPropuesta] = Field(
        default_factory=list,
        description=(
            "3-5 plantillas visuales con su paleta, para que el usuario elija, "
            "combine varias, o aporte una referencia propia (URL o texto)."
        ),
    )
    prompt_final_optimizado: str = Field(
        ...,
        min_length=1,
        description="Prompt de grado de ingeniería listo para el agente de código.",
    )

    @field_validator("preguntas_para_el_usuario", mode="before")
    @classmethod
    def _tolerar_preguntas_planas(cls, v: object) -> object:
        """Acepta la forma antigua (lista de strings) convirtiéndola a objetos."""
        if isinstance(v, list):
            return [{"texto": p} if isinstance(p, str) else p for p in v]
        return v

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
    propuesta_id: str | None = Field(
        default=None,
        description=(
            "Identificador de la propuesta guardada (nivel PROPONER). Al "
            "ejecutar con este id se aplica EXACTAMENTE lo que el alumno "
            "revisó, byte a byte — nunca una regeneración."
        ),
    )
    detalle: str = Field(default="", description="Error/traceback real si algo falló.")

    model_config = {"extra": "ignore"}


# ===========================================================================
# CURSO INTERACTIVO DEL PROFESOR
# Tras entregar el MVP, el sistema genera un plan de estudios sobre EL PROYECTO
# del alumno y lo guía clase por clase, por chat, con superación VERIFICABLE:
# el alumno no avanza porque diga "entendí", avanza porque el sistema comprueba
# que aprendió (un quiz sobre su código, un cambio aplicado, su repo/URL vivos).
# ===========================================================================
class TipoCriterio(str, Enum):
    """Cómo se demuestra que una clase fue superada de verdad."""

    QUIZ = "quiz"                    # responder bien un mini-quiz sobre SU proyecto
    CAMBIO_APLICADO = "cambio"       # aplicar un ajuste verificado al proyecto
    REPO_GIT = "repo_git"            # su repositorio de GitHub existe (API pública)
    URL_PUBLICADA = "url_publicada"  # su URL responde viva en internet
    REFLEXION = "reflexion"          # explica con sus palabras (lo evalúa el profesor)


class PreguntaQuiz(BaseModel):
    """Pregunta de un mini-quiz de superación (sobre el proyecto del alumno)."""

    pregunta: str = Field(..., min_length=1)
    opciones: list[str] = Field(..., min_length=2)
    correcta: int = Field(..., ge=0, description="Índice de la opción correcta.")


class CriterioSuperacion(BaseModel):
    """La prueba que el alumno debe pasar para completar una clase."""

    tipo: TipoCriterio
    descripcion: str = Field(..., description="Qué se pide, en cristiano.")
    quiz: list[PreguntaQuiz] = Field(default_factory=list)
    aciertos_minimos: int = Field(default=2, description="Para tipo quiz.")
    pista: str = Field(default="", description="Ayuda si el alumno se atasca.")
    #: Archivo concreto que hay que tocar, relativo a la raíz del proyecto.
    #: Sin esto, «modifica el código» dejaba al alumno mirando 23 archivos sin
    #: saber por dónde empezar; con esto el aula le abre el correcto.
    archivo: str = Field(default="", description="Ruta del archivo a modificar.")
    #: Qué se debe ver distinto al terminar. Es la diferencia entre «cambia
    #: algo» y saber si lo lograste.
    resultado_esperado: str = Field(
        default="",
        description="Qué debería verse diferente cuando el cambio esté bien hecho.",
    )


class Clase(BaseModel):
    """Una clase del curso: objetivo, contenido sobre SU código, reto y criterio."""

    numero: int = Field(..., ge=1)
    titulo: str = Field(..., min_length=1)
    objetivo: str = Field(..., description="Qué vas a lograr, en una frase.")
    contenido: str = Field(..., description="La explicación sobre el proyecto (markdown).")
    reto: str = Field(..., description="El ejercicio práctico de esta clase.")
    concepto_clave: str = Field(default="", description="El concepto que se aprende.")
    criterio: CriterioSuperacion


class Syllabus(BaseModel):
    """El plan de estudios completo.

    Nace de dos sitios distintos, y por eso `tema` existe:
      · de un PROYECTO del alumno — el curso habla de SU código;
      · de un TEMA libre ("n8n", "SQL") — no hay código que leer.

    En el segundo caso `proyecto` guarda el nombre del tema (es la clave con la
    que se almacena el curso) y `tema` queda relleno para que todo el circuito
    sepa que no debe ir a buscar archivos a disco.
    """

    proyecto: str
    arquetipo: str = Field(default="")
    titulo_curso: str
    resumen: str
    clases: list[Clase] = Field(default_factory=list)
    tema: str = Field(
        default="",
        description="Tema externo del curso. Vacío = el curso es sobre un proyecto del alumno.",
    )

    @property
    def sobre_un_tema(self) -> bool:
        """True si el curso enseña un tema externo y no hay proyecto que leer."""
        return bool(self.tema.strip())


class MensajeChat(BaseModel):
    """Un turno de la conversación entre el profesor y el alumno."""

    rol: str = Field(..., description="'profesor' o 'alumno'.")
    texto: str = Field(..., min_length=1)


class NivelAlumno(str, Enum):
    """Nivel del alumno en programación/sistemas, para calibrar al profesor."""

    DESCONOCIDO = "desconocido"
    BAJO = "bajo"      # nunca ha programado; habla de la idea, no del código
    MEDIO = "medio"    # se defiende; ha tocado algo de código o herramientas
    ALTO = "alto"      # entiende de sistemas; quiere el "cómo", no el "qué"


class ProgresoCurso(BaseModel):
    """Dónde va el alumno en su curso: la clase actual y las ya superadas."""

    curso_id: str
    usuario_sub: str
    proyecto: str
    clase_actual: int = Field(default=1)
    completadas: list[int] = Field(default_factory=list)
    total_clases: int = Field(default=0)
    graduado: bool = Field(default=False)
    nivel: NivelAlumno = Field(
        default=NivelAlumno.DESCONOCIDO,
        description="Nivel estimado del alumno; el profesor lo mide conversando.",
    )


class ResultadoVerificacion(BaseModel):
    """Veredicto del profesor sobre si el alumno superó la clase."""

    superada: bool
    mensaje: str = Field(..., description="Qué pasó, en tono de profesor.")
    avanzo: bool = Field(default=False, description="Si se pasó a la siguiente clase.")
    graduado: bool = Field(default=False)


class EstadoMVP(str, Enum):
    """Veredicto honesto de si el MVP entregado sirve para un usuario final.

    Nace del caso Azure: el sistema dijo "terminado" y entregó un JSON sin nada
    que ver. Un usuario no técnico ante eso cierra el navegador y se va. El
    profesor NO puede empezar a enseñar sobre un MVP que en realidad no funciona:
    primero diagnostica con honestidad, y si está roto, lo dice y ofrece
    relanzarlo antes de la Clase 1.
    """

    FUNCIONA = "funciona"    # se ve y se usa: hay algo real que mostrar
    PARCIAL = "parcial"      # arranca pero le falta para que un usuario lo disfrute
    VACIO = "vacio"          # no hay nada que ver (solo JSON/API, página en blanco)


class DiagnosticoMVP(BaseModel):
    """El estado REAL del MVP entregado, en palabras que el usuario entiende.

    Es lo que el profesor mira antes de enseñar: ¿esto que le entregamos de
    verdad le sirve a alguien que no sabe programar? Si no, lo dice sin adornos
    y propone el siguiente paso (repararlo/relanzarlo) en vez de fingir éxito.
    """

    estado: EstadoMVP
    puede_verse: bool = Field(
        default=False,
        description="Si un usuario final vería una interfaz usable (no un JSON).",
    )
    veredicto: str = Field(..., description="Una frase honesta del estado, en cristiano.")
    lo_que_ve_el_usuario: str = Field(
        default="",
        description="Qué encontraría un usuario no técnico al abrir la URL.",
    )
    problemas: list[str] = Field(
        default_factory=list,
        description="Lo que impide que se disfrute (vacío si funciona).",
    )
    siguiente_paso: str = Field(
        default="",
        description="Qué conviene hacer ahora (relanzar, reparar, o empezar la Clase 1).",
    )
    url: str = Field(default="", description="URL evaluada, si la hubo.")


class CasoGeneracion(BaseModel):
    """Un caso del BANCO DE CASOS: qué se pidió, qué salió y qué se aprendió.

    Es la memoria que hace al agente mejor con cada proyecto. Ante una idea
    nueva, el sistema recupera casos parecidos y reinyecta lo que funcionó y lo
    que falló, para no tropezar dos veces con la misma piedra. Y cada fracaso
    honesto que se corrige queda aquí como dataset del agente-profesor.
    """

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    idea: str = Field(..., description="El prompt/idea que originó el proyecto.")
    arquetipo: str = Field(default="", description="Arquetipo elegido (o vacío si libre).")
    slug: str = Field(default="", description="Slug del proyecto generado.")
    estado_mvp: EstadoMVP = Field(
        default=EstadoMVP.PARCIAL,
        description="Veredicto de visibilidad del MVP resultante.",
    )
    tuvo_url: bool = Field(default=False, description="Si se entregó una URL viva.")
    relanzado: bool = Field(
        default=False,
        description="Si el gate de visibilidad tuvo que relanzar la generación.",
    )
    problemas: list[str] = Field(
        default_factory=list,
        description="Fallos detectados (para no repetirlos en ideas similares).",
    )
    lecciones: list[str] = Field(
        default_factory=list,
        description="Qué se ajustó y funcionó (para reforzarlo en ideas similares).",
    )
    num_archivos: int = Field(default=0)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @property
    def exito(self) -> bool:
        """Éxito real = el MVP se ve y además se entregó una URL viva."""
        return self.estado_mvp == EstadoMVP.FUNCIONA and self.tuvo_url


class SpecPlan(BaseModel):
    """Contrato explícito ANTES de generar (inspirado en Spec-Driven Development).

    Convierte la idea del usuario en un QUÉ y un CÓMO concretos y verificables,
    para que la generación sea predecible: qué pantallas verá, qué datos maneja,
    qué endpoints expone el backend (para que el frontend no pida rutas que no
    existen) y, sobre todo, QUÉ debe VERSE (el contrato anti-'JSON muerto'). Se
    guarda como SPEC.md/PLAN.md: sirve de guía al generador y de material del
    profesor.
    """

    resumen: str = Field(default="", description="1-2 frases del qué se construye.")
    pantallas: list[str] = Field(
        default_factory=list, description="Vistas que el usuario verá (nombres claros)."
    )
    entidades: list[str] = Field(
        default_factory=list, description="Los datos del sistema (ej: Proyecto, Recurso)."
    )
    endpoints: list[str] = Field(
        default_factory=list,
        description="Rutas del backend, ej 'GET /api/resources' (contrato con el frontend).",
    )
    criterios_visibles: list[str] = Field(
        default_factory=list,
        description="Qué debe VER un usuario no técnico para considerarlo funcional.",
    )
    stack_sugerido: str = Field(default="", description="Stack recomendado, en cristiano.")

    def como_markdown(self) -> str:
        """Render SPEC.md/PLAN.md para guardar en el proyecto (material del alumno)."""
        def lista(items: list[str]) -> str:
            return "\n".join(f"- {i}" for i in items) or "- (por definir)"
        return (
            f"# Especificación y plan\n\n## Qué se construye\n{self.resumen}\n\n"
            f"## Pantallas que verás\n{lista(self.pantallas)}\n\n"
            f"## Datos del sistema\n{lista(self.entidades)}\n\n"
            f"## API del backend\n{lista(self.endpoints)}\n\n"
            f"## Para considerarlo funcional, debes VER\n{lista(self.criterios_visibles)}\n\n"
            f"## Stack\n{self.stack_sugerido or '(a criterio del generador)'}\n"
        )


class DependeDe(str, Enum):
    """De quién depende un hito: por eso una meta es un PROCESO, no un clic."""

    ALUMNO = "alumno"          # depende de que la persona haga el trabajo
    PLATAFORMA = "plataforma"  # depende de un tercero (YouTube, un banco, Google)
    TIEMPO = "tiempo"          # depende de que pase tiempo (audiencia, revisión)
    SISTEMA = "sistema"        # lo construimos aquí (una web, un sistema)


class Hito(BaseModel):
    """Un paso concreto del camino hacia una meta de proceso."""

    titulo: str = Field(..., min_length=1)
    descripcion: str = Field(default="", description="Qué hay que lograr, en cristiano.")
    depende_de: DependeDe = Field(default=DependeDe.ALUMNO)
    hecho: bool = Field(default=False)


class MetaProceso(BaseModel):
    """Una meta que NO es solo código: un camino de hitos multi-sesión.

    Nace del caso 'quiero monetizar mi canal de YouTube': hablarle a la IA no
    hace aparecer el dinero; hay pasos del mundo real, con tiempos que no
    dependen de nosotros. El profesor convierte el sueño en un mapa honesto y
    acompaña sesión a sesión, retomando donde se quedaron.
    """

    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:20])
    usuario_sub: str
    objetivo: str = Field(..., description="La meta en palabras del alumno.")
    resumen: str = Field(default="", description="La verdad honesta del alcance.")
    hitos: list[Hito] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @property
    def progreso(self) -> tuple[int, int]:
        """(hitos hechos, total)."""
        return sum(1 for h in self.hitos if h.hecho), len(self.hitos)
