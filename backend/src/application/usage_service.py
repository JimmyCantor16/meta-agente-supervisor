"""Servicio de uso y licencia: controla el límite de generaciones gratuitas.

Modelo de negocio: el usuario puede generar N proyectos gratis; para seguir,
debe activar una licencia. Si hay licencia válida activa, el uso es ilimitado.

**La licencia es POR USUARIO.** Antes no lo era: el contador y la clave vivían
en una fila única, así que quien activaba `META-PRO-2026` licenciaba la
instancia entera —todos los demás pasaban a ilimitado— y `/usage` le enseñaba a
cada cual cuántos proyectos habían generado los otros. Es el mismo criterio de
privacidad que rige en la galería, los despliegues y la bandeja: lo que puede
cruzar usuarios, se filtra por dueño.

Sin usuario (`usuario=""`) se conserva el comportamiento global de siempre, que
es lo que usan los scripts y las pruebas antiguas.
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

    def is_licensed(self, usuario: str = "") -> bool:
        """True si ESE usuario tiene una licencia activa y válida."""
        active = self._repo.active_license_de(usuario)
        return bool(active and active in self._valid_keys)

    def status(self, usuario: str = "") -> dict:
        """Estado de uso para la UI, del usuario que pregunta."""
        used = self._repo.generations_used_de(usuario)
        licensed = self.is_licensed(usuario)
        remaining = -1 if licensed else max(0, self._free_limit - used)
        return {
            "used": used,
            "limit": self._free_limit,
            "remaining": remaining,
            "licensed": licensed,
        }

    def ensure_can_generate(self, usuario: str = "") -> None:
        """Lanza si ESE usuario agotó su cupo gratis y no tiene licencia."""
        if self.is_licensed(usuario):
            return
        if self._repo.generations_used_de(usuario) >= self._free_limit:
            raise LicenseRequiredError(
                f"Alcanzaste el límite de {self._free_limit} proyectos gratuitos. "
                f"Activa una licencia para seguir generando."
            )

    def record_generation(self, usuario: str = "") -> None:
        """Registra una generación exitosa (solo cuenta si no hay licencia)."""
        if not self.is_licensed(usuario):
            self._repo.record_generation_de(usuario)

    def activate(self, key: str, usuario: str = "") -> bool:
        """Activa la licencia PARA ESE USUARIO si la clave es válida."""
        key = key.strip()
        if key in self._valid_keys:
            self._repo.set_license_de(usuario, key)
            logger.info("Licencia activada correctamente para un usuario.")
            return True
        logger.warning("Intento de activar licencia inválida.")
        return False
