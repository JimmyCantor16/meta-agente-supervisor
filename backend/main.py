"""Punto de entrada del backend.

Configura el logging global y expone la app ASGI (`app`) para uvicorn.

Ejecutar en desarrollo:
    uvicorn main:app --reload --port 8000
o directamente:
    python main.py
"""

from __future__ import annotations

import logging
import sys

from src.config import get_settings
from src.infrastructure.entrypoints.api import create_app


def configure_logging(level: str) -> None:
    """Configura el módulo `logging` nativo para toda la aplicación."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )


# La configuración se carga al importar el módulo (fail-fast si falta la key).
settings = get_settings()
configure_logging(settings.log_level)

# Instancia ASGI que uvicorn descubre como `main:app`.
app = create_app(settings)


if __name__ == "__main__":
    # Arranque directo para desarrollo local.
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
