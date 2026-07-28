"""Catálogo de planes: qué recibe cada uno.

Es dominio puro: describe el producto, sin saber de FastAPI ni de la base de
datos. Aquí vive la respuesta a «¿qué desbloquea pagar?», que hasta ahora era
binaria (gratis o pagado) y no distinguía entre niveles.

La diferencia REAL entre planes no es solo el cupo: es **quién construye**. Los
planes bajos usan la cadena de modelos gratuitos; los altos añaden un agente de
pago que entra en los momentos donde los gratuitos se atascan.
"""

from __future__ import annotations

from dataclasses import dataclass

ILIMITADO = -1


@dataclass(frozen=True)
class Plan:
    """Un plan comercial y lo que habilita técnicamente."""

    id: str
    nombre: str
    precio_usd: int
    proyectos: int
    clases: int
    #: Cuánto interviene el agente de pago:
    #:   "no"      → solo modelos gratuitos
    #:   "critico" → entra en los 3 momentos difíciles (plan, rescate, repaso)
    #:   "total"   → además dirige la construcción de principio a fin
    ia_experta: str

    @property
    def usa_ia_experta(self) -> bool:
        return self.ia_experta != "no"

    def proyectos_ilimitados(self) -> bool:
        return self.proyectos == ILIMITADO

    def clases_ilimitadas(self) -> bool:
        return self.clases == ILIMITADO


# Orden de menor a mayor: la interfaz los pinta en este orden.
PLANES: tuple[Plan, ...] = (
    Plan(
        id="free",
        nombre="Free",
        precio_usd=0,
        proyectos=1,
        clases=5,
        ia_experta="no",
    ),
    Plan(
        id="pro",
        nombre="Pro",
        precio_usd=9,
        proyectos=ILIMITADO,
        clases=ILIMITADO,
        ia_experta="no",
    ),
    Plan(
        id="studio",
        nombre="Studio",
        precio_usd=19,
        proyectos=ILIMITADO,
        clases=ILIMITADO,
        ia_experta="critico",
    ),
    Plan(
        id="business",
        nombre="Business",
        precio_usd=29,
        proyectos=ILIMITADO,
        clases=ILIMITADO,
        ia_experta="total",
    ),
)

_POR_ID = {p.id: p for p in PLANES}

#: Plan de quien no ha pagado nada.
PLAN_BASE = _POR_ID["free"]


def plan_por_id(plan_id: str | None) -> Plan:
    """Devuelve el plan pedido, o el básico si no se reconoce.

    Nunca lanza: un identificador viejo o corrupto en la base de datos no debe
    dejar a nadie sin servicio, solo sin privilegios.
    """
    return _POR_ID.get((plan_id or "").strip().lower(), PLAN_BASE)
