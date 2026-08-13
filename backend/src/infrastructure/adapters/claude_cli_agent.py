"""Agente CLI local: Claude Code por subprocess, con la sesión YA logueada.

Es el patrón probado en ripor-extracccion (`reporte-app/backend/agents.py`),
transplantado y generalizado: usa las credenciales del `claude login` del
equipo — sin API key aparte — y por eso el coste va contra la suscripción
local (coste-cero facturable), no contra una bolsa de créditos.

Decisiones heredadas de ripor que aquí son ley:

· **Encoding explícito SIEMPRE.** En Windows, `text=True` sin `encoding`
  decodifica con la codepage local (cp1252) y las tildes salen como mojibake
  («Corrección» → «CorrecciÃ³n»). Todas las llamadas van con
  `encoding="utf-8", errors="replace"`.

· **`claude -p` puede salir con returncode 1 e IGUAL imprimir el JSON** con el
  detalle del error (`api_error_status`, `result`). Sin leerlo, una sobrecarga
  momentánea (529) abortaría un trabajo que un reintento habría salvado.

Seguridad (innegociable):

· JAMÁS se pasa `--dangerously-skip-permissions`.
· `allowed_tools` solo admite valores de una LISTA BLANCA fija (Read, Write,
  Edit, Glob, Grep — nada de Bash); cualquier otro valor es error, no se filtra
  en silencio.
· `cwd`, si viene, debe existir; el LLAMADOR es quien lo confina a
  `generated/<slug>` — aquí solo se comprueba que sea un directorio real.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from src.domain.ports import AgenteCliError, AgenteCliPort

logger = logging.getLogger(__name__)

# Errores del lado del servidor que NO son culpa del prompt: reintentar tiene
# sentido. 529 = "Overloaded" (el que aparece en la práctica), 429 = rate limit.
_HTTP_TRANSITORIOS = {429, 500, 502, 503, 504, 529}
_REINTENTOS = 4
_ESPERA_BASE = 8  # segundos; crece x2 en cada intento (8, 16, 32)

#: Lista BLANCA de herramientas que se pueden conceder al agente. Fija a
#: propósito: nunca se construye desde datos de la petición, y Bash NO está.
_HERRAMIENTAS_PERMITIDAS = ("Read", "Write", "Edit", "Glob", "Grep")

#: Llamada mínima real para `probar()`: barata, rápida y suficiente para saber
#: si la sesión responde (binario en PATH ≠ sesión viva; puede estar caducada).
_PROMPT_PRUEBA = 'Responde únicamente con este JSON, sin texto alrededor: {"ok":true}'
_TIMEOUT_PRUEBA = 60

_INSTALL_HINT = "npm install -g @anthropic-ai/claude-code"


class _FormaInvalida(Exception):
    """Interno: el CLI respondió, pero la salida no cumple el contrato pedido.

    No es un fallo del servidor (no aplica el backoff de sobrecarga): es el
    modelo respondiendo con la forma equivocada. Da derecho a UN reintento
    extra como máximo — otra muestra suele bastar, y más sería insistir.
    """


def _extraer_json(texto: str, clave_esperada: str | None = None) -> dict:
    """Extrae de la salida del agente el objeto JSON útil (versión generalizada).

    Tolerante a prosa, fences y a que el agente imprima logs u otros objetos
    JSON antes/después: recorre TODOS los objetos balanceados — contando llaves
    con conciencia de strings y escapes, porque una llave dentro de una nota no
    cuenta — y devuelve el primero que tenga `clave_esperada` (si ninguno la
    tiene, o no se pidió clave, devuelve el primer dict válido).

    Lanza ValueError si no hay ningún objeto JSON parseable.
    """
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", texto, re.S)
    candidatos: list[str] = []
    if m:
        candidatos.append(m.group(1))
    inicio = texto.find("{")
    while inicio != -1:
        profundidad = 0
        en_string = False  # llaves dentro de un string JSON (p.ej. una nota) no cuentan
        escape = False
        for i in range(inicio, len(texto)):
            c = texto[i]
            if en_string:
                if escape:
                    escape = False
                elif c == "\\":
                    escape = True
                elif c == '"':
                    en_string = False
                continue
            if c == '"':
                en_string = True
            elif c == "{":
                profundidad += 1
            elif c == "}":
                profundidad -= 1
                if profundidad == 0:
                    candidatos.append(texto[inicio : i + 1])
                    break
        inicio = texto.find("{", inicio + 1)

    parseados: list[Any] = []
    for fragmento in candidatos:
        # strict=False como segunda oportunidad: los modelos meten saltos de
        # línea LITERALES dentro de strings (código fuente sin escapar).
        for estricto in (True, False):
            try:
                parseados.append(json.loads(fragmento, strict=estricto))
                break
            except (json.JSONDecodeError, ValueError):
                continue

    if clave_esperada:
        for obj in parseados:
            if isinstance(obj, dict) and clave_esperada in obj:
                return obj
    for obj in parseados:
        if isinstance(obj, dict):
            return obj
    detalle = f" con la clave '{clave_esperada}'" if clave_esperada else ""
    raise ValueError(f"El agente no devolvió un objeto JSON válido{detalle}.")


def _json_o_none(texto: str) -> dict | None:
    """Parsea el sobre JSON del CLI. None si stdout no era JSON (ruido, vacío)."""
    try:
        d = json.loads(texto)
    except (json.JSONDecodeError, TypeError):
        return None
    return d if isinstance(d, dict) else None


class ClaudeCliAgent(AgenteCliPort):
    """Adaptador de `AgenteCliPort` sobre el binario `claude` (Claude Code CLI).

    Atributos públicos:
        ultimo_uso: dict con el coste/uso del ÚLTIMO sobre recibido
            (`total_cost_usd`, `usage`, `duracion_ms`), marcado con
            `origen="suscripcion"` y `coste_facturable_usd=0.0`: el CLI cobra
            contra la suscripción local, no contra una API key. Ripor descartaba
            estos campos; aquí se conservan porque el gasto —aunque sea cero
            facturable— se contabiliza.
    """

    def __init__(self, binario: str = "") -> None:
        """Args:
        binario: ruta o nombre del CLI (normalmente `settings.claude_cli_bin`).
            Vacío = se resuelve por la variable de entorno `CLAUDE_CLI_BIN` o,
            en su defecto, por el PATH (`shutil.which("claude")`).
        """
        self._bin_configurado = (binario or "").strip()
        self.ultimo_uso: dict = {}

    # ------------------------------------------------------------------
    # Detección
    # ------------------------------------------------------------------
    def _binario(self) -> str | None:
        """Resuelve el ejecutable. Un override configurado que no existe es
        error visible (None + warning), no un fallback silencioso al PATH:
        si alguien fijó una ruta, espera que se use ESA."""
        for candidato in (self._bin_configurado, os.environ.get("CLAUDE_CLI_BIN", "").strip()):
            if not candidato:
                continue
            resuelto = shutil.which(candidato)
            if resuelto:
                return resuelto
            if Path(candidato).is_file():
                return candidato
            logger.warning("CLAUDE_CLI_BIN/claude_cli_bin apunta a «%s» y no existe.", candidato)
            return None
        return shutil.which("claude")

    def disponible(self) -> bool:
        return self._binario() is not None

    def probar(self) -> str | None:
        """Llamada mínima REAL. None = sano; texto = descripción del fallo.

        Nunca lanza: es el chequeo que la UI muestra tal cual. Un solo intento
        y sin reintentos — probar debe tardar segundos, no minutos.
        """
        binario = self._binario()
        if not binario:
            return f"No encontré el CLI «claude». Instálalo con: {_INSTALL_HINT}"
        try:
            r = subprocess.run(
                [binario, "-p", "--output-format", "json"],
                input=_PROMPT_PRUEBA, capture_output=True, text=True,
                encoding="utf-8", errors="replace",
                timeout=_TIMEOUT_PRUEBA, env=os.environ.copy(),
            )
        except subprocess.TimeoutExpired:
            return f"No respondió en {_TIMEOUT_PRUEBA}s."
        except Exception as exc:  # noqa: BLE001 — probar() jamás debe lanzar
            return str(exc)[:300]

        salida = r.stdout or ""
        sobre = _json_o_none(salida)
        if r.returncode == 0 and sobre is not None and not sobre.get("is_error"):
            texto = str(sobre.get("result", "")).strip()
            if not texto:
                return "Respondió vacío."
            # Basta una respuesta coherente: el JSON exacto es lo ideal, pero
            # un "ok" ya prueba que la sesión funciona y el modelo contesta.
            if '"ok"' in texto or "ok" in texto.lower()[:80]:
                return None
            return f"Respuesta inesperada: {texto[:160]}"
        detalle = str(sobre.get("result") or "") if sobre else ""
        detalle = detalle or (r.stderr or salida or "El CLI falló sin dar detalle.").strip()
        return detalle[:300]

    # ------------------------------------------------------------------
    # Ejecución (modo json, de una pieza)
    # ------------------------------------------------------------------
    def ejecutar(
        self,
        system: str,
        user: str,
        validar: Callable | None = None,
        cwd: Path | None = None,
        timeout_s: int = 300,
        *,
        allowed_tools: list[str] | None = None,
        clave_esperada: str | None = None,
    ) -> Any:
        """Una llamada completa a Claude Code. Devuelve dict validado o str.

        `system` y `user` se concatenan en un solo prompt por STDIN (el CLI no
        tiene canal de system aparte en `-p`). Con `validar` o `clave_esperada`
        devuelve el dict extraído; sin ambos, el texto crudo del resultado.

        `validar` corre DENTRO del bucle de reintentos (misma filosofía que
        `MultiModelLLM`): si el JSON parsea pero no cumple el contrato, cuenta
        como fallo del modelo y se pide otra muestra (1 reintento extra máximo).

        OJO, y es a propósito: el RETORNO de `validar` se DESCARTA — es un
        chequeo, no un constructor. Lo que sale de aquí es el DICT, nunca la
        entidad; quien necesite una entidad la construye él con ese dict (así
        lo hace `revision_entregas._veredicto_desde`). Dar por hecho lo
        contrario dejó la revisión de entregas muerta al 100 % en agosto de
        2026: su `isinstance(resultado, VeredictoRevision)` no daba True jamás.
        """
        comando = self._comando("json", allowed_tools)
        dir_trabajo = self._resolver_cwd(cwd)
        prompt = self._prompt(system, user)

        ultimo = ""
        reintentos_forma = 1  # presupuesto propio de la forma inválida
        intento = 0
        while True:
            try:
                r = subprocess.run(
                    comando, input=prompt, capture_output=True, text=True,
                    encoding="utf-8", errors="replace",
                    timeout=timeout_s, env=os.environ.copy(), cwd=dir_trabajo,
                )
            except subprocess.TimeoutExpired as exc:
                raise AgenteCliError(f"Claude Code no respondió en {timeout_s}s.") from exc
            except OSError as exc:
                raise AgenteCliError(f"No pude ejecutar el CLI «claude»: {exc}") from exc

            salida = r.stdout or ""
            sobre = _json_o_none(salida)
            if r.returncode == 0 and sobre is not None and not sobre.get("is_error"):
                self._registrar_uso(sobre)
                try:
                    return self._dar_forma(str(sobre.get("result", salida)), validar, clave_esperada)
                except _FormaInvalida as exc:
                    ultimo = f"Salida con forma inválida: {exc}"
                    if reintentos_forma <= 0:
                        break
                    reintentos_forma -= 1
                    logger.warning("[claude-cli] %s; pido otra muestra.", ultimo)
                    continue  # sin backoff: no es sobrecarga, es otra muestra

            # returncode 0 sin sobre JSON: el CLI imprimió texto plano. Solo es
            # aceptable si quien llama no exigía forma (ni validar ni clave).
            if r.returncode == 0 and sobre is None and validar is None and clave_esperada is None:
                return salida

            ultimo = (r.stderr or salida or "claude error").strip()
            if not self._salida_transitoria(salida) or intento >= _REINTENTOS - 1:
                break
            espera = _ESPERA_BASE * (2**intento)
            logger.warning(
                "[claude-cli] Sobrecarga; reintento %d/%d en %ds.",
                intento + 1, _REINTENTOS - 1, espera,
            )
            time.sleep(espera)
            intento += 1

        raise AgenteCliError(self._detalle_legible(ultimo))

    # ------------------------------------------------------------------
    # Ejecución (modo stream, evento a evento)
    # ------------------------------------------------------------------
    def ejecutar_stream(
        self,
        system: str,
        user: str,
        al_evento: Callable[[dict], None],
        validar: Callable | None = None,
        cwd: Path | None = None,
        timeout_s: int = 600,
        *,
        allowed_tools: list[str] | None = None,
        clave_esperada: str | None = None,
    ) -> Any:
        """Como `ejecutar`, pero emitiendo cada evento del CLI según llega.

        Usa `--output-format stream-json --verbose`: cada línea de stdout es un
        evento JSON, y por cada uno se llama `al_evento(evento)` — pensado para
        que el integrador lo enchufe al WebSocket de progreso. El sobre final
        (`type == "result"`) trae `result`/`usage` igual que el modo json y de
        ahí sale el valor devuelto.

        Si el callback lanza, se registra y se sigue: el progreso es cosmético,
        el trabajo no se aborta por él. En un reintento por sobrecarga se emite
        un evento sintético `{"type": "reintento", ...}` para que la UI lo diga.
        """
        comando = self._comando("stream-json", allowed_tools)
        dir_trabajo = self._resolver_cwd(cwd)
        prompt = self._prompt(system, user)

        ultimo = ""
        reintentos_forma = 1
        intento = 0
        while True:
            sobre, crudo, caduco = self._correr_stream(comando, prompt, dir_trabajo, timeout_s, al_evento)
            if caduco:
                raise AgenteCliError(f"Claude Code no respondió en {timeout_s}s (proceso matado).")

            if sobre is not None and not sobre.get("is_error"):
                self._registrar_uso(sobre)
                try:
                    return self._dar_forma(str(sobre.get("result", "")), validar, clave_esperada)
                except _FormaInvalida as exc:
                    ultimo = f"Salida con forma inválida: {exc}"
                    if reintentos_forma <= 0:
                        break
                    reintentos_forma -= 1
                    logger.warning("[claude-cli] %s; pido otra muestra.", ultimo)
                    continue

            ultimo = crudo or "claude error"
            transitorio = sobre is not None and self._sobre_transitorio(sobre)
            if not transitorio or intento >= _REINTENTOS - 1:
                break
            espera = _ESPERA_BASE * (2**intento)
            self._avisar(al_evento, {
                "type": "reintento",
                "intento": intento + 1,
                "de": _REINTENTOS - 1,
                "espera_s": espera,
                "motivo": "sobrecarga del servidor",
            })
            logger.warning(
                "[claude-cli] Sobrecarga en stream; reintento %d/%d en %ds.",
                intento + 1, _REINTENTOS - 1, espera,
            )
            time.sleep(espera)
            intento += 1

        raise AgenteCliError(self._detalle_legible(ultimo))

    def _correr_stream(
        self,
        comando: list[str],
        prompt: str,
        dir_trabajo: str | None,
        timeout_s: int,
        al_evento: Callable[[dict], None],
    ) -> tuple[dict | None, str, bool]:
        """Un pase del proceso en streaming: (sobre final, detalle crudo, ¿caducó?).

        El timeout es GLOBAL y con verdugo: `readline` puede bloquearse para
        siempre si el CLI enmudece, así que un `threading.Timer` mata el proceso
        al vencer el plazo — y eso desbloquea la lectura.
        """
        try:
            proc = subprocess.Popen(
                comando,
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding="utf-8", errors="replace",
                env=os.environ.copy(), cwd=dir_trabajo,
            )
        except OSError as exc:
            raise AgenteCliError(f"No pude ejecutar el CLI «claude»: {exc}") from exc

        caduco = threading.Event()

        def _matar() -> None:
            caduco.set()
            proc.kill()

        verdugo = threading.Timer(timeout_s, _matar)
        verdugo.daemon = True
        verdugo.start()

        # stdin y stderr en hilos aparte: si el prompt es grande y el hijo ya
        # está escribiendo, alimentarlo desde este mismo hilo se interbloquea
        # (los dos esperando a que el otro drene su tubería).
        def _alimentar() -> None:
            try:
                assert proc.stdin is not None
                proc.stdin.write(prompt)
                proc.stdin.close()
            except OSError:
                pass  # murió antes de leer el prompt; el sobre/returncode lo contará

        trozos_err: list[str] = []

        def _drenar_stderr() -> None:
            try:
                assert proc.stderr is not None
                trozos_err.append(proc.stderr.read())
            except OSError:
                pass

        for objetivo in (_alimentar, _drenar_stderr):
            hilo = threading.Thread(target=objetivo, daemon=True)
            hilo.start()

        sobre: dict | None = None
        residuo = ""  # última línea no-evento, por si el detalle del error viene ahí
        try:
            assert proc.stdout is not None
            for linea in proc.stdout:
                linea = linea.strip()
                if not linea:
                    continue
                evento = _json_o_none(linea)
                if evento is None:
                    residuo = linea[:400]
                    continue  # ruido en stdout (logs), no un evento
                self._avisar(al_evento, evento)
                if evento.get("type") == "result":
                    sobre = evento
            proc.wait()
        finally:
            verdugo.cancel()
            if proc.poll() is None:
                proc.kill()
                proc.wait()

        detalle = ""
        if sobre is not None:
            detalle = str(sobre.get("result") or "")
        detalle = detalle or "".join(trozos_err).strip() or residuo or "claude error"
        return sobre, detalle.strip()[:400], caduco.is_set()

    # ------------------------------------------------------------------
    # Piezas comunes
    # ------------------------------------------------------------------
    def _comando(self, formato: str, allowed_tools: list[str] | None) -> list[str]:
        """Arma el comando base. La lista blanca se aplica AQUÍ y con error
        visible: pedir Bash (o cualquier cosa fuera de ella) no se filtra en
        silencio — es un bug del llamador y debe estallar como tal."""
        binario = self._binario()
        if not binario:
            raise AgenteCliError(
                f"No encontré el CLI «claude». Instálalo con: {_INSTALL_HINT}"
            )
        comando = [binario, "-p", "--output-format", formato]
        if formato == "stream-json":
            comando.append("--verbose")  # sin esto, el CLI no emite los eventos
        if allowed_tools:
            fuera = [h for h in allowed_tools if h not in _HERRAMIENTAS_PERMITIDAS]
            if fuera:
                raise AgenteCliError(
                    "Herramientas fuera de la lista blanca "
                    f"({', '.join(_HERRAMIENTAS_PERMITIDAS)}): {fuera}"
                )
            comando += ["--allowedTools", ",".join(allowed_tools)]
        return comando

    @staticmethod
    def _prompt(system: str, user: str) -> str:
        """El CLI en `-p` no separa system/user: van concatenados por STDIN."""
        system = (system or "").strip()
        user = (user or "").strip()
        return f"{system}\n\n{user}" if system and user else (system or user)

    @staticmethod
    def _resolver_cwd(cwd: Path | None) -> str | None:
        """Comprueba que el directorio exista. El LLAMADOR es quien lo confina
        a `generated/<slug>`; aquí solo se evita el error críptico de subprocess
        con un cwd inexistente."""
        if cwd is None:
            return None
        ruta = Path(cwd)
        if not ruta.is_dir():
            raise AgenteCliError(f"El directorio de trabajo no existe: {ruta}")
        return str(ruta)

    @staticmethod
    def _dar_forma(
        texto: str,
        validar: Callable | None,
        clave_esperada: str | None,
    ) -> Any:
        """Aplica el contrato pedido al texto útil del sobre.

        Sin `validar` ni `clave_esperada` devuelve el texto tal cual. Con
        cualquiera de los dos, extrae el JSON y —si hay validador— lo somete a
        él. Cualquier incumplimiento se lanza como `_FormaInvalida` para que el
        bucle de reintentos pida otra muestra. El retorno de `validar` se
        descarta (es un chequeo de contrato, igual que en `MultiModelLLM`).
        """
        if validar is None and clave_esperada is None:
            return texto
        try:
            datos = _extraer_json(texto, clave_esperada)
        except ValueError as exc:
            raise _FormaInvalida(str(exc)) from exc
        if validar is not None:
            try:
                validar(datos)
            except Exception as exc:  # noqa: BLE001 — el validador es código ajeno
                raise _FormaInvalida(f"{type(exc).__name__}: {str(exc)[:200]}") from exc
        return datos

    @staticmethod
    def _sobre_transitorio(sobre: dict) -> bool:
        """¿El sobre describe un fallo pasajero del servidor (reintentable)?"""
        if sobre.get("api_error_status") in _HTTP_TRANSITORIOS:
            return True
        return bool(re.search(r"overloaded|rate.?limit|try again", str(sobre.get("result", "")), re.I))

    @classmethod
    def _salida_transitoria(cls, salida: str) -> bool:
        """Como `_sobre_transitorio`, pero desde el stdout crudo del modo json.

        `claude -p` sale con returncode 1 pero IGUAL imprime un JSON con el
        detalle; ahí viene `api_error_status` (p.ej. 529). Sin distinguirlos,
        un trabajo desatendido abortaba por una sobrecarga momentánea.
        """
        sobre = _json_o_none(salida)
        return sobre is not None and cls._sobre_transitorio(sobre)

    def _registrar_uso(self, sobre: dict) -> None:
        """Guarda coste/uso del sobre final. `origen="suscripcion"`: el CLI
        cobra contra la sesión local logueada, así que el coste facturable para
        nosotros es cero — pero el dato se conserva para contabilizarlo."""
        try:
            coste = float(sobre.get("total_cost_usd") or 0.0)
        except (TypeError, ValueError):
            coste = 0.0
        self.ultimo_uso = {
            "total_cost_usd": coste,
            "usage": sobre.get("usage") or {},
            "duracion_ms": sobre.get("duration_ms"),
            "origen": "suscripcion",
            "coste_facturable_usd": 0.0,
        }

    @staticmethod
    def _avisar(al_evento: Callable[[dict], None], evento: dict) -> None:
        """Entrega un evento al callback sin dejar que su fallo tumbe el trabajo."""
        try:
            al_evento(evento)
        except Exception:  # noqa: BLE001 — el callback es código ajeno (WS, UI)
            logger.warning("El callback de progreso falló; se sigue sin él.", exc_info=True)

    @staticmethod
    def _detalle_legible(ultimo: str) -> str:
        """Mensaje para el error final: si el JSON traía `result`, ese texto
        explica mejor que el volcado del sobre entero."""
        try:
            detalle = json.loads(ultimo).get("result") or ultimo
        except (json.JSONDecodeError, AttributeError, TypeError):
            detalle = ultimo
        return str(detalle).strip()[:400] or "Claude Code falló sin dar detalle."
