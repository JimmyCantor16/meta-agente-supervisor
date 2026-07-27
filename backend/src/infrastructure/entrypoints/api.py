"""Entrypoint HTTP (FastAPI): expone los casos de uso como una API REST.

Es un adaptador de ENTRADA: traduce peticiones HTTP en llamadas a los casos de
uso y el resultado del dominio en respuestas HTTP. La inyección de los
adaptadores concretos (DeepSeek o mock, y el repositorio SQLite) se resuelve
aquí mediante el sistema de dependencias de FastAPI.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pathlib import Path

from src.application.account_service import AccountService
from src.application.aplicar_ajuste import AplicarAjusteUseCase
from src.application.audit_project import AuditProjectUseCase
from src.application.mejorar_proyecto import MejorarProyectoUseCase
from src.application.evaluate_prompt import EvaluatePromptUseCase, RegisterFeedbackUseCase
from src.application.explain_project import ExplainProjectUseCase
from src.application.generate_project import GenerateProjectUseCase
from src.application.usage_service import UsageService
from src.application.curso_profesor import (
    ChatProfesorUseCase,
    GenerarCursoUseCase,
    VerificarClaseUseCase,
)
from src.application.control_proyecto import ControlProyectoUseCase
from src.application.secretos import SecretosUseCase
from src.application.diagnostico_mvp import DiagnosticarMVPUseCase, RelanzarMVPUseCase
from src.application.metas_proceso import (
    CrearMetaUseCase,
    ListarMetasUseCase,
    MarcarHitoUseCase,
)
from src.config import Settings, get_settings
from src.domain.entities import EvaluationStatus, NivelAutonomia, UserAccount
from src.domain.ports import (
    AjustadorModuloPort,
    AuditError,
    CodeAuditorPort,
    CodeTeacherPort,
    CasoRepositoryPort,
    CursoRepositoryPort,
    DiagnosticadorMVPPort,
    EvaluationRepositoryPort,
    GeneradorMetaPort,
    GeneradorSyllabusPort,
    MetaRepositoryPort,
    LicenseRequiredError,
    PaymentRequiredError,
    ProfesorChatPort,
    ProjectGenerationError,
    ProjectGeneratorPort,
    ProjectReaderPort,
    ProjectRunnerPort,
    ProjectVerifierPort,
    ProjectWriterPort,
    PromptEvaluationError,
    PromptEvaluatorPort,
    SpecPlanPort,
    UsageRepositoryPort,
    UserRepositoryPort,
)
from src.infrastructure.adapters.deepseek_adapter import DeepSeekPromptEvaluator
from src.infrastructure.adapters.iterative_project_generator import IterativeProjectGenerator
from src.infrastructure.adapters.llm_ajustador import LLMAjustadorModulo
from src.infrastructure.adapters.llm_code_auditor import LLMCodeAuditor
from src.infrastructure.adapters.llm_code_teacher import LLMCodeTeacher
from src.infrastructure.adapters.llm_diagnostico_mvp import LLMDiagnosticadorMVP
from src.infrastructure.adapters.llm_generador_syllabus import LLMGeneradorSyllabus
from src.infrastructure.adapters.llm_profesor_chat import LLMProfesorChat
from src.infrastructure.adapters.mock_adapter import MockPromptEvaluator
from src.infrastructure.adapters.mock_ajustador import MockAjustadorModulo
from src.infrastructure.adapters.mock_curso import MockGeneradorSyllabus, MockProfesorChat
from src.infrastructure.adapters.mock_diagnostico_mvp import MockDiagnosticadorMVP
from src.infrastructure.adapters.llm_meta_proceso import LLMGeneradorMeta
from src.infrastructure.adapters.mock_meta_proceso import MockGeneradorMeta
from src.infrastructure.adapters.llm_spec_plan import LLMSpecPlan
from src.infrastructure.adapters.mock_spec_plan import MockSpecPlan
from src.infrastructure.adapters.sqlite_caso_repository import SqliteCasoRepository
from src.infrastructure.adapters.sqlite_meta_repository import SqliteMetaRepository
from src.infrastructure.adapters.sqlite_curso_repository import SqliteCursoRepository
from src.infrastructure.adapters.mock_code_auditor import MockCodeAuditor
from src.infrastructure.adapters.mock_code_teacher import MockCodeTeacher
from src.infrastructure.adapters.mock_project_generator import MockProjectGenerator
from src.infrastructure.adapters.project_reader import FileSystemProjectReader
from src.infrastructure.adapters.multistack import (
    MultiStackProjectRunner,
    MultiStackProjectVerifier,
)
from src.infrastructure.adapters.project_writer import FileSystemProjectWriter
from src.infrastructure.adapters.postgres_repository import PostgresEvaluationRepository
from src.infrastructure.adapters.postgres_usage_repository import PostgresUsageRepository
from src.infrastructure.adapters.postgres_user_repository import PostgresUserRepository
from src.infrastructure.adapters.sqlite_repository import SqliteEvaluationRepository
from src.infrastructure.adapters.sqlite_usage_repository import SqliteUsageRepository
from src.infrastructure.adapters.sqlite_user_repository import SqliteUserRepository
from src.infrastructure.entrypoints.auth import verify_google_token

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# DTOs de la capa HTTP.
# ---------------------------------------------------------------------------
class EvaluateRequest(BaseModel):
    """Cuerpo de la petición de evaluación."""

    prompt: str = Field(
        ...,
        min_length=10,
        max_length=8000,
        description="Idea o prompt de desarrollo del usuario.",
        examples=["Crear una web de e-commerce con carrito y pasarela de pago Stripe."],
    )
    # El idioma queda restringido por `Literal`: FastAPI rechaza cualquier otro
    # valor con un 422 antes de llegar al caso de uso.
    language: Literal["es", "en"] = Field(
        default="es",
        description="Idioma deseado para la respuesta del agente.",
    )


class PreguntaDTO(BaseModel):
    """Pregunta de aterrizaje con opciones marcables + campo libre opcional."""

    texto: str
    opciones: list[str] = Field(default_factory=list)
    permite_otro: bool = True


class PlantillaDTO(BaseModel):
    """Plantilla visual propuesta, con su paleta declarada."""

    nombre: str
    descripcion: str
    estilo: str = ""
    colores: list[str] = Field(default_factory=list)


class EvaluationResponse(BaseModel):
    """Respuesta de la evaluación. Incluye `id` para poder enviar feedback luego."""

    id: str
    status: EvaluationStatus
    analisis_critico: str
    sugerencias_mejora: list[str]
    preguntas_para_el_usuario: list[PreguntaDTO] = Field(
        default_factory=list,
        description="Datos que solo el usuario puede aportar antes de generar.",
    )
    plantillas: list[PlantillaDTO] = Field(
        default_factory=list,
        description="Plantillas visuales para elegir, combinar o sustituir por una referencia propia.",
    )
    prompt_final_optimizado: str


class FeedbackRequest(BaseModel):
    """Cuerpo de la petición de feedback sobre una evaluación."""

    evaluation_id: str = Field(..., description="Id de la evaluación votada.")
    helpful: bool = Field(..., description="True si fue útil (👍), False si no (👎).")


class GenerateRequest(BaseModel):
    """Cuerpo de la petición para generar un proyecto."""

    prompt: str = Field(
        ...,
        min_length=10,
        max_length=12000,
        description="Prompt de ingeniería (idealmente el prompt_final_optimizado).",
    )
    language: Literal["es", "en"] = Field(default="es")
    modo_inquieto: bool = Field(
        default=True,
        description=(
            "Con True (defecto) el agente explora más allá de lo pedido: añade "
            "mejoras que el usuario agradecerá (responsive, accesibilidad, "
            "detalles). Con False se limita estrictamente a lo solicitado."
        ),
    )


_INSTRUCCION_INQUIETO = (
    "\n\n[MODO INQUIETO ACTIVADO] No te limites a lo pedido: sé creativo e "
    "intuitivo. Añade los detalles que el usuario no pidió pero agradecerá: "
    "diseño responsive real, accesibilidad, estados vacíos y de error cuidados, "
    "micro-interacciones sutiles, datos de ejemplo creíbles y estructura "
    "escalable. Los extras NUNCA pueden romper ni retrasar lo pedido: primero "
    "lo esencial funcionando, luego el brillo."
)

_INSTRUCCION_OBEDIENTE = (
    "\n\n[SIN EXTRAS] El usuario pidió explícitamente ceñirse a lo solicitado: "
    "no añadas funcionalidades, pantallas ni adornos que no estén en el prompt."
)


class GenerateResponse(BaseModel):
    """Respuesta de la generación: metadatos + dónde quedó escrito."""

    name: str
    summary: str
    output_path: str = Field(..., description="Ruta absoluta donde se escribió el proyecto.")
    files: list[str] = Field(..., description="Rutas relativas de los archivos generados.")
    run_instructions: str
    url: str | None = Field(
        default=None,
        description="URL del proyecto ya corriendo (si se pudo arrancar).",
    )
    # El manual viaja COMPLETO, no su ruta: quien va a usar el sistema no tiene
    # por qué abrir archivos ni saber qué es una ruta. Ahí están los usuarios de
    # prueba y las credenciales para entrar.
    manual: str | None = Field(
        default=None,
        description="Contenido del manual de usuario (MANUAL.md), si se generó.",
    )


class AuditRequest(BaseModel):
    """Cuerpo de la petición para auditar un proyecto ya generado."""

    project_name: str = Field(..., min_length=1, description="Nombre del proyecto a auditar.")
    language: Literal["es", "en"] = Field(default="es")


class SuggestionDTO(BaseModel):
    """Una sugerencia de mejora en la respuesta HTTP."""

    title: str
    category: str
    priority: str
    file: str
    rationale: str
    suggestion: str


class AuditResponse(BaseModel):
    """Respuesta de la auditoría: diagnóstico + sugerencias priorizadas."""

    target: str
    summary: str
    suggestions: list[SuggestionDTO]


class ExplainRequest(BaseModel):
    """Cuerpo de la petición para explicar (Modo Profesor) un proyecto."""

    project_name: str = Field(..., min_length=1)
    language: Literal["es", "en"] = Field(default="es")


class TeachingResponse(BaseModel):
    """Respuesta del Modo Profesor: guía didáctica del proyecto."""

    target: str
    summary: str
    steps: list[str]
    concepts: list[str]
    next_steps: list[str]


class AjusteRequest(BaseModel):
    """Cuerpo para ajustar un módulo durante una clase."""

    project_name: str = Field(..., min_length=1)
    ajuste: str = Field(..., min_length=1, description="Qué quiere ajustar el alumno.")
    nivel: Literal["explicar", "proponer", "ejecutar"] = Field(
        default="proponer",
        description="Cuánto hace la IA. 'proponer' (recomendado) muestra el cambio "
                    "para que el alumno lo apruebe; 'ejecutar' lo aplica y lo verifica.",
    )
    language: Literal["es", "en"] = Field(default="es")
    propuesta_id: str | None = Field(
        default=None,
        max_length=32,
        description=(
            "Con nivel 'ejecutar': aplica EXACTAMENTE la propuesta guardada "
            "con este id (la que el alumno revisó), sin regenerar nada."
        ),
    )


class CambioDTO(BaseModel):
    """Un archivo tocado por el ajuste, con su diff para revisarlo."""

    path: str
    diff: str
    es_nuevo: bool
    contenido_nuevo: str


class AjusteResponse(BaseModel):
    """Resultado del ajuste: qué se propuso, si se aplicó y si se verificó."""

    proyecto: str
    ajuste: str
    nivel: str
    explicacion: str
    concepto: str
    cambios: list[CambioDTO]
    aplicado: bool
    verificado: bool
    revertido: bool
    detalle: str
    propuesta_id: str | None = None


class ProjectSummary(BaseModel):
    """Resumen de un proyecto generado (para la galería)."""

    name: str
    files: int


class UsageResponse(BaseModel):
    """Estado de uso y licencia."""

    used: int
    limit: int
    remaining: int  # -1 = ilimitado (licenciado)
    licensed: bool


class LicenseRequest(BaseModel):
    """Petición para activar una licencia."""

    key: str = Field(..., min_length=1)


class AccountStatusResponse(BaseModel):
    """Estado de la cuenta del usuario (por usuario)."""

    sub: str
    email: str
    name: str
    plan: str
    requested_plan: str
    paid: bool
    status: str
    is_admin: bool
    generations_used: int
    generations_limit: int
    generations_remaining: int
    lessons_used: int
    lessons_limit: int
    lessons_remaining: int


class ApproveRequest(BaseModel):
    """Petición del super-admin para aprobar el pago de un usuario."""

    sub: str = Field(..., min_length=1)
    plan: str = Field(default="")


class UpgradeRequest(BaseModel):
    """Petición del usuario para solicitar un plan (queda pendiente de aprobación)."""

    plan: str = Field(default="pro")


# ---------------------------------------------------------------------------
# Inyección de dependencias (composición de la arquitectura hexagonal).
# ---------------------------------------------------------------------------
@lru_cache
def get_repository() -> EvaluationRepositoryPort:
    """Provee el repositorio de evaluaciones (memoria del agente).

    Elige PostgreSQL si hay `DATABASE_URL` (despliegue cloud, disco efímero) o
    SQLite en caso contrario (desarrollo local y escritorio).
    """
    settings = get_settings()
    if settings.uses_postgres:
        logger.info("Persistencia: PostgreSQL (DATABASE_URL).")
        return PostgresEvaluationRepository(settings.database_url)
    return SqliteEvaluationRepository(settings.db_path)


@lru_cache
def get_evaluator() -> PromptEvaluatorPort:
    """Provee el evaluador: DeepSeek real o el mock, según configuración.

    Cambiar entre uno y otro es tan simple como la variable `USE_MOCK_LLM`,
    gracias a que ambos cumplen el mismo puerto.
    """
    settings = get_settings()
    if settings.use_mock_llm:
        logger.warning("USE_MOCK_LLM=true -> usando evaluador SIMULADO (sin DeepSeek).")
        return MockPromptEvaluator()
    return DeepSeekPromptEvaluator()


def get_evaluate_use_case(
    evaluator: PromptEvaluatorPort = Depends(get_evaluator),
    repository: EvaluationRepositoryPort = Depends(get_repository),
) -> EvaluatePromptUseCase:
    """Construye el caso de uso de evaluación con sus puertos resueltos."""
    return EvaluatePromptUseCase(evaluator, repository)


def get_feedback_use_case(
    repository: EvaluationRepositoryPort = Depends(get_repository),
) -> RegisterFeedbackUseCase:
    """Construye el caso de uso de feedback."""
    return RegisterFeedbackUseCase(repository)


@lru_cache
def get_project_generator() -> ProjectGeneratorPort:
    """Provee el generador de proyectos: DeepSeek real o mock, según configuración."""
    settings = get_settings()
    if settings.use_mock_llm:
        logger.warning("USE_MOCK_LLM=true -> generador de proyectos SIMULADO.")
        return MockProjectGenerator()
    # Generador iterativo (planificar -> escribir por archivo -> auto-reparar).
    iterativo = IterativeProjectGenerator()
    # Envuelto por el generador de ESQUELETO: para la clase más común (CRUD web con
    # login) entrega un proyecto PROBADO que sube solo; el resto lo hace el libre.
    from src.infrastructure.adapters.skeleton_generator import SkeletonProjectGenerator

    return SkeletonProjectGenerator(fallback=iterativo)


@lru_cache
def get_project_writer() -> ProjectWriterPort:
    """Provee el escritor de proyectos (filesystem seguro)."""
    return FileSystemProjectWriter(get_settings().generated_dir)


@lru_cache
def get_project_verifier() -> ProjectVerifierPort:
    """Provee el verificador, que elige Python o Node según el proyecto."""
    return MultiStackProjectVerifier()


@lru_cache
def get_project_runner() -> ProjectRunnerPort:
    """Provee el runner, que sabe arrancar tanto FastAPI como Express."""
    return MultiStackProjectRunner(get_settings().generated_public_host)


@lru_cache
def get_caso_repository() -> CasoRepositoryPort:
    """Banco de casos: la memoria que aprende de cada idea y cada fallo.

    Vive donde ocurre la generación con URL (local/escritorio), por eso usa el
    mismo SQLite que el resto de datos locales.
    """
    return SqliteCasoRepository(get_settings().db_path)


@lru_cache
def get_spec_plan() -> SpecPlanPort:
    """Diseñador spec+plan (contrato previo a generar). Real o mock."""
    if get_settings().use_mock_llm:
        return MockSpecPlan()
    return LLMSpecPlan()


def get_generate_use_case(
    generator: ProjectGeneratorPort = Depends(get_project_generator),
    writer: ProjectWriterPort = Depends(get_project_writer),
    verifier: ProjectVerifierPort = Depends(get_project_verifier),
    runner: ProjectRunnerPort = Depends(get_project_runner),
    caso_repo: CasoRepositoryPort = Depends(get_caso_repository),
    spec_plan: SpecPlanPort = Depends(get_spec_plan),
) -> GenerateProjectUseCase:
    """Construye el caso de uso de generación (spec+plan + auto-verificación + memoria)."""
    return GenerateProjectUseCase(generator, writer, verifier, runner, caso_repo, spec_plan)


@lru_cache
def get_project_reader() -> ProjectReaderPort:
    """Provee el lector de proyectos (filesystem)."""
    return FileSystemProjectReader(get_settings().generated_dir)


@lru_cache
def get_code_auditor() -> CodeAuditorPort:
    """Provee el auditor: IA real o mock, según configuración."""
    settings = get_settings()
    if settings.use_mock_llm:
        logger.warning("USE_MOCK_LLM=true -> auditor SIMULADO.")
        return MockCodeAuditor()
    return LLMCodeAuditor()


def get_audit_use_case(
    reader: ProjectReaderPort = Depends(get_project_reader),
    auditor: CodeAuditorPort = Depends(get_code_auditor),
) -> AuditProjectUseCase:
    """Construye el caso de uso de auditoría con sus puertos resueltos."""
    return AuditProjectUseCase(reader, auditor)


@lru_cache
def get_ajustador() -> AjustadorModuloPort:
    """Provee el ajustador de módulos: IA real o mock, según configuración."""
    settings = get_settings()
    if settings.use_mock_llm:
        return MockAjustadorModulo()
    return LLMAjustadorModulo()


def get_ajuste_use_case(
    reader: ProjectReaderPort = Depends(get_project_reader),
    ajustador: AjustadorModuloPort = Depends(get_ajustador),
    verifier: ProjectVerifierPort = Depends(get_project_verifier),
) -> AplicarAjusteUseCase:
    """Construye el caso de uso de ajuste (propone, aplica y verifica)."""
    return AplicarAjusteUseCase(reader, ajustador, verifier, get_settings().generated_dir)


def get_mejorar_use_case(
    reader: ProjectReaderPort = Depends(get_project_reader),
    auditor: CodeAuditorPort = Depends(get_code_auditor),
    ajustar: AplicarAjusteUseCase = Depends(get_ajuste_use_case),
) -> MejorarProyectoUseCase:
    """Construye el bucle de auto-mejora (auditar → aplicar → verificar)."""
    return MejorarProyectoUseCase(reader, auditor, ajustar)


@lru_cache
def get_code_teacher() -> CodeTeacherPort:
    """Provee el agente profesor: IA real o mock, según configuración."""
    settings = get_settings()
    if settings.use_mock_llm:
        logger.warning("USE_MOCK_LLM=true -> profesor SIMULADO.")
        return MockCodeTeacher()
    return LLMCodeTeacher()


# --- CURSO INTERACTIVO DEL PROFESOR ---
@lru_cache
def get_curso_repository() -> CursoRepositoryPort:
    """Persistencia del curso (SQLite en el mismo db que el resto)."""
    return SqliteCursoRepository(get_settings().db_path)


@lru_cache
def get_generador_syllabus() -> GeneradorSyllabusPort:
    if get_settings().use_mock_llm:
        return MockGeneradorSyllabus()
    return LLMGeneradorSyllabus()


@lru_cache
def get_profesor_chat() -> ProfesorChatPort:
    if get_settings().use_mock_llm:
        return MockProfesorChat()
    return LLMProfesorChat()


def get_generar_curso_use_case(
    reader: ProjectReaderPort = Depends(get_project_reader),
    generador: GeneradorSyllabusPort = Depends(get_generador_syllabus),
    repo: CursoRepositoryPort = Depends(get_curso_repository),
) -> GenerarCursoUseCase:
    return GenerarCursoUseCase(reader, generador, repo)


def get_chat_profesor_use_case(
    reader: ProjectReaderPort = Depends(get_project_reader),
    chat: ProfesorChatPort = Depends(get_profesor_chat),
    repo: CursoRepositoryPort = Depends(get_curso_repository),
) -> ChatProfesorUseCase:
    return ChatProfesorUseCase(reader, chat, repo)


def get_verificar_clase_use_case(
    reader: ProjectReaderPort = Depends(get_project_reader),
    chat: ProfesorChatPort = Depends(get_profesor_chat),
    repo: CursoRepositoryPort = Depends(get_curso_repository),
) -> VerificarClaseUseCase:
    return VerificarClaseUseCase(reader, chat, repo)


@lru_cache
def get_diagnosticador_mvp() -> DiagnosticadorMVPPort:
    if get_settings().use_mock_llm:
        return MockDiagnosticadorMVP()
    return LLMDiagnosticadorMVP()


def get_diagnosticar_mvp_use_case(
    reader: ProjectReaderPort = Depends(get_project_reader),
    diagnosticador: DiagnosticadorMVPPort = Depends(get_diagnosticador_mvp),
) -> DiagnosticarMVPUseCase:
    return DiagnosticarMVPUseCase(reader, diagnosticador)


def get_relanzar_mvp_use_case(
    generate_uc: GenerateProjectUseCase = Depends(get_generate_use_case),
    diagnosticar_uc: DiagnosticarMVPUseCase = Depends(get_diagnosticar_mvp_use_case),
    caso_repo: CasoRepositoryPort = Depends(get_caso_repository),
) -> RelanzarMVPUseCase:
    return RelanzarMVPUseCase(generate_uc, diagnosticar_uc, caso_repo)


def get_secretos_use_case() -> SecretosUseCase:
    return SecretosUseCase(get_settings().generated_dir)


def get_control_proyecto_use_case(
    runner: ProjectRunnerPort = Depends(get_project_runner),
    verifier: ProjectVerifierPort = Depends(get_project_verifier),
    secretos: SecretosUseCase = Depends(get_secretos_use_case),
) -> ControlProyectoUseCase:
    return ControlProyectoUseCase(runner, get_settings().generated_dir, verifier, secretos)


@lru_cache
def get_meta_repository() -> MetaRepositoryPort:
    """Persistencia de las metas de proceso (mismo SQLite local)."""
    return SqliteMetaRepository(get_settings().db_path)


@lru_cache
def get_generador_meta() -> GeneradorMetaPort:
    if get_settings().use_mock_llm:
        return MockGeneradorMeta()
    return LLMGeneradorMeta()


def get_crear_meta_use_case(
    generador: GeneradorMetaPort = Depends(get_generador_meta),
    repo: MetaRepositoryPort = Depends(get_meta_repository),
) -> CrearMetaUseCase:
    return CrearMetaUseCase(generador, repo)


def get_marcar_hito_use_case(
    repo: MetaRepositoryPort = Depends(get_meta_repository),
) -> MarcarHitoUseCase:
    return MarcarHitoUseCase(repo)


def get_listar_metas_use_case(
    repo: MetaRepositoryPort = Depends(get_meta_repository),
) -> ListarMetasUseCase:
    return ListarMetasUseCase(repo)


def get_explain_use_case(
    reader: ProjectReaderPort = Depends(get_project_reader),
    teacher: CodeTeacherPort = Depends(get_code_teacher),
) -> ExplainProjectUseCase:
    """Construye el caso de uso del Modo Profesor."""
    return ExplainProjectUseCase(reader, teacher)


@lru_cache
def get_user_repository() -> UserRepositoryPort:
    """Repositorio de cuentas de usuario (PostgreSQL en cloud, SQLite en local)."""
    settings = get_settings()
    if settings.uses_postgres:
        return PostgresUserRepository(settings.database_url)
    return SqliteUserRepository(settings.db_path)


def get_account_service(
    repository: UserRepositoryPort = Depends(get_user_repository),
) -> AccountService:
    """Servicio de cuentas/licencia por usuario."""
    settings = get_settings()
    return AccountService(
        repository,
        settings.free_generation_limit,
        settings.free_lesson_limit,
        settings.super_admin_emails_list,
    )


def get_current_user(
    authorization: str | None = Header(default=None),
    account: AccountService = Depends(get_account_service),
) -> UserAccount:
    """Identifica al usuario a partir del token de Google (header Authorization).

    Raises 401 si no hay sesión válida.

    PUERTA DE DESARROLLO LOCAL (AUTH_DEV_BYPASS=1): SOLO para el arnés de pruebas
    que entrena al agente en la máquina local. Permite disparar /generate sin un
    token de Google vivo (imposible de scriptear sin abrir el navegador). Se
    activa únicamente si la variable de entorno está puesta —lo está en el
    docker-compose local, NUNCA en el despliegue de Render— así producción sigue
    exigiendo Google. Acepta 'Bearer dev-local' o directamente ninguna cabecera.
    """
    import os

    if os.environ.get("AUTH_DEV_BYPASS") == "1":
        token = (authorization or "").split(" ", 1)[-1].strip() if authorization else ""
        if not authorization or token == "dev-local":
            dev = account.get_or_create("dev-local", "dev@local.test", "Dev Local")
            # 'paid' en memoria: el arnés de entrenamiento genera muchas veces y
            # no debe chocar con el cupo gratis (no persiste; solo esta petición).
            dev.paid = True
            return dev
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inicia sesión con Google para continuar.",
        )
    token = authorization.split(" ", 1)[1].strip()
    info = verify_google_token(token)  # lanza 401/400
    return account.get_or_create(info.get("sub", ""), info.get("email", ""), info.get("name", ""))


def require_admin(
    user: UserAccount = Depends(get_current_user),
    account: AccountService = Depends(get_account_service),
) -> UserAccount:
    """Exige que el usuario sea super-admin."""
    if not account.is_super_admin(user.email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requiere super-admin.")
    return user


@lru_cache
def get_usage_repository() -> UsageRepositoryPort:
    """Provee el repositorio de uso/licencia (PostgreSQL en cloud, SQLite en local)."""
    settings = get_settings()
    if settings.uses_postgres:
        return PostgresUsageRepository(settings.database_url)
    return SqliteUsageRepository(settings.db_path)


def get_usage_service(
    repository: UsageRepositoryPort = Depends(get_usage_repository),
) -> UsageService:
    """Construye el servicio de uso/licencia."""
    settings = get_settings()
    return UsageService(repository, settings.free_generation_limit, settings.license_keys_list)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/api/v1/agent", tags=["agent"])


@router.post(
    "/evaluate",
    response_model=EvaluationResponse,
    status_code=status.HTTP_200_OK,
    summary="Evalúa y optimiza un prompt de desarrollo.",
)
def evaluate_prompt(
    request: EvaluateRequest,
    use_case: EvaluatePromptUseCase = Depends(get_evaluate_use_case),
) -> EvaluationResponse:
    """Recibe el prompt del usuario y devuelve la evaluación estructurada.

    Traduce los errores del dominio a códigos HTTP apropiados:
    - 422: prompt inválido (validación del dominio).
    - 502: fallo del proveedor LLM (DeepSeek).
    """
    try:
        record = use_case.execute(request.prompt, request.language)
    except ValueError as exc:
        logger.warning("Prompt inválido: %s", exc)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except PromptEvaluationError as exc:
        logger.error("Fallo evaluando el prompt: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    # Aplanamos el registro (id + evaluación) en la respuesta HTTP.
    ev = record.evaluation
    return EvaluationResponse(
        id=record.id,
        status=ev.status,
        analisis_critico=ev.analisis_critico,
        sugerencias_mejora=ev.sugerencias_mejora,
        preguntas_para_el_usuario=[
            PreguntaDTO(texto=p.texto, opciones=p.opciones, permite_otro=p.permite_otro)
            for p in ev.preguntas_para_el_usuario
        ],
        plantillas=[
            PlantillaDTO(nombre=t.nombre, descripcion=t.descripcion,
                         estilo=t.estilo, colores=t.colores)
            for t in ev.plantillas
        ],
        prompt_final_optimizado=ev.prompt_final_optimizado,
    )


@router.post(
    "/feedback",
    status_code=status.HTTP_200_OK,
    summary="Registra si una evaluación fue útil (alimenta el aprendizaje).",
)
def register_feedback(
    request: FeedbackRequest,
    use_case: RegisterFeedbackUseCase = Depends(get_feedback_use_case),
) -> dict[str, str]:
    """Guarda el voto de utilidad; 404 si la evaluación no existe."""
    updated = use_case.execute(request.evaluation_id, request.helpful)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluación no encontrada.",
        )
    return {"status": "ok"}


@router.post(
    "/generate",
    response_model=GenerateResponse,
    status_code=status.HTTP_200_OK,
    summary="Genera un proyecto de software a partir de un prompt (agente que construye).",
)
def generate_project(
    request: GenerateRequest,
    use_case: GenerateProjectUseCase = Depends(get_generate_use_case),
    account: AccountService = Depends(get_account_service),
    user: UserAccount = Depends(get_current_user),
) -> GenerateResponse:
    """Toma el prompt, genera el proyecto y lo escribe en disco.

    - 401: sin sesión.
    - 402: se agotó el cupo gratis del usuario y requiere pago aprobado.
    - 422: prompt inválido.
    - 502: fallo del generador o de escritura.
    """
    # Gate POR USUARIO: bloquea si agotó su cupo gratis y no tiene pago aprobado.
    try:
        account.ensure_can_generate(user)
    except PaymentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc

    # El modo inquieto viaja como parte del prompt: el dominio no necesita
    # conocer la política, solo el texto final de ingeniería.
    prompt_final = request.prompt + (
        _INSTRUCCION_INQUIETO if request.modo_inquieto else _INSTRUCCION_OBEDIENTE
    )

    try:
        project, output_path = use_case.execute(prompt_final, request.language)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ProjectGenerationError as exc:
        logger.error("Fallo generando el proyecto: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    # Cuenta la generación exitosa contra el cupo del usuario.
    account.record_generation(user)

    return GenerateResponse(
        name=project.name,
        summary=project.summary,
        output_path=output_path,
        files=[f.path for f in project.files],
        run_instructions=project.run_instructions,
        url=use_case.last_url,
        manual=_manual_del_proyecto(project),
    )


def _manual_del_proyecto(project) -> str | None:
    """Contenido del manual de usuario, para mostrarlo en la conversación.

    Se generaba y nadie llegaba a leerlo: la interfaz solo enseñaba una ruta
    (además la del contenedor, que no existe en la máquina del usuario). Quien
    va a probar el sistema necesita las credenciales delante, no una dirección
    de archivo.
    """
    for archivo in project.files:
        if archivo.path.upper().endswith("MANUAL.MD"):
            return archivo.content
    # Sin manual, al menos el README explica de qué va el sistema.
    for archivo in project.files:
        if archivo.path.upper().endswith("README.MD"):
            return archivo.content
    return None


@router.post(
    "/audit",
    response_model=AuditResponse,
    status_code=status.HTTP_200_OK,
    summary="Audita un proyecto generado y sugiere mejoras (agente proactivo).",
)
def audit_project(
    request: AuditRequest,
    use_case: AuditProjectUseCase = Depends(get_audit_use_case),
) -> AuditResponse:
    """Lee un proyecto del disco, lo analiza con la IA y devuelve mejoras.

    - 404: el proyecto no existe.
    - 502: fallo del auditor (IA).
    """
    try:
        report = use_case.execute(request.project_name, request.language)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except AuditError as exc:
        # "no existe" -> 404; el resto -> 502.
        message = str(exc)
        if "no existe" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from exc
        logger.error("Fallo auditando el proyecto: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message) from exc

    return AuditResponse(
        target=report.target,
        summary=report.summary,
        suggestions=[
            SuggestionDTO(
                title=s.title,
                category=s.category,
                priority=s.priority,
                file=s.file,
                rationale=s.rationale,
                suggestion=s.suggestion,
            )
            for s in report.suggestions
        ],
    )


@router.post(
    "/explain",
    response_model=TeachingResponse,
    status_code=status.HTTP_200_OK,
    summary="Explica un proyecto y enseña a completarlo (Modo Profesor).",
)
def explain_project(
    request: ExplainRequest,
    use_case: ExplainProjectUseCase = Depends(get_explain_use_case),
    account: AccountService = Depends(get_account_service),
    user: UserAccount = Depends(get_current_user),
) -> TeachingResponse:
    """Genera una guía didáctica (clase) del proyecto para un aprendiz."""
    # Gate de CLASES por usuario.
    try:
        account.ensure_can_learn(user)
    except PaymentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc

    try:
        guide = use_case.execute(request.project_name, request.language)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except AuditError as exc:
        message = str(exc)
        if "no existe" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message) from exc

    # Cuenta la clase contra el cupo del usuario.
    account.record_lesson(user)

    return TeachingResponse(
        target=guide.target,
        summary=guide.summary,
        steps=guide.steps,
        concepts=guide.concepts,
        next_steps=guide.next_steps,
    )


@router.post(
    "/lecciones/ajuste",
    response_model=AjusteResponse,
    status_code=status.HTTP_200_OK,
    summary="Ajusta un módulo durante la clase (explicar / proponer / ejecutar).",
)
def ajustar_modulo(
    request: AjusteRequest,
    use_case: AplicarAjusteUseCase = Depends(get_ajuste_use_case),
    account: AccountService = Depends(get_account_service),
    user: UserAccount = Depends(get_current_user),
) -> AjusteResponse:
    """Convierte un punto de la clase en un cambio de código.

    El alumno elige cuánto hace la IA. En 'ejecutar', si la verificación por
    ejecución falla el cambio se revierte: una clase nunca deja el proyecto
    peor de como estaba.
    """
    # Un ajuste es parte de la clase: cuenta contra el mismo cupo.
    try:
        account.ensure_can_learn(user)
    except PaymentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc

    try:
        resultado = use_case.execute(
            request.project_name,
            request.ajuste,
            NivelAutonomia(request.nivel),
            request.language,
            propuesta_id=request.propuesta_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except AuditError as exc:
        message = str(exc)
        if "no existe" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message) from exc

    account.record_lesson(user)

    return AjusteResponse(
        proyecto=resultado.proyecto,
        ajuste=resultado.ajuste,
        nivel=resultado.nivel.value,
        explicacion=resultado.explicacion,
        concepto=resultado.concepto,
        cambios=[
            CambioDTO(
                path=c.path, diff=c.diff, es_nuevo=c.es_nuevo,
                contenido_nuevo=c.contenido_nuevo,
            )
            for c in resultado.cambios
        ],
        aplicado=resultado.aplicado,
        verificado=resultado.verificado,
        revertido=resultado.revertido,
        detalle=resultado.detalle,
        propuesta_id=resultado.propuesta_id,
    )


class VerificarPublicacionRequest(BaseModel):
    """El alumno pega la URL donde publicó; el profesor revisa su tarea."""

    url: str = Field(..., min_length=10, max_length=300)


@router.post(
    "/publicar/verificar",
    summary="El profesor comprueba que la página publicada por el alumno está VIVA.",
)
def verificar_publicacion(request: VerificarPublicacionRequest) -> dict:
    """La diferencia con un chatbot: aquí el profesor revisa la tarea de verdad.

    Comprueba desde el servidor que la URL del alumno responde y tiene
    contenido. Con guardas anti-SSRF: solo http(s) público, nunca redes
    internas.
    """
    import ipaddress
    import socket
    from urllib.parse import urlparse

    import httpx

    url = request.url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    partes = urlparse(url)
    if partes.scheme not in ("http", "https") or not partes.hostname:
        raise HTTPException(status_code=422, detail="Esa URL no parece válida.")
    try:
        for info in socket.getaddrinfo(partes.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                raise HTTPException(
                    status_code=422,
                    detail="Esa dirección es local: publica primero en internet "
                           "(Netlify/GitHub Pages/Render) y pega esa URL.",
                )
    except socket.gaierror as exc:
        raise HTTPException(
            status_code=422,
            detail="Ese dominio no existe todavía. Revisa la URL exacta que te "
                   "dio tu plataforma de hosting.",
        ) from exc

    try:
        with httpx.Client(follow_redirects=True, timeout=15) as cliente:
            r = cliente.get(url, headers={"User-Agent": "MetaAgente-Profesor/1.0"})
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"No pude cargar tu página ({type(exc).__name__}). "
                   "Puede estar despertando (Render tarda ~1 min) — espera y reintenta.",
        ) from exc

    cuerpo = r.text or ""
    import re as _re

    m = _re.search(r"<title>([^<]{1,120})</title>", cuerpo, _re.I)
    titulo = m.group(1).strip() if m else ""
    viva = r.status_code == 200 and len(cuerpo) > 200
    return {
        "viva": viva,
        "estado_http": r.status_code,
        "titulo": titulo,
        "url_final": str(r.url),
        "mensaje": (
            f"¡Tu página está VIVA en internet! 🎉 Título: «{titulo or 'sin título'}»."
            if viva
            else f"La URL responde {r.status_code} pero aún no se ve bien. "
                 "Revisa que subiste la carpeta completa (con index.html)."
        ),
    }


class MejorarRequest(BaseModel):
    """Cuerpo para lanzar una pasada de auto-mejora sobre un proyecto."""

    project_name: str = Field(..., min_length=1)
    language: Literal["es", "en"] = Field(default="es")


class MejoraResponse(BaseModel):
    """Resultado de la pasada: qué entró verificado y qué se revirtió."""

    proyecto: str
    diagnostico: str
    sugerencias_totales: int
    intentadas: int
    aplicadas: list[str]
    revertidas: list[str]
    sin_cambios: list[str]


@router.post(
    "/lecciones/mejorar",
    response_model=MejoraResponse,
    status_code=status.HTTP_200_OK,
    summary="El agente audita el proyecto y aplica las mejoras (fase construcción).",
)
def mejorar_proyecto(
    request: MejorarRequest,
    use_case: MejorarProyectoUseCase = Depends(get_mejorar_use_case),
    account: AccountService = Depends(get_account_service),
    user: UserAccount = Depends(get_current_user),
) -> MejoraResponse:
    """Bucle de auto-mejora: cada sugerencia se aplica verificada o se revierte."""
    try:
        account.ensure_can_learn(user)
    except PaymentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc

    try:
        resumen = use_case.execute(request.project_name, request.language)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except AuditError as exc:
        message = str(exc)
        if "no existe" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=message) from exc

    account.record_lesson(user)
    return MejoraResponse(
        proyecto=resumen.proyecto,
        diagnostico=resumen.diagnostico,
        sugerencias_totales=resumen.sugerencias_totales,
        intentadas=resumen.intentadas,
        aplicadas=resumen.aplicadas,
        revertidas=resumen.revertidas,
        sin_cambios=resumen.sin_cambios,
    )


# ===========================================================================
# CURSO INTERACTIVO DEL PROFESOR
# ===========================================================================
class CriterioDTO(BaseModel):
    tipo: str
    descripcion: str
    quiz: list[dict] = Field(default_factory=list)
    aciertos_minimos: int = 2
    pista: str = ""


class ClaseDTO(BaseModel):
    numero: int
    titulo: str
    objetivo: str
    contenido: str
    reto: str
    concepto_clave: str = ""
    criterio: CriterioDTO


class ProgresoDTO(BaseModel):
    curso_id: str
    proyecto: str
    clase_actual: int
    completadas: list[int]
    total_clases: int
    graduado: bool
    nivel: str = "desconocido"


class CursoResponse(BaseModel):
    titulo_curso: str
    resumen: str
    arquetipo: str = ""
    clases: list[ClaseDTO]
    progreso: ProgresoDTO


class CursoRequest(BaseModel):
    project_name: str = Field(..., min_length=1)
    arquetipo: str = Field(default="")
    language: Literal["es", "en"] = "es"
    nivel: str = Field(default="desconocido", description="Nivel medido antes de generar.")


class CursoExisteResponse(BaseModel):
    existe: bool
    nivel: str = "desconocido"


def _curso_response(syllabus, progreso) -> CursoResponse:
    return CursoResponse(
        titulo_curso=syllabus.titulo_curso,
        resumen=syllabus.resumen,
        arquetipo=syllabus.arquetipo,
        clases=[
            ClaseDTO(
                numero=c.numero, titulo=c.titulo, objetivo=c.objetivo,
                contenido=c.contenido, reto=c.reto, concepto_clave=c.concepto_clave,
                criterio=CriterioDTO(
                    tipo=c.criterio.tipo.value if hasattr(c.criterio.tipo, "value") else c.criterio.tipo,
                    descripcion=c.criterio.descripcion,
                    # El quiz viaja SIN la respuesta correcta: el navegador no debe saberla.
                    quiz=[{"pregunta": q.pregunta, "opciones": q.opciones} for q in c.criterio.quiz],
                    aciertos_minimos=c.criterio.aciertos_minimos,
                    pista=c.criterio.pista,
                ),
            )
            for c in syllabus.clases
        ],
        progreso=ProgresoDTO(
            curso_id=progreso.curso_id, proyecto=progreso.proyecto,
            clase_actual=progreso.clase_actual, completadas=progreso.completadas,
            total_clases=progreso.total_clases, graduado=progreso.graduado,
            nivel=progreso.nivel.value if hasattr(progreso.nivel, "value") else progreso.nivel,
        ),
    )


@router.post(
    "/curso/iniciar",
    response_model=CursoResponse,
    summary="Genera (o recupera) el curso del profesor para un proyecto del alumno.",
)
def iniciar_curso(
    request: CursoRequest,
    use_case: GenerarCursoUseCase = Depends(get_generar_curso_use_case),
    account: AccountService = Depends(get_account_service),
    user: UserAccount = Depends(get_current_user),
) -> CursoResponse:
    """Al entregar el MVP ya no hay silencio: el profesor abre el curso."""
    try:
        account.ensure_can_learn(user)
    except PaymentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc
    try:
        syllabus, progreso = use_case.execute(
            user.sub, request.project_name, user.plan or "free",
            request.arquetipo, request.language, request.nivel,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AuditError as exc:
        msg = str(exc)
        code = 404 if "no existe" in msg.lower() else 502
        raise HTTPException(status_code=code, detail=msg) from exc
    return _curso_response(syllabus, progreso)


@router.get(
    "/curso/existe",
    response_model=CursoExisteResponse,
    summary="¿Ya existe un curso para este proyecto? (para nivelar antes de generar).",
)
def curso_existe(
    project_name: str,
    repo: CursoRepositoryPort = Depends(get_curso_repository),
    user: UserAccount = Depends(get_current_user),
) -> CursoExisteResponse:
    cid = repo.curso_de(user.sub, (project_name or "").strip())
    if not cid:
        return CursoExisteResponse(existe=False)
    progreso = repo.cargar_progreso(cid)
    nivel = "desconocido"
    if progreso is not None:
        nivel = progreso.nivel.value if hasattr(progreso.nivel, "value") else progreso.nivel
    return CursoExisteResponse(existe=True, nivel=nivel)


class ChatRequest(BaseModel):
    curso_id: str = Field(..., min_length=1)
    numero_clase: int = Field(..., ge=1)
    mensaje: str = Field(default="", max_length=2000)
    abrir: bool = Field(default=False, description="Solo abrir la clase (traer historial).")
    language: Literal["es", "en"] = "es"


class MensajeDTO(BaseModel):
    rol: str
    texto: str


class ChatResponse(BaseModel):
    mensajes: list[MensajeDTO]


@router.post(
    "/curso/chat",
    response_model=ChatResponse,
    summary="Habla con el profesor dentro de una clase (o abre la clase).",
)
def chat_curso(
    request: ChatRequest,
    use_case: ChatProfesorUseCase = Depends(get_chat_profesor_use_case),
    user: UserAccount = Depends(get_current_user),
) -> ChatResponse:
    try:
        if request.abrir or not request.mensaje.strip():
            historial = use_case.abrir_clase(request.curso_id, request.numero_clase)
            return ChatResponse(mensajes=[MensajeDTO(rol=m.rol, texto=m.texto) for m in historial])
        respuesta = use_case.execute(
            request.curso_id, request.numero_clase, request.mensaje, request.language
        )
        return ChatResponse(mensajes=[MensajeDTO(rol=respuesta.rol, texto=respuesta.texto)])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AuditError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class NivelRequest(BaseModel):
    curso_id: str = Field(default="", description="Vacío = solo clasificar (antes de crear el curso).")
    respuesta: str = Field(default="", max_length=1500)
    language: Literal["es", "en"] = "es"


class NivelResponse(BaseModel):
    nivel: str
    mensaje: str


@router.post(
    "/curso/nivel",
    response_model=NivelResponse,
    summary="El profesor mide el nivel del alumno para adaptar el curso.",
)
def estimar_nivel(
    request: NivelRequest,
    use_case: ChatProfesorUseCase = Depends(get_chat_profesor_use_case),
    user: UserAccount = Depends(get_current_user),
) -> NivelResponse:
    try:
        nivel, mensaje = use_case.estimar_nivel(request.curso_id, request.respuesta, request.language)
    except AuditError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return NivelResponse(nivel=nivel, mensaje=mensaje)


class VerificarClaseRequest(BaseModel):
    curso_id: str = Field(..., min_length=1)
    numero_clase: int = Field(..., ge=1)
    respuestas_quiz: list[int] = Field(default_factory=list)
    texto: str = Field(default="", max_length=2000)
    language: Literal["es", "en"] = "es"


class VerificarClaseResponse(BaseModel):
    superada: bool
    mensaje: str
    avanzo: bool
    graduado: bool


@router.post(
    "/curso/verificar",
    response_model=VerificarClaseResponse,
    summary="El profesor revisa la tarea y decide si el alumno superó la clase.",
)
def verificar_clase(
    request: VerificarClaseRequest,
    use_case: VerificarClaseUseCase = Depends(get_verificar_clase_use_case),
    account: AccountService = Depends(get_account_service),
    user: UserAccount = Depends(get_current_user),
) -> VerificarClaseResponse:
    try:
        account.ensure_can_learn(user)
    except PaymentRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc
    try:
        r = use_case.execute(
            request.curso_id, request.numero_clase,
            request.respuestas_quiz, request.texto, request.language,
        )
    except AuditError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if r.superada:
        account.record_lesson(user)
    return VerificarClaseResponse(
        superada=r.superada, mensaje=r.mensaje, avanzo=r.avanzo, graduado=r.graduado
    )


class DiagnosticoRequest(BaseModel):
    project_name: str = Field(..., min_length=1)
    url: str = Field(default="", max_length=500)
    language: Literal["es", "en"] = "es"


class DiagnosticoResponse(BaseModel):
    estado: str
    puede_verse: bool
    veredicto: str
    lo_que_ve_el_usuario: str
    problemas: list[str]
    siguiente_paso: str
    url: str


@router.post(
    "/curso/diagnostico",
    response_model=DiagnosticoResponse,
    summary="El profesor retoma el proyecto y diagnostica si el MVP sirve de verdad.",
)
def diagnosticar_mvp(
    request: DiagnosticoRequest,
    use_case: DiagnosticarMVPUseCase = Depends(get_diagnosticar_mvp_use_case),
    user: UserAccount = Depends(get_current_user),
) -> DiagnosticoResponse:
    """Antes de enseñar, la verdad: ¿esto que entregamos le sirve a un humano?"""
    try:
        d = use_case.execute(request.project_name, request.url, request.language)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AuditError as exc:
        msg = str(exc)
        code = 404 if "no existe" in msg.lower() else 502
        raise HTTPException(status_code=code, detail=msg) from exc
    return DiagnosticoResponse(
        estado=d.estado.value if hasattr(d.estado, "value") else d.estado,
        puede_verse=d.puede_verse, veredicto=d.veredicto,
        lo_que_ve_el_usuario=d.lo_que_ve_el_usuario, problemas=d.problemas,
        siguiente_paso=d.siguiente_paso, url=d.url,
    )


class RelanzarRequest(BaseModel):
    project_name: str = Field(..., min_length=1)
    idea: str = Field(default="", max_length=4000)
    language: Literal["es", "en"] = "es"


class RelanzarResponse(BaseModel):
    diagnostico: DiagnosticoResponse
    url: str | None = None


@router.post(
    "/curso/relanzar",
    response_model=RelanzarResponse,
    summary="Repara y RELANZA un MVP que no sirve, recordando su idea original.",
)
def relanzar_mvp(
    request: RelanzarRequest,
    use_case: RelanzarMVPUseCase = Depends(get_relanzar_mvp_use_case),
    account: AccountService = Depends(get_account_service),
    user: UserAccount = Depends(get_current_user),
) -> RelanzarResponse:
    """El botón del banner: vuelve a generar exigiendo una interfaz visible.

    No cuesta una generación del cupo: es reparar un entregable que no sirvió.
    """
    try:
        d, url = use_case.execute(request.project_name, request.idea, request.language)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AuditError as exc:
        msg = str(exc)
        code = 404 if "no tengo registro" in msg.lower() else 502
        raise HTTPException(status_code=code, detail=msg) from exc
    return RelanzarResponse(
        diagnostico=DiagnosticoResponse(
            estado=d.estado.value if hasattr(d.estado, "value") else d.estado,
            puede_verse=d.puede_verse, veredicto=d.veredicto,
            lo_que_ve_el_usuario=d.lo_que_ve_el_usuario, problemas=d.problemas,
            siguiente_paso=d.siguiente_paso, url=d.url,
        ),
        url=url,
    )


# --- METAS DE PROCESO (multi-sesión: p.ej. monetizar un canal) ---
class HitoDTO(BaseModel):
    titulo: str
    descripcion: str
    depende_de: str
    hecho: bool


class MetaResponse(BaseModel):
    id: str
    objetivo: str
    resumen: str
    hitos: list[HitoDTO]
    hechos: int
    total: int


def _meta_response(meta) -> MetaResponse:
    hechos, total = meta.progreso
    return MetaResponse(
        id=meta.id, objetivo=meta.objetivo, resumen=meta.resumen,
        hitos=[
            HitoDTO(
                titulo=h.titulo, descripcion=h.descripcion,
                depende_de=h.depende_de.value if hasattr(h.depende_de, "value") else h.depende_de,
                hecho=h.hecho,
            )
            for h in meta.hitos
        ],
        hechos=hechos, total=total,
    )


class MetaRequest(BaseModel):
    objetivo: str = Field(..., min_length=1, max_length=600)
    contexto: str = Field(default="", max_length=1000)
    language: Literal["es", "en"] = "es"


@router.post(
    "/curso/meta/iniciar",
    response_model=MetaResponse,
    summary="Traza el mapa de hitos honesto de una meta de proceso del alumno.",
)
def iniciar_meta(
    request: MetaRequest,
    use_case: CrearMetaUseCase = Depends(get_crear_meta_use_case),
    user: UserAccount = Depends(get_current_user),
) -> MetaResponse:
    try:
        meta = use_case.execute(user.sub, request.objetivo, request.contexto, request.language)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AuditError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return _meta_response(meta)


@router.get(
    "/curso/metas",
    response_model=list[MetaResponse],
    summary="Las metas de proceso del alumno, para retomarlas sesión a sesión.",
)
def listar_metas(
    use_case: ListarMetasUseCase = Depends(get_listar_metas_use_case),
    user: UserAccount = Depends(get_current_user),
) -> list[MetaResponse]:
    return [_meta_response(m) for m in use_case.execute(user.sub)]


class HitoRequest(BaseModel):
    meta_id: str = Field(..., min_length=1)
    indice: int = Field(..., ge=0)
    hecho: bool = True


@router.post(
    "/curso/meta/hito",
    response_model=MetaResponse,
    summary="Marca (o desmarca) un hito de una meta como logrado.",
)
def marcar_hito(
    request: HitoRequest,
    use_case: MarcarHitoUseCase = Depends(get_marcar_hito_use_case),
    user: UserAccount = Depends(get_current_user),
) -> MetaResponse:
    try:
        meta = use_case.execute(user.sub, request.meta_id, request.indice, request.hecho)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AuditError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _meta_response(meta)


# --- CONTROL DEL PROYECTO EN VIVO (encender / apagar / estado) ---
class EstadoProyectoResponse(BaseModel):
    corriendo: bool
    url: str | None = None
    puerto: int | None = None


@router.get(
    "/projects/{project_name}/estado",
    response_model=EstadoProyectoResponse,
    summary="¿Está encendido el proyecto? ¿En qué URL/puerto?",
)
def estado_proyecto(
    project_name: str,
    use_case: ControlProyectoUseCase = Depends(get_control_proyecto_use_case),
    user: UserAccount = Depends(get_current_user),
) -> EstadoProyectoResponse:
    try:
        return EstadoProyectoResponse(**use_case.estado(project_name))
    except AuditError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/projects/{project_name}/encender",
    response_model=EstadoProyectoResponse,
    summary="Enciende el proyecto y devuelve su URL para abrirlo.",
)
def encender_proyecto(
    project_name: str,
    use_case: ControlProyectoUseCase = Depends(get_control_proyecto_use_case),
    user: UserAccount = Depends(get_current_user),
) -> EstadoProyectoResponse:
    try:
        return EstadoProyectoResponse(**use_case.encender(project_name))
    except AuditError as exc:
        msg = str(exc)
        code = 404 if "no existe" in msg.lower() else 502
        raise HTTPException(status_code=code, detail=msg) from exc


@router.post(
    "/projects/{project_name}/apagar",
    response_model=EstadoProyectoResponse,
    summary="Apaga el proyecto.",
)
def apagar_proyecto(
    project_name: str,
    use_case: ControlProyectoUseCase = Depends(get_control_proyecto_use_case),
    user: UserAccount = Depends(get_current_user),
) -> EstadoProyectoResponse:
    return EstadoProyectoResponse(**use_case.apagar(project_name))


class CompilarRequest(BaseModel):
    path: str = Field(..., min_length=1)
    contenido: str = Field(default="", max_length=200000)


@router.post(
    "/projects/{project_name}/compilar",
    response_model=EstadoProyectoResponse,
    summary="Guarda un archivo editado y reinicia el proyecto para verlo en vivo.",
)
def compilar_proyecto(
    project_name: str,
    request: CompilarRequest,
    use_case: ControlProyectoUseCase = Depends(get_control_proyecto_use_case),
    user: UserAccount = Depends(get_current_user),
) -> EstadoProyectoResponse:
    """Fase 2 del aula en vivo: editar → Compilar → ver el cambio al instante."""
    try:
        return EstadoProyectoResponse(**use_case.compilar(project_name, request.path, request.contenido))
    except AuditError as exc:
        msg = str(exc)
        code = 404 if "no existe" in msg.lower() else 400 if "no se puede" in msg.lower() or "fuera del" in msg.lower() else 502
        raise HTTPException(status_code=code, detail=msg) from exc


class SecretosResponse(BaseModel):
    carpeta: str
    nombres: list[str]
    instruccion: str


@router.get(
    "/projects/{project_name}/secretos",
    response_model=SecretosResponse,
    summary="Carpeta segura para las claves (Azure, etc.): nunca por el chat.",
)
def secretos_proyecto(
    project_name: str,
    use_case: SecretosUseCase = Depends(get_secretos_use_case),
    user: UserAccount = Depends(get_current_user),
) -> SecretosResponse:
    """Devuelve DÓNDE dejar las claves y qué NOMBRES ya hay (nunca los valores)."""
    try:
        return SecretosResponse(**use_case.info(project_name))
    except AuditError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# --- AULA EN VIVO: ver el código fuente del proyecto (solo lectura) ---
_SECRETO_EN_RUTA = ("secretos/", "/.env", ".env", "node_modules/")


def _es_visible_en_aula(path: str) -> bool:
    """No exponemos secretos ni el .env en el visor de código."""
    p = path.lower()
    return not any(marca in p for marca in _SECRETO_EN_RUTA)


class ArchivoItem(BaseModel):
    path: str
    bytes: int


class ArbolResponse(BaseModel):
    archivos: list[ArchivoItem]


class ArchivoResponse(BaseModel):
    path: str
    contenido: str
    lenguaje: str


def _lenguaje_de(path: str) -> str:
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return {
        "js": "javascript", "jsx": "javascript", "ts": "typescript", "tsx": "typescript",
        "py": "python", "html": "html", "css": "css", "json": "json", "md": "markdown",
        "vue": "vue", "svelte": "svelte", "sql": "sql",
    }.get(ext, "text")


@router.get(
    "/projects/{project_name}/archivos",
    response_model=ArbolResponse,
    summary="Árbol de archivos del proyecto (para el aula en vivo).",
)
def archivos_proyecto(
    project_name: str,
    reader: ProjectReaderPort = Depends(get_project_reader),
    user: UserAccount = Depends(get_current_user),
) -> ArbolResponse:
    try:
        archivos = reader.read(project_name)
    except AuditError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    items = [
        ArchivoItem(path=f.path, bytes=len(f.content.encode("utf-8", errors="ignore")))
        for f in archivos if _es_visible_en_aula(f.path)
    ]
    items.sort(key=lambda i: i.path)
    return ArbolResponse(archivos=items)


@router.get(
    "/projects/{project_name}/archivo",
    response_model=ArchivoResponse,
    summary="Contenido de UN archivo del proyecto (solo lectura).",
)
def archivo_proyecto(
    project_name: str,
    path: str,
    reader: ProjectReaderPort = Depends(get_project_reader),
    user: UserAccount = Depends(get_current_user),
) -> ArchivoResponse:
    if not _es_visible_en_aula(path):
        raise HTTPException(status_code=403, detail="Ese archivo no se muestra por seguridad.")
    try:
        archivos = reader.read(project_name)
    except AuditError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    for f in archivos:
        if f.path == path:
            return ArchivoResponse(
                path=f.path, contenido=f.content[:100000], lenguaje=_lenguaje_de(f.path)
            )
    raise HTTPException(status_code=404, detail="Ese archivo no existe en el proyecto.")


@router.get(
    "/projects",
    response_model=list[ProjectSummary],
    summary="Lista los proyectos generados (para la galería).",
)
def list_projects() -> list[ProjectSummary]:
    """Enumera las carpetas de proyectos generados y su número de archivos."""
    base = Path(get_settings().generated_dir)
    if not base.is_dir():
        return []

    projects: list[ProjectSummary] = []
    for entry in sorted(base.iterdir()):
        if entry.is_dir():
            file_count = sum(1 for p in entry.rglob("*") if p.is_file())
            projects.append(ProjectSummary(name=entry.name, files=file_count))
    return projects


@router.get(
    "/usage",
    response_model=UsageResponse,
    summary="Estado de uso y licencia (generaciones gratis restantes).",
)
def get_usage(usage: UsageService = Depends(get_usage_service)) -> UsageResponse:
    """Devuelve cuántas generaciones se han usado y si hay licencia."""
    return UsageResponse(**usage.status())


@router.post(
    "/license",
    response_model=UsageResponse,
    summary="Activa una licencia para generar sin límite.",
)
def activate_license(
    request: LicenseRequest,
    usage: UsageService = Depends(get_usage_service),
) -> UsageResponse:
    """Activa la licencia si la clave es válida; si no, devuelve 400."""
    if not usage.activate(request.key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Clave de licencia inválida.",
        )
    return UsageResponse(**usage.status())


# ---------------------------------------------------------------------------
# Cuenta por usuario + super-admin
# ---------------------------------------------------------------------------
@router.get("/account/me", response_model=AccountStatusResponse, tags=["account"])
def account_me(
    user: UserAccount = Depends(get_current_user),
    account: AccountService = Depends(get_account_service),
) -> AccountStatusResponse:
    """Estado de la cuenta del usuario autenticado."""
    return AccountStatusResponse(**account.status(user))


@router.post("/account/request-upgrade", response_model=AccountStatusResponse, tags=["account"])
def request_upgrade(
    request: UpgradeRequest,
    user: UserAccount = Depends(get_current_user),
    account: AccountService = Depends(get_account_service),
) -> AccountStatusResponse:
    """El usuario solicita un plan (queda pendiente de aprobación del super-admin)."""
    account.request_upgrade(user, request.plan)
    refreshed = account.get_or_create(user.sub, user.email, user.name)
    return AccountStatusResponse(**account.status(refreshed))


@router.get("/admin/pending", response_model=list[AccountStatusResponse], tags=["admin"])
def admin_pending(
    _admin: UserAccount = Depends(require_admin),
    account: AccountService = Depends(get_account_service),
) -> list[AccountStatusResponse]:
    """Lista los usuarios pendientes de aprobación de pago (solo super-admin)."""
    return [AccountStatusResponse(**s) for s in account.list_pending()]


class CasoResponse(BaseModel):
    idea: str
    arquetipo: str
    slug: str
    estado_mvp: str
    tuvo_url: bool
    relanzado: bool
    exito: bool
    problemas: list[str]
    num_archivos: int
    created_at: str


@router.get("/admin/casos", response_model=list[CasoResponse], tags=["admin"])
def admin_casos(
    _admin: UserAccount = Depends(require_admin),
    repo: CasoRepositoryPort = Depends(get_caso_repository),
) -> list[CasoResponse]:
    """Banco de casos = memoria del agente + log de fallos (solo super-admin).

    Deja ver qué ideas funcionaron, cuáles salieron 'vacías' (solo JSON) y
    cuáles hubo que relanzar — el dataset con el que el agente-profesor mejora.
    """
    return [
        CasoResponse(
            idea=c.idea, arquetipo=c.arquetipo, slug=c.slug,
            estado_mvp=c.estado_mvp.value if hasattr(c.estado_mvp, "value") else c.estado_mvp,
            tuvo_url=c.tuvo_url, relanzado=c.relanzado, exito=c.exito,
            problemas=c.problemas, num_archivos=c.num_archivos, created_at=c.created_at,
        )
        for c in repo.todos()
    ]


@router.post("/admin/approve", response_model=AccountStatusResponse, tags=["admin"])
def admin_approve(
    request: ApproveRequest,
    admin: UserAccount = Depends(require_admin),
    account: AccountService = Depends(get_account_service),
) -> AccountStatusResponse:
    """El super-admin confirma el pago de un usuario y activa su plan."""
    if not account.approve(admin.email, request.sub, request.plan):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")
    updated = account.get_or_create(request.sub, "", "")
    return AccountStatusResponse(**account.status(updated))


# ---------------------------------------------------------------------------
# Factory de la aplicación
# ---------------------------------------------------------------------------
def create_app(settings: Settings | None = None) -> FastAPI:
    """Construye y configura la instancia de FastAPI.

    Args:
        settings: Configuración a usar. Si es `None`, se toma la global.

    Returns:
        Aplicación FastAPI lista para servir.
    """
    settings = settings or get_settings()

    app = FastAPI(
        title="Meta-Agente Supervisor de Desarrollo Autónomo",
        description="Evalúa, critica y optimiza prompts de desarrollo con DeepSeek.",
        version="1.1.0",
    )

    # CORS: imprescindible para que el frontend (Vite) consuma la API.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)

    # Router de autenticación con Google.
    from src.infrastructure.entrypoints.auth import router as auth_router

    app.include_router(auth_router)

    # Progreso de generación EN VIVO (WebSocket): el usuario ve construirse
    # su sistema paso a paso en vez de mirar un spinner mudo.
    from src.infrastructure.entrypoints.progreso import router_ws

    app.include_router(router_ws)

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        """Endpoint de salud para readiness/liveness checks."""
        return {"status": "ok"}

    return app
