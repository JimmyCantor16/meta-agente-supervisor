"""Trabajador del PUENTE LOCAL: la terminal del equipo atiende la IA de PROD.

PROD (Render) no puede llamar a este PC. Así que este programa le pregunta a
PROD, con una espera larga, si hay trabajo; lo resuelve aquí con el motor que
toque y devuelve el resultado. Solo conexiones SALIENTES.

Motores:
  · claude   → Claude Code (`claude -p`), con la sesión ya iniciada de este PC.
               SIN herramientas (`--tools ""`), en una carpeta temporal vacía y
               con el prompt por STDIN: el texto de un usuario es DATO, nunca
               una orden que ejecutar aquí.
  · deepseek → el servicio `deepseek-web-chat` (127.0.0.1:6174), reutilizando el
               cliente del backend (stream SSE + borrado del chat al terminar).

Uso (desde la raíz del repo):
    python scripts/puente_local.py --url https://metaagente-backend.onrender.com

El token se lee de la variable PUENTE_TOKEN o del archivo
%LOCALAPPDATA%\\RenderDeploy\\secretos\\puente.txt (nunca de la línea de comandos,
para que no quede en el historial).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))

TIMEOUT_CLAUDE = 300
COLORES = {"claude": "\033[35m", "deepseek": "\033[36m", "ok": "\033[32m", "mal": "\033[31m", "fin": "\033[0m"}


def log(color: str, texto: str) -> None:
    print(f"{COLORES.get(color, '')}[{time.strftime('%H:%M:%S')}] {texto}{COLORES['fin']}", flush=True)


def leer_token() -> str:
    token = os.environ.get("PUENTE_TOKEN", "").strip()
    if token:
        return token
    archivo = Path(os.environ.get("LOCALAPPDATA", "")) / "RenderDeploy" / "secretos" / "puente.txt"
    if archivo.is_file():
        return archivo.read_text(encoding="utf-8").strip()
    sys.exit("Falta el token: define PUENTE_TOKEN o crea %LOCALAPPDATA%\\RenderDeploy\\secretos\\puente.txt")


# ----------------------------------------------------------------------------
# Motores
# ----------------------------------------------------------------------------
def binario_claude() -> str | None:
    # Se prefiere el .exe real: un .cmd pasaría por cmd.exe. Aun así, aquí los
    # argumentos son fijos y el texto del usuario va por STDIN, nunca por argv.
    for nombre in ("claude.exe", "claude"):
        ruta = shutil.which(nombre)
        if ruta:
            return ruta
    return None


REGISTRO_RAROS = RAIZ / "backend" / "data" / "puente_respuestas_raras.log"


def json_valido(texto: str) -> bool:
    """El mismo criterio tolerante que el servidor (fences y texto alrededor)."""
    limpio = texto.strip()
    if limpio.startswith("```"):
        limpio = limpio[3:].removeprefix("json").rsplit("```", 1)[0].strip()
    for candidato in (limpio, limpio[limpio.find("{"): limpio.rfind("}") + 1] if "{" in limpio else ""):
        for estricto in (True, False):
            try:
                return isinstance(json.loads(candidato, strict=estricto), dict)
            except ValueError:
                continue
    return False


def anotar_raro(encargo: dict, texto: str) -> None:
    try:
        REGISTRO_RAROS.parent.mkdir(parents=True, exist_ok=True)
        with REGISTRO_RAROS.open("a", encoding="utf-8") as f:
            f.write(f"--- {time.strftime('%H:%M:%S')} {encargo.get('id')} {encargo.get('tipo')}\n{texto[:1500]}\n")
    except OSError:
        pass


def motor_claude(encargo: dict, modelo: str) -> str:
    """Claude Code; si se pidió JSON y no lo devolvió, se le pide UNA corrección."""
    texto = _llamar_claude(encargo, modelo)
    if encargo.get("want_json") and not json_valido(texto):
        anotar_raro(encargo, texto)
        log("mal", f"  {encargo['id']}: Claude no devolvió JSON; le pido que lo corrija")
        correccion = dict(encargo)
        correccion["user"] = (
            (encargo.get("user") or "")
            + "\n\n### TU RESPUESTA ANTERIOR NO ERA JSON VÁLIDO\n"
            + texto[:4000]
            + "\n\nDevuelve AHORA solo el objeto JSON pedido: sin preguntas, sin explicaciones, "
            "sin markdown. Si te falta un dato, asume un valor razonable."
        )
        texto = _llamar_claude(correccion, modelo)
        if not json_valido(texto):
            anotar_raro(encargo, texto)
    return texto


def _llamar_claude(encargo: dict, modelo: str) -> str:
    binario = binario_claude()
    if not binario:
        raise RuntimeError("no encuentro el CLI «claude» en el PATH")
    system = encargo.get("system") or "Eres un ingeniero de software senior."
    if encargo.get("want_json"):
        system += (
            "\n\nRESPONDE ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después "
            "y sin bloques de código markdown."
        )
    with tempfile.TemporaryDirectory(prefix="puente-claude-") as vacia:
        archivo_system = Path(vacia) / "system.txt"
        archivo_system.write_text(system, encoding="utf-8")
        modelo_usado = "opus" if str(encargo.get("tipo", "")).startswith("experto") else modelo
        comando = [
            binario, "-p", "--output-format", "json", "--model", modelo_usado,
            "--tools", "", "--strict-mcp-config", "--no-session-persistence",
            "--system-prompt-file", str(archivo_system),
        ]
        r = subprocess.run(
            comando, cwd=vacia, input=encargo.get("user") or "", capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=TIMEOUT_CLAUDE,
        )
    try:
        sobre = json.loads(r.stdout or "{}")
    except ValueError:
        sobre = {}
    texto = str(sobre.get("result") or "").strip()
    if r.returncode != 0 or sobre.get("is_error") or not texto:
        detalle = texto or (r.stderr or r.stdout or "").strip()
        raise RuntimeError(f"claude código {r.returncode}: {detalle[:300]}")
    return texto


_DEEPSEEK = None


def motor_deepseek(encargo: dict, url: str) -> str:
    global _DEEPSEEK
    from src.infrastructure.adapters.deepseek_web_client import DeepSeekWebClient

    if _DEEPSEEK is None:
        _DEEPSEEK = DeepSeekWebClient(url, timeout=180.0)
    mensajes = []
    if encargo.get("system"):
        mensajes.append({"role": "system", "content": encargo["system"]})
    mensajes.append({"role": "user", "content": encargo.get("user") or ""})
    respuesta = _DEEPSEEK.chat.completions.create(
        model="deepseek-web", messages=mensajes,
        response_format={"type": "json_object"} if encargo.get("want_json") else None,
    )
    return respuesta.choices[0].message.content or ""


def deepseek_vivo(url: str) -> bool:
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/", timeout=3):
            return True
    except urllib.error.HTTPError:
        return True  # responde, aunque sea con un 404: el servicio está arriba
    except Exception:  # noqa: BLE001
        return False


# ----------------------------------------------------------------------------
# Bucle
# ----------------------------------------------------------------------------
class Trabajador:
    def __init__(self, base: str, token: str, motores: list[str], modelo: str, url_deepseek: str) -> None:
        self.base = base.rstrip("/") + "/api/v1/puente"
        self.token = token
        self.motores = motores
        self.modelo = modelo
        self.url_deepseek = url_deepseek
        self.pool = ThreadPoolExecutor(max_workers=4)
        self.hechos = 0
        self.lock = threading.Lock()

    def _peticion(self, metodo: str, ruta: str, cuerpo: dict | None = None, timeout: float = 40) -> tuple[int, dict | None]:
        datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
        req = urllib.request.Request(
            self.base + ruta, data=datos, method=metodo,
            headers={"X-Puente-Token": self.token, "Content-Type": "application/json",
                     "User-Agent": "metaagente-puente/1.0"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            texto = r.read().decode("utf-8")
            return r.status, (json.loads(texto) if texto.strip() and texto.strip() != "null" else None)

    def resolver(self, encargo: dict) -> None:
        motor = encargo["motor"]
        tipo = encargo.get("tipo", "chat")
        log(motor, f"▶ {encargo['id']} · {tipo} · {motor} · {len(encargo.get('user') or '')} caracteres")
        inicio = time.monotonic()
        contenido, error = "", ""
        try:
            if motor == "claude":
                contenido = motor_claude(encargo, self.modelo)
            else:
                contenido = motor_deepseek(encargo, self.url_deepseek)
        except Exception as exc:  # noqa: BLE001 — cualquier fallo vuelve a PROD como error
            error = f"{type(exc).__name__}: {exc}"[:500]
        segundos = time.monotonic() - inicio
        try:
            self._peticion("POST", f"/entregar/{encargo['id']}",
                           {"contenido": contenido, "error": error, "segundos": round(segundos, 1)})
        except Exception as exc:  # noqa: BLE001
            log("mal", f"No pude entregar {encargo['id']}: {exc}")
            return
        with self.lock:
            self.hechos += 1
        if error:
            log("mal", f"✗ {encargo['id']} en {segundos:.0f}s: {error[:160]}")
        else:
            log("ok", f"✓ {encargo['id']} en {segundos:.0f}s ({len(contenido)} caracteres) · total {self.hechos}")

    def correr(self) -> None:
        equipo = socket.gethostname()[:40]
        log("ok", f"Puente conectado a {self.base} · motores: {', '.join(self.motores)} · Ctrl+C para salir")
        fallos = 0
        while True:
            try:
                estado, encargo = self._peticion(
                    "GET", f"/tomar?motores={','.join(self.motores)}&equipo={urllib.request.quote(equipo)}"
                )
                fallos = 0
                if estado == 200 and encargo:
                    self.pool.submit(self.resolver, encargo)
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 404):
                    sys.exit(f"PROD rechazó el puente (HTTP {exc.code}): revisa PUENTE_TOKEN en Render y aquí.")
                fallos += 1
                log("mal", f"HTTP {exc.code} al pedir trabajo; reintento en {min(5 * fallos, 30)}s")
                time.sleep(min(5 * fallos, 30))
            except Exception as exc:  # noqa: BLE001 — red caída, servidor dormido…
                fallos += 1
                log("mal", f"Sin conexión con PROD ({exc}); reintento en {min(5 * fallos, 30)}s")
                time.sleep(min(5 * fallos, 30))


def main() -> None:
    # La consola de Windows (cp1252) revienta con ▶/✓: se fuerza UTF-8.
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            pass
    ap = argparse.ArgumentParser(description="Trabajador del puente local del Meta-Agente.")
    ap.add_argument("--url", default="https://metaagente-backend.onrender.com")
    ap.add_argument("--motores", default="auto", help="claude,deepseek o auto (los que estén disponibles)")
    ap.add_argument("--modelo", default="sonnet", help="Modelo de Claude Code para escribir código")
    ap.add_argument("--deepseek", default="http://127.0.0.1:6174")
    args = ap.parse_args()

    if args.motores == "auto":
        motores = []
        if binario_claude():
            motores.append("claude")
        if deepseek_vivo(args.deepseek):
            motores.append("deepseek")
        if not motores:
            sys.exit("No hay motores: ni «claude» en el PATH ni deepseek-web-chat en " + args.deepseek)
    else:
        motores = [m.strip() for m in args.motores.split(",") if m.strip()]
    Trabajador(args.url, leer_token(), motores, args.modelo, args.deepseek).correr()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nPuente cerrado.")
