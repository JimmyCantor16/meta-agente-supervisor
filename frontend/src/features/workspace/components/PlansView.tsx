import { useState } from "react";
import { Button } from "../../../components/Button";
import { useLanguage } from "../../../i18n/LanguageProvider";
import type { AccountStatus } from "../../auth/types";
import type { Language } from "../../../i18n/translations";

interface PlansViewProps {
  isLoggedIn: boolean;
  account: AccountStatus | null;
  /** Solicita un plan (queda pendiente de aprobación del admin). */
  onChoose: (plan: string) => Promise<void>;
}

interface PlanDef {
  id: string;
  name: string;
  price: string;
  period: string;
  highlight?: boolean;
  features: string[];
}

// Contenido de los planes (editable por el negocio). Bilingüe.
function plansFor(lang: Language, forever: string, perMonth: string): PlanDef[] {
  const es = lang === "es";
  return [
    {
      id: "free",
      name: "Free",
      price: "$0",
      period: forever,
      features: es
        ? ["3 proyectos generados", "3 clases (Modo Profesor)", "Multi-modelo de IA gratis", "Soporte de comunidad"]
        : ["3 generated projects", "3 lessons (Teacher mode)", "Free multi-model AI", "Community support"],
    },
    {
      id: "pro",
      name: "Pro",
      price: "$9",
      period: perMonth,
      highlight: true,
      features: es
        ? ["Proyectos ilimitados", "Clases ilimitadas", "App de escritorio", "Soporte por email"]
        : ["Unlimited projects", "Unlimited lessons", "Desktop app", "Email support"],
    },
    {
      id: "business",
      name: "Business",
      price: "$29",
      period: perMonth,
      features: es
        ? ["Todo lo de Pro", "Varios usuarios del equipo", "Soporte prioritario", "Más modelos de IA"]
        : ["Everything in Pro", "Multiple team users", "Priority support", "More AI models"],
    },
  ];
}

/**
 * Página de planes: tarjetas con precios y beneficios. Elegir un plan de pago
 * lo deja "pendiente" hasta que un super-admin confirme el pago.
 */
export function PlansView({ isLoggedIn, account, onChoose }: PlansViewProps) {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState<string | null>(null);

  const plans = plansFor(lang, t.plans.forever, t.plans.perMonth);
  const currentPlan = account?.plan ?? "free";
  const requestedPlan = account?.status === "pending_payment" ? account?.requested_plan : "";

  const choose = async (planId: string) => {
    setBusy(planId);
    try {
      await onChoose(planId);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900">💎 {t.plans.title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">{t.plans.subtitle}</p>

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.id && account?.paid;
          const isRequested = requestedPlan === plan.id;
          const isFree = plan.id === "free";

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
                plan.highlight ? "border-brand-300 ring-2 ring-brand-200" : "border-slate-200"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold text-white">
                  {t.plans.popular}
                </span>
              )}

              <p className="text-lg font-bold text-slate-900">{plan.name}</p>
              <p className="mt-2">
                <span className="text-3xl font-extrabold text-slate-900">{plan.price}</span>
                <span className="ml-1 text-sm text-slate-400">{plan.period}</span>
              </p>

              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-emerald-500" aria-hidden>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <span className="block rounded-xl bg-emerald-50 py-2.5 text-center text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    {t.plans.currentPlan}
                  </span>
                ) : isFree ? (
                  <span className="block py-2.5 text-center text-sm text-slate-400">—</span>
                ) : isRequested ? (
                  <span className="block rounded-xl bg-amber-50 py-2.5 text-center text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                    {t.plans.requested}
                  </span>
                ) : !isLoggedIn ? (
                  <span className="block py-2.5 text-center text-xs text-slate-400">
                    {t.plans.loginFirst}
                  </span>
                ) : (
                  <Button
                    onClick={() => choose(plan.id)}
                    loading={busy === plan.id}
                    variant={plan.highlight ? "primary" : "ghost"}
                    className="w-full"
                  >
                    {busy === plan.id ? t.plans.choosing : t.plans.choose}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
