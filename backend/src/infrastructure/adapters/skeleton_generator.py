"""Generador que GARANTIZA el MVP para la clase más común (CRUD web con login).

Estrategia (la "forma adecuada" hallada tras 4 generaciones libres rotas): en vez
de re-generar y parchear la plomería, se REUTILIZA un esqueleto probado. El LLM
solo hace UNA tarea pequeña y fiable: leer la idea y devolver los TEXTOS visibles
(nombre de la app, qué son los ítems). El código sale correcto por construcción.

Si la idea NO es un CRUD con login (p. ej. un juego, una landing), delega en el
generador libre de siempre.
"""

from __future__ import annotations

import logging

from src.domain.entities import GeneratedProject
from src.domain.ports import ProjectGeneratorPort
from src.infrastructure.adapters.multimodel_llm import MultiModelLLM
from src.infrastructure.adapters.skeleton_fullstack import MARCADOR, construir

logger = logging.getLogger(__name__)

_SYSTEM = (
    "Eres un clasificador. Lees la idea de una app y decides si es una aplicación "
    "web donde el usuario INICIA SESIÓN y gestiona una LISTA de elementos (CRUD): "
    "tareas, notas, contactos, gastos, inventario, hábitos, etc. Devuelve SOLO un "
    "JSON válido con estaforma exacta:\n"
    '{"es_crud_login": true|false, "app_name": "<título corto y bonito>", '
    '"item_label": "<qué son los elementos, en plural: p.ej. tareas>", '
    '"field_ph": "<placeholder del campo de texto, p.ej. Escribe una tarea...>"}\n'
    "Si la idea NO encaja en ese patrón (juego, landing, dashboard sin login, etc.) "
    "pon es_crud_login=false. No expliques nada, solo el JSON."
)


class SkeletonProjectGenerator(ProjectGeneratorPort):
    """Usa el esqueleto probado para CRUD+login; delega el resto al generador libre."""

    def __init__(self, fallback: ProjectGeneratorPort) -> None:
        self._fallback = fallback
        self._llm = MultiModelLLM(role="prompt")

    def generate(self, prompt: str, language: str = "es") -> GeneratedProject:
        datos = self._extraer(prompt)
        if datos is None:
            logger.info("Esqueleto: la idea no es CRUD+login -> generador libre.")
            return self._fallback.generate(prompt, language)
        logger.info(
            "Esqueleto: idea CRUD+login -> proyecto PROBADO ('%s', ítems=%s).",
            datos["app_name"], datos["item_label"],
        )
        return construir(datos["app_name"], datos["item_label"], datos["field_ph"])

    def repair_with_error(self, project: GeneratedProject, error: str) -> GeneratedProject:
        # Un proyecto de esqueleto es correcto por construcción: NO lo toca el LLM
        # (evita que el reparador rompa algo que ya funciona).
        if self._es_esqueleto(project):
            logger.info("Esqueleto: proyecto correcto por construcción; no se repara.")
            return project
        return self._fallback.repair_with_error(project, error)

    def aplicar_stubs(self, project: GeneratedProject) -> GeneratedProject:
        if self._es_esqueleto(project):
            return project
        return self._fallback.aplicar_stubs(project)

    # -- internos ------------------------------------------------------------
    @staticmethod
    def _es_esqueleto(project: GeneratedProject) -> bool:
        return any(f.path == MARCADOR for f in project.files)

    def _extraer(self, prompt: str) -> dict | None:
        try:
            data = self._llm.chat_json(_SYSTEM, prompt, temperature=0.1)
        except Exception as exc:  # noqa: BLE001 - si el LLM falla, se delega
            logger.warning("Esqueleto: no se pudo clasificar la idea (%s); se delega.", exc)
            return None
        if not isinstance(data, dict) or not data.get("es_crud_login"):
            return None
        return {
            "app_name": str(data.get("app_name") or "Mi App")[:60],
            "item_label": str(data.get("item_label") or "elementos")[:40],
            "field_ph": str(data.get("field_ph") or "Escribe algo...")[:60],
        }
