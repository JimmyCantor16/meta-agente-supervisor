"""Rutas del puente local: el trabajador del PC del equipo toma y entrega encargos.

Autenticación: cabecera `X-Puente-Token` contra `PUENTE_TOKEN` (comparación en
tiempo constante). Sin token configurado, las rutas del trabajador responden
404: la función no existe en ese servidor.

`GET /api/v1/puente/estado` es público a propósito y no lleva nada sensible
(conectado sí/no, qué motores, cuántos encargos): es lo que pinta el monitor
para que se vea si la terminal está trabajando.
"""

from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from src.config import get_settings
from src.infrastructure.adapters.puente_local import HUB, MOTORES_CONOCIDOS

logger = logging.getLogger(__name__)

router_puente = APIRouter(prefix="/api/v1/puente", tags=["puente"])

#: Cuánto retiene el servidor una espera larga sin encargos antes de soltarla.
ESPERA_LARGA_SEG = 25.0


class EntregaIn(BaseModel):
    contenido: str = ""
    error: str = ""
    segundos: float = Field(default=0.0, ge=0.0)


class EstadoPuente(BaseModel):
    activo: bool
    conectado: bool
    motores: list[str]
    equipo: str
    en_cola: int
    en_curso: int
    resueltos: int


def _autorizar(token: str | None) -> None:
    esperado = get_settings().puente_token.strip()
    if not esperado:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    if not token or not hmac.compare_digest(token.strip(), esperado):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token del puente inválido.")


@router_puente.get("/estado", response_model=EstadoPuente)
def estado_puente() -> EstadoPuente:
    activo = bool(get_settings().puente_token.strip())
    estado = HUB.estado()
    # El nombre del equipo es del PC de una persona: no sale en una ruta pública.
    estado["equipo"] = "terminal del equipo" if estado["conectado"] else ""
    return EstadoPuente(activo=activo, **estado)


@router_puente.get("/tomar")
async def tomar(
    response: Response,
    motores: str = Query(default="claude"),
    equipo: str = Query(default="", max_length=60),
    x_puente_token: str | None = Header(default=None),
):
    """Espera larga del trabajador: devuelve un encargo o 204 si no hubo ninguno."""
    _autorizar(x_puente_token)
    lista = tuple(m for m in (x.strip().lower() for x in motores.split(",")) if m in MOTORES_CONOCIDOS)
    if not lista:
        raise HTTPException(status_code=422, detail=f"Motores válidos: {', '.join(MOTORES_CONOCIDOS)}")
    encargo = await run_in_threadpool(HUB.tomar, lista, equipo.strip(), ESPERA_LARGA_SEG)
    if encargo is None:
        response.status_code = status.HTTP_204_NO_CONTENT
        return None
    logger.info("Puente: encargo %s (%s) para %s.", encargo.id, encargo.tipo, encargo.motor)
    return encargo.para_trabajador()


@router_puente.post("/entregar/{encargo_id}")
def entregar(encargo_id: str, cuerpo: EntregaIn, x_puente_token: str | None = Header(default=None)) -> dict:
    _autorizar(x_puente_token)
    aceptado = HUB.entregar(encargo_id, cuerpo.contenido, cuerpo.error, cuerpo.segundos)
    return {"aceptado": aceptado}
