"""Prueba de la cadena de IA: DeepSeek primero, OpenRouter solo gratis. Offline.

QUÉ DEMUESTRA
-------------
1. `DEEPSEEK_MODE=local` pone `deepseek-web` PRIMERO; `off` no lo pone; y
   `remote` sin clave no rompe nada (avisa y sigue sin él).
2. Los proveedores de GitHub Models (retirados, 410) se podan solos aunque
   sigan en `LLM_PROVIDERS`, y los Llama retirados de Groq pasan a su sucesor.
3. De OpenRouter solo entran modelos `:free` (u `openrouter/free`): un id de
   pago se descarta en vez de empezar a gastar saldo.
4. El cliente de `deepseek-web-chat` funciona contra un servidor HTTP falso
   con la misma API: compone system+user, valida el contrato dentro del
   fallback, borra el chat que abre y, si el servicio no está, salta al
   siguiente proveedor y queda en pausa (no reintenta en cada petición).
5. OpenCode (último respaldo) solo se lanza por su `.exe` real, nunca por el
   `.cmd` de npm, y si su CLI falla la cadena sigue con el siguiente.

    cd backend
    PYTHONIOENCODING=utf-8 python pruebas/cadena_ia.py
"""

from __future__ import annotations

import json
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import BaseModel  # noqa: E402

from src.config import LLMProvider, Settings  # noqa: E402
from src.infrastructure.adapters.deepseek_web_client import DeepSeekWebClient  # noqa: E402
from src.infrastructure.adapters.multimodel_llm import MultiModelLLM  # noqa: E402
from src.infrastructure.adapters.opencode_cli_client import (  # noqa: E402
    OpenCodeCliClient,
    ejecutable_opencode,
    limpiar_salida,
)

GITHUB = LLMProvider(name="github-gpt4o-mini", base_url="https://models.inference.ai.azure.com",
                     api_key="x" * 12, model="gpt-4o-mini")
GROQ = LLMProvider(name="groq-70b", base_url="https://api.groq.com/openai/v1",
                   api_key="x" * 12, model="llama-3.3-70b-versatile")
OR_PAGO = LLMProvider(name="or-pago", base_url="https://openrouter.ai/api/v1",
                      api_key="x" * 12, model="anthropic/claude-sonnet-4")


def ajustes(**kw) -> Settings:
    # Todo explícito: las variables de entorno (p. ej. DEEPSEEK_MODE=local de
    # `npm run dev`) ganarían a los valores por defecto y la prueba mentiría.
    base = {
        "deepseek_api_key": "x" * 12,
        "llm_providers": [GITHUB, GROQ, OR_PAGO],
        "deepseek_mode": "off",
        "deepseek_api_url": "",
        "openrouter_api_key": "",
        "opencode_mode": "off",
    }
    return Settings(_env_file=None, **{**base, **kw})  # type: ignore[call-arg]


class Contrato(BaseModel):
    titulo: str


class ServicioFalso(BaseHTTPRequestHandler):
    """Imita `deepseek-web-chat`: el SSE de /api/deepseek/stream (con los mismos
    eventos que emite su `streamDeepSeek`) y /api/deepseek/delete."""

    prompts: list[str] = []
    borrados: list[str] = []

    def do_POST(self) -> None:  # noqa: N802
        cuerpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/api/deepseek/stream":
            ServicioFalso.prompts.append(cuerpo["prompt"])
            eventos = [
                ("progress", {"type": "progress", "phase": "pow"}),
                ("session", {"type": "session", "chat_session_id": "s-1"}),
                ("content", {"type": "content", "delta": "basura que se reemplaza"}),
                ("content", {"type": "content", "delta": '```json\n{"titulo": ', "replace": True}),
                ("content", {"type": "content", "delta": '"hola"}\n```'}),
                ("done", {"chat_session_id": "s-1", "status": "FINISHED"}),
            ]
            salida = "".join(f"event: {e}\ndata: {json.dumps(d)}\n\n" for e, d in eventos).encode()
            tipo = "text/event-stream"
        else:
            ServicioFalso.borrados.append(cuerpo.get("chat_session_id"))
            salida, tipo = b'{"ok": true}', "application/json"
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(salida)))
        self.end_headers()
        self.wfile.write(salida)

    def log_message(self, *_a) -> None:
        pass


class ClienteSano:
    def __init__(self) -> None:
        self.llamadas = 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **_kw):
        self.llamadas += 1
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"titulo": "de groq"}'), finish_reason="stop")],
            usage=None,
        )


