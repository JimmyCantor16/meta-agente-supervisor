"""Servicio de cuentas: gating por usuario y aprobación de pago por super-admin.

Reglas:
- Gratis: el usuario puede generar hasta `free_gen_limit` proyectos y recibir
  hasta `free_lesson_limit` clases (Modo Profesor).
- Al agotar el cupo, para seguir debe pagar. Queda en `pending_payment` hasta
  que un super-admin marque el pago (`paid`), y entonces se desbloquea según plan.
"""

from __future__ import annotations

import logging

from src.domain.entities import UserAccount
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

    # -- Estado para la UI --------------------------------------------
    def status(self, user: UserAccount) -> dict:
        gen_remaining = -1 if user.paid else max(0, self._free_gen_limit - user.generations_used)
        lesson_remaining = -1 if user.paid else max(0, self._free_lesson_limit - user.lessons_used)
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
            "generations_limit": self._free_gen_limit,
            "generations_remaining": gen_remaining,
            "lessons_used": user.lessons_used,
            "lessons_limit": self._free_lesson_limit,
            "lessons_remaining": lesson_remaining,
        }

    # -- Gating --------------------------------------------------------
    def ensure_can_generate(self, user: UserAccount) -> None:
        if user.paid:
            return
        if user.generations_used >= self._free_gen_limit:
            raise PaymentRequiredError(
                f"Alcanzaste el límite gratuito de {self._free_gen_limit} proyectos. "
                f"Para continuar, adquiere un plan; un administrador debe confirmar tu pago."
            )

    def ensure_can_learn(self, user: UserAccount) -> None:
        if user.paid:
            return
        if user.lessons_used >= self._free_lesson_limit:
            raise PaymentRequiredError(
                f"Alcanzaste el límite gratuito de {self._free_lesson_limit} clases. "
                f"Para continuar, adquiere un plan; un administrador debe confirmar tu pago."
            )

    def record_generation(self, user: UserAccount) -> None:
        if not user.paid:
            self._repo.increment_generation(user.sub)


    def record_lesson(self, user: UserAccount) -> None:
        if not user.paid:
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
