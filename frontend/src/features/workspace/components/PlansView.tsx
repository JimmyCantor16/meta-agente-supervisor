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
  /** Nivel del agente de pago: refleja `ia_experta` del backend. */
  ia?: "critico" | "total";
  /** Frase que explica QUÉ hace el agente experto en este plan. */
  iaClaim?: string;
  features: string[];
}

// Contenido comercial de los planes. Los límites y el nivel de IA son los
// mismos que declara el backend en `domain/planes.py`; aquí vive solo el texto.
function plansFor(lang: Language, forever: string, perMonth: string): PlanDef[] {
  const es = lang === "es";
  return [
    {
      id: "free",
      name: "Free",
      price: "$0",
      period: forever,
      features: es
        ? ["1 proyecto generado", "5 clases (Modo Profesor)", "Multi-modelo de IA gratis", "Soporte de comunidad"]
        : ["1 generated project", "5 lessons (Teacher mode)", "Free multi-model AI", "Community support"],
    },
    {
      id: "pro",
      name: "Pro",
      price: "$9",
      period: perMonth,
      features: es
        ? ["Proyectos ilimitados", "Clases ilimitadas", "App de escritorio y móvil", "Soporte por email"]
        : ["Unlimited projects", "Unlimited lessons", "Desktop and mobile app", "Email support"],
    },
    {
      id: "studio",
      name: "Studio",
      price: "$19",
      period: perMonth,
      highlight: true,
      ia: "critico",
      iaClaim: es
        ? "Un agente de IA de pago entra en los momentos difíciles: diseña la arquitectura, rescata las reparaciones donde los modelos gratuitos se atascan y hace el repaso final."
        : "A paid AI agent steps in at the hard moments: designs the architecture, rescues repairs where free models get stuck, and does the final review.",
      features: es
        ? ["Todo lo de Pro", "Arquitectura diseñada por IA experta", "Rescate cuando la IA gratis se atasca", "Repaso de calidad final"]
        : ["Everything in Pro", "Architecture designed by expert AI", "Rescue when free AI gets stuck", "Final quality review"],
    },
    {
      id: "business",
      name: "Business",
      price: "$29",
      period: perMonth,
      ia: "total",
      iaClaim: es
        ? "El agente experto dirige la construcción de principio a fin: no solo rescata, decide. Para sistemas serios."
        : "The expert agent leads construction end to end: it doesn't just rescue, it decides. For serious systems.",
      features: es
        ? ["Todo lo de Studio", "IA experta en todo el proceso", "Varios usuarios del equipo", "Soporte prioritario"]
        : ["Everything in Studio", "Expert AI across the whole process", "Multiple team users", "Priority support"],
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
      <h2 className="text-xl font-bold text-ink">💎 {t.plans.title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t.plans.subtitle}</p>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.id && account?.paid;
          const isRequested = requestedPlan === plan.id;
          const isFree = plan.id === "free";

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-6 shadow-sm ${
                plan.ia
                  ? "border-brand-300 bg-gradient-to-b from-brand-50/70 to-white"
                  : "border-black/10 bg-white"
              } ${plan.highlight ? "ring-2 ring-brand-300" : ""}`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold text-white">
                  {t.plans.popular}
                </span>
              )}

              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-ink">{plan.name}</p>
                {plan.ia && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      plan.ia === "total"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-brand-100 text-brand-700"
                    }`}
                  >
                    {plan.ia === "total" ? t.plans.iaTotal : t.plans.iaCritico}
                  </span>
                )}
              </div>

              <p className="mt-2">
                <span className="text-3xl font-extrabold text-ink">{plan.price}</span>
                <span className="ml-1 text-sm text-ink-faint">{plan.period}</span>
              </p>

              {plan.iaClaim && (
                <p className="mt-3 rounded-xl bg-white/70 p-3 text-xs leading-relaxed text-ink-body ring-1 ring-brand-100">
                  <span aria-hidden>⭐ </span>
                  {plan.iaClaim}
                </p>
              )}

              <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-body">
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
                  <span className="block py-2.5 text-center text-sm text-ink-faint">—</span>
                ) : isRequested ? (
                  <span className="block rounded-xl bg-amber-50 py-2.5 text-center text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                    {t.plans.requested}
                  </span>
                ) : !isLoggedIn ? (
                  <span className="block py-2.5 text-center text-xs text-ink-faint">
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
