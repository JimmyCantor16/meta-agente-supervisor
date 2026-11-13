import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, Check, Clock, Copy, LoaderCircle, Receipt, Sparkles, X } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import type { AccountStatus } from "../../auth/types";
import type { Language } from "../../../i18n/translations";

interface PlansViewProps {
  isLoggedIn: boolean;
  account: AccountStatus | null;
  /** Solicita un plan (queda pendiente de aprobación del admin). */
  onChoose: (plan: string) => Promise<void>;
  /** Guarda el nº de comprobante de la solicitud pendiente. */
  onSubmitReceipt: (receipt: string) => Promise<void>;
  /** Retira la solicitud pendiente. */
  onCancel: () => Promise<void>;
}

interface PlanDef {
  id: string;
  name: string;
  usd: number;
  period: string;
  highlight?: boolean;
  /** Nivel del agente de pago: refleja `ia_experta` del backend. */
  ia?: "critico" | "total";
  /** Frase que explica QUÉ hace el agente experto en este plan. */
  iaClaim?: string;
  features: string[];
}

// Contenido comercial de los planes. Los límites, el precio y el nivel de IA
// son los mismos que declara el backend en `domain/planes.py`; aquí vive solo
// el texto. El importe que se cobra lo pone el SERVIDOR (requested_amount_usd).
function plansFor(lang: Language, forever: string, perMonth: string): PlanDef[] {
  const es = lang === "es";
  return [
    {
      id: "free",
      name: "Free",
      usd: 0,
      period: forever,
      features: es
        ? ["1 proyecto generado", "5 clases (Modo Profesor)", "Multi-modelo de IA gratis", "Soporte de comunidad"]
        : ["1 generated project", "5 lessons (Teacher mode)", "Free multi-model AI", "Community support"],
    },
    {
      id: "pro",
      name: "Pro",
      usd: 9,
      period: perMonth,
      features: es
        ? ["Proyectos ilimitados", "Clases ilimitadas", "App de escritorio y móvil", "Soporte por email"]
        : ["Unlimited projects", "Unlimited lessons", "Desktop and mobile app", "Email support"],
    },
    {
      id: "studio",
      name: "Studio",
      usd: 19,
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
      usd: 29,
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

/** Fecha corta en el idioma de la interfaz; cadena vacía si no se puede leer. */
export function fechaCorta(iso: string | undefined, lang: Language): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(lang === "es" ? "es" : "en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BTN_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 rounded border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink-body transition hover:border-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40";
const CAMPO =
  "w-full rounded border border-black/10 bg-white px-3.5 py-2.5 text-sm text-ink-body transition placeholder:text-ink-faint focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15";

/**
 * Página de planes. Elegir un plan de pago abre el panel de compra: importe,
 * referencia única, instrucciones y el comprobante. El plan se activa cuando
 * un super-admin confirma el pago.
 */
export function PlansView({ isLoggedIn, account, onChoose, onSubmitReceipt, onCancel }: PlansViewProps) {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const plans = plansFor(lang, t.plans.forever, t.plans.perMonth);
  const pending = account?.status === "pending_payment";
  const currentPlan = account?.paid ? account.plan : "free";
  const requestedPlan = pending ? account?.requested_plan ?? "" : "";

  const choose = async (planId: string) => {
    setBusy(planId);
    setError("");
    try {
      await onChoose(planId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t.plans.error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h2 className="text-heading text-ink">{t.plans.title}</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{t.plans.subtitle}</p>

      {pending && account && (
        <PaymentPanel account={account} plans={plans} onSubmitReceipt={onSubmitReceipt} onCancel={onCancel} />
      )}

      {!pending && account?.rejection_reason && (
        <div className="mt-5 flex items-start gap-3 rounded-lg bg-white p-4 shadow-card">
          <AlertCircle className="mt-px h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-ink">{t.plans.adminNote}</p>
            <p className="mt-0.5 text-ink-body">{account.rejection_reason}</p>
            <p className="mt-1 text-xs text-ink-muted">{t.plans.tryAgain}</p>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-1.5 text-sm text-red-700">
          <AlertCircle className="mt-px h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.id && (plan.id === "free" ? !!account : !!account?.paid);
          const isRequested = requestedPlan === plan.id;
          const isFree = plan.id === "free";

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-lg bg-white p-5 ${
                plan.highlight ? "shadow-float" : "shadow-card"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-2.5 left-5 rounded bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {t.plans.popular}
                </span>
              )}

              <div className="flex items-center gap-2">
                <p className="text-subhead text-ink">{plan.name}</p>
                {plan.ia && (
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand-700">
                    {plan.ia === "total" ? t.plans.iaTotal : t.plans.iaCritico}
                  </span>
                )}
              </div>

              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-title text-ink">${plan.usd}</span>
                <span className="text-xs text-ink-faint">USD {plan.period}</span>
              </p>

              {plan.iaClaim && (
                <p className="mt-3 flex items-start gap-1.5 rounded bg-surface-muted p-3 text-xs leading-relaxed text-ink-body">
                  <Sparkles className="mt-px h-3.5 w-3.5 shrink-0 text-brand-600" strokeWidth={2} aria-hidden />
                  <span>{plan.iaClaim}</span>
                </p>
              )}

              <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-body">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.2} aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <span className="flex items-center justify-center gap-1.5 rounded bg-brand-50 py-2 text-sm font-semibold text-brand-700">
                    <Check className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                    {t.plans.currentPlan}
                  </span>
                ) : isFree ? (
                  <span className="block py-2 text-center text-sm text-ink-faint">—</span>
                ) : isRequested ? (
                  <span className="flex items-center justify-center gap-1.5 rounded bg-surface-muted py-2 text-xs font-semibold text-ink-muted">
                    <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    {t.plans.requested}
                  </span>
                ) : !isLoggedIn ? (
                  <span className="block py-2 text-center text-xs text-ink-faint">{t.plans.loginFirst}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => choose(plan.id)}
                    disabled={busy !== null}
                    className={`w-full ${plan.highlight ? BTN_PRIMARIO : BTN_SECUNDARIO}`}
                  >
                    {busy === plan.id && <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />}
                    {busy === plan.id ? t.plans.choosing : pending ? t.plans.switchPlan : t.plans.choose}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PaymentPanelProps {
  account: AccountStatus;
  plans: PlanDef[];
  onSubmitReceipt: (receipt: string) => Promise<void>;
  onCancel: () => Promise<void>;
}

/** Panel de compra: lo que el usuario necesita para pagar y lo que deja de constancia. */
function PaymentPanel({ account, plans, onSubmitReceipt, onCancel }: PaymentPanelProps) {
  const { t, lang } = useLanguage();
  const [receipt, setReceipt] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const plan = plans.find((p) => p.id === account.requested_plan);
  const amount = account.requested_amount_usd ?? plan?.usd ?? 0;
  const ref = account.payment_ref ?? "";
  const fecha = fechaCorta(account.requested_at, lang);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sin portapapeles (http o permiso denegado): la referencia sigue a la vista */
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const limpio = receipt.trim();
    if (!limpio) return;
    setSending(true);
    setError("");
    try {
      await onSubmitReceipt(limpio);
      setReceipt("");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.plans.error);
    } finally {
      setSending(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    setError("");
    try {
      await onCancel();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.plans.error);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <section className="mt-6 rounded-lg bg-white p-5 shadow-float sm:p-6" aria-labelledby="pago-titulo">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-brand-50">
          <Receipt className="h-4 w-4 text-brand-600" strokeWidth={2} aria-hidden />
        </span>
        <div>
          <h3 id="pago-titulo" className="text-subhead text-ink">
            {t.plans.payTitle}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t.plans.paySubtitle}</p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-ink-muted">{t.plans.payPlan}</dt>
          <dd className="mt-1 text-sm font-semibold text-ink">{plan?.name ?? account.requested_plan}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">{t.plans.payAmount}</dt>
          <dd className="mt-1 text-sm font-semibold text-ink">{t.plans.payMonthly(amount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">{t.plans.payRef}</dt>
          <dd className="mt-1 flex items-center gap-2">
            <span className="font-mono text-sm font-semibold tracking-wide text-ink">{ref}</span>
            {ref && (
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 rounded border border-black/10 bg-white px-2 py-1 text-xs font-semibold text-ink-body transition hover:border-brand-600 hover:text-brand-700"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                )}
                {copied ? t.plans.copied : t.plans.copy}
              </button>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-ink-faint">{t.plans.payRefHint}</p>

      {account.payment_instructions && (
        <div className="mt-5 rounded bg-surface-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t.plans.payHow}</p>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-body">
            {account.payment_instructions}
          </p>
        </div>
      )}

      <form onSubmit={send} className="mt-5">
        <label htmlFor="comprobante" className="mb-1.5 block text-xs text-ink-muted">
          {t.plans.receiptLabel}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="comprobante"
            value={receipt}
            onChange={(e) => setReceipt(e.target.value)}
            maxLength={120}
            placeholder={t.plans.receiptPlaceholder}
            className={CAMPO}
          />
          <button type="submit" disabled={sending || !receipt.trim()} className={`${BTN_PRIMARIO} shrink-0`}>
            {sending && <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />}
            {account.payment_receipt ? t.plans.receiptUpdate : t.plans.receiptSend}
          </button>
        </div>
        {account.payment_receipt && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-brand-700">
            <Check className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
            {t.plans.receiptSaved(account.payment_receipt)}
          </p>
        )}
      </form>

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-red-700">
          <AlertCircle className="mt-px h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-black/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          {fecha ? `${t.plans.requestedOn(fecha)} · ` : ""}
          {t.plans.waiting}
        </p>
        <button type="button" onClick={cancel} disabled={cancelling} className={`${BTN_SECUNDARIO} shrink-0`}>
          {cancelling ? (
            <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          )}
          {cancelling ? t.plans.cancelling : t.plans.cancelRequest}
        </button>
      </div>
    </section>
  );
}
