"""Caso de uso: auditar un proyecto y sugerir mejoras (agente proactivo).

Orquesta el lector (que trae los archivos del proyecto) y el auditor (que los
analiza con la IA). No conoce el filesystem ni el LLM directamente.
"""

from __future__ import annotations

import logging

from src.domain.entities import AuditReport
from src.domain.ports import AuditError, CodeAuditorPort, ProjectReaderPort

logger = logging.getLogger(__name__)


class AuditProjectUseCase:
    """Revisa un proyecto existente y devuelve mejoras priorizadas."""

    def __init__(self, reader: ProjectReaderPort, auditor: CodeAuditorPort) -> None:
        """Inyecta el lector de proyectos y el auditor.

        Args:
            reader: Adaptador que lee los archivos del proyecto del disco.
            auditor: Motor que analiza el código (IA o mock).
        """
        self._reader = reader
        self._auditor = auditor

    def execute(self, project_name: str, language: str = "es") -> AuditReport:
        """Ejecuta la auditoría completa.

        Args:
            project_name: Nombre del proyecto a auditar (ya generado en disco).
            language: Idioma del informe.

        Returns:
            Informe de auditoría con sugerencias de mejora.

        Raises:
            ValueError: Si el nombre está vacío.
            AuditError: Si el proyecto no existe o falla el análisis.
        """
        if not project_name or not project_name.strip():
            raise ValueError("El nombre del proyecto a auditar no puede estar vacío.")

        files = self._reader.read(project_name.strip())
        if not files:
            raise AuditError(f"El proyecto '{project_name}' no tiene archivos legibles.")

        logger.info("Auditando '%s' (%d archivo(s))...", project_name, len(files))
        report = self._auditor.audit(project_name.strip(), files, language)

        logger.info(
            "Auditoría de '%s' completada: %d sugerencia(s).",
            project_name,
            len(report.suggestions),
        )
        return report
