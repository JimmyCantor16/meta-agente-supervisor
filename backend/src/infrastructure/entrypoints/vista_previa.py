"""Vista previa PÚBLICA de los MVP generados.

Problema que resuelve: los proyectos se arrancan dentro del contenedor en un
puerto suelto (8100-8120). En local eso da una URL utilizable
(`http://localhost:8100`), pero en producción ese puerto no está publicado, así
que al usuario se le entregaba una dirección a `localhost` que no lleva a
ninguna parte — «el MVP no se ve».

Aquí el backend hace de intermediario: reenvía todo lo que llegue a
`/preview/<slug>/...` al proyecto que corre en su puerto local. Como el backend
SÍ tiene una URL pública, el MVP pasa a ser visible desde cualquier sitio.

Para que funcione bajo ese prefijo, los proyectos del esqueleto piden sus cosas
con rutas RELATIVAS (`api/items`, `static/styles.css`), que resuelven igual de
bien servidos en la raíz que dentro de `/preview/<slug>/`.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["preview"])

# Cabeceras que NO deben reenviarse tal cual (las gestiona el propio servidor).
_OMITIR_PETICION = {"host", "content-length", "connection", "accept-encoding"}
_OMITIR_RESPUESTA = {"content-length", "content-encoding", "transfer-encoding", "connection"}


def _destino_local(slug: str) -> str | None:
    """URL local (http://localhost:PUERTO) del proyecto arrancado, si lo está."""
    from src.infrastructure.entrypoints.api import get_project_runner

    runner = get_project_runner()
    url = getattr(runner, "_urls", {}).get(slug)  # noqa: SLF001 - registro del runner
    return url


@router.get("/preview/{slug}", include_in_schema=False)
def preview_sin_barra(slug: str) -> RedirectResponse:
    """Redirige a la versión con barra final: sin ella, las rutas relativas fallan."""
    return RedirectResponse(url=f"/preview/{slug}/", status_code=307)


@router.api_route(
    "/preview/{slug}/{ruta:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    include_in_schema=False,
)
async def preview(slug: str, ruta: str, request: Request) -> Response:
    """Reenvía la petición al MVP que corre en el puerto local del contenedor."""
    destino = _destino_local(slug)
    if not destino:
        return Response(
            content=(
                "<h1>Este sistema no está encendido</h1>"
                "<p>Vuelve a la aplicación y arráncalo para verlo aquí.</p>"
            ),
            status_code=404,
            media_type="text/html; charset=utf-8",
        )

    url = f"{destino.rstrip('/')}/{ruta}"
    cabeceras = {k: v for k, v in request.headers.items() if k.lower() not in _OMITIR_PETICION}
    cuerpo = await request.body()

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as cliente:
            respuesta = await cliente.request(
                request.method,
                url,
                content=cuerpo or None,
                headers=cabeceras,
                params=dict(request.query_params),
            )
    except httpx.RequestError as exc:
        logger.warning("Vista previa de '%s' no responde: %s", slug, exc)
        return Response(
            content="<h1>El sistema no responde</h1><p>Puede estar arrancando todavía.</p>",
            status_code=502,
            media_type="text/html; charset=utf-8",
        )

    salida = {k: v for k, v in respuesta.headers.items() if k.lower() not in _OMITIR_RESPUESTA}
    return Response(
        content=respuesta.content,
        status_code=respuesta.status_code,
        headers=salida,
        media_type=respuesta.headers.get("content-type"),
    )
