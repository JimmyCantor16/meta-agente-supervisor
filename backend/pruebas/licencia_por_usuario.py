"""Prueba: la licencia y el cupo son de CADA usuario, no de la instancia.

Antes, activar `META-PRO-2026` escribía una fila única: el que la activaba
licenciaba a todo el mundo, y `/usage` le contaba a cada cual las generaciones
de los demás. Este guion lo demuestra al revés — que ya no ocurre — y de paso
comprueba que un repositorio antiguo (sin las variantes por usuario) sigue
funcionando como siempre, en global.

    cd backend
    PYTHONIOENCODING=utf-8 python pruebas/licencia_por_usuario.py

Offline: no toca la red ni gasta cupo de ningún modelo.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.application.usage_service import UsageService  # noqa: E402
from src.domain.ports import LicenseRequiredError, UsageRepositoryPort  # noqa: E402
from src.infrastructure.adapters.sqlite_usage_repository import (  # noqa: E402
    SqliteUsageRepository,
)

CLAVE = "META-PRO-2026"
ANA = "google-oauth2|ana"
BETO = "google-oauth2|beto"

fallos: list[str] = []


def comprobar(condicion: bool, mensaje: str) -> None:
    print(("  OK   " if condicion else "  FALLA") + " " + mensaje)
    if not condicion:
        fallos.append(mensaje)


class RepositorioAntiguo(UsageRepositoryPort):
    """Un adaptador de antes: solo conoce los métodos globales."""

    def __init__(self) -> None:
        self.contador = 0
        self.clave: str | None = None

    def generations_used(self) -> int:
        return self.contador

    def record_generation(self) -> None:
        self.contador += 1

    def active_license(self) -> str | None:
        return self.clave

    def set_license(self, key: str) -> None:
        self.clave = key


def main() -> int:
    # ignore_cleanup_errors: en Windows sqlite3 deja el archivo tomado un instante.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as carpeta:
        repo = SqliteUsageRepository(str(Path(carpeta) / "uso.db"))
        servicio = UsageService(repo, free_limit=2, valid_keys=[CLAVE])

        print("\n1. El cupo se cuenta por separado")
        servicio.record_generation(ANA)
        servicio.record_generation(ANA)
        comprobar(servicio.status(ANA)["used"] == 2, "Ana lleva 2 generaciones")
        comprobar(servicio.status(BETO)["used"] == 0, "Beto sigue en 0 (no hereda las de Ana)")

        print("\n2. Agotar el cupo solo bloquea a quien lo agotó")
        try:
            servicio.ensure_can_generate(ANA)
            comprobar(False, "Ana debería estar bloqueada tras agotar su cupo")
        except LicenseRequiredError:
            comprobar(True, "Ana queda bloqueada al llegar a su límite")
        try:
            servicio.ensure_can_generate(BETO)
            comprobar(True, "Beto sigue pudiendo generar")
        except LicenseRequiredError:
            comprobar(False, "Beto NO debería estar bloqueado por el cupo de Ana")

        print("\n3. La licencia de uno no licencia a los demás")
        comprobar(servicio.activate(CLAVE, ANA), "Ana activa una clave válida")
        comprobar(servicio.is_licensed(ANA), "Ana queda licenciada")
        comprobar(not servicio.is_licensed(BETO), "Beto NO queda licenciado con la clave de Ana")
        comprobar(servicio.status(ANA)["remaining"] == -1, "Ana pasa a ilimitado")
        comprobar(servicio.status(BETO)["remaining"] == 2, "A Beto le quedan sus 2 gratis")

        print("\n4. Una clave inválida no activa nada")
        comprobar(not servicio.activate("NO-EXISTE", BETO), "Clave inventada rechazada")
        comprobar(not servicio.is_licensed(BETO), "Beto sigue sin licencia")

        print("\n5. Con licencia activa, las generaciones ya no consumen cupo")
        antes = servicio.status(ANA)["used"]
        servicio.record_generation(ANA)
        comprobar(servicio.status(ANA)["used"] == antes, "El contador de Ana no sube estando licenciada")

    print("\n6. Un repositorio ANTIGUO no se rompe: se comporta en global")
    viejo = UsageService(RepositorioAntiguo(), free_limit=2, valid_keys=[CLAVE])
    viejo.record_generation(ANA)
    comprobar(viejo.status(BETO)["used"] == 1, "Sin soporte por usuario, el contador es el de siempre")
    comprobar(viejo.activate(CLAVE, ANA) and viejo.is_licensed(BETO), "Y la licencia sigue siendo global")

    print("\n" + ("=== FIN OK ===" if not fallos else "=== FALLOS: %d ===" % len(fallos)))
    for fallo in fallos:
        print(" - " + fallo)
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
