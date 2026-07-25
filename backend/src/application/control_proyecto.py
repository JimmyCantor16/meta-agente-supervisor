"""Caso de uso: ENCENDER / APAGAR / ver el estado de un proyecto generado.

Nace de un dolor concreto del usuario: 'tengo mi proyecto, pero no sé si está
encendido o apagado, ni en qué puerto, ni cómo abrirlo'. Aquí el sistema deja de
suponer que el usuario sabe de Docker o de puertos: un botón lo enciende y le
devuelve la URL; otro lo apaga; y siempre puede ver si está vivo.
"""

from __future__ import annotations

import logging
from pathlib import Path
from urllib.parse import urlparse

from src.domain.entities import slugify
from src.domain.ports import AuditError, ProjectRunnerPort, ProjectVerifierPort

logger = logging.getLogger(__name__)


class ControlProyectoUseCase:
    """Enciende, apaga y consulta el estado de un proyecto en disco."""

    def __init__(
        self,
        runner: ProjectRunnerPort,
        generated_dir: str,
        verifier: ProjectVerifierPort | None = None,
        secretos=None,
    ) -> None:
        self._runner = runner
        self._generated_dir = generated_dir
        # El verificador instala las dependencias: necesario para un arranque en
        # frío (tras reiniciar, la copia con node_modules ya no existe).
        self._verifier = verifier
        # Compone las claves de la carpeta de secretos en el .env antes de arrancar.
        self._secretos = secretos

    def _dir(self, project_name: str) -> Path:
        ruta = Path(self._generated_dir) / slugify(project_name)
        if not ruta.is_dir():
            raise AuditError(f"El proyecto '{project_name}' no existe en disco.")
        return ruta

    def estado(self, project_name: str) -> dict:
        slug = slugify(project_name)
        # Confirma que existe (lanza si no).
        self._dir(project_name)
        url = self._runner.url_activa(slug)
        return _estado_dict(bool(url), url)

    def encender(self, project_name: str) -> dict:
        slug = slugify(project_name)
        ruta = self._dir(project_name)
        ya = self._runner.url_activa(slug)
        if ya:
            return _estado_dict(True, ya)
        logger.info("Encendiendo proyecto '%s' por petición del usuario.", slug)
        # Inyecta las claves de la carpeta de secretos (Azure, etc.) al .env.
        if self._secretos is not None:
            try:
                n = self._secretos.componer_env(project_name)
                if n:
                    logger.info("Cargadas %d clave(s) secreta(s) para '%s'.", n, slug)
            except Exception as exc:  # noqa: BLE001 - los secretos nunca tumban el arranque
                logger.warning("No se pudieron componer los secretos: %s", exc)
        # Camino rápido: si la copia con dependencias sigue viva, arranca ya.
        url = self._runner.start(str(ruta), slug)
        if not url and self._verifier is not None:
            # Arranque EN FRÍO: reinstala dependencias (verify) y reintenta. Es
            # lento (~1-2 min en Node) pero es lo que hace falta tras un reinicio.
            logger.info("Arranque en frío de '%s': preparando dependencias…", slug)
            try:
                self._verifier.verify(str(ruta))
            except Exception as exc:  # noqa: BLE001 - verify es best-effort aquí
                logger.warning("Verify durante encender falló: %s", exc)
            url = self._runner.start(str(ruta), slug)
        if not url:
            raise AuditError(
                "No pude arrancarlo automáticamente. Puede que necesite reinstalar "
                "sus dependencias; el profesor te guía para correrlo en tu computador."
            )
        return _estado_dict(True, url)

    def apagar(self, project_name: str) -> dict:
        slug = slugify(project_name)
        self._runner.stop(slug)
        return _estado_dict(False, None)


def _estado_dict(corriendo: bool, url: str | None) -> dict:
    puerto = None
    if url:
        try:
            puerto = urlparse(url).port
        except ValueError:
            puerto = None
    return {"corriendo": corriendo, "url": url, "puerto": puerto}
