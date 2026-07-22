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
from src.config import Settings, get_settings
from src.domain.entities import EvaluationStatus, NivelAutonomia, UserAccount
from src.domain.ports import (
    AjustadorModuloPort,
    AuditError,
    CodeAuditorPort,
    CodeTeacherPort,
    EvaluationRepositoryPort,
    LicenseRequiredError,
    PaymentRequiredError,
    ProjectGenerationError,
    ProjectGeneratorPort,
    ProjectReaderPort,
    ProjectRunnerPort,
    ProjectVerifierPort,
    ProjectWriterPort,
    PromptEvaluationError,
    PromptEvaluatorPort,
    UsageRepositoryPort,
    UserRepositoryPort,
)
from src.infrastructure.adapters.deepseek_adapter import DeepSeekPromptEvaluator
from src.infrastructure.adapters.iterative_project_generator import IterativeProjectGenerator
from src.infrastructure.adapters.llm_ajustador import LLMAjustadorModulo
from src.infrastructure.adapters.llm_code_auditor import LLMCodeAuditor
from src.infrastructure.adapters.llm_code_teacher import LLMCodeTeacher
from src.infrastructure.adapters.mock_adapter import MockPromptEvaluator
from src.infrastructure.adapters.mock_ajustador import MockAjustadorModulo
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


class EvaluationResponse(BaseModel):
    """Respuesta de la evaluación. Incluye `id` para poder enviar feedback luego."""

    id: str
    status: EvaluationStatus
    analisis_critico: str
    sugerencias_mejora: list[str]
    preguntas_para_el_usuario: list[str] = Field(
        default_factory=list,
        description="Datos que solo el usuario puede aportar antes de generar.",
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
    return IterativeProjectGenerator()


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


def get_generate_use_case(
    generator: ProjectGeneratorPort = Depends(get_project_generator),
    writer: ProjectWriterPort = Depends(get_project_writer),
    verifier: ProjectVerifierPort = Depends(get_project_verifier),
    runner: ProjectRunnerPort = Depends(get_project_runner),
) -> GenerateProjectUseCase:
    """Construye el caso de uso de generación (auto-verificación + arranque)."""
    return GenerateProjectUseCase(generator, writer, verifier, runner)


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
    """
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
        preguntas_para_el_usuario=ev.preguntas_para_el_usuario,
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

    try:
        project, output_path = use_case.execute(request.prompt, request.language)
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
    )


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

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        """Endpoint de salud para readiness/liveness checks."""
        return {"status": "ok"}

    return app
