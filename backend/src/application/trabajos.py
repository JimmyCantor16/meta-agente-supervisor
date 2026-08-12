"""Caso de uso: ciclo de vida de los trabajos de fondo.

Generaliza el patrón "estado.json" de ripor: todo trabajo largo (una
publicación, la revisión de una entrega, futuras generaciones) queda
registrado, es consultable por HTTP y sobrevive a un refresh del navegador
o a un reinicio del proceso.

Regla de la casa: cada método persiste AL MOMENTO. El proceso puede morir
en cualquier punto y la tabla siempre cuenta la última verdad — un trabajo
que nunca llegó a `completar()`/`fallar()` queda "en_curso" y la auditoría
de huérfanos (patrón de `auditoria_despliegues.py`) puede recogerlo después.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from src.domain.entities import TrabajoFondo
from src.domain.ports import TrabajosRepositoryPort

logger = logging.getLogger(__name__)


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


class TrabajosUseCase:
    """Registra y consulta trabajos largos; persiste cada transición al instante."""

    def __init__(self, repo: TrabajosRepositoryPort) -> None:
        self._repo = repo

    # ---- ciclo de vida ----
    def iniciar(self, tipo: str, dueno: str = "") -> TrabajoFondo:
        """Crea el trabajo ya 'en_curso' y lo persiste ANTES de devolverlo."""
        ahora = _ahora()
        trabajo = TrabajoFondo(
            id=uuid.uuid4().hex[:12],
            tipo=tipo,
            dueno=dueno,
            estado="en_curso",
            creado_en=ahora,
            actualizado_en=ahora,
        )
        self._repo.guardar(trabajo)
        return trabajo

    def avanzar(self, id: str, progreso: str) -> TrabajoFondo | None:  # noqa: A002
        """Actualiza el mensaje de progreso (lo que ve quien refresca)."""
        return self._actualizar(id, {"progreso": progreso})

    def completar(self, id: str, resultado: dict) -> TrabajoFondo | None:  # noqa: A002
        """Marca 'listo' con el resultado serializado a JSON."""
        return self._actualizar(id, {
            "estado": "listo",
            "resultado": json.dumps(resultado, ensure_ascii=False),
        })

    def fallar(self, id: str, detalle: str) -> TrabajoFondo | None:  # noqa: A002
        """Marca 'fallido' dejando el porqué a la vista, en el progreso."""
        return self._actualizar(id, {"estado": "fallido", "progreso": detalle})

    # ---- lectura ----
    def obtener(self, id: str) -> TrabajoFondo | None:  # noqa: A002
        return self._repo.obtener(id)

    def listar_de(self, dueno: str, limite: int = 20) -> list[TrabajoFondo]:
        return self._repo.listar_de(dueno, limite)

    # ------------------------------------------------------------------
    def _actualizar(self, id: str, cambios: dict) -> TrabajoFondo | None:  # noqa: A002
        """Lee, aplica los cambios con la hora actual y persiste de una.

        Si el trabajo no existe no revienta: quien avanza un trabajo de
        fondo no debe tumbar el trabajo real por un id perdido.
        """
        trabajo = self._repo.obtener(id)
        if trabajo is None:
            logger.warning("Se intentó actualizar un trabajo inexistente: %s", id)
            return None
        actualizado = trabajo.model_copy(
            update={**cambios, "actualizado_en": _ahora()}
        )
        self._repo.guardar(actualizado)
        return actualizado
