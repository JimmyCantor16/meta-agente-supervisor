"""Cliente del servicio local `deepseek-web-chat` (la segunda terminal).

`deepseek-web-chat` habla con chat.deepseek.com usando la sesión web de la
máquina (bearer capturado con Playwright + POW anti-bot), así que DeepSeek
responde sin API key y sin coste. Se usa su `POST /api/deepseek/stream` (SSE),
el mismo camino que su propia interfaz, y `/api/deepseek/delete`.

**No `/api/deepseek/chat`** (el no-stream): su parser (`deepseekSse.js`, «para
tests») no entiende el formato de fragments actual y devuelve `content: ""`
con `status: FINISHED` — DeepSeek respondió y la respuesta se pierde. Comprobado
el 27-oct-2026. El parser que ese repo mantiene es el del stream.

Imita lo justo del SDK de OpenAI (`client.chat.completions.create(...)` y la
forma de la respuesta) para que `MultiModelLLM` lo trate como un proveedor más:
mismo fallback, mismo throttling, misma validación del contrato. Cualquier
fallo sale como `DeepSeekWebError`, que el bucle cuenta como "este proveedor no
sirve, prueba el siguiente".

Tres cosas que exige ese servicio y que se resuelven aquí:

1. **No tiene rol de sistema** (el servicio NO inyecta prompts, a propósito):
   el system y el user viajan en un único prompt con secciones marcadas.
2. **Recorta el prompt a 50.000 caracteres** sin avisar: por encima, la
   petición se rechaza aquí, antes de mandarla mutilada.
3. **Cada llamada abre un chat nuevo en la cuenta del usuario**: se borra al
   terminar (en segundo plano), o su historial en chat.deepseek.com se llenaría
   con cientos de conversaciones del agente.

Si el servicio no está arrancado o la sesión caducó, el proveedor queda en
pausa un par de minutos: sin eso, cada petición pagaría el intento (y, sin
sesión, `deepseek-web-chat` abre un Chromium headless para refrescarla).
"""

from __future__ import annotations

import json
import logging
import threading
import time
from types import SimpleNamespace

import httpx

logger = logging.getLogger(__name__)

#: Lo que `/api/deepseek/stream` deja pasar antes de recortar.
MAX_PROMPT_CHARS = 50_000
#: Tras un fallo de conexión o de sesión, cuánto se deja descansar.
PAUSA_TRAS_FALLO_SEG = 120.0
#: En Windows, conectar a un puerto cerrado no da «rechazado» al instante:
#: reintenta el SYN durante segundos. Con el servicio apagado, cada petición
#: los pagaría antes de pasar al siguiente proveedor. Es esta máquina: 2 s
#: sobran. (Por lo mismo la URL por defecto es 127.0.0.1 y no `localhost`,
#: que prueba antes `::1` y paga el intento dos veces.)
CONEXION_SEG = 2.0

_INSTRUCCION_JSON = (
    "FORMATO OBLIGATORIO: responde ÚNICAMENTE con un objeto JSON válido. "
    "Sin texto antes ni después y sin bloques ``` de markdown."
)


class DeepSeekWebError(Exception):
    """El servicio local no pudo responder (apagado, sin sesión, error)."""


