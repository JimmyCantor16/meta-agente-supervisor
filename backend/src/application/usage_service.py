"""Servicio de uso y licencia: controla el límite de generaciones gratuitas.

Modelo de negocio: el usuario puede generar N proyectos gratis; para seguir,
debe activar una licencia. Si hay licencia válida activa, el uso es ilimitado.
"""

from __future__ import annotations

import logging

from src.domain.ports import LicenseRequiredError, UsageRepositoryPort

logger = logging.getLogger(__name__)


class UsageService:
    """Aplica el gate de licencia sobre las generaciones."""

    def __init__(
        self,
        repository: UsageRepositoryPort,
        free_limit: int,
        valid_keys: list[str],
    ) -> None:
        self._repo = repository
        self._free_limit = free_limit
        self._valid_keys = set(valid_keys)

    def is_licensed(self) -> bool:
        """True si hay una licencia activa y válida."""
        active = self._repo.active_license()
        return bool(active and active in self._valid_keys)

    def status(self) -> dict:
        """Estado de uso para la UI."""
        used = self._repo.generations_used()
        licensed = self.is_licensed()
        remaining = -1 if licensed else max(0, self._free_limit - used)
        return {
            "used": used,
            "limit": self._free_limit,
            "remaining": remaining,
            "licensed": licensed,
        }

    def ensure_can_generate(self) -> None:
        """Lanza si se agotó el cupo gratis y no hay licencia."""
        if self.is_licensed():
            return
        if self._repo.generations_used() >= self._free_limit:
            raise LicenseRequiredError(
                f"Alcanzaste el límite de {self._free_limit} proyectos gratuitos. "
                f"Activa una licencia para seguir generando."
            )

    def record_generation(self) -> None:
        """Registra una generación exitosa (solo cuenta si no hay licencia)."""
        if not self.is_licensed():
            self._repo.record_generation()

    def activate(self, key: str) -> bool:
        """Activa una licencia si la clave es válida."""
        key = key.strip()
        if key in self._valid_keys:
            self._repo.set_license(key)
            logger.info("Licencia activada correctamente.")
            return True
        logger.warning("Intento de activar licencia inválida.")
        return False
