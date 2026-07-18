"""Adaptador de filesystem: lee un proyecto del disco para auditarlo.

Lee de forma segura (solo dentro del directorio base), omite binarios y archivos
enormes, y acota el tamaño total para no exceder el contexto del LLM.
"""

from __future__ import annotations

import logging
from pathlib import Path

from src.domain.entities import GeneratedFile, slugify
from src.domain.ports import AuditError, ProjectReaderPort

logger = logging.getLogger(__name__)

# Límites para no reventar el contexto del modelo.
_MAX_FILE_BYTES = 60_000
_MAX_TOTAL_BYTES = 200_000
# Carpetas/archivos que no aportan al análisis.
_SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "dist", "build"}
_SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".lock", ".db"}


class FileSystemProjectReader(ProjectReaderPort):
    """Lee los archivos de texto de un proyecto bajo un directorio base."""

    def __init__(self, base_dir: str) -> None:
        self._base_dir = Path(base_dir).resolve()

    def read(self, project_name: str) -> list[GeneratedFile]:
        project_root = (self._base_dir / slugify(project_name)).resolve()

        # Seguridad: el proyecto debe estar dentro del directorio base.
        try:
            project_root.relative_to(self._base_dir)
        except ValueError as exc:
            raise AuditError(f"Ruta de proyecto inválida: {project_name!r}") from exc

        if not project_root.is_dir():
            raise AuditError(f"El proyecto '{project_name}' no existe en disco.")

        files: list[GeneratedFile] = []
        total = 0

        for path in sorted(project_root.rglob("*")):
            if not path.is_file():
                continue
            # Omite carpetas y extensiones no relevantes.
            if any(part in _SKIP_DIRS for part in path.relative_to(project_root).parts):
                continue
            if path.suffix.lower() in _SKIP_SUFFIXES:
                continue

            size = path.stat().st_size
            if size > _MAX_FILE_BYTES:
                logger.debug("Omitido por tamaño: %s (%d bytes)", path, size)
                continue
            if total + size > _MAX_TOTAL_BYTES:
                logger.warning("Límite total alcanzado; se auditan los primeros archivos.")
                break

            try:
                content = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue  # Binario o ilegible: lo saltamos.

            rel = path.relative_to(project_root).as_posix()
            files.append(GeneratedFile(path=rel, content=content))
            total += size

        return files
