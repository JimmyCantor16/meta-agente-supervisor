"""Carpeta de secretos: compartir claves de forma segura, SIN pasar por el chat.

Nace de una necesidad real: 'te paso la key de Azure en un .txt en una carpeta
que crees para compartir secretos de forma segura'. La regla de oro es que una
credencial NUNCA se escribe en el chat, porque ese texto viajaría al proveedor
de IA. Aquí el usuario suelta un archivo .txt en una carpeta local del proyecto;
el backend lo lee EN LOCAL y lo inyecta como variable de entorno al arrancar.

- Los VALORES nunca se devuelven por la API: solo los NOMBRES de las claves.
- La carpeta vive dentro del proyecto (generated/<slug>/secretos), ignorada por
  git como todo 'generated/'.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from src.domain.entities import slugify
from src.domain.ports import AuditError

logger = logging.getLogger(__name__)

_NOMBRE_VALIDO = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class SecretosUseCase:
    """Gestiona la carpeta de secretos de un proyecto y compone su .env."""

    def __init__(self, generated_dir: str) -> None:
        self._generated_dir = generated_dir

    def _proyecto_dir(self, project_name: str) -> Path:
        ruta = Path(self._generated_dir) / slugify(project_name)
        if not ruta.is_dir():
            raise AuditError(f"El proyecto '{project_name}' no existe en disco.")
        return ruta

    def carpeta(self, project_name: str) -> Path:
        """Devuelve (creándola si hace falta) la carpeta de secretos del proyecto."""
        carpeta = self._proyecto_dir(project_name) / "secretos"
        carpeta.mkdir(parents=True, exist_ok=True)
        # Una nota para el usuario dentro de la propia carpeta.
        readme = carpeta / "LEEME.txt"
        if not readme.exists():
            readme.write_text(
                "Suelta aquí tus claves en archivos .txt (una por línea, formato\n"
                "NOMBRE=valor). NUNCA las pegues en el chat: aquí quedan seguras y\n"
                "solo se usan en tu computador para arrancar el proyecto.\n"
                "Ejemplo (archivo azure.txt):\n"
                "AZURE_SUBSCRIPTION_ID=xxxxxxxx\n"
                "AZURE_CLIENT_ID=xxxxxxxx\n",
                encoding="utf-8",
            )
        return carpeta

    def info(self, project_name: str) -> dict:
        """Ruta de la carpeta + NOMBRES de las claves cargadas (nunca los valores)."""
        carpeta = self.carpeta(project_name)
        nombres = sorted(self._leer(carpeta).keys())
        return {
            "carpeta": str(carpeta),
            "nombres": nombres,
            "instruccion": (
                "Suelta tu archivo .txt con tus claves (NOMBRE=valor) en esta "
                "carpeta. Nunca las escribas en el chat. Al encender el proyecto "
                "se cargan solas."
            ),
        }

    def componer_env(self, project_name: str) -> int:
        """Vuelca las claves de la carpeta al .env del proyecto. Devuelve cuántas.

        Se llama al ENCENDER: así el proceso del proyecto ve las credenciales por
        entorno, sin que hayan pasado nunca por la red ni por el chat.
        """
        try:
            proyecto = self._proyecto_dir(project_name)
        except AuditError:
            return 0
        secretos = self._leer(proyecto / "secretos")
        if not secretos:
            return 0
        env_path = proyecto / ".env"
        existentes = self._leer_env(env_path)
        existentes.update(secretos)  # las claves de la carpeta mandan
        env_path.write_text(
            "".join(f"{k}={v}\n" for k, v in existentes.items()), encoding="utf-8"
        )
        logger.info("Compuestas %d clave(s) secreta(s) en el .env de '%s'.",
                    len(secretos), slugify(project_name))
        return len(secretos)

    # ------------------------------------------------------------------
    def _leer(self, carpeta: Path) -> dict[str, str]:
        """Lee todos los .txt de la carpeta y devuelve {NOMBRE: valor}."""
        if not carpeta.is_dir():
            return {}
        claves: dict[str, str] = {}
        for archivo in carpeta.glob("*.txt"):
            if archivo.name.lower() == "leeme.txt":
                continue
            try:
                contenido = archivo.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for linea in contenido.splitlines():
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                nombre, _, valor = linea.partition("=")
                nombre = nombre.strip()
                valor = valor.strip()
                if _NOMBRE_VALIDO.match(nombre) and valor:
                    claves[nombre] = valor
        return claves

    @staticmethod
    def _leer_env(env_path: Path) -> dict[str, str]:
        if not env_path.is_file():
            return {}
        datos: dict[str, str] = {}
        for linea in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                nombre, _, valor = linea.partition("=")
                datos[nombre.strip()] = valor.strip()
        return datos
