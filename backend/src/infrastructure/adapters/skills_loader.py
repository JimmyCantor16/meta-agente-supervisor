"""Cargador de skills: doctrina en archivos .md que se inyecta a los prompts.

Mejorar el comportamiento del agente = editar texto, no código. Las skills
viven en backend/skills/ y cada adaptador pide la suya. Si el archivo no
existe, se devuelve vacío: una skill ausente jamás rompe el sistema.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_SKILLS_DIR = Path(__file__).resolve().parents[3] / "skills"


@lru_cache(maxsize=16)
def skill(nombre: str) -> str:
    """Contenido de una skill (cacheado y con techo de tamaño)."""
    try:
        return (_SKILLS_DIR / nombre).read_text(encoding="utf-8")[:6000]
    except OSError:
        logger.warning("Skill '%s' no encontrada en %s.", nombre, _SKILLS_DIR)
        return ""
