"""Rutas del catálogo de cursos escritos (estilo Platzi): `/api/v1/cursos`.

Router propio para no seguir engordando `api.py`; reutiliza de allí la
identificación del usuario y el registro de actividad. Mirar el catálogo y
leer un curso no exige sesión (como hojear un temario); avanzar, evaluar y
hablar con el tutor sí, porque eso se guarda o gasta cupo de IA.

Errores de dominio → HTTP: `CatalogoError`→404, `LeccionBloqueadaError`→409,
`TutorCursoError`→502, `ValueError`→422.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from src.application.account_service import AccountService
from src.application.catalogo_cursos import CatalogoCursosUseCase
from src.config import get_settings
from src.domain.catalogo import CertificadoCatalogo, RespuestaTutor
from src.domain.entities import UserAccount
from src.domain.ports import (
    CatalogoCursosRepositoryPort,
    CatalogoError,
    LeccionBloqueadaError,
    TutorCursoError,
    TutorCursoPort,
)
from src.infrastructure.adapters.llm_tutor_curso import LLMTutorCurso
from src.infrastructure.adapters.mock_tutor_curso import MockTutorCurso
from src.infrastructure.adapters.postgres_catalogo_repository import PostgresCatalogoRepository
from src.infrastructure.adapters.sqlite_catalogo_repository import SqliteCatalogoRepository
from src.infrastructure.entrypoints.api import (
    get_account_service,
    get_actividad_repository,
    get_current_user,
)
from src.infrastructure.entrypoints.limite_ritmo import limitar_por_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/cursos", tags=["cursos"])


# --- Inyección de dependencias ---
@lru_cache
def get_catalogo_repository() -> CatalogoCursosRepositoryPort:
    """Catálogo y progreso (PostgreSQL en cloud, SQLite en local)."""
    settings = get_settings()
    if settings.uses_postgres:
        return PostgresCatalogoRepository(settings.database_url)
    return SqliteCatalogoRepository(settings.db_path)


@lru_cache
def get_tutor_curso() -> TutorCursoPort:
    if get_settings().use_mock_llm:
        return MockTutorCurso()
    return LLMTutorCurso()


def get_catalogo_use_case() -> CatalogoCursosUseCase:
    return CatalogoCursosUseCase(get_catalogo_repository(), get_tutor_curso(), get_actividad_repository())


def usuario_opcional(
    authorization: str | None = Header(default=None),
    account: AccountService = Depends(get_account_service),
) -> UserAccount | None:
    """El usuario si hay sesión válida; None si no (las rutas de lectura)."""
    try:
        return get_current_user(authorization, account)
    except HTTPException:
        return None


def sembrar_catalogo() -> list[str]:
    """Carga los cursos de la semilla (idempotente; se llama al arrancar).

    Sin disco persistente en Render, la base nace vacía en cada deploy: el
    catálogo tiene que reaparecer solo, como el esquema de las apps generadas.
    """
    from src.infrastructure.semillas import cursos_semilla

    return get_catalogo_use_case().sembrar(cursos_semilla())


def _traducir(exc: Exception) -> HTTPException:
    if isinstance(exc, CatalogoError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, LeccionBloqueadaError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, TutorCursoError):
        logger.warning("Tutor del catálogo sin respuesta: %s", exc)
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="El tutor IA no está disponible ahora mismo. Inténtalo en un minuto.",
        )
    if isinstance(exc, ValueError):
        return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    raise exc


# --- DTOs ---
class EvaluarRequest(BaseModel):
    #: id de pregunta → índice de la opción elegida.
    respuestas: dict[str, int] = Field(default_factory=dict)


class RetoRequest(BaseModel):
    codigo: str = Field(..., min_length=1)


class TutorRequest(BaseModel):
    leccion_id: str = Field(..., min_length=1)
    pregunta: str = Field(..., min_length=1)
    codigo: str = ""


# --- Rutas ---
@router.get("", summary="Cursos publicados, con el avance del usuario si hay sesión.")
def listar_cursos(user: UserAccount | None = Depends(usuario_opcional)) -> list[dict]:
    return get_catalogo_use_case().listar(user.sub if user else "")


@router.get("/{curso_id}", summary="Un curso completo (sin respuestas) y el progreso del usuario.")
def detalle_curso(curso_id: str, user: UserAccount | None = Depends(usuario_opcional)) -> dict:
    try:
        return get_catalogo_use_case().detalle(curso_id, user.sub if user else "")
    except Exception as exc:  # noqa: BLE001 - se traduce o se relanza
        raise _traducir(exc) from exc


@router.post("/{curso_id}/lecciones/{leccion_id}/completar", summary="Marca una lección como completada.")
def completar_leccion(curso_id: str, leccion_id: str, user: UserAccount = Depends(get_current_user)) -> dict:
    try:
        return get_catalogo_use_case().completar_leccion(user.sub, curso_id, leccion_id, user.name or "")
    except Exception as exc:  # noqa: BLE001
        raise _traducir(exc) from exc


@router.post("/{curso_id}/evaluaciones/{evaluacion_id}", summary="Corrige un quiz en el servidor.")
def evaluar(
    curso_id: str, evaluacion_id: str, body: EvaluarRequest, user: UserAccount = Depends(get_current_user)
) -> dict:
    try:
        return get_catalogo_use_case().evaluar(user.sub, curso_id, evaluacion_id, body.respuestas, user.name or "")
    except Exception as exc:  # noqa: BLE001
        raise _traducir(exc) from exc


@router.post("/{curso_id}/retos/{reto_id}", summary="El tutor IA revisa la solución de un reto.")
def revisar_reto(
    curso_id: str,
    reto_id: str,
    body: RetoRequest,
    user: UserAccount = Depends(get_current_user),
    _limite: None = Depends(limitar_por_ip),
) -> dict:
    try:
        return get_catalogo_use_case().revisar_reto(user.sub, curso_id, reto_id, body.codigo)
    except Exception as exc:  # noqa: BLE001
        raise _traducir(exc) from exc


@router.post("/{curso_id}/tutor", response_model=RespuestaTutor, summary="Pregunta al tutor IA sobre una lección.")
def preguntar_tutor(
    curso_id: str,
    body: TutorRequest,
    user: UserAccount = Depends(get_current_user),  # noqa: ARG001 - gasta cupo: exige sesión
    _limite: None = Depends(limitar_por_ip),
) -> RespuestaTutor:
    try:
        return get_catalogo_use_case().preguntar_tutor(curso_id, body.leccion_id, body.pregunta, body.codigo)
    except Exception as exc:  # noqa: BLE001
        raise _traducir(exc) from exc


@router.get("/{curso_id}/certificado", response_model=CertificadoCatalogo, summary="El certificado del curso.")
def certificado(curso_id: str, user: UserAccount = Depends(get_current_user)) -> CertificadoCatalogo:
    try:
        cert = get_catalogo_use_case().certificado(user.sub, curso_id)
    except Exception as exc:  # noqa: BLE001
        raise _traducir(exc) from exc
    if cert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aún no tienes el certificado de este curso.")
    return cert
