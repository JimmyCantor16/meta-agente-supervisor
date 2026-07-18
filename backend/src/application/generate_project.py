"""Caso de uso: generar un proyecto de software a partir de un prompt.

Es el "agente que construye". Orquesta dos puertos: el generador (que produce
los archivos) y el escritor (que los materializa en disco de forma segura).
No conoce DeepSeek ni el sistema de archivos directamente.
"""

from __future__ import annotations

import logging

from src.domain.entities import GeneratedProject
from src.domain.ports import ProjectGeneratorPort, ProjectWriterPort

logger = logging.getLogger(__name__)


class GenerateProjectUseCase:
    """Convierte un prompt de ingeniería en un proyecto escrito en disco."""

    def __init__(
        self,
        generator: ProjectGeneratorPort,
        writer: ProjectWriterPort,
    ) -> None:
        """Inyecta el generador y el escritor.

        Args:
            generator: Motor que produce los archivos (DeepSeek o mock).
            writer: Adaptador que materializa el proyecto en el filesystem.
        """
        self._generator = generator
        self._writer = writer

    def execute(self, prompt: str, language: str = "es") -> tuple[GeneratedProject, str]:
        """Genera el proyecto y lo escribe en disco.

        Args:
            prompt: Prompt optimizado que describe el sistema a construir.
            language: Idioma para la documentación generada.

        Returns:
            Tupla (proyecto generado, ruta absoluta donde se escribió).

        Raises:
            ValueError: Si el prompt está vacío.
            ProjectGenerationError: Si falla la generación o la escritura.
        """
        if not prompt or not prompt.strip():
            raise ValueError("El prompt para generar el proyecto no puede estar vacío.")

        logger.info("Generando proyecto a partir del prompt (%d caracteres)...", len(prompt))
        project = self._generator.generate(prompt.strip(), language)

        logger.info("Proyecto '%s' generado con %d archivo(s). Escribiendo...", project.name, len(project.files))
        output_path = self._writer.write(project)

        logger.info("Proyecto escrito en: %s", output_path)
        return project, output_path