class DeepSeekWebClient:
    """Cliente con la forma mínima del SDK de OpenAI que usa `MultiModelLLM`."""

    def __init__(self, base_url: str, timeout: float) -> None:
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        self._pausa_hasta = 0.0
        self._lock = threading.Lock()
        # Un solo cliente HTTP para toda la vida del proveedor: crear uno carga
        # los certificados del sistema, y en Windows eso son varios segundos
        # que `httpx.post(...)` pagaría en CADA petición.
        self._http: httpx.Client | None = None
        # `client.chat.completions.create(...)`, como el SDK de OpenAI.
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    # ------------------------------------------------------------------
    def _create(self, model: str, messages: list[dict], temperature: float = 0.2,
                response_format: dict | None = None, **_: object) -> SimpleNamespace:
        with self._lock:
            restante = self._pausa_hasta - time.monotonic()
        if restante > 0:
            raise DeepSeekWebError(f"en pausa {restante:.0f}s tras un fallo reciente")

        prompt = componer_prompt(messages, want_json=bool(response_format))
        if len(prompt) > MAX_PROMPT_CHARS:
            raise DeepSeekWebError(
                f"no cabe: {len(prompt)} caracteres (máx. {MAX_PROMPT_CHARS})"
            )

        inicio = time.monotonic()
        try:
            contenido, sesion, estado = self._leer_stream(prompt, inicio)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            # Va ANTES que `TimeoutException`: un ConnectTimeout también lo es,
            # y sin la pausa cada petición volvería a pagar la espera.
            self._pausar()
            raise DeepSeekWebError(
                f"no se pudo conectar con {self._base} (¿está corriendo deepseek-web-chat?)"
            ) from exc
        except httpx.TimeoutException as exc:
            raise DeepSeekWebError(f"sin respuesta en {self._timeout:.0f}s") from exc
        except httpx.HTTPError as exc:
            raise DeepSeekWebError(f"fallo HTTP: {exc}") from exc

        if sesion:
            threading.Thread(target=self._borrar_chat, args=(sesion,), daemon=True).start()
        if not contenido.strip():
            raise DeepSeekWebError(f"respuesta vacía (estado {estado or 'desconocido'})")

        return SimpleNamespace(
            choices=[SimpleNamespace(
                message=SimpleNamespace(content=contenido),
                # DeepSeek corta con estado INCOMPLETE si llega a su tope de
                # salida: se avisa como "length", igual que la API de OpenAI.
                finish_reason="length" if estado == "INCOMPLETE" else "stop",
            )],
            # La web no informa de tokens: se estima para el throttling.
            usage=SimpleNamespace(total_tokens=(len(prompt) + len(contenido)) // 4),
        )

    def _leer_stream(self, prompt: str, inicio: float) -> tuple[str, str | None, str | None]:
        """Lee el SSE de `/api/deepseek/stream` y devuelve (texto, chat, estado).

        Eventos que importan: `session` (id del chat abierto), `content` (un
        trozo de respuesta; con `replace` sustituye lo acumulado), `status`,
        `done` y `error`. El resto (progreso del POW, título…) se ignora.
        """
        partes: list[str] = []
        sesion: str | None = None
        estado: str | None = None
        evento = "message"
        with self._cliente().stream(
            "POST",
            f"{self._base}/api/deepseek/stream",
            json={"prompt": prompt, "thinking": False, "search": False},
        ) as r:
            if r.status_code != 200:
                r.read()
                self._fallo_del_servicio(r.text or f"HTTP {r.status_code}")
            for linea in r.iter_lines():
                if time.monotonic() - inicio > self._timeout:
                    raise DeepSeekWebError(f"sin terminar en {self._timeout:.0f}s")
                if linea.startswith("event:"):
                    evento = linea[6:].strip()
                    continue
                if not linea.startswith("data:"):
                    continue
                try:
                    datos = json.loads(linea[5:].strip())
                except ValueError:
                    continue
                if evento == "content":
                    trozo = str(datos.get("delta") or "")
                    if datos.get("replace"):
                        partes = [trozo]
                    else:
                        partes.append(trozo)
                elif evento == "session":
                    sesion = datos.get("chat_session_id") or sesion
                elif evento == "status":
                    estado = str(datos.get("value") or "") or estado
                elif evento == "done":
                    sesion = datos.get("chat_session_id") or sesion
                    estado = datos.get("status") or estado
                elif evento == "error":
                    if sesion:
                        threading.Thread(target=self._borrar_chat, args=(sesion,), daemon=True).start()
                    self._fallo_del_servicio(str(datos.get("error") or "error sin detalle"))
        return "".join(partes), sesion, estado

    def _fallo_del_servicio(self, error: str) -> None:
        error = error[:200]
        # Sin sesión no hay nada que hacer hasta que alguien inicie sesión en
        # la ventana de deepseek-web-chat: se pausa en vez de insistir.
        if any(m in error.lower() for m in ("bearer", "login", "sesion", "401", "403", "40003")):
            self._pausar()
        raise DeepSeekWebError(error)

    def _cliente(self) -> httpx.Client:
        with self._lock:
            if self._http is None:
                self._http = httpx.Client(timeout=httpx.Timeout(self._timeout, connect=CONEXION_SEG))
            return self._http

    def _pausar(self) -> None:
        with self._lock:
            self._pausa_hasta = time.monotonic() + PAUSA_TRAS_FALLO_SEG

    def _borrar_chat(self, sesion: str) -> None:
        """Quita de la cuenta el chat que abrió esta llamada. Best-effort."""
        try:
            self._cliente().post(
                f"{self._base}/api/deepseek/delete",
                json={"chat_session_id": sesion},
                timeout=20.0,
            )
        except httpx.HTTPError:
            logger.debug("No se pudo borrar el chat %s de DeepSeek.", sesion)


def componer_prompt(messages: list[dict], want_json: bool) -> str:
    """Une system + user en un solo prompt (la web no tiene rol de sistema)."""
    partes: list[str] = []
    for m in messages:
        contenido = str(m.get("content") or "").strip()
        if not contenido:
            continue
        titulo = "INSTRUCCIONES" if m.get("role") == "system" else "PETICIÓN"
        partes.append(f"### {titulo}\n{contenido}")
    if want_json:
        partes.append(_INSTRUCCION_JSON)
    return "\n\n".join(partes)


def estado_servicio(base_url: str, timeout: float = 25.0) -> dict:
    """¿Está arrancado deepseek-web-chat y con sesión? Para diagnóstico.

    Devuelve `{arrancado, sesion, email, error}`. `status` puede tardar unos
    segundos: si el bearer expiró, el servicio lo refresca antes de contestar.
    """
    base = base_url.rstrip("/")
    try:
        httpx.get(f"{base}/api/health", timeout=httpx.Timeout(3.0, connect=CONEXION_SEG)).raise_for_status()
    except httpx.HTTPError as exc:
        return {"arrancado": False, "sesion": False, "email": None, "error": str(exc)[:200]}
    try:
        datos = httpx.get(f"{base}/api/deepseek/status", timeout=timeout).json()
    except (httpx.HTTPError, ValueError) as exc:
        return {"arrancado": True, "sesion": False, "email": None, "error": str(exc)[:200]}
    return {
        "arrancado": True,
        "sesion": bool(datos.get("loggedIn")),
        "email": datos.get("email"),
        "error": datos.get("error"),
    }
