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
from src.infrastructure.adapters.skeleton_landing import construir_landing

logger = logging.getLogger(__name__)

_SYSTEM = (
    "Clasifica la idea de una app en UN tipo y devuelve SOLO un JSON válido (sin texto extra):\n"
    "- 'crud_login': app web donde el usuario INICIA SESIÓN y gestiona una LISTA de "
    "elementos (tareas, notas, contactos, gastos, inventario, hábitos...).\n"
    "- 'landing': página de presentación / marketing / portafolio / informativa de un "
    "producto, servicio, artista o negocio, SIN login ni base de datos.\n"
    "- 'otro': cualquier otra cosa (juego, dashboard complejo, solo API, etc.).\n\n"
    "Forma del JSON:\n"
    '{"tipo":"crud_login|landing|otro",'
    ' "app_name":"<título corto>","item_label":"<elementos en plural, p.ej. tareas>",'
    ' "field_ph":"<placeholder, p.ej. Escribe una tarea...>",'
    ' "title":"<título de la landing>","tagline":"<frase gancho breve>","cta":"<botón, p.ej. Empezar>",'
    ' "sections":[{"heading":"...","text":"..."}]}\n'
    "Rellena SOLO los campos del tipo elegido (para landing incluye 3 a 5 sections). "
    "No expliques nada, solo el JSON."
)


class SkeletonProjectGenerator(ProjectGeneratorPort):
    """Usa el esqueleto probado para CRUD+login; delega el resto al generador libre."""

    def __init__(self, fallback: ProjectGeneratorPort) -> None:
        self._fallback = fallback
        self._llm = MultiModelLLM(role="prompt")

    def generate(self, prompt: str, language: str = "es") -> GeneratedProject:
        datos = self._extraer(prompt)
        tipo = (datos or {}).get("tipo")
        if tipo == "crud_login":
            app_name = str(datos.get("app_name") or "Mi App")[:60]
            item_label = str(datos.get("item_label") or "elementos")[:40]
            field_ph = str(datos.get("field_ph") or "Escribe algo...")[:60]
            logger.info("Esqueleto: CRUD+login -> hexagonal PROBADO ('%s', ítems=%s).", app_name, item_label)
            return construir(app_name, item_label, field_ph)
        if tipo == "landing":
            title = str(datos.get("title") or datos.get("app_name") or "Mi Producto")[:60]
            tagline = str(datos.get("tagline") or "Algo simple y bien hecho.")[:140]
            cta = str(datos.get("cta") or "Empezar")[:30]
            secciones = datos.get("sections") if isinstance(datos.get("sections"), list) else []
            secciones = [s for s in secciones if isinstance(s, dict) and s.get("heading")]
            logger.info("Esqueleto: LANDING PROBADA ('%s', %d secciones).", title, len(secciones))
            return construir_landing(title, tagline, cta, secciones)
        logger.info("Esqueleto: idea 'otro' -> generador libre.")
        return self._fallback.generate(prompt, language)

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
        return data if isinstance(data, dict) else None
