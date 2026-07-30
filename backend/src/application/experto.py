"""Caso de uso: cuándo entra el agente experto, y qué se cuenta cuando entra.

Dos reglas gobiernan todo lo de aquí:

1. **El experto nunca es obligatorio.** Si no está configurado, si el plan no lo
   incluye o si el usuario agotó su tope del mes, la construcción sigue con los
   modelos gratuitos. Un fallo del experto jamás puede costarle su proyecto a
   nadie.

2. **Si entra, se ve.** El usuario que paga $19 o $29 tiene derecho a saber en
   qué momento exacto entró la IA de pago y qué hizo. Por eso cada intervención
   se anuncia por el canal de progreso, igual que los pasos de la construcción.

El registro de gasto es lo que hace el negocio sostenible: se mide lo que cuesta
cada intervención y se corta al llegar al tope del plan.
"""

from __future__ import annotations

import logging

from src.domain.experto import (
    AgenteExpertoPort,
    AporteExperto,
    MomentoExperto,
    RegistroGastoPort,
)
from src.domain.planes import Plan, plan_por_id

logger = logging.getLogger(__name__)

#: Cómo se le cuenta al usuario cada momento, en su idioma, sin jerga.
_EN_PALABRAS = {
    MomentoExperto.DISENO: "diseñando el modelo de datos con criterio",
    MomentoExperto.RESCATE: "rescatando la construcción atascada",
    MomentoExperto.REPASO: "repasando la calidad de lo entregado",
}


class ServicioExperto:
    """Decide si el experto interviene, lo llama y lo hace visible."""

    def __init__(
        self,
        experto: AgenteExpertoPort,
        gastos: RegistroGastoPort,
        usuario: str = "",
        plan_id: str = "free",
    ) -> None:
        self._experto = experto
        self._gastos = gastos
        self._usuario = usuario or "anonimo"
        self._plan: Plan = plan_por_id(plan_id)

    @property
    def plan(self) -> Plan:
        return self._plan

    def puede_intervenir(self, momento: MomentoExperto) -> tuple[bool, str]:
        """(Si entra, por qué no). El motivo se enseña tal cual al usuario."""
        if not self._experto.disponible:
            return False, "El agente experto no está configurado en este servidor."
        if not self._plan.entra_experto_en(momento.value):
            return False, f"El plan {self._plan.nombre} no incluye experto en «{momento.value}»."
        tope = self._plan.tope_experto_usd
        gastado = self._gastos.gastado_este_mes(self._usuario)
        if tope > 0 and gastado >= tope:
            return False, (
                f"Alcanzaste el tope de experto de este mes "
                f"(${gastado:.2f} de ${tope:.2f}). Sigue con los modelos incluidos."
            )
        return True, ""

    def intervenir(self, momento: MomentoExperto, contexto: dict) -> AporteExperto | None:
        """Llama al experto si corresponde. None si no entra o si no aportó nada.

        No lanza nunca: la construcción tiene que poder continuar sin él.
        """
        puede, motivo = self.puede_intervenir(momento)
        if not puede:
            logger.info("Experto NO entra en '%s': %s", momento.value, motivo)
            return None

        logger.info("🧠 ENTRÓ EL AGENTE EXPERTO: %s", _EN_PALABRAS[momento])
        try:
            aporte = self._experto.aportar(momento, contexto)
        except Exception as exc:  # noqa: BLE001 - el experto nunca tumba la construcción
            logger.warning("El agente experto falló en '%s': %s", momento.value, exc)
            return None

        if aporte is None or not aporte.datos:
            logger.info("El agente experto no encontró nada que aportar en '%s'.", momento.value)
            return None

        if aporte.coste_usd > 0:
            self._gastos.anotar(self._usuario, aporte.coste_usd)
        logger.info(
            "Experto (%s) resolvió '%s': %s · coste $%.4f",
            aporte.modelo or "sin modelo", momento.value,
            aporte.resumen or "sin resumen", aporte.coste_usd,
        )
        return aporte

    def resumen_gasto(self) -> dict:
        """Lo que el usuario ha consumido y cuánto le queda este mes."""
        tope = self._plan.tope_experto_usd
        gastado = self._gastos.gastado_este_mes(self._usuario)
        return {
            "plan": self._plan.id,
            "tope_usd": tope,
            "gastado_usd": round(gastado, 4),
            "restante_usd": round(max(0.0, tope - gastado), 4) if tope > 0 else 0.0,
        }
