"""Login con GitHub.

Google entrega un «ID token» que cualquiera puede verificar con sus claves
públicas. GitHub NO hace eso: entrega un token de acceso a su API. Así que el
flujo es distinto y el backend tiene que emitir **su propia sesión firmada**
después de comprobar la identidad contra la API de GitHub.

Flujo (OAuth web estándar):
  1. El navegador va a GitHub con nuestro Client ID.
  2. La persona autoriza y GitHub devuelve un `code` de un solo uso.
  3. Aquí se canjea ese `code` por un token de acceso (usando el secreto, que
     nunca sale del servidor).
  4. Con ese token se pregunta a GitHub quién es, y se emite una sesión propia.

El `state` es obligatorio: sin él, un tercero podría iniciar el flujo y colar su
propia cuenta en la sesión de otro (CSRF de login).
"""

from __future__ import annotations

import logging
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

import requests
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel, Field

from src.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth/github", tags=["auth"])

_AUTORIZAR = "https://github.com/login/oauth/authorize"
_CANJEAR = "https://github.com/login/oauth/access_token"
_API_USUARIO = "https://api.github.com/user"
_API_CORREOS = "https://api.github.com/user/emails"

_ALGO = "HS256"
_DURACION_HORAS = 24

# `state` pendientes: se emiten al empezar y se consumen UNA vez al volver.
_lock = threading.Lock()
_estados: dict[str, float] = {}
_ESTADO_TTL = 600  # 10 minutos para completar el login


def _clave_sesion() -> str:
    """Clave de firma. Si no está configurada, se genera una para este proceso."""
    configurada = get_settings().session_secret
    if configurada:
        return configurada
    global _clave_volatil
    if not _clave_volatil:
        _clave_volatil = secrets.token_urlsafe(48)
        logger.warning(
            "SESSION_SECRET sin definir: las sesiones de GitHub se invalidarán "
            "en cada reinicio. Defínela en producción."
        )
    return _clave_volatil


_clave_volatil = ""


def emitir_sesion(sub: str, email: str, nombre: str) -> str:
    """Firma una sesión propia para un usuario ya verificado."""
    ahora = datetime.now(timezone.utc)
    carga = {
        "sub": sub,
        "email": email,
        "name": nombre,
        "iss": "metaagente",
        "iat": ahora,
        "exp": ahora + timedelta(hours=_DURACION_HORAS),
    }
    return jwt.encode(carga, _clave_sesion(), algorithm=_ALGO)


def leer_sesion(token: str) -> dict | None:
    """Devuelve los datos de una sesión propia válida, o None."""
    try:
        datos = jwt.decode(token, _clave_sesion(), algorithms=[_ALGO])
    except JWTError:
        return None
    return datos if datos.get("iss") == "metaagente" else None


def _nuevo_estado() -> str:
    estado = secrets.token_urlsafe(24)
    ahora = time.time()
    with _lock:
        # Limpieza de los que caducaron, para no crecer sin límite.
        for viejo in [e for e, t in _estados.items() if ahora - t > _ESTADO_TTL]:
            _estados.pop(viejo, None)
        _estados[estado] = ahora
    return estado


def _consumir_estado(estado: str) -> bool:
    with _lock:
        nacido = _estados.pop(estado, None)
    return nacido is not None and time.time() - nacido <= _ESTADO_TTL


class InicioGitHub(BaseModel):
    """Dónde debe ir el navegador para autorizar."""

    url: str = Field(..., description="URL de autorización de GitHub.")


@router.get("/config")
def config_github() -> dict:
    """Indica si el login con GitHub está disponible."""
    return {"enabled": bool(get_settings().github_client_id)}


@router.get("/iniciar", response_model=InicioGitHub)
def iniciar(redirect_uri: str = "") -> InicioGitHub:
    """Empieza el login: devuelve la URL de GitHub con un `state` de un solo uso."""
    settings = get_settings()
    if not settings.github_client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El login con GitHub no está configurado en el servidor.",
        )
    estado = _nuevo_estado()
    destino = redirect_uri or f"{settings.public_base_url}/api/v1/auth/github/volver"
    url = (
        f"{_AUTORIZAR}?client_id={settings.github_client_id}"
        f"&redirect_uri={destino}"
        f"&scope=read:user%20user:email"
        f"&state={estado}"
    )
    return InicioGitHub(url=url)


@router.get("/volver")
def volver(code: str = "", state: str = "", error: str = "") -> RedirectResponse:
    """GitHub devuelve aquí a la persona; se canjea el código y se abre sesión."""
    settings = get_settings()
    destino_web = settings.public_base_url or ""

    if error or not code:
        return RedirectResponse(url=f"/?github_error=1", status_code=302)
    if not _consumir_estado(state):
        # Sin un `state` válido no se sigue: podría ser un login ajeno inyectado.
        logger.warning("Login de GitHub con estado inválido o caducado.")
        return RedirectResponse(url="/?github_error=estado", status_code=302)

    try:
        canje = requests.post(
            _CANJEAR,
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
            },
            timeout=15,
        )
        acceso = canje.json().get("access_token")
        if not acceso:
            raise ValueError("GitHub no devolvió token de acceso")

        cabeceras = {"Authorization": f"Bearer {acceso}", "Accept": "application/json"}
        perfil = requests.get(_API_USUARIO, headers=cabeceras, timeout=15).json()
        correo = perfil.get("email") or ""
        if not correo:
            # El correo puede estar oculto: se pide el principal y verificado.
            correos = requests.get(_API_CORREOS, headers=cabeceras, timeout=15).json()
            correo = next(
                (c["email"] for c in correos if c.get("primary") and c.get("verified")),
                "",
            )
    except Exception as exc:  # noqa: BLE001 - cualquier fallo aquí es un login fallido
        logger.warning("Login de GitHub fallido: %s", exc)
        return RedirectResponse(url="/?github_error=canje", status_code=302)

    # El identificador lleva prefijo para no chocar nunca con los de Google.
    sub = f"github:{perfil.get('id')}"
    nombre = perfil.get("name") or perfil.get("login") or "Usuario de GitHub"
    sesion = emitir_sesion(sub, correo, nombre)
    logger.info("Login con GitHub correcto: %s", correo or perfil.get("login"))

    # La sesión viaja en el fragmento (#) para que no quede en los registros
    # del servidor ni en el historial de navegación como parámetro.
    return RedirectResponse(url=f"{destino_web}/#sesion={sesion}", status_code=302)
