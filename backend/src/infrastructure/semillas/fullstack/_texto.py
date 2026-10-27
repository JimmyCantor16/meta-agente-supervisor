"""Ayudante para escribir el contenido del curso con sangría legible."""

from __future__ import annotations

import textwrap


def t(texto: str) -> str:
    """Quita la sangría común y los saltos de línea de los extremos."""
    return textwrap.dedent(texto).strip("\n")
