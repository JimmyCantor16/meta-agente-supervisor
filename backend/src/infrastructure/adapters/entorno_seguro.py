"""Entorno MÍNIMO para los subprocesos que ejecutan código generado.

Por diseño, el sistema instala y ejecuta artefactos escritos por un modelo a
partir del prompt de un usuario: `pip install -r requirements.txt`, `npm
install` y finalmente el servidor del proyecto. Hasta ahora esos procesos
heredaban `os.environ` COMPLETO, es decir, corrían con las claves de los
proveedores de IA, la URL de la base de datos y el resto de secretos del
backend a la vista. Un `setup.py` o un `postinstall` malicioso —o simplemente
un paquete equivocado— podía leerlos y sacarlos fuera.

Aquí se construye un entorno con lo IMPRESCINDIBLE para compilar y arrancar, y
nada más. Es una lista BLANCA: lo que no está, no viaja.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# Variables necesarias para que un proceso arranque en Linux y en Windows.
_PERMITIDAS = {
    # POSIX
    "PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TERM", "SHELL", "USER", "LOGNAME",
    # Windows
    "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "USERPROFILE",
    "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)",
    "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS", "SYSTEMDRIVE",
    # Python / Node: comportamiento, no secretos.
    "PYTHONIOENCODING", "PYTHONUNBUFFERED", "PYTHONDONTWRITEBYTECODE", "PYTHONHASHSEED",
    "NODE_ENV", "NPM_CONFIG_CACHE", "NPM_CONFIG_LOGLEVEL",
    # Puerto en el que debe escuchar el proyecto.
    "PORT",
}

# Prefijos permitidos: las variables que el propio verificador inyecta para
# prestarle una base de datos de pruebas al proyecto.
_PREFIJOS_PERMITIDOS = ("VERIFY_",)


def entorno_minimo(extra: dict[str, str] | None = None) -> dict[str, str]:
    """Entorno seguro para ejecutar código generado.

    Args:
        extra: variables que el verificador necesita añadir a propósito
            (por ejemplo, la URL de la base de datos de pruebas).

    Returns:
        Un entorno con lo imprescindible, SIN los secretos del backend.
    """
    limpio = {
        clave: valor
        for clave, valor in os.environ.items()
        if clave.upper() in _PERMITIDAS or clave.upper().startswith(_PREFIJOS_PERMITIDOS)
    }
    # Sin PATH no arranca nada; si faltara, es preferible fallar claro.
    if "PATH" not in limpio and "Path" not in os.environ:
        logger.warning("El entorno no trae PATH; los subprocesos podrían no arrancar.")
    if extra:
        limpio.update(extra)
    return limpio
