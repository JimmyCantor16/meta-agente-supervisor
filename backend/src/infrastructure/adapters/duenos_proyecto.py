"""Quién es el dueño de cada proyecto generado.

Hasta ahora los proyectos no tenían dueño: cualquiera con sesión veía la lista
completa y podía leer el código de los demás. Y para el usuario se sentía como
que «sus» proyectos no se guardaban, porque la galería mezclaba todo.

La marca vive DENTRO de la carpeta del proyecto (un archivo oculto) en vez de en
una tabla aparte: así el dueño viaja con el proyecto, no hay migración que
mantener, y si el proyecto desaparece, su marca desaparece con él.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_MARCA = ".dueno.json"


def marcar_dueno(project_dir: str | Path, sub: str, email: str = "") -> None:
    """Deja constancia de quién pidió este proyecto. Nunca lanza."""
    if not sub:
        return
    try:
        destino = Path(project_dir) / _MARCA
        destino.write_text(
            json.dumps(
                {
                    "sub": sub,
                    "email": email,
                    "creado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    except Exception as exc:  # noqa: BLE001 - marcar nunca puede tumbar la entrega
        logger.warning("No se pudo marcar el dueño de '%s': %s", project_dir, exc)


def dueno_de(project_dir: str | Path) -> str | None:
    """Sub del dueño, o None si el proyecto no tiene marca (es de antes)."""
    try:
        datos = json.loads((Path(project_dir) / _MARCA).read_text(encoding="utf-8"))
        sub = datos.get("sub")
        return sub if isinstance(sub, str) and sub else None
    except Exception:  # noqa: BLE001 - sin marca, sin dueño conocido
        return None


def es_suyo(project_dir: str | Path, sub: str, es_admin: bool = False) -> bool:
    """¿Puede esta persona ver el proyecto?

    Los proyectos SIN marca (creados antes de que existiera la propiedad) se
    consideran visibles: negar el acceso a lo que alguien ya tenía sería
    romperle su trabajo por un cambio nuestro.
    """
    if es_admin:
        return True
    propietario = dueno_de(project_dir)
    return propietario is None or propietario == sub
