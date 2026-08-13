"""Mock del despliegue a Render: simula los hitos sin tocar GitHub ni la nube.

Con `USE_MOCK_LLM=true` todo el circuito de publicación funciona de mentira
pero completo: se ven los mismos mensajes de progreso por el WebSocket y se
devuelve un `InfoDespliegue` creíble. Sirve para probar mecánica y UX sin
credenciales y sin gastar servicios de Render.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

from src.domain.entities import InfoDespliegue
from src.domain.ports import DesplieguePort


class MockRenderDeploy(DesplieguePort):
    """Simula el despliegue completo, hito a hito, en ~1 segundo."""

    def publicar(
        self,
        ruta_proyecto: Path,
        nombre: str,
        al_avanzar: Callable[[str], None] | None = None,
    ) -> InfoDespliegue:
        hitos = (
            "📦 (simulado) Preparando una copia limpia del proyecto…",
            "🧬 (simulado) Stack detectado: python (backend.main:app)",
            "📚 (simulado) Creando el repositorio en GitHub…",
            "⬆️ (simulado) Subiendo el código a GitHub…",
            "🛠️ (simulado) Creando el servicio en Render…",
            "⏳ (simulado) Render: build_in_progress (0.2 min)",
            "⏳ (simulado) Render: live (0.9 min)",
        )
        for hito in hitos:
            self._avisar(al_avanzar, hito)
            time.sleep(0.1)

        return InfoDespliegue(
            slug=nombre,
            nombre_servicio=nombre,
            url=f"https://{nombre}.onrender.com",
            repo=f"https://github.com/mock-owner/{nombre}",
            estado="vivo",
            detalle="Despliegue SIMULADO (USE_MOCK_LLM=true): no hay servicio real.",
            actualizado_en=datetime.now(timezone.utc).isoformat(),
            ultimo_chequeo=None,
        )

    @staticmethod
    def _avisar(al_avanzar: Callable[[str], None] | None, mensaje: str) -> None:
        if al_avanzar is None:
            return
        try:
            al_avanzar(mensaje)
        except Exception:  # noqa: BLE001 - el progreso jamás rompe el flujo
            pass
