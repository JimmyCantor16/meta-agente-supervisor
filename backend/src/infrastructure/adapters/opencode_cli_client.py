"""Cliente de OpenCode por su CLI: el último respaldo gratis de la cadena.

Los modelos gratis de OpenCode (p. ej. `opencode/big-pickle`) solo se pueden
usar desde OpenCode, así que se lanza `opencode run -m <modelo> <prompt>` como
proceso, igual que hace `soporte-ia-linkysign`. Es lento (~30-60 s): por eso va
AL FINAL, para cuando todo lo demás falló. Como el binario `claude`, en
Docker/Render **no existe**: allí este proveedor ni se crea.

Imita lo justo del SDK de OpenAI (`client.chat.completions.create(...)`) para
que `MultiModelLLM` lo trate como uno más; cualquier fallo sale como
`OpenCodeCliError`.

Seguridad (OpenCode es un AGENTE con herramientas, no una API de texto):
- Corre en una carpeta temporal VACÍA y con todas las herramientas apagadas y
  los permisos en `deny` (`OPENCODE_CONFIG_CONTENT`): no lee, no escribe, no
  ejecuta comandos ni navega. El código de un alumno es DATO, nunca órdenes.
- Se ejecuta el `.exe` real, NUNCA el `opencode.cmd` de npm: un `.cmd` pasa por
  `cmd.exe`, que interpretaría `&`, `|` o `%` del texto del alumno como
  comandos. Si solo hay un `.cmd`, el proveedor no se crea.
- Encoding explícito (`utf-8`): en Windows, sin él, las tildes salen rotas.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from types import SimpleNamespace

from src.infrastructure.adapters.deepseek_web_client import componer_prompt

logger = logging.getLogger(__name__)

#: Windows corta la línea de comandos en 32.767 caracteres; el prompt viaja
#: como argumento, así que se deja margen.
MAX_PROMPT_CHARS = 24_000
#: Si el CLI falla (sin red, sin cupo), descansa antes de volver a lanzarlo.
PAUSA_TRAS_FALLO_SEG = 300.0

# Solo claves que esta versión del CLI (1.18) reconoce: apagar herramientas que
# no conoce (`patch`, `todoread`, `read`...) lo deja colgado sin responder —
# comprobado el 27-oct-2026: 125 s mudos contra 42 s con esta configuración.
_CONFIG_SIN_HERRAMIENTAS = json.dumps({
    "permission": {"edit": "deny", "bash": "deny", "webfetch": "deny"},
    "tools": {"bash": False, "edit": False, "write": False, "webfetch": False},
})
_ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
# Solo la cabecera del CLI; una cita de markdown (`> texto`) del tutor se queda.
_CABECERA = re.compile(r"^\s*>\s*\S+\s+·\s+\S+\s*$")


class OpenCodeCliError(Exception):
    """El CLI de OpenCode no pudo responder (no está, sin red, sin cupo...)."""


def ejecutable_opencode(preferido: str = "") -> str | None:
    """Ruta del binario real de OpenCode, o None si no hay uno seguro de lanzar."""
    candidato = preferido or shutil.which("opencode") or ""
    if not candidato:
        return None
    ruta = Path(candidato)
    if ruta.suffix.lower() in (".cmd", ".bat", ".ps1"):
        # El instalador de npm deja un envoltorio; el binario vive al lado.
        ruta = ruta.parent / "node_modules" / "opencode-ai" / "bin" / "opencode.exe"
    return str(ruta) if ruta.is_file() else None


class OpenCodeCliClient:
    """Cliente con la forma mínima del SDK de OpenAI que usa `MultiModelLLM`."""

    def __init__(self, ejecutable: str, timeout: float) -> None:
        self._exe = ejecutable
        self._timeout = timeout
        self._pausa_hasta = 0.0
        self._lock = threading.Lock()
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, model: str, messages: list[dict], temperature: float = 0.2,
                response_format: dict | None = None, **_: object) -> SimpleNamespace:
        with self._lock:
            restante = self._pausa_hasta - time.monotonic()
        if restante > 0:
            raise OpenCodeCliError(f"en pausa {restante:.0f}s tras un fallo reciente")

        prompt = (
            "No uses herramientas ni leas o escribas archivos: responde solo con texto.\n\n"
            + componer_prompt(messages, want_json=bool(response_format))
        )
        if len(prompt) > MAX_PROMPT_CHARS:
            raise OpenCodeCliError(f"no cabe: {len(prompt)} caracteres (máx. {MAX_PROMPT_CHARS})")

        entorno = {**os.environ, "OPENCODE_CONFIG_CONTENT": _CONFIG_SIN_HERRAMIENTAS}
        with tempfile.TemporaryDirectory(prefix="metaagente-opencode-") as vacia:
            try:
                r = subprocess.run(
                    [self._exe, "run", "-m", model, prompt],
                    cwd=vacia, env=entorno, capture_output=True, text=True,
                    encoding="utf-8", errors="replace", timeout=self._timeout,
                    stdin=subprocess.DEVNULL,
                )
            except subprocess.TimeoutExpired as exc:
                raise OpenCodeCliError(f"sin respuesta en {self._timeout:.0f}s") from exc
            except OSError as exc:
                self._pausar()
                raise OpenCodeCliError(f"no se pudo lanzar opencode: {exc}") from exc

        texto = limpiar_salida(r.stdout or "")
        if r.returncode != 0 or not texto:
            self._pausar()
            detalle = limpiar_salida(r.stderr or "")[:200]
            raise OpenCodeCliError(f"código {r.returncode}{', respuesta vacía' if not texto else ''}: {detalle}")

        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=texto), finish_reason="stop")],
            usage=SimpleNamespace(total_tokens=(len(prompt) + len(texto)) // 4),
        )

    def _pausar(self) -> None:
        with self._lock:
            self._pausa_hasta = time.monotonic() + PAUSA_TRAS_FALLO_SEG


def limpiar_salida(salida: str) -> str:
    """Quita los colores y la cabecera (`> build · modelo`) que pinta el CLI."""
    lineas = [_ANSI.sub("", ln) for ln in salida.splitlines()]
    return "\n".join(ln for ln in lineas if not _CABECERA.match(ln)).strip()
