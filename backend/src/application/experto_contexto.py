"""El experto de ESTA petición, disponible donde se construye.

El problema práctico: el generador es un objeto compartido (se crea una vez y lo
usan todas las peticiones), pero el experto depende del plan de QUIEN pide. Pasar
el servicio por parámetro obligaría a cambiar la firma del puerto de generación y
de todos sus adaptadores, solo para un caso opcional.

La salida es un contexto por petición. El entrypoint deja aquí el experto del
usuario antes de generar, el generador lo recoge si está, y al terminar se limpia
solo. Si nadie lo dejó —una petición anónima, una prueba— la construcción sigue
exactamente igual con los modelos gratuitos.
"""

from __future__ import annotations

import contextvars
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - solo para el tipado
    from src.application.experto import ServicioExperto

logger = logging.getLogger(__name__)

_ACTUAL: contextvars.ContextVar["ServicioExperto | None"] = contextvars.ContextVar(
    "experto_actual", default=None
)


@contextmanager
def usar_experto(servicio: "ServicioExperto | None") -> Iterator[None]:
    """Deja el experto del usuario disponible mientras dure el bloque."""
    testigo = _ACTUAL.set(servicio)
    try:
        yield
    finally:
        _ACTUAL.reset(testigo)


def experto_actual() -> "ServicioExperto | None":
    """El experto de esta petición, o None si no hay (y entonces no pasa nada)."""
    return _ACTUAL.get()
