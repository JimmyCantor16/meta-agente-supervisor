import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, Check, Inbox, LoaderCircle, RotateCw, Undo2, Users, X } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import {
  ACCOUNT_CHANGED_EVENT,
  adminApprove,
  adminListPaid,
  adminListPending,
  adminReject,
  adminRevoke,
} from "../../../lib/api";
import type { AccountStatus } from "../../auth/types";
import { fechaCorta } from "./PlansView";

interface AdminViewProps {
  /** Avisa al layout de cuántas solicitudes quedan (para el contador del menú). */
  onPendingCount?: (n: number) => void;
}

/** Planes que el admin puede activar al aprobar (mismos ids que `domain/planes.py`). */
const PLANES_DE_PAGO = [
  { id: "pro", nombre: "Pro", usd: 9 },
  { id: "studio", nombre: "Studio", usd: 19 },
  { id: "business", nombre: "Business", usd: 29 },
];

const nombrePlan = (id: string) => PLANES_DE_PAGO.find((p) => p.id === id)?.nombre ?? (id || "—");

const BTN_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 rounded bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 rounded border border-black/10 bg-white px-3.5 py-2 text-sm font-semibold text-ink-body transition hover:border-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_PELIGRO =
  "inline-flex items-center justify-center gap-1.5 rounded border border-red-200 bg-white px-3.5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40";
const CAMPO =
  "w-full rounded border border-black/10 bg-white px-3 py-2 text-sm text-ink-body transition placeholder:text-ink-faint focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15";

/**
 * Panel del super-admin: solicitudes de plan pendientes (aprobar, cambiando el
 * plan si hace falta, o rechazar con motivo) y usuarios de pago (revocar).
 *
 * Se refresca solo cuando llega un aviso de cuenta por el WebSocket.
 */
