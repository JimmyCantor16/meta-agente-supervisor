"""Cliente LLM multi-modelo con FALLBACK automático.

Prueba una cadena de proveedores gratuitos EN ORDEN. Si uno da rate-limit, se
queda sin cupo o falla, salta automáticamente al siguiente, hasta que uno
responde o se agotan todos. Así se "suman" los cupos gratis de varios modelos
(Groq, Gemini, OpenRouter…) y se completa la tarea sin pagar.

Incluye un control de ritmo (throttling) por proveedor para respetar los límites
de tokens por minuto de los planes gratuitos.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Callable

from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    OpenAI,
    RateLimitError,
)

from src.config import LLMProvider, get_settings

logger = logging.getLogger(__name__)

# Presupuesto de tokens/minuto por proveedor (margen bajo el límite gratis típico).
_TPM_BUDGET = 10_000


class LLMError(Exception):
    """Fallo genérico tras agotar TODOS los proveedores de la cadena."""


class MultiModelLLM:
    """Cliente que llama a una cadena de proveedores con fallback y throttling."""

    # Consumo por cuota: (momento, tokens). Varios modelos de la misma cuenta
    # comparten entrada (`quota_key`). Es a NIVEL DE CLASE a propósito: cada
    # adaptador crea su propia instancia y, con un libro por instancia, el
    # throttling no veía el gasto de las demás y se reventaba la cuota gratis.
    _usage: dict[str, list[tuple[float, int]]] = {}
    _usage_lock = threading.Lock()

    def __init__(
        self,
        providers: list[LLMProvider] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        role: str | None = None,
    ) -> None:
        """Prepara la cadena de proveedores para un rol concreto.

        Args:
            role: "prompt" (analizar/enseñar) o "code" (escribir código). Los
                proveedores que no atienden ese rol se descartan aquí mismo, de
                modo que cada agente solo habla con modelos aptos para su tarea.
        """
        settings = get_settings()
        providers = providers or settings.resolved_providers
        timeout = timeout if timeout is not None else settings.request_timeout
        max_retries = max_retries if max_retries is not None else settings.max_retries

        self._role = role
        candidates = [p for p in providers if p.serves(role)]
        if not candidates:
            # Mejor usar la cadena completa que quedarse sin ningún proveedor.
            logger.warning("Ningún proveedor declara el rol '%s'; se usan todos.", role)
            candidates = list(providers)

        # Los proveedores con bolsa de créditos finita van al final: son el
        # último recurso, porque lo que se gasta ahí no vuelve.
        candidates.sort(key=lambda p: p.exhaustible)

        # Un cliente OpenAI por proveedor (mismo SDK, distinta base_url/key).
        self._clients: list[tuple[LLMProvider, OpenAI]] = [
            (
                p,
                OpenAI(api_key=p.api_key, base_url=p.base_url, timeout=timeout, max_retries=max_retries),
            )
            for p in candidates
        ]
        logger.info(
            "MultiModelLLM [rol=%s] con %d proveedor(es): %s",
            role or "todos", len(candidates), [p.name for p in candidates],
        )

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------
    def chat_json(
        self,
        system: str,
        user: str,
        temperature: float = 0.2,
        validar: Callable[[dict], object] | None = None,
    ) -> dict:
        """Devuelve la respuesta parseada como dict (modo JSON).

        Args:
            validar: comprobación del CONTRATO de la respuesta, que se ejecuta
                dentro del bucle de fallback. Recibe el dict y debe lanzar una
                excepción si no cumple (encaja tal cual `MiModelo.model_validate`).

                Sin esto, el bucle aceptaba cualquier JSON *parseable* aunque
                tuviera la forma equivocada, y el fallo estallaba después, ya
                fuera del bucle: los proveedores restantes no se probaban y la
                petición entera moría. Es el modo de fallo típico de los modelos
                gratuitos —JSON impecable, forma inventada— y se lo comía el
                usuario en forma de 502.
        """
        raw = self._chat(system, user, temperature, want_json=True, validar=validar)
        return self._parse_json(raw)

    def chat_text(self, system: str, user: str, temperature: float = 0.2) -> str:
        """Devuelve la respuesta como texto plano."""
        return self._chat(system, user, temperature, want_json=False)

    # ------------------------------------------------------------------
    # Núcleo: fallback entre proveedores
    # ------------------------------------------------------------------
    def _chat(
        self,
        system: str,
        user: str,
        temperature: float,
        want_json: bool,
        validar: Callable[[dict], object] | None = None,
    ) -> str:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        response_format = {"type": "json_object"} if want_json else None
        errors: list[str] = []
        estimated = self._estimate_tokens(system, user)

        # Proveedores que servirían pero están en su tope de tokens/minuto. Se
        # dejan para el final: es mejor probar otro proveedor libre que dormir.
        throttled: list[tuple[float, LLMProvider, OpenAI]] = []

        for provider, client in self._clients:
            # 1) ¿Cabe la petición? Si sabemos que no, ni la mandamos: sería un
            #    413 seguro y un viaje de ida y vuelta desperdiciado.
            if provider.max_context is not None and estimated > provider.max_context:
                logger.debug(
                    "Salta '%s': la petición (~%d tok) supera su ventana (%d tok).",
                    provider.name, estimated, provider.max_context,
                )
                errors.append(f"{provider.name}: no cabe (~{estimated} > {provider.max_context})")
                continue

            # 2) ¿Está saturado? Lo aparcamos y seguimos con el siguiente.
            wait = self._throttle_wait(provider, estimated)
            if wait > 0:
                logger.debug("Aparca '%s': saturado (%.0fs). Probando otro...", provider.name, wait)
                throttled.append((wait, provider, client))
                continue

            content = self._try_provider(
                provider, client, messages, temperature, response_format, errors, want_json, validar
            )
            if content is not None:
                return content

        # Todos los proveedores que caben estaban saturados: ahora sí toca
        # esperar, empezando por el que antes se libera.
        throttled.sort(key=lambda item: item[0])
        for wait, provider, client in throttled:
            logger.info(
                "Todos los proveedores saturados; esperando %.0fs por '%s'.", wait, provider.name
            )
            time.sleep(min(wait, 61))
            content = self._try_provider(
                provider, client, messages, temperature, response_format, errors, want_json, validar
            )
            if content is not None:
                return content

        # Se agotaron todos los proveedores.
        raise LLMError("Todos los proveedores de IA fallaron. Detalle: " + " | ".join(errors))

    def _try_provider(
        self,
        provider: LLMProvider,
        client: OpenAI,
        messages: list[dict],
        temperature: float,
        response_format: dict | None,
        errors: list[str],
        want_json: bool = False,
        validar: Callable[[dict], object] | None = None,
    ) -> str | None:
        """Intenta una llamada. Devuelve el contenido, o None si hay que seguir.

        La respuesta se VALIDA aquí, dentro del bucle de fallback: si viene
        cortada, su JSON no se puede parsear o NO CUMPLE EL CONTRATO que espera
        quien llama, se descarta y el siguiente proveedor tiene su oportunidad.
        Validar fuera del bucle hacía que una respuesta mala de un proveedor
        tumbara toda la tarea.
        """
        try:
            response = client.chat.completions.create(
                model=provider.model,
                messages=messages,  # type: ignore[arg-type]
                temperature=temperature,
                response_format=response_format,  # type: ignore[arg-type]
            )
        except (RateLimitError, APITimeoutError, APIConnectionError, APIError) as exc:
            # Este proveedor no pudo: registramos y probamos el siguiente.
            logger.warning("Proveedor '%s' falló (%s). Probando el siguiente...", provider.name, exc)
            errors.append(f"{provider.name}: {exc}")
            return None

        if not response.choices or not response.choices[0].message.content:
            logger.warning("Proveedor '%s' devolvió respuesta vacía. Siguiente...", provider.name)
            errors.append(f"{provider.name}: respuesta vacía")
            return None

        choice = response.choices[0]

        # Respuesta cortada por el límite de salida: el JSON queda a medias y
        # sería imposible de parsear. Mejor probar con otro proveedor.
        if choice.finish_reason == "length":
            logger.warning(
                "Proveedor '%s' cortó la respuesta (límite de salida). Siguiente...", provider.name
            )
            errors.append(f"{provider.name}: respuesta truncada")
            return None

        # Se valida el JSON aquí para que un formato roto no tumbe la tarea:
        # cuenta como fallo de ESTE proveedor y se prueba el siguiente.
        if want_json:
            try:
                datos = self._parse_json(choice.message.content)
            except LLMError as exc:
                logger.warning("Proveedor '%s' devolvió JSON inválido (%s). Siguiente...",
                               provider.name, exc)
                errors.append(f"{provider.name}: JSON inválido")
                return None

            # Y aquí el CONTRATO: un JSON perfecto con la forma equivocada es
            # tan inútil como uno roto. Se captura `Exception` a propósito —
            # el validador es código de quien llama y puede lanzar lo que sea;
            # en un bucle de fallback, cualquier fallo suyo significa "este
            # proveedor no sirve, prueba el siguiente", nunca tumbar la tarea.
            if validar is not None:
                try:
                    validar(datos)
                except Exception as exc:  # noqa: BLE001
                    motivo = str(exc).replace("\n", " ")[:200]
                    logger.warning(
                        "Proveedor '%s' no cumple el contrato (%s: %s). Siguiente...",
                        provider.name, type(exc).__name__, motivo,
                    )
                    errors.append(f"{provider.name}: no cumple el contrato ({motivo})")
                    return None

        # Se contabiliza siempre: aunque el proveedor no informe del consumo,
        # la petición cuenta para su límite de peticiones/minuto.
        consumed = response.usage.total_tokens if response.usage is not None else 0
        self._record(provider.quota_key, consumed)
        logger.info("OK con '%s' [rol=%s] (tokens: %s).", provider.name, self._role or "todos", consumed)

        return response.choices[0].message.content

    @staticmethod
    def _estimate_tokens(system: str, user: str) -> int:
        """Estima los tokens de la petición (~4 caracteres por token).

        Es una aproximación deliberadamente conservadora: solo se usa para
        decidir a quién NO preguntar, así que pasarse un poco es preferible a
        quedarse corto y comerse un 413.
        """
        return (len(system) + len(user)) // 4 + 200

    # ------------------------------------------------------------------
    # Throttling por proveedor (tokens/minuto)
    # ------------------------------------------------------------------
    def _throttle_wait(self, provider: LLMProvider, anticipated: int) -> float:
        """Segundos a esperar para no pasarse de los límites del proveedor.

        Vigila DOS cuotas, porque los proveedores gratuitos limitan por ambas:
        tokens/minuto (Groq 70B: 6.000) y peticiones/minuto (GitHub: 15).

        Devuelve 0 si se puede llamar ya. NO duerme: quien decide es `_chat`,
        que prefiere cambiar de proveedor antes que esperar.
        """
        now = time.monotonic()
        key = provider.quota_key
        # El candado cubre SOLO la poda y la escritura del libro compartido;
        # los cálculos siguen sobre la copia local, sin retener el lock.
        with MultiModelLLM._usage_lock:
            log = [(t, k) for (t, k) in MultiModelLLM._usage.get(key, []) if now - t < 60]
            MultiModelLLM._usage[key] = log
        if not log:
            return 0.0

        oldest = min(t for t, _ in log)
        # Espera hasta que la llamada más antigua salga de la ventana de 60s.
        wait = max(0.0, 60 - (now - oldest) + 1)

        # ¿Se pasaría del presupuesto de tokens por minuto?
        budget = provider.max_tpm or _TPM_BUDGET
        if sum(k for _, k in log) + anticipated > budget:
            return wait

        # ¿Y del de peticiones por minuto?
        if provider.max_rpm is not None and len(log) >= provider.max_rpm:
            return wait

        return 0.0

    def _record(self, quota_key: str, tokens: int) -> None:
        with MultiModelLLM._usage_lock:
            MultiModelLLM._usage.setdefault(quota_key, []).append((time.monotonic(), tokens))

    # ------------------------------------------------------------------
    @classmethod
    def _parse_json(cls, text: str) -> dict:
        """Parseo TOLERANTE del JSON devuelto por el modelo.

        Algunos modelos ensucian la salida (fences de markdown, o texto suelto
        antes/después del objeto, p. ej. `We{"ok": true}`). Aquí:
          1. Quitamos fences ```json ... ```
          2. Intentamos parsear directo.
          3. Si falla, extraemos el objeto entre el primer '{' y el último '}'.
        """
        cleaned = text.strip()

        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
            if cleaned[:4].lower() == "json":
                cleaned = cleaned[4:]
            cleaned = cleaned.rsplit("```", 1)[0]
            cleaned = cleaned.strip()

        # `strict=False` permite saltos de línea y tabuladores LITERALES dentro
        # de las cadenas. Es imprescindible aquí: los modelos devuelven código
        # fuente dentro de un campo JSON y muy a menudo no lo escapan.
        for candidato in (cleaned, cls._extraer_objeto(cleaned)):
            if candidato is None:
                continue
            for strict in (True, False):
                try:
                    return json.loads(candidato, strict=strict)
                except json.JSONDecodeError:
                    continue

        if "{" not in cleaned:
            raise LLMError("El modelo no devolvió un objeto JSON.")
        raise LLMError("El modelo devolvió un JSON malformado.")

    @staticmethod
    def _extraer_objeto(texto: str) -> str | None:
        """Recorta el objeto entre la primera '{' y la última '}'.

        Sirve cuando el modelo añade texto suelto alrededor del JSON.
        """
        start = texto.find("{")
        end = texto.rfind("}")
        if start == -1 or end <= start:
            return None
        return texto[start : end + 1]
