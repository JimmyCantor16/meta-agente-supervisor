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

        for provider, client in self._clients:
            self._respect_tpm(provider.name)
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
                continue

            if not response.choices or not response.choices[0].message.content:
                logger.warning("Proveedor '%s' devolvió respuesta vacía. Siguiente...", provider.name)
                errors.append(f"{provider.name}: respuesta vacía")
                continue

            if response.usage is not None:
                self._record(provider.name, response.usage.total_tokens)
                logger.info("OK con '%s' (tokens: %s).", provider.name, response.usage.total_tokens)

            return response.choices[0].message.content

        # Se agotaron todos los proveedores.
        raise LLMError("Todos los proveedores de IA fallaron. Detalle: " + " | ".join(errors))

    # ------------------------------------------------------------------
    # Throttling por proveedor (tokens/minuto)
    # ------------------------------------------------------------------
    def _respect_tpm(self, provider_name: str, anticipated: int = 2500) -> None:
        now = time.monotonic()
        log = [(t, k) for (t, k) in self._usage.get(provider_name, []) if now - t < 60]
        self._usage[provider_name] = log
        used = sum(k for _, k in log)
        if used + anticipated > _TPM_BUDGET and log:
            oldest = min(t for t, _ in log)
            wait = 60 - (now - oldest) + 1
            if wait > 0:
                logger.info("Throttle '%s': esperando %.0fs (~%d tok/min).", provider_name, wait, used)
                time.sleep(min(wait, 61))

    def _record(self, provider_name: str, tokens: int) -> None:
        self._usage.setdefault(provider_name, []).append((time.monotonic(), tokens))

    # ------------------------------------------------------------------
    @staticmethod
    def _parse_json(text: str) -> dict:
        """Parseo tolerante: quita fences de markdown si aparecen."""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
            if cleaned[:4].lower() == "json":
                cleaned = cleaned[4:]
            cleaned = cleaned.rsplit("```", 1)[0]
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise LLMError("El modelo devolvió un JSON malformado.") from exc
