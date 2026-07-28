"""Límite de ritmo por IP para los endpoints que gastan cuota de IA.

`/evaluate` no puede exigir sesión: la app móvil lo usa sin login. Pero dejarlo
abierto de par en par significa que un script anónimo agota los ~12.000
tokens/minuto del tier gratuito y, de rebote, deja sin servicio a los usuarios
que sí iniciaron sesión.

Este limitador es deliberadamente simple (ventana deslizante en memoria): no
pretende parar a un atacante decidido con muchas IPs, sino cortar el abuso
trivial y los bucles accidentales. El control de verdad por usuario lo hace
`AccountService` en los endpoints con sesión.
"""

from __future__ import annotations

import logging
import threading
import time

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)

_VENTANA_SEG = 60.0
_MAX_POR_VENTANA = 8
_MAX_IPS = 5000  # techo de memoria: por encima, se purga lo viejo

_lock = threading.Lock()
_visitas: dict[str, list[float]] = {}


def _ip_cliente(request: Request) -> str:
    """IP del cliente, respetando la cabecera del proxy (Render va detrás de uno)."""
    reenviada = request.headers.get("x-forwarded-for", "")
    if reenviada:
        return reenviada.split(",")[0].strip()
    return request.client.host if request.client else "desconocida"


def _purgar(ahora: float) -> None:
    """Quita las IPs cuya ventana ya expiró (evita crecer sin límite)."""
    for ip in [ip for ip, marcas in _visitas.items() if not marcas or ahora - marcas[-1] > _VENTANA_SEG]:
        _visitas.pop(ip, None)


def limitar_por_ip(request: Request) -> None:
    """Dependencia de FastAPI: lanza 429 si la IP se pasa de ritmo."""
    ahora = time.monotonic()
    ip = _ip_cliente(request)
    with _lock:
        if len(_visitas) > _MAX_IPS:
            _purgar(ahora)
        marcas = [t for t in _visitas.get(ip, []) if ahora - t < _VENTANA_SEG]
        if len(marcas) >= _MAX_POR_VENTANA:
            logger.warning("Límite de ritmo alcanzado para %s.", ip)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiadas peticiones seguidas. Espera un minuto e inténtalo de nuevo.",
            )
        marcas.append(ahora)
        _visitas[ip] = marcas
