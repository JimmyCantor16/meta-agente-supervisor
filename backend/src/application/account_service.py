"""Servicio de cuentas: gating por usuario y aprobación de pago por super-admin.

Reglas:
- Cada usuario tiene un PLAN (ver `domain/planes.py`) que define su cupo de
  proyectos y clases, y si puede usar el agente de IA de pago.
- Quien no ha pagado está en el plan básico. Al agotar su cupo debe adquirir un
  plan: queda en `pending_payment` hasta que un super-admin confirme el pago.

Antes esto era binario (`paid` = ilimitado). Ahora el plan concreto manda, que
es lo que permite tener varios niveles con privilegios distintos.
"""

from __future__ import annotations

import logging

from src.domain.entities import UserAccount
from src.domain.planes import ILIMITADO, PLAN_BASE, Plan, plan_por_id
from src.domain.ports import PaymentRequiredError, UserRepositoryPort

logger = logging.getLogger(__name__)


class AccountService:
    """Lógica de límites por usuario y aprobación de pagos."""

    def __init__(
        self,
        repository: UserRepositoryPort,
        free_gen_limit: int,
        free_lesson_limit: int,
        super_admin_emails: list[str],
    ) -> None:
        self._repo = repository
        self._free_gen_limit = free_gen_limit
        self._free_lesson_limit = free_lesson_limit
        self._admins = {e.lower() for e in super_admin_emails}

    # -- Identidad -----------------------------------------------------
    def get_or_create(self, sub: str, email: str, name: str) -> UserAccount:
        return self._repo.upsert_profile(sub, email, name)

    def is_super_admin(self, email: str) -> bool:
        return email.lower() in self._admins

    # -- Plan efectivo -------------------------------------------------
    def plan_de(self, user: UserAccount) -> Plan:
        """Plan que rige HOY para este usuario.

        Solo cuenta el plan si el pago está confirmado: mientras esté pendiente,
        el usuario sigue con el básico (si no, bastaría con solicitarlo para
        tener los privilegios sin pagar).
        """
        base = plan_por_id(user.plan) if user.paid else PLAN_BASE
        # El plan básico respeta los límites configurables por entorno, para
        # poder ajustarlos sin tocar el código.
        if base.id == PLAN_BASE.id:
            from dataclasses import replace

            return replace(base, proyectos=self._free_gen_limit, clases=self._free_lesson_limit)
        return base

    @staticmethod
    def _restante(limite: int, usado: int) -> int:
        return ILIMITADO if limite == ILIMITADO else max(0, limite - usado)

    # -- Estado para la UI --------------------------------------------
    def status(self, user: UserAccount) -> dict:
        plan = self.plan_de(user)
        return {
            "sub": user.sub,
            "email": user.email,
            "name": user.name,
            "plan": user.plan,
            "requested_plan": user.requested_plan,
            "paid": user.paid,
            "status": user.status,
            "is_admin": self.is_super_admin(user.email),
            "generations_used": user.generations_used,
            "generations_limit": plan.proyectos,
            "generations_remaining": self._restante(plan.proyectos, user.generations_used),
            "lessons_used": user.lessons_used,
            "lessons_limit": plan.clases,
            "lessons_remaining": self._restante(plan.clases, user.lessons_used),
            # Lo que hace visible el valor del plan en la interfaz.
            "plan_nombre": plan.nombre,
            "ia_experta": plan.ia_experta,
        }

    # -- Gating --------------------------------------------------------
    def ensure_can_generate(self, user: UserAccount) -> None:
        plan = self.plan_de(user)
        if plan.proyectos_ilimitados():
            return
        if user.generations_used >= plan.proyectos:
            raise PaymentRequiredError(
                f"Alcanzaste el límite de {plan.proyectos} proyecto(s) del plan "
                f"{plan.nombre}. Para continuar, adquiere un plan superior; un "
                f"administrador debe confirmar tu pago."
            )

    def ensure_can_learn(self, user: UserAccount) -> None:
        plan = self.plan_de(user)
        if plan.clases_ilimitadas():
            return
        if user.lessons_used >= plan.clases:
            raise PaymentRequiredError(
                f"Alcanzaste el límite de {plan.clases} clases del plan "
                f"{plan.nombre}. Para continuar, adquiere un plan superior; un "
                f"administrador debe confirmar tu pago."
            )

    def usa_ia_experta(self, user: UserAccount) -> str:
        """Nivel de intervención del agente de pago: 'no' | 'critico' | 'total'."""
        return self.plan_de(user).ia_experta

    def record_generation(self, user: UserAccount) -> None:
        # Se cuenta siempre: aunque el plan sea ilimitado, el histórico sirve
        # para que el usuario vea cuánto ha construido.
        self._repo.increment_generation(user.sub)

    def record_lesson(self, user: UserAccount) -> None:
        self._repo.increment_lesson(user.sub)

    def request_upgrade(self, user: UserAccount, plan: str = "") -> None:
        """Marca la cuenta como pendiente de pago del plan solicitado."""
        self._repo.set_pending(user.sub, plan or "pro")

    # -- Super-admin ---------------------------------------------------
    def list_pending(self) -> list[dict]:
        return [self.status(u) for u in self._repo.list_pending()]

    def approve(self, admin_email: str, target_sub: str, plan: str) -> bool:
        if not self.is_super_admin(admin_email):
            return False
        # Si el admin no especifica plan, usa el que el usuario solicitó.
        target = self._repo.get(target_sub)
        final_plan = plan or (target.requested_plan if target else "") or "pro"
        ok = self._repo.approve(target_sub, final_plan, admin_email)
        if ok:
            logger.info("Pago aprobado por %s para %s (plan=%s).", admin_email, target_sub, final_plan)
        return ok
