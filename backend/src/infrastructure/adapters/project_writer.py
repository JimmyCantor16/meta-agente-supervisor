"""Adaptador de filesystem: escribe proyectos generados de forma SEGURA.

Punto crítico de seguridad: los archivos vienen (potencialmente) de un LLM, así
que NUNCA confiamos en sus rutas. Rechazamos rutas absolutas y cualquier intento
de salir de la carpeta base (path traversal con `..`), evitando que un contenido
malicioso escriba fuera del directorio destinado.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from src.domain.entities import GeneratedProject
from src.domain.ports import ProjectGenerationError, ProjectWriterPort

logger = logging.getLogger(__name__)


class FileSystemProjectWriter(ProjectWriterPort):
    """Escribe un `GeneratedProject` bajo un directorio base controlado."""

    def __init__(self, base_dir: str) -> None:
        """Inicializa el escritor.

        Args:
            base_dir: Carpeta raíz donde se crean los proyectos generados.
        """
        self._base_dir = Path(base_dir).resolve()
        self._base_dir.mkdir(parents=True, exist_ok=True)

    def write(self, project: GeneratedProject) -> str:
        """Materializa el proyecto en `<base_dir>/<slug>/`.

        Si la carpeta ya existe, se reemplaza (regeneración limpia).
        """
        project_root = (self._base_dir / project.slug()).resolve()

        # Defensa: el destino del proyecto debe quedar dentro de base_dir.
        self._ensure_within_base(project_root)

        # Regeneración limpia: si existía, se borra primero.
        if project_root.exists():
            shutil.rmtree(project_root)
        project_root.mkdir(parents=True)

        for file in project.files:
            target = self._safe_target(project_root, file.path)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(file.content, encoding="utf-8")
            logger.debug("Escrito: %s", target)

        return str(project_root)

    # ------------------------------------------------------------------
    # Seguridad de rutas
    # ------------------------------------------------------------------
    def _safe_target(self, project_root: Path, relative_path: str) -> Path:
        """Resuelve una ruta relativa validando que no escape del proyecto."""
        candidate = relative_path.replace("\\", "/").strip()

        if not candidate or candidate.startswith("/") or ":" in candidate:
            raise ProjectGenerationError(f"Ruta de archivo insegura o absoluta: {relative_path!r}")

        target = (project_root / candidate).resolve()
        self._ensure_within(target, project_root, relative_path)
        return target

    def _ensure_within_base(self, path: Path) -> None:
        """Verifica que `path` no escape del directorio base."""
        self._ensure_within(path, self._base_dir, str(path))

    @staticmethod
    def _ensure_within(path: Path, root: Path, original: str) -> None:
        """Lanza si `path` no está contenido en `root` (bloquea path traversal)."""
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise ProjectGenerationError(
                f"Ruta fuera del directorio permitido: {original!r}"
            ) from exc
