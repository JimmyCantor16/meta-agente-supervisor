"""Caso de uso: el agente audita su propio proyecto y APLICA las mejoras.

Cierra el hueco que hacía inútil al auditor: producía sugerencias que morían
en pantalla porque no había forma de ejecutarlas. Este bucle pertenece a la
FASE DE CONSTRUCCIÓN (antes de entregar el MVP): el agente trabaja con
autonomía total, porque el objetivo es entregar el producto completo, no
enseñar. Tras la entrega, las mejoras pasan por el modo profesor con
'proponer' por defecto.

Cada sugerencia se aplica con el mismo mecanismo de las clases
(`AplicarAjusteUseCase` en nivel EJECUTAR): se escribe, se verifica POR
EJECUCIÓN y, si rompe algo, se revierte. Una mejora nunca puede dejar el
proyecto peor: o entra verificada, o no entra.
"""

from __future__ import annotations

import logging

from pydantic import BaseModel, Field

from src.application.aplicar_ajuste import AplicarAjusteUseCase
from src.domain.entities import ImprovementSuggestion, NivelAutonomia, ResultadoAjuste
from src.domain.ports import AuditError, CodeAuditorPort, ProjectReaderPort

logger = logging.getLogger(__name__)

# Prioridad de aplicación: lo urgente primero. Lo que no esté en la tabla, al final.
_ORDEN_PRIORIDAD = {"alta": 0, "media": 1, "baja": 2}


class ResumenMejora(BaseModel):
    """Qué pasó en una pasada de auto-mejora."""

    proyecto: str
    diagnostico: str = Field(default="", description="Resumen del auditor.")
    sugerencias_totales: int = 0
    intentadas: int = 0
    aplicadas: list[str] = Field(default_factory=list, description="Títulos que entraron verificados.")
    revertidas: list[str] = Field(default_factory=list, description="Rompieron la verificación y se deshicieron.")
    sin_cambios: list[str] = Field(default_factory=list, description="No requirieron tocar código o fallaron al proponerse.")
    detalles: list[ResultadoAjuste] = Field(default_factory=list)

    model_config = {"extra": "ignore"}


class MejorarProyectoUseCase:
    """Audita el proyecto y ejecuta las mejores sugerencias, verificando cada una."""

    def __init__(
        self,
        reader: ProjectReaderPort,
        auditor: CodeAuditorPort,
        ajustar: AplicarAjusteUseCase,
        max_ajustes: int = 3,
    ) -> None:
        self._reader = reader
        self._auditor = auditor
        self._ajustar = ajustar
        # Tope de sugerencias por pasada: cada una cuesta llamadas al LLM y una
        # verificación completa; el tier gratuito no da para aplicar las ocho.
        self._max_ajustes = max_ajustes

    # ------------------------------------------------------------------
    def execute(self, project_name: str, language: str = "es") -> ResumenMejora:
        nombre = (project_name or "").strip()
        if not nombre:
            raise ValueError("El nombre del proyecto no puede estar vacío.")

        archivos = self._reader.read(nombre)
        if not archivos:
            raise AuditError(f"El proyecto '{nombre}' no existe o está vacío.")

        informe = self._auditor.audit(nombre, archivos, language)
        elegidas = self._elegir(informe.suggestions)
        resumen = ResumenMejora(
            proyecto=nombre,
            diagnostico=informe.summary,
            sugerencias_totales=len(informe.suggestions),
            intentadas=len(elegidas),
        )
        logger.info("Auto-mejora de '%s': %d sugerencia(s), se intentan %d.",
                    nombre, len(informe.suggestions), len(elegidas))

        for sugerencia in elegidas:
            peticion = _como_ajuste(sugerencia)
            try:
                resultado = self._ajustar.execute(
                    nombre, peticion, NivelAutonomia.EJECUTAR, language
                )
            except (AuditError, ValueError) as exc:
                logger.warning("Sugerencia '%s' no se pudo aplicar: %s",
                               sugerencia.title, exc)
                resumen.sin_cambios.append(sugerencia.title)
                continue

            resumen.detalles.append(resultado)
            if resultado.aplicado and resultado.verificado:
                resumen.aplicadas.append(sugerencia.title)
            elif resultado.revertido:
                resumen.revertidas.append(sugerencia.title)
            else:
                resumen.sin_cambios.append(sugerencia.title)

        logger.info("Auto-mejora de '%s' terminada: %d aplicada(s), %d revertida(s), %d sin cambios.",
                    nombre, len(resumen.aplicadas), len(resumen.revertidas),
                    len(resumen.sin_cambios))
        return resumen

    # ------------------------------------------------------------------
    def _elegir(self, sugerencias: list[ImprovementSuggestion]) -> list[ImprovementSuggestion]:
        """Las más importantes primero, hasta el tope por pasada."""
        ordenadas = sorted(
            sugerencias,
            key=lambda s: _ORDEN_PRIORIDAD.get((s.priority or "").lower(), 9),
        )
        return ordenadas[: self._max_ajustes]


def _como_ajuste(s: ImprovementSuggestion) -> str:
    """Convierte la sugerencia del auditor en la petición del ajustador."""
    partes = [s.title]
    if s.suggestion:
        partes.append(s.suggestion)
    if s.file:
        partes.append(f"(archivo afectado: {s.file})")
    if s.rationale:
        partes.append(f"Motivo: {s.rationale}")
    return ". ".join(p.strip().rstrip(".") for p in partes if p.strip()) + "."
