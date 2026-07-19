"""Caso de uso: generar un proyecto de software CON AUTO-VERIFICACIÓN.

Es el "agente que construye". Flujo:
  1. GENERAR  -> el agente produce los archivos.
  2. ESCRIBIR -> se materializan en disco.
  3. VERIFICAR-> se intenta ejecutar/importar de verdad.
  4. CORREGIR -> si falla, se le pasa el ERROR REAL al agente y reintenta.

Ese bucle (3-4) es lo que convierte "código plausible" en "código que funciona".
"""

from __future__ import annotations

import logging

from src.domain.entities import GeneratedProject
from src.domain.ports import (
    ProjectGeneratorPort,
    ProjectRunnerPort,
    ProjectVerifierPort,
    ProjectWriterPort,
)

logger = logging.getLogger(__name__)

# Cuántas veces intentamos corregir con el error real antes de rendirnos.
_MAX_FIX_ATTEMPTS = 3


class GenerateProjectUseCase:
    """Convierte un prompt en un proyecto escrito en disco y VERIFICADO."""

    def __init__(
        self,
        generator: ProjectGeneratorPort,
        writer: ProjectWriterPort,
        verifier: ProjectVerifierPort | None = None,
        runner: ProjectRunnerPort | None = None,
    ) -> None:
        """Inyecta el generador, el escritor y (opcionales) verificador y runner."""
        self._generator = generator
        self._writer = writer
        self._verifier = verifier
        self._runner = runner
        # URL del último proyecto arrancado (la expone el entrypoint).
        self.last_url: str | None = None

    def execute(self, prompt: str, language: str = "es") -> tuple[GeneratedProject, str]:
        """Genera, escribe y auto-verifica el proyecto.

        Returns:
            Tupla (proyecto final, ruta absoluta donde quedó escrito).

        Raises:
            ValueError: Si el prompt está vacío.
            ProjectGenerationError: Si falla la generación o la escritura.
        """
        if not prompt or not prompt.strip():
            raise ValueError("El prompt para generar el proyecto no puede estar vacío.")

        logger.info("Generando proyecto a partir del prompt (%d caracteres)...", len(prompt))
        project = self._generator.generate(prompt.strip(), language)

        logger.info("Proyecto '%s' generado con %d archivo(s).", project.name, len(project.files))
        output_path = self._writer.write(project)

        self.last_url = None

        if self._verifier is None:
            return project, output_path

        # --- Bucle de auto-verificación con el error REAL ---
        for attempt in range(1, _MAX_FIX_ATTEMPTS + 1):
            error = self._verifier.verify(output_path)
            if error is None:
                logger.info("Verificación OK en el intento %d: el proyecto ejecuta.", attempt)
                self._launch(project, output_path)
                return project, output_path

            logger.warning(
                "Verificación falló (intento %d/%d). Corrigiendo con el error real...",
                attempt,
                _MAX_FIX_ATTEMPTS,
            )
            project = self._generator.repair_with_error(project, error)
            output_path = self._writer.write(project)

        # Último chequeo tras la corrección final.
        final_error = self._verifier.verify(output_path)
        if final_error is None:
            logger.info("Verificación OK tras las correcciones.")
            self._launch(project, output_path)
        else:
            logger.warning(
                "El proyecto se entrega con un fallo pendiente tras %d intentos: %s",
                _MAX_FIX_ATTEMPTS,
                final_error[:200],
            )
        return project, output_path

    def _launch(self, project: GeneratedProject, output_path: str) -> None:
        """Arranca el proyecto verificado y guarda su URL para entregarla."""
        if self._runner is None:
            return
        try:
            self.last_url = self._runner.start(output_path, project.slug())
            if self.last_url:
                logger.info("Proyecto disponible en %s", self.last_url)
        except Exception as exc:  # noqa: BLE001 - arrancar es "best effort"
            logger.warning("No se pudo arrancar el proyecto: %s", exc)
            self.last_url = None
