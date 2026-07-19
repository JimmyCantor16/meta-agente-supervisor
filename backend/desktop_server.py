"""Punto de entrada del backend cuando viaja DENTRO de la app de escritorio.

La app de escritorio no usa Docker: PyInstaller empaqueta este archivo (junto
con FastAPI, uvicorn y el resto de dependencias) en un único ejecutable que
Tauri arranca como *sidecar* al abrir la ventana y mata al cerrarla.

Diferencias con `main.py` (el que usa Docker):

* Los datos NO se guardan junto al ejecutable (Program Files es de solo
  lectura), sino en la carpeta de datos del usuario:
  `%LOCALAPPDATA%\\MetaAgente` en Windows, `~/.local/share/MetaAgente` en Linux
  y `~/Library/Application Support/MetaAgente` en macOS.
* La configuración (claves de IA, Google) se lee de un `.env` en esa misma
  carpeta, de modo que el usuario puede cambiarla sin reinstalar y los secretos
  nunca quedan dentro del instalador.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Puerto fijo en el que escucha el backend embebido. El frontend empaquetado se
# compila apuntando a esta misma dirección (ver `VITE_API_URL` en el build).
DESKTOP_PORT = 8756


def user_data_dir() -> Path:
    """Carpeta de datos del usuario, según el sistema operativo."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local"
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share"
    directory = Path(base) / "MetaAgente"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


_ENV_TEMPLATE = """\
# Configuración del Meta-Agente (app de escritorio).
# Edita este archivo y vuelve a abrir la aplicación.

# Deja USE_MOCK_LLM en true para probar la app sin gastar cupo de IA.
# Ponlo en false cuando hayas configurado tus claves reales abajo.
USE_MOCK_LLM=true

# --- Proveedor de IA (compatible con OpenAI; p. ej. Groq, gratis) ---
DEEPSEEK_API_KEY=pon-aqui-tu-clave
DEEPSEEK_BASE_URL=https://api.groq.com/openai/v1
DEEPSEEK_MODEL=llama-3.3-70b-versatile

# --- Cadena de proveedores con fallback (opcional, JSON en una sola línea) ---
# LLM_PROVIDERS=[{"name":"groq-70b","base_url":"...","api_key":"...","model":"..."}]

# --- Login con Google (opcional) ---
GOOGLE_CLIENT_ID=

# --- Límites del plan gratuito ---
FREE_GENERATION_LIMIT=3
FREE_LESSON_LIMIT=3
"""


def configure_environment() -> Path:
    """Prepara las variables de entorno antes de importar la app.

    `Settings` se construye al importar la API, así que todo esto debe ocurrir
    ANTES de ese import; por eso la importación de la app es diferida.
    """
    data_dir = user_data_dir()

    # `.env` editable por el usuario en su carpeta de datos. En la primera
    # ejecución no existe: se crea una plantilla en modo simulado para que la
    # app abra y sea usable, en vez de morir por falta de claves.
    env_file = data_dir / ".env"
    if not env_file.exists():
        env_file.write_text(_ENV_TEMPLATE, encoding="utf-8")
        print(f"[Meta-Agente] Configuración inicial creada en {env_file}", flush=True)

    from dotenv import load_dotenv

    load_dotenv(env_file)

    # Red de seguridad: si el usuario vació una clave obligatoria, la app arranca
    # igualmente en modo simulado en lugar de no abrir.
    if not os.environ.get("DEEPSEEK_API_KEY"):
        os.environ["DEEPSEEK_API_KEY"] = "sin-configurar"
        os.environ["USE_MOCK_LLM"] = "true"

    # Rutas de escritura: nunca junto al ejecutable.
    os.environ.setdefault("DB_PATH", str(data_dir / "evaluations.db"))
    os.environ.setdefault("GENERATED_DIR", str(data_dir / "generated"))

    # En escritorio el frontend se sirve desde el propio Tauri, cuyo origen no
    # es http://localhost:8080; hay que permitir esos orígenes en CORS.
    os.environ.setdefault(
        "CORS_ORIGINS",
        "http://localhost:8756,http://127.0.0.1:8756,"
        "tauri://localhost,http://tauri.localhost,https://tauri.localhost",
    )
    return data_dir


def main() -> None:
    """Arranca uvicorn sirviendo la API en el puerto del escritorio."""
    data_dir = configure_environment()

    # Import diferido: la configuración ya está en el entorno.
    import uvicorn

    from src.infrastructure.entrypoints.api import create_app

    print(f"[Meta-Agente] Datos del usuario: {data_dir}", flush=True)
    print(f"[Meta-Agente] API escuchando en http://127.0.0.1:{DESKTOP_PORT}", flush=True)

    uvicorn.run(
        create_app(),
        host="127.0.0.1",
        port=DESKTOP_PORT,
        log_level=os.environ.get("LOG_LEVEL", "info").lower(),
    )


if __name__ == "__main__":
    main()
