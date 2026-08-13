"""Caso de uso: auditoría periódica de los despliegues publicados.

Un despliegue no es una foto, es una promesa: la URL que se entregó tiene que
seguir viva mañana. Este caso de uso recorre los despliegues persistidos y:

  · a los "vivo"/"caido" les hace un chequeo HTTP real (reusa `_url_viva`, que
    ya trae las guardas anti-SSRF del profesor) y actualiza su estado;
  · a los "en_curso" abandonados (el servidor se reinició a mitad de deploy)
    los marca "fallido" para que la lista no mienta para siempre;
  · devuelve el informe de lo chequeado, listo para difundir por el WebSocket.

El plan gratis de Render duerme los servicios: un fallo del primer intento no
condena — se espera a que despierte (~1 min) y se reintenta una vez antes de
declarar "caido".
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from src.application.curso_profesor import _url_viva
from src.domain.entities import InfoDespliegue
from src.domain.ports import DespliegueRepositoryPort

logger = logging.getLogger(__name__)

#: Un "en_curso" más viejo que esto quedó huérfano: el poll del deploy dura
#: como mucho ~15 min, así que a los 45 ya nadie lo está esperando.
_EN_CURSO_MAX_S = 45 * 60

#: Espera antes del reintento: un servicio free de Render tarda ~50 s en
#: despertar, y el primer GET es justamente el que lo despierta.
_ESPERA_DESPERTAR_S = 60


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _a_fecha(iso: str) -> datetime | None:
    try:
        fecha = datetime.fromisoformat(iso)
    except (TypeError, ValueError):
        return None
    # Sin zona horaria se asume UTC (todo lo nuestro se guarda en UTC).
    return fecha if fecha.tzinfo else fecha.replace(tzinfo=timezone.utc)


class AuditarDesplieguesUseCase:
    """Revisa la salud de cada despliegue y persiste lo que encontró."""

    def __init__(self, repo_despliegues: DespliegueRepositoryPort) -> None:
        self._repo = repo_despliegues

    def execute(self) -> list[InfoDespliegue]:
        """Chequea todos los despliegues. Devuelve los que se revisaron."""
        informe: list[InfoDespliegue] = []
        for despliegue in self._repo.listar():
            revisado = self._revisar(despliegue)
            if revisado is not None:
                self._repo.guardar(revisado)
                informe.append(revisado)
        return informe

    # ------------------------------------------------------------------
    def _revisar(self, d: InfoDespliegue) -> InfoDespliegue | None:
        """Devuelve el despliegue actualizado, o None si no tocaba revisarlo."""
        if d.estado == "en_curso":
            return self._revisar_huerfano(d)
        if d.estado == "fallido" or not d.url:
            return None  # no hay nada vivo que vigilar
        return self._revisar_salud(d)

    def _revisar_huerfano(self, d: InfoDespliegue) -> InfoDespliegue | None:
        inicio = _a_fecha(d.actualizado_en)
        if inicio is None:
            return None
        transcurrido = (datetime.now(timezone.utc) - inicio).total_seconds()
        if transcurrido <= _EN_CURSO_MAX_S:
            return None  # sigue dentro de lo razonable: aún puede terminar
        logger.warning("Despliegue '%s' quedó a medias; se marca fallido.", d.slug)
        ahora = _ahora()
        return d.model_copy(update={
            "estado": "fallido",
            "detalle": "El despliegue quedó a medias (posible reinicio del servidor).",
            "actualizado_en": ahora,
            "ultimo_chequeo": ahora,
        })

    def _revisar_salud(self, d: InfoDespliegue) -> InfoDespliegue:
        # `_url_viva` exige 200 con cuerpo real (>200 bytes) y trae las guardas
        # anti-SSRF: nunca seguimos una URL hacia la red interna del servidor.
        viva, mensaje = _url_viva(d.url)
        if not viva:
            time.sleep(_ESPERA_DESPERTAR_S)  # quizá solo estaba dormido (plan free)
            viva, mensaje = _url_viva(d.url)

        ahora = _ahora()
        nuevo_estado = "vivo" if viva else "caido"
        cambios: dict = {
            "ultimo_chequeo": ahora,
            "detalle": "Respondiendo bien." if viva else mensaje[:300],
        }
        if nuevo_estado != d.estado:
            cambios["estado"] = nuevo_estado
            cambios["actualizado_en"] = ahora
            if viva:
                logger.info("Despliegue '%s' volvió a la vida: %s", d.slug, d.url)
            else:
                logger.warning("Despliegue '%s' CAÍDO (%s): %s", d.slug, d.url, mensaje[:200])
        return d.model_copy(update=cambios)
