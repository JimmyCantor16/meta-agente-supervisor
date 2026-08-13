"""Agente CLI SIMULADO: prueba toda la mecánica sin binario y sin coste.

Sigue la convención del proyecto: cada agente de IA tiene su gemelo simulado.
Con `USE_MOCK_LLM=true` el circuito completo (trabajo de fondo → progreso por
eventos → veredicto validado) se puede recorrer sin tener Claude Code instalado
ni logueado.

No pretende ser inteligente. Pretende ser **verificable**: siempre disponible,
siempre sano, y sus respuestas se fabrican para PASAR el `validar` de los casos
de uso conocidos (un `VeredictoRevision` plausible, el `{"ok": true}` de la
prueba de vida). Si le piden un contrato que no sabe fabricar, falla con un
mensaje claro en vez de devolver una forma equivocada en silencio.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.domain.ports import AgenteCliError, AgenteCliPort

logger = logging.getLogger(__name__)

_TEXTO_PLANO = "Respuesta simulada del agente CLI local (mock)."


class MockClaudeCli(AgenteCliPort):
    """Gemelo simulado de `ClaudeCliAgent`: misma interfaz, cero subprocess."""

    def __init__(self) -> None:
        # Mismo atributo público que el adaptador real, para que quien
        # contabilice el gasto no distinga entre ambos.
        self.ultimo_uso: dict = {}

    def disponible(self) -> bool:
        return True

    def probar(self) -> str | None:
        return None  # siempre sano: es su gracia

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
        """Devuelve algo coherente con el contrato pedido, al instante.

        Paridad EXACTA con el adaptador real, incluida la parte que engaña: el
        retorno de `validar` se descarta y lo que sale es el DICT, no la
        entidad. El mock no puede ser más amable que el CLI o el consumidor se
        rompería solo en producción.
        """
        self._registrar_uso()
        if validar is None and clave_esperada is None:
            return _TEXTO_PLANO
        return self._fabricar(user, validar, clave_esperada)

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
        """Emite 3-4 eventos falsos con la MISMA forma que el CLI real y
        devuelve lo mismo que `ejecutar`: así el WebSocket de progreso se puede
        probar de punta a punta sin gastar."""
        resultado = self.ejecutar(
            system, user, validar, cwd, timeout_s,
            allowed_tools=allowed_tools, clave_esperada=clave_esperada,
        )
        texto_final = resultado if isinstance(resultado, str) else json.dumps(resultado, ensure_ascii=False)
        eventos: list[dict] = [
            {"type": "system", "subtype": "init", "model": "claude-simulado",
             "tools": list(allowed_tools or [])},
            {"type": "assistant", "message": {"content": [
                {"type": "text", "text": "Leyendo el encargo (simulado)…"}]}},
            {"type": "assistant", "message": {"content": [
                {"type": "text", "text": "Redactando la respuesta (simulada)…"}]}},
            {"type": "result", "subtype": "success", "is_error": False,
             "result": texto_final, "total_cost_usd": 0.0,
             "usage": {"input_tokens": 0, "output_tokens": 0}},
        ]
        for evento in eventos:
            self._avisar(al_evento, evento)
        return resultado

    # ------------------------------------------------------------------
    def _fabricar(
        self,
        user: str,
        validar: Callable | None,
        clave_esperada: str | None,
    ) -> dict:
        """Construye un dict que cumpla el contrato pedido.

        Prueba una batería de formas conocidas contra `validar` y devuelve la
        primera que pase. Sin validador, devuelve la primera que contenga
        `clave_esperada` (o la más plausible). Si nada pasa, `AgenteCliError`
        con el motivo: mejor un mock que avisa que uno que miente.
        """
        candidatos = self._candidatos(user, clave_esperada)
        if validar is None:
            if clave_esperada:
                for candidato in candidatos:
                    if clave_esperada in candidato:
                        return candidato
            return candidatos[0]

        ultimo_motivo = ""
        for candidato in candidatos:
            try:
                validar(candidato)
                return candidato
            except Exception as exc:  # noqa: BLE001 — el validador es código ajeno
                ultimo_motivo = f"{type(exc).__name__}: {str(exc)[:200]}"
        raise AgenteCliError(
            "El mock del agente CLI no sabe fabricar una respuesta que cumpla "
            f"ese contrato. Último rechazo: {ultimo_motivo}"
        )

    def _candidatos(self, user: str, clave_esperada: str | None) -> list[dict]:
        """Las formas que el mock sabe fabricar, de la más rica a la más simple."""
        ahora = datetime.now(timezone.utc).isoformat()
        veredicto = {
            # Un VeredictoRevision plausible: el caso de uso conocido de Fase 2.
            "slug": self._slug_de(user),
            "aprobar": True,
            "calidad": 8,
            "resumen": "Revisión simulada: el proyecto cumple lo esencial y se puede publicar.",
            "mejoras": [
                "Añadir pruebas automáticas del flujo principal.",
                "Documentar en el README cómo arrancar el proyecto.",
            ],
            "publicado": False,
            "fecha": ahora,
        }
        candidatos: list[dict] = []
        if clave_esperada and clave_esperada not in veredicto:
            # Valor neutro bajo la clave pedida: una lista vacía es lo que menos
            # supone sobre el contrato, y una cadena, el plan B.
            candidatos.append({clave_esperada: [], "resumen": "Simulado.", "fecha": ahora})
            candidatos.append({clave_esperada: "valor simulado", "resumen": "Simulado.", "fecha": ahora})
        candidatos.append(veredicto)
        candidatos.append({"ok": True})  # la prueba de vida (estilo test_brain)
        return candidatos

    @staticmethod
    def _slug_de(user: str) -> str:
        """Rescata el slug del encargo si viene mencionado; si no, uno demo."""
        m = re.search(r"slug[\"'\s:=]+([a-z0-9][a-z0-9-]*)", user or "", re.I)
        return m.group(1).lower() if m else "proyecto-demo"

    def _registrar_uso(self) -> None:
        """Mismo formato que el adaptador real, con todo en cero."""
        self.ultimo_uso = {
            "total_cost_usd": 0.0,
            "usage": {"input_tokens": 0, "output_tokens": 0},
            "duracion_ms": 0,
            "origen": "suscripcion",
            "coste_facturable_usd": 0.0,
        }

    @staticmethod
    def _avisar(al_evento: Callable[[dict], None], evento: dict) -> None:
        """Paridad con el real: un callback que lanza no tumba el trabajo."""
        try:
            al_evento(evento)
        except Exception:  # noqa: BLE001 — el callback es código ajeno (WS, UI)
            logger.warning("El callback de progreso falló; se sigue sin él.", exc_info=True)
