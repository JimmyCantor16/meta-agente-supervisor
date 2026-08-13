"""Caso de uso: publicar un proyecto generado como URL pública permanente.

Cierra el hueco entre «tu MVP corre en la vista previa del backend» y «tu MVP
tiene su propia URL en internet». Orquesta sin saber CÓMO se despliega (eso es
del puerto): resuelve la ruta del proyecto en disco, deja constancia de que el
despliegue está en curso, delega en `DesplieguePort` reportando el progreso, y
guarda el resultado final (vivo o fallido, con su detalle) para que
GET /agent/despliegues siempre cuente la verdad.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from src.domain.entities import InfoDespliegue, slugify
from src.domain.ports import DespliegueError, DesplieguePort, DespliegueRepositoryPort

logger = logging.getLogger(__name__)


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


class PublicarProyectoUseCase:
    """Despliega un proyecto de `generated/<slug>` y persiste su estado."""

    def __init__(
        self,
        despliegue: DesplieguePort,
        repo_despliegues: DespliegueRepositoryPort,
        generated_dir: str,
    ) -> None:
        self._despliegue = despliegue
        self._repo = repo_despliegues
        # Mismo patrón que SecretosUseCase: la carpeta de proyectos generados
        # llega por constructor (settings.generated_dir), no se lee aquí.
        self._generated_dir = generated_dir

    def execute(
        self,
        project_name: str,
        al_avanzar: Callable[[str], None] | None = None,
    ) -> InfoDespliegue:
        slug = slugify(project_name)
        ruta = Path(self._generated_dir) / slug
        if not ruta.is_dir():
            # ValueError → 422 en el entrypoint (convención del proyecto).
            raise ValueError(f"El proyecto '{slug}' no existe en disco.")

        # Constancia inmediata: si alguien consulta la lista mientras el build
        # corre, ve "en_curso" y no un hueco. Si ya había un despliegue previo
        # (redeploy), se conservan su URL y su repo hasta tener los nuevos.
        previo = self._repo.obtener(slug)
        en_curso = (previo or InfoDespliegue(
            slug=slug,
            nombre_servicio=slug,
            url="",
            repo="",
            estado="en_curso",
            detalle="",
            actualizado_en=_ahora(),
            ultimo_chequeo=None,
        )).model_copy(update={
            "estado": "en_curso",
            "detalle": "Despliegue en curso…",
            "actualizado_en": _ahora(),
        })
        self._repo.guardar(en_curso)

        try:
            info = self._despliegue.publicar(ruta, slug, al_avanzar)
        except DespliegueError as exc:
            self._marcar_fallido(en_curso, str(exc))
            raise
        except Exception as exc:  # noqa: BLE001 - un fallo inesperado también debe quedar registrado
            self._marcar_fallido(en_curso, f"{type(exc).__name__}: {exc}")
            raise DespliegueError(f"El despliegue falló de forma inesperada: {exc}") from exc

        # El adaptador puede haber recibido otra URL si el nombre estaba tomado;
        # el slug, en cambio, es NUESTRA llave y no se negocia.
        info = info.model_copy(update={"slug": slug})
        self._repo.guardar(info)
        logger.info("Proyecto '%s' publicado: %s", slug, info.url)
        self._avisar(al_avanzar, f"🌍 ¡Tu sistema está VIVO en {info.url}!")
        return info

    # ------------------------------------------------------------------
    def _marcar_fallido(self, base: InfoDespliegue, detalle: str) -> None:
        logger.warning("Despliegue de '%s' FALLIDO: %s", base.slug, detalle[:200])
        self._repo.guardar(base.model_copy(update={
            "estado": "fallido",
            "detalle": detalle[:400],
            "actualizado_en": _ahora(),
        }))

    @staticmethod
    def _avisar(al_avanzar: Callable[[str], None] | None, mensaje: str) -> None:
        if al_avanzar is None:
            return
        try:
            al_avanzar(mensaje)
        except Exception:  # noqa: BLE001 - el progreso jamás rompe el flujo
            pass
