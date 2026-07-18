"""Caso de uso: explicar un proyecto en 'Modo Profesor'.

Lee el proyecto y pide al agente profesor una guía didáctica. Reutiliza el
mismo lector de proyectos que la auditoría.
"""

from __future__ import annotations

import logging

from src.domain.entities import TeachingGuide
from src.domain.ports import AuditError, CodeTeacherPort, ProjectReaderPort

logger = logging.getLogger(__name__)


class ExplainProjectUseCase:
    """Genera una guía de aprendizaje sobre un proyecto existente."""

    def __init__(self, reader: ProjectReaderPort, teacher: CodeTeacherPort) -> None:
        self._reader = reader
        self._teacher = teacher

    def execute(self, project_name: str, language: str = "es") -> TeachingGuide:
        if not project_name or not project_name.strip():
            raise ValueError("El nombre del proyecto no puede estar vacío.")

        files = self._reader.read(project_name.strip())
        if not files:
            raise AuditError(f"El proyecto '{project_name}' no tiene archivos legibles.")

        logger.info("Explicando (modo profesor) '%s' (%d archivos)...", project_name, len(files))
        return self._teacher.teach(project_name.strip(), files, language)
