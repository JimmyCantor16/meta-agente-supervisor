"""DIXEL dentro de las apps generadas: los archivos, las etiquetas y el arranque.

DIXEL (`vendor/dixel`, MIT de Jonathan Contreras) es una librería gráfica sin
dependencias que se consume con un `<script>` y un `<link>`. Aquí vive el único
punto que sabe dónde están sus archivos y cómo se encienden, para que los
esqueletos no repitan rutas ni versiones.

Lo que viaja a cada app es un PERFIL (feedback, botones, campos, tarjetas,
layout, datos, tipografía, revelado por scroll), no la librería entera: son
~78 kB gzip en vez de 166. Se regenera con `python backend/tools/actualizar_dixel.py`.

**La paleta se pasa SIEMPRE**: `Dixel.theme` recibe el acento de la app, así que
la librería sale del color del proyecto y no del morado de fábrica. Sin eso, un
sistema de citas médicas en verde tendría botones lilas.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_DIR = Path(__file__).resolve().parents[3] / "bases" / "dixel"
#: Dónde quedan los archivos dentro del proyecto generado.
DESTINO_JS = "frontend/vendor/dixel.js"
DESTINO_CSS = "frontend/vendor/dixel.css"


@lru_cache(maxsize=4)
def _leer(nombre: str) -> str:
    try:
        return (_DIR / nombre).read_text(encoding="utf-8")
    except OSError:
        logger.warning("DIXEL: falta %s en %s; la app saldrá sin la librería.", nombre, _DIR)
        return ""


def disponible() -> bool:
    """True si los assets están en la imagen. Si no, se degrada sin romper."""
    return bool(_leer("dixel.js")) and bool(_leer("dixel.css"))


def archivos() -> dict[str, str]:
    """Ruta dentro del proyecto generado -> contenido. Vacío si no hay assets."""
    if not disponible():
        return {}
    return {DESTINO_JS: _leer("dixel.js"), DESTINO_CSS: _leer("dixel.css")}


def etiquetas(base: str = "static/vendor") -> str:
    """El `<link>` y el `<script>` que la cargan, ya sangrados para el <head>."""
    if not disponible():
        return ""
    return (
        f'<link rel="stylesheet" href="{base}/dixel.css">\n'
        f'  <script defer src="{base}/dixel.js"></script>'
    )


def arranque(acento: str, modo: str = "dark") -> str:
    """El encendido, con la paleta de la app. Va dentro de un <script>.

    Deja además `window.avisar(texto, tipo)`: una notificación que se ve aunque
    el usuario esté al final de una lista larga. El mensaje pegado al formulario
    se conserva —es el que anuncia el lector de pantalla—, pero por sí solo se
    perdía fuera de pantalla justo cuando más importa («Guardado», «No se pudo»).
    Si la librería no viaja, la función no existe y quien la llama usa `?.`: la
    app se comporta exactamente como antes.
    """
    if not disponible():
        return ""
    color = json.dumps(acento or "#6d5cff")
    tema = json.dumps(modo if modo in ("dark", "light", "auto") else "dark")
    return (
        "window.addEventListener('DOMContentLoaded', () => {\n"
        "      if (!window.Dixel) return;\n"
        f"      Dixel.init({{ smoothScroll: false, theme: {{ primary: {color}, mode: {tema} }} }});\n"
        "      let bandeja = null;\n"
        "      window.avisar = (texto, tipo) => {\n"
        "        if (!texto) return;\n"
        "        if (!bandeja) bandeja = Dixel.create('Toast', { position: 'bottom-right' }).mount(document.body);\n"
        "        bandeja.push({ type: tipo === 'error' ? 'danger' : (tipo || 'success'), message: String(texto) });\n"
        "      };\n"
        "    });"
    )


@lru_cache(maxsize=1)
def _catalogo() -> dict:
    try:
        return json.loads((_DIR / "catalogo.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


@lru_cache(maxsize=1)
def clases_disponibles() -> frozenset[str]:
    """Nombres que EXISTEN en el perfil entregado.

    Es la lista contra la que se comprueba un `data-dx="…"`: un componente
    inventado no falla al escribirlo, falla en pantalla y en silencio.
    """
    return frozenset(
        item["class"]
        for categoria in _catalogo().values()
        for item in categoria
        if item.get("class")
    )


def catalogo_para_prompt(por_categoria: int = 6) -> str:
    """Resumen corto del catálogo para inyectar en un prompt."""
    lineas = []
    for categoria, items in _catalogo().items():
        nombres = [i["class"] for i in items[:por_categoria] if i.get("class")]
        if nombres:
            lineas.append(f"- {categoria}: " + ", ".join(nombres))
    return "\n".join(lineas)