def main() -> int:
    # 1) Dónde entra DeepSeek.
    nombres = [p.name for p in ajustes(deepseek_mode="local").resolved_providers]
    assert nombres[0] == "deepseek-web", nombres
    assert "deepseek-web" not in [p.name for p in ajustes().resolved_providers]
    assert "deepseek-remote" not in [p.name for p in ajustes(deepseek_mode="remote").resolved_providers]
    remoto = ajustes(deepseek_mode="remote", deepseek_remote_key="k" * 12).resolved_providers
    assert remoto[0].name == "deepseek-remote" and remoto[0].base_url == "https://api.deepseek.com"
    print("1. DeepSeek va primero en local/remote, y remote sin clave no rompe nada ✓")

    # 2 y 3) Poda.
    cadena = ajustes(openrouter_api_key="k" * 12, openrouter_models="openrouter/free,qwen/de-pago").resolved_providers
    nombres = [p.name for p in cadena]
    assert "github-gpt4o-mini" not in nombres, nombres
    print("2. GitHub Models (retirado) se poda aunque siga en LLM_PROVIDERS ✓")
    assert next(p for p in cadena if p.name == "groq-70b").model == "openai/gpt-oss-120b"
    assert GROQ.model == "llama-3.3-70b-versatile", "no debe mutar la configuración original"
    print("2b. un Llama retirado de Groq se cambia por su sucesor vigente ✓")
    assert "or-pago" not in nombres and "openrouter-de-pago" not in nombres, nombres
    assert "openrouter-free" in nombres and nombres[-1] == "openrouter-free", nombres
    assert next(p for p in cadena if p.name == "openrouter-free").quota_group == "openrouter-free"
    print("3. de OpenRouter solo entran modelos gratuitos, al final de la cadena ✓")

    # 4) El cliente contra un deepseek-web-chat falso.
    servidor = HTTPServer(("127.0.0.1", 0), ServicioFalso)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{servidor.server_port}"
    web = LLMProvider(name="deepseek-web", kind="deepseek_web", base_url=url, api_key="-", model="-")
    llm = MultiModelLLM(providers=[web, GROQ])
    sano = ClienteSano()
    llm._clients[1] = (GROQ, sano)  # noqa: SLF001 - sin red
    assert isinstance(llm._clients[0][1], DeepSeekWebClient)  # noqa: SLF001
    datos = llm.chat_json("eres un sistema", "dame un título", validar=Contrato.model_validate)
    assert datos == {"titulo": "hola"} and sano.llamadas == 0, (datos, sano.llamadas)
    prompt = ServicioFalso.prompts[-1]
    assert "eres un sistema" in prompt and "dame un título" in prompt and "JSON" in prompt
    for _ in range(50):  # el borrado va en segundo plano
        if ServicioFalso.borrados:
            break
        threading.Event().wait(0.1)
    assert ServicioFalso.borrados == ["s-1"], ServicioFalso.borrados
    print("4a. DeepSeek por la web responde, el contrato se valida y el chat se borra ✓")

    servidor.shutdown()
    servidor.server_close()
    assert llm.chat_json("s", "u") == {"titulo": "de groq"} and sano.llamadas == 1
    assert llm._clients[0][1]._pausa_hasta > 0, "tras el fallo de conexión debe quedar en pausa"  # noqa: SLF001
    assert llm.chat_json("s", "u") == {"titulo": "de groq"} and sano.llamadas == 2
    print("4b. con el servicio apagado salta al siguiente y queda en pausa ✓")

    # 5) OpenCode: último respaldo, solo por su binario real.
    with tempfile.TemporaryDirectory() as d:
        envoltorio = Path(d) / "opencode.cmd"
        envoltorio.write_text("@echo off", encoding="utf-8")
        assert ejecutable_opencode(str(envoltorio)) is None, "un .cmd pasaría el texto del alumno por cmd.exe"
        exe = Path(d) / "node_modules" / "opencode-ai" / "bin" / "opencode.exe"
        exe.parent.mkdir(parents=True)
        exe.write_bytes(b"")
        assert ejecutable_opencode(str(envoltorio)) == str(exe)
    assert "opencode" not in [p.name for p in ajustes().resolved_providers]
    salida = "\x1b[0m\n> build · deepseek-v4.1-flash-free\n\x1b[0m\n> una cita\nhola"
    assert limpiar_salida(salida) == "> una cita\nhola", limpiar_salida(salida)
    oc = LLMProvider(name="opencode", kind="opencode_cli", base_url=sys.executable, api_key="cli", model="m")
    llm = MultiModelLLM(providers=[oc, GROQ])
    assert isinstance(llm._clients[0][1], OpenCodeCliClient)  # noqa: SLF001
    sano = ClienteSano()
    llm._clients[1] = (GROQ, sano)  # noqa: SLF001
    assert llm.chat_json("s", "u") == {"titulo": "de groq"} and sano.llamadas == 1
    assert llm._clients[0][1]._pausa_hasta > 0  # noqa: SLF001
    print("5. OpenCode: solo su .exe (nunca el .cmd), salida limpia y, si falla, salta y descansa ✓")

    print("\nTODO CORRECTO: DeepSeek primero, retirados fuera, OpenRouter solo gratis y OpenCode al final.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
