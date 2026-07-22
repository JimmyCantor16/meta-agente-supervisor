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
# Se subió de 3 a 7 porque el bucle CONVERGE pero necesita vueltas: en una
# corrida real iba 5 -> 3 símbolos pendientes y se quedó sin intentos justo
# antes de terminar. Ahora repetir es barato (las dependencias están cacheadas)
# y el bucle se corta solo en cuanto una corrección no cambia nada.
_MAX_FIX_ATTEMPTS = 7


def _solo_falla_el_frontend(error: str) -> bool:
    """True si lo único roto es la compilación de la interfaz.

    En ese caso el backend está instalado y comprobado, y merece entregarse:
    media entrega honesta vale más que ninguna.
    """
    marcadores = ("EL FRONTEND NO COMPILA", "Fallo instalando dependencias del frontend")
    return any(m in error for m in marcadores)


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
        # Si la interfaz no compiló, aquí queda el motivo para poder decírselo
        # al usuario en vez de entregarle una URL a medias sin explicación.
        self.frontend_error: str | None = None

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
                logger.info("Verificación superada en el intento %d.", attempt)
                self._launch(project, output_path)
                if self.last_url is None:
                    # Sin URL el entregable está incompleto: el usuario recibe
                    # código en disco en vez del sistema funcionando.
                    logger.warning(
                        "ENTREGABLE INCOMPLETO: '%s' no se pudo arrancar, no hay URL.",
                        project.name,
                    )
                return project, output_path

            # Se registra el error COMPLETO de cada intento, no solo el último:
            # sin esto no hay forma de saber por qué falló una ronda intermedia,
            # y cada iteración se convierte en una adivinanza.
            logger.warning(
                "Verificación falló (intento %d/%d):\n%s\n--- corrigiendo ---",
                attempt,
                _MAX_FIX_ATTEMPTS,
                error[-1800:],
            )
            huella_previa = {f.path: f.content for f in project.files}
            project = self._generator.repair_with_error(project, error)

            # Con la misma entrada y temperatura baja, el modelo devuelve
            # exactamente la misma corrección: reintentar es tiempo perdido.
            # Si nada cambió, se para en vez de repetir la jugada.
            if {f.path: f.content for f in project.files} == huella_previa:
                logger.warning(
                    "La corrección no cambió NADA; se generan stubs para los "
                    "símbolos que faltan y así el sistema al menos ARRANCA "
                    "(intento %d).", attempt,
                )
                # Última bala: si lo que bloquea son símbolos sin implementar,
                # se crean stubs seguros para que el proyecto compile y arranque.
                # Las funciones quedan como ejercicio del modo profesor.
                project = self._generator.aplicar_stubs(project)
                nuevo_output = self._writer.write(project)
                if self._verifier.verify(nuevo_output) is None:
                    output_path = nuevo_output
                    break
                # Si ni con stubs arranca, no hay más que hacer.
                if {f.path: f.content for f in project.files} == huella_previa:
                    break
                output_path = nuevo_output
                continue

            output_path = self._writer.write(project)

        # Último chequeo tras la corrección final.
        final_error = self._verifier.verify(output_path)
        if final_error is None:
            logger.info("Verificación OK tras las correcciones.")
            self._launch(project, output_path)
        elif _solo_falla_el_frontend(final_error):
            # El backend está instalado y verificado: descartarlo entero porque
            # la interfaz no compiló es tirar lo que SÍ funciona. Se entrega la
            # URL del backend y se dice con claridad qué quedó pendiente.
            logger.warning(
                "La interfaz no compila, pero el backend sí funciona: se entrega "
                "igualmente su URL. Detalle del fallo del frontend:\n%s",
                final_error[-800:],
            )
            self._launch(project, output_path)
            self.frontend_error = final_error
        else:
            # Se registra el final del error (donde está el diagnóstico), no los
            # primeros 200 caracteres, que solo mostraban la cabecera inútil del
            # traceback y dejaban a ciegas a quien revisa los logs.
            logger.warning(
                "El proyecto se entrega con un fallo pendiente tras %d intentos:\n%s",
                _MAX_FIX_ATTEMPTS,
                final_error[-1500:],
            )
        return project, output_path

    def _launch(self, project: GeneratedProject, output_path: str) -> None:
        """Arranca el proyecto verificado y guarda su URL para entregarla.

        GATE DE RENDER: antes de entregar la URL, un navegador real comprueba
        que la página SE VE y no revienta en JavaScript. El usuario final no
        sabe programar: una URL en blanco es peor que no entregar URL.
        """
        if self._runner is None:
            return
        try:
            self.last_url = self._runner.start(output_path, project.slug())
            if not self.last_url:
                return
            from src.infrastructure.adapters.validacion_navegador import validar_render

            fallo_render = validar_render(self.last_url)
            if fallo_render is None:
                logger.info("Proyecto disponible en %s (render validado).", self.last_url)
                return
            logger.warning(
                "URL RETENIDA para '%s': el navegador demostró que la página "
                "no sirve al usuario final.\n%s",
                project.slug(), fallo_render,
            )
            self._runner.stop(project.slug())
            self.frontend_error = (
                "El proyecto compila y arranca, pero el navegador detectó que "
                "la página no se muestra correctamente, así que la URL no se "
                "entrega todavía:\n" + fallo_render
            )
            self.last_url = None
        except Exception as exc:  # noqa: BLE001 - arrancar es "best effort"
            logger.warning("No se pudo arrancar el proyecto: %s", exc)
            self.last_url = None