export function AdminView({ onPendingCount }: AdminViewProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"pending" | "paid">("pending");
  const [pending, setPending] = useState<AccountStatus[]>([]);
  const [paid, setPaid] = useState<AccountStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([adminListPending(), adminListPaid()])
      .then(([p, q]) => {
        setPending(p);
        setPaid(q);
        setError("");
        onPendingCount?.(p.length);
      })
      .catch((e) => setError(e instanceof Error && e.message ? e.message : t.admin.error))
      .finally(() => setLoading(false));
  }, [onPendingCount, t.admin.error]);

  useEffect(() => {
    load();
    window.addEventListener(ACCOUNT_CHANGED_EVENT, load);
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, load);
  }, [load]);

  /** Ejecuta una acción del admin y recarga; el error queda a la vista. */
  const run = async (accion: () => Promise<unknown>) => {
    setError("");
    try {
      await accion();
      load();
      return true;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t.admin.error);
      return false;
    }
  };

  const tabs = [
    { id: "pending" as const, label: t.admin.tabPending, n: pending.length, Icon: Inbox },
    { id: "paid" as const, label: t.admin.tabPaid, n: paid.length, Icon: Users },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-heading text-ink">{t.admin.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{t.admin.subtitle}</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className={BTN_SECUNDARIO}>
          <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={2.2} aria-hidden />
          {t.admin.refresh}
        </button>
      </div>

      <div className="mt-5 flex gap-1 border-b border-black/10" role="tablist">
        {tabs.map(({ id, label, n, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition ${
              tab === id ? "border-brand-600 text-brand-700" : "border-transparent text-ink-muted hover:text-ink-body"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
            {label}
            <span
              className={`rounded px-1.5 text-xs ${
                tab === id ? "bg-brand-50 text-brand-700" : "bg-surface-muted text-ink-muted"
              }`}
            >
              {n}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-1.5 text-sm text-red-700">
          <AlertCircle className="mt-px h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {error}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {loading && pending.length === 0 && paid.length === 0 ? (
          <div className="flex justify-center py-10">
            <LoaderCircle className="h-6 w-6 animate-spin text-brand-600" strokeWidth={2} aria-hidden />
          </div>
        ) : tab === "pending" ? (
          pending.length === 0 ? (
            <Vacio texto={t.admin.empty} />
          ) : (
            pending.map((u) => <SolicitudPendiente key={u.sub} u={u} run={run} />)
          )
        ) : paid.length === 0 ? (
          <Vacio texto={t.admin.emptyPaid} />
        ) : (
          paid.map((u) => <UsuarioDePago key={u.sub} u={u} run={run} />)
        )}
      </div>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-black/10 bg-white p-8 text-center text-sm text-ink-faint">
      {texto}
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{etiqueta}</dt>
      <dd className="mt-0.5 truncate text-sm text-ink-body">{children}</dd>
    </div>
  );
}

interface FilaProps {
  u: AccountStatus;
  run: (accion: () => Promise<unknown>) => Promise<boolean>;
}

function SolicitudPendiente({ u, run }: FilaProps) {
  const { t, lang } = useLanguage();
  const [plan, setPlan] = useState(u.requested_plan || "pro");
  const [busy, setBusy] = useState<"" | "approve" | "reject">("");
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const aprobar = async () => {
    setBusy("approve");
    await run(() => adminApprove(u.sub, plan));
    setBusy("");
  };
  const rechazar = async () => {
    setBusy("reject");
    if (await run(() => adminReject(u.sub, motivo.trim()))) setRechazando(false);
    setBusy("");
  };

  const importe = PLANES_DE_PAGO.find((p) => p.id === plan)?.usd ?? u.requested_amount_usd ?? 0;

  return (
    <article className="rounded-lg bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{u.name || u.email}</p>
          <p className="truncate text-xs text-ink-faint">{u.email}</p>
        </div>
        <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
          {nombrePlan(u.requested_plan)} · US$ {u.requested_amount_usd ?? 0}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta={t.admin.ref}>
          <span className="font-mono font-semibold text-ink">{u.payment_ref || "—"}</span>
        </Dato>
        <Dato etiqueta={t.admin.receipt}>
          {u.payment_receipt ? (
            <span className="font-mono">{u.payment_receipt}</span>
          ) : (
            <span className="text-ink-faint">{t.admin.noReceipt}</span>
          )}
        </Dato>
        <Dato etiqueta={t.admin.requestedAt}>{fechaCorta(u.requested_at, lang) || "—"}</Dato>
        <Dato etiqueta={t.admin.currentPlan}>{u.paid ? nombrePlan(u.plan) : "Free"}</Dato>
      </dl>
      <p className="mt-2 text-xs text-ink-faint">{t.admin.usage(u.generations_used, u.lessons_used)}</p>

      {rechazando ? (
        <div className="mt-4 border-t border-black/10 pt-4">
          <label htmlFor={`motivo-${u.sub}`} className="mb-1.5 block text-xs text-ink-muted">
            {t.admin.rejectReason}
          </label>
          <input
            id={`motivo-${u.sub}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
            placeholder={t.admin.rejectPlaceholder}
            className={CAMPO}
            autoFocus
          />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setRechazando(false)} className={BTN_SECUNDARIO}>
              {t.admin.cancel}
            </button>
            <button type="button" onClick={rechazar} disabled={busy !== ""} className={BTN_PELIGRO}>
              {busy === "reject" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
              ) : (
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              )}
              {busy === "reject" ? t.admin.rejecting : t.admin.confirmReject}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2 border-t border-black/10 pt-4 sm:flex-row sm:items-center sm:justify-end">
          <label className="flex items-center gap-2 text-xs text-ink-muted sm:mr-auto">
            {t.admin.approveAs}
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="rounded border border-black/10 bg-white px-2 py-1.5 text-sm text-ink-body focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            >
              {PLANES_DE_PAGO.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · US$ {p.usd}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setRechazando(true)} disabled={busy !== ""} className={BTN_SECUNDARIO}>
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t.admin.reject}
          </button>
          <button type="button" onClick={aprobar} disabled={busy !== ""} className={BTN_PRIMARIO}>
            {busy === "approve" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <Check className="h-4 w-4" strokeWidth={2.2} aria-hidden />
            )}
            {busy === "approve" ? t.admin.approving : `${t.admin.approve} · US$ ${importe}`}
          </button>
        </div>
      )}
    </article>
  );
}

function UsuarioDePago({ u, run }: FilaProps) {
  const { t, lang } = useLanguage();
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  const revocar = async () => {
    setBusy(true);
    if (await run(() => adminRevoke(u.sub, motivo.trim()))) setConfirmando(false);
    setBusy(false);
  };

  return (
    <article className="rounded-lg bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{u.name || u.email}</p>
          <p className="truncate text-xs text-ink-faint">{u.email}</p>
        </div>
        <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
          {u.plan_nombre || nombrePlan(u.plan)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Dato etiqueta={t.admin.since}>{fechaCorta(u.approved_at, lang) || "—"}</Dato>
        <Dato etiqueta={t.admin.approvedBy}>{u.approved_by || "—"}</Dato>
        <Dato etiqueta={t.admin.ref}>
          <span className="font-mono">{u.payment_ref || "—"}</span>
        </Dato>
      </dl>
      <p className="mt-2 text-xs text-ink-faint">{t.admin.usage(u.generations_used, u.lessons_used)}</p>

      {confirmando ? (
        <div className="mt-4 border-t border-black/10 pt-4">
          <p className="text-sm font-semibold text-ink">{t.admin.revokeQuestion}</p>
          <label htmlFor={`revoca-${u.sub}`} className="mb-1.5 mt-3 block text-xs text-ink-muted">
            {t.admin.revokeReason}
          </label>
          <input
            id={`revoca-${u.sub}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
            className={CAMPO}
          />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setConfirmando(false)} className={BTN_SECUNDARIO}>
              {t.admin.cancel}
            </button>
            <button type="button" onClick={revocar} disabled={busy} className={BTN_PELIGRO}>
              {busy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
              ) : (
                <Undo2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              )}
              {busy ? t.admin.revoking : t.admin.confirmRevoke}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex justify-end border-t border-black/10 pt-4">
          <button type="button" onClick={() => setConfirmando(true)} className={BTN_PELIGRO}>
            <Undo2 className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t.admin.revoke}
          </button>
        </div>
      )}
    </article>
  );
}
