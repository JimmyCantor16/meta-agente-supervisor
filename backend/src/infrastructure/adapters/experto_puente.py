"""Experto por el PUENTE: el juicio lo da Claude Code desde la terminal del equipo.

Es el mismo papel que `ClaudeAgenteExperto` (mismas instrucciones, mismo JSON de
salida), pero en vez de la API de Anthropic usa la terminal conectada por el
puente local. Sirve para enseñar la diferencia entre planes sin una clave de
API: Studio y Business ven entrar a Claude en los momentos difíciles.

Si la terminal no está conectada (o falla), cae al experto de RESPALDO —la API de
Anthropic si hay clave, o el modelo gratuito reservado—, así que encender el
puente nunca empeora nada: en el peor caso, todo sigue como antes.
"""

from __future__ import annotations

import json
import logging

from src.domain.experto import AgenteExpertoPort, AporteExperto, MomentoExperto
from src.infrastructure.adapters.claude_experto import _INSTRUCCIONES, _json_o_vacio
from src.infrastructure.adapters.puente_local import HUB, PuenteError, PuenteHub

logger = logging.getLogger(__name__)

MOTOR = "claude"


class ExpertoPuente(AgenteExpertoPort):
    """Experto que delega en Claude Code por el puente, con respaldo."""

    def __init__(self, respaldo: AgenteExpertoPort, espera: float, hub: PuenteHub | None = None) -> None:
        self._respaldo = respaldo
        self._espera = espera
        self._hub = hub or HUB

    @property
    def disponible(self) -> bool:
        return self._hub.conectado(MOTOR) or self._respaldo.disponible

    def aportar(self, momento: MomentoExperto, contexto: dict) -> AporteExperto:
        if not self._hub.conectado(MOTOR):
            return self._respaldo.aportar(momento, contexto)
        try:
            encargo = self._hub.encargar(
                MOTOR,
                _INSTRUCCIONES[momento],
                json.dumps(contexto, ensure_ascii=False)[:20000],
                want_json=True,
                espera=self._espera,
                tipo=f"experto:{momento.value}",
            )
        except PuenteError as exc:
            logger.warning("El experto por la terminal no respondió (%s): uso el respaldo.", exc)
            return self._respaldo.aportar(momento, contexto)

        datos = _json_o_vacio(encargo.contenido)
        resumen = str(datos.pop("resumen", "")).strip()
        return AporteExperto(
            momento=momento,
            resumen=resumen or "Intervención del agente experto.",
            datos=datos,
            coste_usd=0.0,
            modelo="Claude Code (terminal)",
        )
