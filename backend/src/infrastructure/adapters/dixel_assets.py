"""DIXEL dentro de los proyectos generados: los archivos, las etiquetas y el arranque.

DIXEL (`vendor/dixel`, MIT de Jonathan Contreras) es una librería gráfica sin
dependencias que se consume con un `<script>` y un `<link>`. Aquí vive el único
punto que sabe dónde están sus archivos y cómo se encienden, para que ningún
generador repita rutas ni versiones.

Lo que viaja es un PERFIL, no la librería entera:

- `app` — proyectos con sesión y datos (gestión, tienda, reservas, educativo,
  panel): feedback, botones, campos, tarjetas, layout, datos, tipografía.
- `sitio` — proyectos que se leen (landing, contenido, portafolio): tipografía,
  medios, tarjetas, efectos de scroll, hover, fondos y microinteracciones.

Se regeneran con `python backend/tools/actualizar_dixel.py`.

**La paleta se pasa SIEMPRE**: `Dixel.theme` recibe el acento del proyecto, así
que la librería sale del color de la marca y no del morado de fábrica. Sin eso,
un sistema de citas médicas en verde tendría botones lilas.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_DIR = Path(__file__).resolve().parents[3] / "bases" / "dixel"
#: Perfil por defecto: el de las aplicaciones con datos.
PERFIL_APP = "app"
#: Perfil de los sitios de lectura (landing, contenido).
PERFIL_SITIO = "sitio"


@lru_cache(maxsize=8)
def _leer(perfil: str, nombre: str) -> str:
    try:
        return (_DIR / perfil / nombre).read_text(encoding="utf-8")
    except OSError:
        logger.warning(
            "DIXEL: falta %s/%s en %s; el proyecto saldrá sin la librería.",
            perfil, nombre, _DIR,
        )
        return ""


def disponible(perfil: str = PERFIL_APP) -> bool:
    """True si los assets de ese perfil están en la imagen. Si no, se degrada."""
    return bool(_leer(perfil, "dixel.js")) and bool(_leer(perfil, "dixel.css"))


def archivos(perfil: str = PERFIL_APP, prefijo: str = "frontend/vendor") -> dict[str, str]:
    """Ruta dentro del proyecto generado -> contenido. Vacío si no hay assets.

    `prefijo` cambia según la forma del proyecto: los esqueletos separan
    `frontend/`, y las bases doradas estáticas sirven desde la raíz.
    """
    if not disponible(perfil):
        return {}
    base = prefijo.rstrip("/")
    return {
        f"{base}/dixel.js": _leer(perfil, "dixel.js"),
        f"{base}/dixel.css": _leer(perfil, "dixel.css"),
    }


def etiquetas(base: str = "static/vendor", perfil: str = PERFIL_APP, sangria: str = "  ") -> str:
    """El `<link>` y el `<script>` que la cargan, listos para el `<head>`."""
    if not disponible(perfil):
        return ""
    ruta = base.rstrip("/")
    return (
        f'<link rel="stylesheet" href="{ruta}/dixel.css">\n'
        f'{sangria}<script defer src="{ruta}/dixel.js"></script>'
    )


def arranque(acento: str, modo: str = "dark", perfil: str = PERFIL_APP, sangria: str = "    ") -> str:
    """El encendido, con la paleta del proyecto. Va dentro de un `<script>`.

    Deja además `window.avisar(texto, tipo)`: una notificación que se ve aunque
    el usuario esté al final de una lista larga. El mensaje pegado al formulario
    se conserva —es el que anuncia el lector de pantalla—, pero por sí solo se
    perdía fuera de pantalla justo cuando más importa («Guardado», «No se pudo»).
    Si la librería no viaja, la función no existe y quien la llama usa `?.`: el
    proyecto se comporta exactamente como antes.

    En el perfil `sitio` no hay `Toast`, así que ahí no se promete `avisar`.
    """
    if not disponible(perfil):
        return ""
    color = json.dumps(acento or "#6d5cff")
    tema = json.dumps(modo if modo in ("dark", "light", "auto") else "dark")
    lineas = [
        "window.addEventListener('DOMContentLoaded', () => {",
        "  if (!window.Dixel) return;",
        f"  Dixel.init({{ smoothScroll: false, theme: {{ primary: {color}, mode: {tema} }} }});",
    ]
    if "Toast" in clases_disponibles(perfil):
        lineas += [
            "  let bandeja = null;",
            "  window.avisar = (texto, tipo) => {",
            "    if (!texto) return;",
            "    if (!bandeja) bandeja = Dixel.create('Toast', { position: 'bottom-right' }).mount(document.body);",
            "    bandeja.push({ type: tipo === 'error' ? 'danger' : (tipo || 'success'), message: String(texto) });",
            "  };",
        ]
    lineas.append("});")
    return ("\n" + sangria).join(lineas)


@lru_cache(maxsize=8)
def _catalogo(perfil: str) -> dict:
    try:
        return json.loads((_DIR / perfil / "catalogo.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


@lru_cache(maxsize=8)
def clases_disponibles(perfil: str = PERFIL_APP) -> frozenset[str]:
    """Nombres que EXISTEN en ese perfil."""
    return frozenset(
        item["class"]
        for categoria in _catalogo(perfil).values()
        for item in categoria
        if item.get("class")
    )


@lru_cache(maxsize=1)
def clases_de_cualquier_perfil() -> frozenset[str]:
    """Unión de todos los perfiles.

    Es el último recurso del verificador: lo primero que mira es la librería que
    el proyecto REALMENTE lleva dentro, que es la única verdad de qué hay ahí.
    """
    perfiles = [p.name for p in _DIR.iterdir() if p.is_dir()] if _DIR.is_dir() else []
    union: set[str] = set()
    for perfil in perfiles:
        union |= set(clases_disponibles(perfil))
    return frozenset(union)


def catalogo_para_prompt(perfil: str = PERFIL_APP, por_categoria: int = 6) -> str:
    """Resumen corto del catálogo de un perfil, para inyectar en un prompt."""
    lineas = []
    for categoria, items in _catalogo(perfil).items():
        nombres = [i["class"] for i in items[:por_categoria] if i.get("class")]
        if nombres:
            lineas.append(f"- {categoria}: " + ", ".join(nombres))
    return "\n".join(lineas)
