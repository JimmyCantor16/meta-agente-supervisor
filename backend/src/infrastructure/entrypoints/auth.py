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


# ---------------------------------------------------------------------------
# PUENTE DE ESCRITORIO: Google bloquea su login dentro de WebViews embebidos
# (disallowed_useragent). En la app de escritorio, el login se hace en el
# NAVEGADOR REAL del usuario: el backend local abre una página-puente en
# Chrome/Edge, ahí Google Identity Services entrega el credential, la página
# lo deposita aquí con un código de un solo uso, y la app lo recoge por
# polling. Solo existe en modo escritorio (MODO_ESCRITORIO=1).
# ---------------------------------------------------------------------------
import os
import re as _re
import threading
import time
import webbrowser

from fastapi.responses import HTMLResponse

_puente_lock = threading.Lock()
_puente_tokens: dict[str, tuple[str, float]] = {}  # estado -> (credential, epoch)
_PUENTE_TTL = 300  # 5 minutos


def _es_escritorio() -> bool:
    return os.environ.get("MODO_ESCRITORIO") == "1"


def _estado_valido(estado: str) -> bool:
    return bool(_re.fullmatch(r"[A-Za-z0-9]{16,64}", estado or ""))


def _limpiar_puente() -> None:
    ahora = time.time()
    for k in [k for k, (_, t) in _puente_tokens.items() if ahora - t > _PUENTE_TTL]:
        _puente_tokens.pop(k, None)


class AbrirPuenteRequest(BaseModel):
    estado: str = Field(..., min_length=16, max_length=64)


@router.post("/puente/abrir")
def abrir_puente(request: AbrirPuenteRequest) -> dict:
    """Abre la página-puente en el navegador REAL del usuario (solo escritorio)."""
    if not _es_escritorio():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solo escritorio.")
    if not _estado_valido(request.estado):
        raise HTTPException(status_code=422, detail="Estado inválido.")
    puerto = os.environ.get("METAAGENTE_PUERTO", "8756")
    url = f"http://127.0.0.1:{puerto}/api/v1/auth/puente?estado={request.estado}"
    webbrowser.open(url)
    return {"ok": True}


@router.get("/puente", response_class=HTMLResponse)
def pagina_puente(estado: str = "") -> HTMLResponse:
    """La página que corre en el navegador real y habla con Google."""
    if not _es_escritorio():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solo escritorio.")
    if not _estado_valido(estado):
        raise HTTPException(status_code=422, detail="Estado inválido.")
    client_id = get_settings().google_client_id
    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Entrar — Meta-Agente</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {{ margin:0; min-height:100vh; display:grid; place-items:center;
    font-family:'Segoe UI',system-ui,sans-serif;
    background:linear-gradient(135deg,#6366f1,#10b981); }}
  .caja {{ background:#fff; border-radius:22px; padding:2.4rem 2.2rem; max-width:400px;
    text-align:center; box-shadow:0 24px 60px -24px rgba(0,0,0,.4); }}
  h1 {{ font-size:1.3rem; margin:0 0 .4rem; color:#22242e; }}
  p {{ color:#6b7080; font-size:.95rem; margin:.3rem 0 1.2rem; }}
  #g {{ display:flex; justify-content:center; }}
  .ok {{ display:none; color:#10b981; font-weight:700; font-size:1.05rem; }}
</style></head>
<body><div class="caja">
  <h1>Inicia sesión con Google</h1>
  <p>Meta-Agente abrió esta página en tu navegador porque Google no permite
  entrar desde la ventana de la app. Al terminar, vuelve a la aplicación.</p>
  <div id="g"></div>
  <p class="ok" id="ok">✅ ¡Listo! Ya puedes volver a Meta-Agente.</p>
</div>
<script src="https://accounts.google.com/gsi/client" async defer onload="iniciar()"></script>
<script>
function iniciar() {{
  google.accounts.id.initialize({{
    client_id: "{client_id}",
    callback: async (r) => {{
      await fetch('/api/v1/auth/puente/entregar', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{ estado: "{estado}", credential: r.credential }})
      }});
      document.getElementById('g').style.display = 'none';
      document.getElementById('ok').style.display = 'block';
      setTimeout(() => window.close(), 1800);
    }}
  }});
  google.accounts.id.renderButton(document.getElementById('g'),
    {{ theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with' }});
}}
</script></body></html>"""
    return HTMLResponse(html)


class EntregarPuenteRequest(BaseModel):
    estado: str = Field(..., min_length=16, max_length=64)
    credential: str = Field(..., min_length=10)


@router.post("/puente/entregar")
def entregar_puente(request: EntregarPuenteRequest) -> dict:
    """La página-puente deposita el credential (verificado) para su estado."""
    if not _es_escritorio():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solo escritorio.")
    if not _estado_valido(request.estado):
        raise HTTPException(status_code=422, detail="Estado inválido.")
    # Se verifica AQUÍ: un credential inválido jamás queda depositado.
    verify_google_token(request.credential)
    with _puente_lock:
        _limpiar_puente()
        if len(_puente_tokens) >= 20:
            raise HTTPException(status_code=429, detail="Demasiados intentos; espera un momento.")
        _puente_tokens[request.estado] = (request.credential, time.time())
    return {"ok": True}


@router.get("/puente/recoger")
def recoger_puente(estado: str = "") -> dict:
    """La app recoge el credential una única vez (y este se destruye)."""
    if not _es_escritorio():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solo escritorio.")
    if not _estado_valido(estado):
        raise HTTPException(status_code=422, detail="Estado inválido.")
    with _puente_lock:
        _limpiar_puente()
        par = _puente_tokens.pop(estado, None)
    if par is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aún no hay sesión.")
    return {"credential": par[0]}
