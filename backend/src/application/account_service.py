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
import secrets
from datetime import datetime, timezone

from src.domain.entities import UserAccount
from src.domain.planes import ILIMITADO, PLAN_BASE, Plan, plan_por_id
from src.domain.ports import PaymentRequiredError, UserRepositoryPort

logger = logging.getLogger(__name__)

#: Sin 0/O ni 1/I: la referencia se dicta por teléfono y se teclea en un banco.
_ALFABETO_REF = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def nueva_referencia() -> str:
    """Referencia de pago legible y única en la práctica (32^6 ≈ 10^9)."""
    return "MA-" + "".join(secrets.choice(_ALFABETO_REF) for _ in range(6))


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _limpio(texto: str, maximo: int) -> str:
    """Una línea, sin caracteres de control, con tope de longitud."""
    texto = "".join(c for c in (texto or "") if c == " " or c.isprintable())
    return texto.strip()[:maximo]


class AccountService:
    """Lógica de límites por usuario y aprobación de pagos."""

    def __init__(
        self,
        repository: UserRepositoryPort,
        free_gen_limit: int,
        free_lesson_limit: int,
        super_admin_emails: list[str],
        payment_instructions: str = "",
    ) -> None:
        self._repo = repository
        self._free_gen_limit = free_gen_limit
        self._free_lesson_limit = free_lesson_limit
        self._admins = {e.lower() for e in super_admin_emails}
        # En una variable de entorno no se escribe un salto de línea real.
        self._instrucciones = (payment_instructions or "").replace("\\n", "\n").strip()

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
    def status(self, user: UserAccount, para_admin: bool = False) -> dict:
        """Estado para la UI. `para_admin` añade quién aprobó (un email interno
        que el propio usuario no necesita ver)."""
        plan = self.plan_de(user)
        pendiente = user.status == "pending_payment"
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
            # --- Compra en curso (o la última respuesta del admin) ---
            "requested_amount_usd": plan_por_id(user.requested_plan).precio_usd
            if user.requested_plan
            else 0,
            "payment_ref": user.payment_ref,
            "payment_receipt": user.payment_receipt,
            "requested_at": user.requested_at,
            "approved_at": user.approved_at,
            "approved_by": user.approved_by if para_admin else "",
            "rejection_reason": user.rejection_reason,
            "payment_instructions": self._instrucciones if pendiente else "",
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

    @staticmethod
    def plan_de_pago(plan_id: str) -> Plan:
        """El plan de pago pedido, o ValueError si no existe o es el gratuito."""
        plan = plan_por_id(plan_id)
        if plan.id != (plan_id or "").strip().lower() or plan.precio_usd <= 0:
            raise ValueError(f"Plan desconocido o no comprable: '{plan_id}'.")
        return plan

    def request_upgrade(self, user: UserAccount, plan: str = "") -> UserAccount:
        """Deja la cuenta pendiente de pago del plan pedido, con su referencia.

        Si ya había una solicitud pendiente se conserva la referencia: el usuario
        puede haberla copiado ya en su banco, y cambiar de plan no debe dejarle
        un pago huérfano.
        """
        elegido = self.plan_de_pago(plan or "pro")
        actual = self._repo.get(user.sub) or user
        if actual.paid and plan_por_id(actual.plan).id == elegido.id:
            raise ValueError(f"Ya tienes el plan {elegido.nombre} activo.")
        ref = actual.payment_ref if actual.status == "pending_payment" and actual.payment_ref else nueva_referencia()
        self._repo.set_pending(user.sub, elegido.id, ref, _ahora())
        logger.info("Solicitud de plan %s de %s (ref %s).", elegido.id, user.sub, ref)
        return self._repo.get(user.sub) or actual

    def submit_receipt(self, user: UserAccount, receipt: str) -> bool:
        """El usuario pega su nº de comprobante. False si no tiene nada pendiente."""
        return self._repo.set_payment_receipt(user.sub, _limpio(receipt, 120))

    def cancel_request(self, user: UserAccount) -> bool:
        """El usuario retira su solicitud. False si no tenía ninguna pendiente."""
        return self._repo.clear_request(user.sub, "")

    # -- Super-admin ---------------------------------------------------
    def admin_emails(self) -> list[str]:
        return sorted(self._admins)

    def admin_subs(self) -> list[str]:
        """Los `sub` de los super-admin que ya entraron alguna vez.

        Los avisos por WebSocket van SIEMPRE con dueño; un admin que nunca ha
        iniciado sesión no tiene fila y simplemente no recibe el aviso en vivo
        (lo verá en la bandeja al entrar).
        """
        subs: list[str] = []
        for email in self.admin_emails():
            cuenta = self._repo.find_by_email(email)
            if cuenta and cuenta.sub:
                subs.append(cuenta.sub)
        return subs

    def get(self, sub: str) -> UserAccount | None:
        return self._repo.get(sub)

    def list_pending(self) -> list[dict]:
        return [self.status(u, para_admin=True) for u in self._repo.list_pending()]

    def list_paid(self) -> list[dict]:
        return [self.status(u, para_admin=True) for u in self._repo.list_paid()]

    def approve(self, admin_email: str, target_sub: str, plan: str) -> bool:
        if not self.is_super_admin(admin_email):
            return False
        # Si el admin no especifica plan, usa el que el usuario solicitó.
        target = self._repo.get(target_sub)
        if target is None:
            return False
        final_plan = self.plan_de_pago(plan or target.requested_plan or "pro").id
        ok = self._repo.approve(target_sub, final_plan, admin_email, _ahora())
        if ok:
            logger.info("Pago aprobado por %s para %s (plan=%s).", admin_email, target_sub, final_plan)
        return ok

    def reject(self, admin_email: str, target_sub: str, reason: str = "") -> bool:
        """Rechaza la solicitud pendiente; el plan vigente no cambia."""
        if not self.is_super_admin(admin_email):
            return False
        ok = self._repo.clear_request(target_sub, _limpio(reason, 300))
        if ok:
            logger.info("Solicitud de %s rechazada por %s.", target_sub, admin_email)
        return ok

    def revoke(self, admin_email: str, target_sub: str, reason: str = "") -> bool:
        """Devuelve a un usuario de pago al plan gratuito."""
        if not self.is_super_admin(admin_email):
            return False
        ok = self._repo.revoke(target_sub, _limpio(reason, 300))
        if ok:
            logger.info("Plan de %s revocado por %s.", target_sub, admin_email)
        return ok
