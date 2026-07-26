"""Casos de uso de las METAS DE PROCESO: sueños que se logran en varios pasos.

Cuando el alumno pide algo que ninguna IA logra de un tirón porque es un
PROCESO ('monetizar mi canal de YouTube', 'vender por internet'), el profesor
no promete magia ni corta la ilusión: traza un mapa de hitos honesto y lo
acompaña sesión a sesión, retomando donde se quedaron.
"""

from __future__ import annotations

import logging

from src.domain.entities import MetaProceso
from src.domain.ports import (
    AuditError,
    GeneradorMetaPort,
    MetaRepositoryPort,
)

logger = logging.getLogger(__name__)


class CrearMetaUseCase:
    """Crea (o recupera) el mapa de hitos de una meta del alumno."""

    def __init__(self, generador: GeneradorMetaPort, repo: MetaRepositoryPort) -> None:
        self._generador = generador
        self._repo = repo

    def execute(
        self, usuario_sub: str, objetivo: str, contexto: str = "", language: str = "es"
    ) -> MetaProceso:
        obj = (objetivo or "").strip()
        if not obj:
            raise ValueError("Cuéntame qué meta quieres lograr.")
        meta = self._generador.generar(obj, contexto, language)
        meta.usuario_sub = usuario_sub
        self._repo.guardar(meta)
        logger.info("Meta creada para %s: '%s' (%d hitos).",
                    usuario_sub, obj[:50], len(meta.hitos))
        return meta


class MarcarHitoUseCase:
    """Marca (o desmarca) un hito como logrado y guarda el avance."""

    def __init__(self, repo: MetaRepositoryPort) -> None:
        self._repo = repo

    def execute(self, usuario_sub: str, meta_id: str, indice: int, hecho: bool) -> MetaProceso:
        meta = self._repo.cargar(meta_id)
        if meta is None or meta.usuario_sub != usuario_sub:
            raise AuditError("Esa meta no existe.")
        if not (0 <= indice < len(meta.hitos)):
            raise ValueError("Ese hito no existe en la meta.")
        meta.hitos[indice].hecho = hecho
        self._repo.guardar(meta)
        return meta


class ListarMetasUseCase:
    """Devuelve las metas del alumno para retomarlas."""

    def __init__(self, repo: MetaRepositoryPort) -> None:
        self._repo = repo

    def execute(self, usuario_sub: str) -> list[MetaProceso]:
        return self._repo.de_usuario(usuario_sub)
