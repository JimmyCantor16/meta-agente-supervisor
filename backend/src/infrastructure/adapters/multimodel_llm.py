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
import time

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

    def __init__(
        self,
        providers: list[LLMProvider] | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
    ) -> None:
        settings = get_settings()
        providers = providers or settings.resolved_providers
        timeout = timeout if timeout is not None else settings.request_timeout
        max_retries = max_retries if max_retries is not None else settings.max_retries

        # Un cliente OpenAI por proveedor (mismo SDK, distinta base_url/key).
        self._clients: list[tuple[LLMProvider, OpenAI]] = [
            (
                p,
                OpenAI(api_key=p.api_key, base_url=p.base_url, timeout=timeout, max_retries=max_retries),
            )
            for p in providers
        ]
        # Registro de uso por proveedor (para el throttle TPM).
        self._usage: dict[str, list[tuple[float, int]]] = {p.name: [] for p in providers}
        logger.info("MultiModelLLM listo con %d proveedor(es): %s",
                    len(providers), [p.name for p in providers])

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------
    def chat_json(self, system: str, user: str, temperature: float = 0.2) -> dict:
        """Devuelve la respuesta parseada como dict (modo JSON)."""
        raw = self._chat(system, user, temperature, want_json=True)
        return self._parse_json(raw)

    def chat_text(self, system: str, user: str, temperature: float = 0.2) -> str:
        """Devuelve la respuesta como texto plano."""
        return self._chat(system, user, temperature, want_json=False)

    # ------------------------------------------------------------------
    # Núcleo: fallback entre proveedores
    # ------------------------------------------------------------------
    def _chat(self, system: str, user: str, temperature: float, want_json: bool) -> str:
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
            wait = self._throttle_wait(provider.name, estimated)
            if wait > 0:
                logger.debug("Aparca '%s': saturado (%.0fs). Probando otro...", provider.name, wait)
                throttled.append((wait, provider, client))
                continue

            content = self._try_provider(provider, client, messages, temperature, response_format, errors)
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
            content = self._try_provider(provider, client, messages, temperature, response_format, errors)
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
    ) -> str | None:
        """Intenta una llamada. Devuelve el contenido, o None si hay que seguir."""
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

        if response.usage is not None:
            self._record(provider.name, response.usage.total_tokens)
            logger.info("OK con '%s' (tokens: %s).", provider.name, response.usage.total_tokens)

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
    def _throttle_wait(self, provider_name: str, anticipated: int) -> float:
        """Segundos que habría que esperar para no pasarse del TPM del proveedor.

        Devuelve 0 si se puede llamar ya. NO duerme: quien decide es `_chat`,
        que prefiere cambiar de proveedor antes que esperar.
        """
        now = time.monotonic()
        log = [(t, k) for (t, k) in self._usage.get(provider_name, []) if now - t < 60]
        self._usage[provider_name] = log
        used = sum(k for _, k in log)

        if not log or used + anticipated <= _TPM_BUDGET:
            return 0.0

        # Hay que esperar a que la llamada más antigua salga de la ventana de 60s.
        oldest = min(t for t, _ in log)
        return max(0.0, 60 - (now - oldest) + 1)

    def _record(self, provider_name: str, tokens: int) -> None:
        self._usage.setdefault(provider_name, []).append((time.monotonic(), tokens))

    # ------------------------------------------------------------------
    @staticmethod
    def _parse_json(text: str) -> dict:
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

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass  # Intentamos rescatar el objeto JSON incrustado.

        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError as exc:
                raise LLMError("El modelo devolvió un JSON malformado.") from exc

        raise LLMError("El modelo no devolvió un objeto JSON.")
