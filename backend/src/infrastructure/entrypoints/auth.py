"""Entrypoint HTTP de autenticación con Google (OAuth / ID token).

Flujo (Google Identity Services):
  1. El frontend muestra el botón de Google y obtiene un `credential` (ID token JWT).
  2. Lo envía a POST /api/v1/auth/google.
  3. Aquí verificamos el token con las claves públicas de Google y el Client ID,
     y devolvemos los datos del usuario.

No usamos secreto de cliente: la verificación del ID token solo requiere el
Client ID como 'audience'.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, Field

from src.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class AuthConfigResponse(BaseModel):
    """Config pública que el frontend necesita para pintar el botón de Google."""

    enabled: bool
    client_id: str


class GoogleLoginRequest(BaseModel):
    """Cuerpo con el ID token (credential) que devuelve Google en el frontend."""

    credential: str = Field(..., min_length=10)


class UserResponse(BaseModel):
    """Datos del usuario autenticado."""

    sub: str  # id único de Google
    email: str
    name: str
    picture: str


@router.get("/config", response_model=AuthConfigResponse)
def auth_config() -> AuthConfigResponse:
    """Indica si el login está habilitado y con qué Client ID."""
    client_id = get_settings().google_client_id
    return AuthConfigResponse(enabled=bool(client_id), client_id=client_id)


def verify_google_token(credential: str) -> dict:
    """Verifica un ID token de Google y devuelve su payload.

    Raises:
        HTTPException 400: si el login no está configurado.
        HTTPException 401: si el token es inválido.
    """
    client_id = get_settings().google_client_id
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El login con Google no está configurado en el servidor.",
        )
    try:
        return google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), client_id
        )
    except ValueError as exc:
        logger.warning("Token de Google inválido: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada. Inicia sesión de nuevo.",
        ) from exc


@router.post("/google", response_model=UserResponse)
def login_with_google(request: GoogleLoginRequest) -> UserResponse:
    """Verifica el ID token de Google y devuelve el usuario."""
    info = verify_google_token(request.credential)
    logger.info("Login correcto: %s", info.get("email"))
    return UserResponse(
        sub=info.get("sub", ""),
        email=info.get("email", ""),
        name=info.get("name", info.get("email", "")),
        picture=info.get("picture", ""),
    )
