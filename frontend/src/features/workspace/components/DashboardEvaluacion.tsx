import { useEffect, useState } from "react";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { GoogleLoginButton } from "../../auth/GoogleLoginButton";
import { useLanguage } from "../../../i18n/LanguageProvider";
import type { AccountStatus } from "../../auth/types";
import { useAuditProject } from "../hooks/useAuditProject";
import { useExplainProject } from "../hooks/useExplainProject";
import { useGenerateProject } from "../hooks/useGenerateProject";
import type { AuditSuggestion, EvaluationResult } from "../types";

interface DashboardEvaluacionProps {
  evaluation: EvaluationResult;
  feedback: boolean | null;
  onFeedback: (helpful: boolean) => void;
  teacherMode: boolean;
  /** True si el usuario inició sesión. */
  isLoggedIn: boolean;
  /** Estado de la cuenta (para mostrar pendiente de pago). */
  account: AccountStatus | null;
  /** Se llama tras generar (refresca galería + cuenta). */
  onAfterGenerate: () => void;
  /** El usuario solicita continuar (plan). */
  onRequestUpgrade: (plan?: string) => Promise<void>;
  /** Navega a la página de Planes. */
  onViewPlans: () => void;
}

export function DashboardEvaluacion({
  evaluation,
  feedback,
  onFeedback,
  teacherMode,
  isLoggedIn,
  account,
  onAfterGenerate,
  onRequestUpgrade,
  onViewPlans,
}: DashboardEvaluacionProps) {
  const { t } = useLanguage();
  const { status, analisis_critico, sugerencias_mejora, prompt_final_optimizado } = evaluation;
  const needsChanges = status === "sugerir_ajustes";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-500">{t.dashboard.verdict}</span>
        {needsChanges ? (
          <Badge tone="warning">{t.dashboard.needsChanges}</Badge>
        ) : (
          <Badge tone="success">{t.dashboard.approved}</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={t.dashboard.criticalAnalysis} icon={<span>🧠</span>}>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {analisis_critico}
          </p>
        </Card>

        <Card title={t.dashboard.suggestions} icon={<span>💡</span>}>
          {sugerencias_mejora.length === 0 ? (
            <p className="text-sm text-slate-400">{t.dashboard.noSuggestions}</p>
          ) : (
            <ul className="space-y-2.5">
              {sugerencias_mejora.map((s, i) => (
                <li
                  key={i}
                  className={`flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${
                    needsChanges
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <span className={needsChanges ? "text-amber-500" : "text-brand-500"} aria-hidden>
                    ▸
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <PromptFinalBlock prompt={prompt_final_optimizado} />

      <GenerateProjectSection
        prompt={prompt_final_optimizado}
        teacherMode={teacherMode}
        isLoggedIn={isLoggedIn}
        account={account}
        onAfterGenerate={onAfterGenerate}
        onRequestUpgrade={onRequestUpgrade}
        onViewPlans={onViewPlans}
      />

      {/* Feedback */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:justify-between">
        <span className="text-sm text-slate-500">{t.dashboard.feedbackQuestion}</span>
        {feedback === null ? (
          <div className="flex gap-2">
            <button
              onClick={() => onFeedback(true)}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              {t.dashboard.feedbackYes}
            </button>
            <button
              onClick={() => onFeedback(false)}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              {t.dashboard.feedbackNo}
            </button>
          </div>
        ) : (
          <span className="text-sm font-medium text-emerald-600">{t.dashboard.feedbackThanks}</span>
        )}
      </div>
    </div>
  );
}

function priorityTone(priority: string): string {
  const p = priority.toLowerCase();
  if (p.startsWith("alt") || p.startsWith("hig")) return "bg-red-50 text-red-700 ring-red-200";
  if (p.startsWith("med")) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function GenerateProjectSection({
  prompt,
  teacherMode,
  isLoggedIn,
  account,
  onAfterGenerate,
  onRequestUpgrade,
  onViewPlans,
}: {
  prompt: string;
  teacherMode: boolean;
  isLoggedIn: boolean;
  account: AccountStatus | null;
  onAfterGenerate: () => void;
  onRequestUpgrade: (plan?: string) => Promise<void>;
  onViewPlans: () => void;
}) {
  const { t } = useLanguage();
  const { data, loading, error, licenseRequired, generate } = useGenerateProject();

  useEffect(() => {
    if (data) onAfterGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <Card title={t.dashboard.generatedTitle} icon={<span>🏗️</span>}>
      <p className="mb-4 text-sm text-slate-500">{t.dashboard.generateHint}</p>

      {!isLoggedIn ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-4">
          <p className="text-sm text-brand-700">🔐 {t.account.loginToGenerate}</p>
          <GoogleLoginButton />
        </div>
      ) : (
        <Button onClick={() => generate(prompt)} loading={loading}>
          {loading ? t.dashboard.generating : t.dashboard.generateButton}
        </Button>
      )}

      {/* Bloqueo por límite: panel de pago / pendiente */}
      {licenseRequired && (
        <PaymentPanel account={account} onRequestUpgrade={onRequestUpgrade} onViewPlans={onViewPlans} />
      )}

      {error && !licenseRequired && (
        <p className="mt-3 flex items-start gap-2 text-sm text-red-600">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      )}

      {data && !loading && (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div>
            <span className="font-semibold text-slate-800">{data.name}</span>
            <span className="text-slate-500"> — {data.summary}</span>
          </div>
          <div>
            <span className="text-slate-400">{t.dashboard.generatedSavedAt}</span>
            <code className="ml-2 break-all font-mono text-slate-600">{data.output_path}</code>
          </div>
          <div>
            <span className="text-slate-400">{t.dashboard.generatedFiles}</span>
            <ul className="mt-1 grid grid-cols-1 gap-x-4 font-mono text-xs text-slate-500 sm:grid-cols-2">
              {data.files.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
          </div>

          <AuditSubsection projectName={data.name} />
          {teacherMode && <TeacherSubsection projectName={data.name} />}
        </div>
      )}
    </Card>
  );
}

/** Panel de pago cuando el usuario agota su cupo gratuito. */
function PaymentPanel({
  account,
  onViewPlans,
}: {
  account: AccountStatus | null;
  onRequestUpgrade: (plan?: string) => Promise<void>;
  onViewPlans: () => void;
}) {
  const { t } = useLanguage();
  const isPending = account?.status === "pending_payment";

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-800">🔒 {t.account.paymentTitle}</p>
      <p className="mt-1 text-sm text-amber-700">{t.account.paymentIntro}</p>

      {isPending ? (
        <p className="mt-3 text-sm font-medium text-amber-800">{t.account.pending}</p>
      ) : (
        <div className="mt-3">
          <Button onClick={onViewPlans}>💎 {t.nav.plans}</Button>
        </div>
      )}
    </div>
  );
}

function AuditSubsection({ projectName }: { projectName: string }) {
  const { t } = useLanguage();
  const { data, loading, error, audit } = useAuditProject();

  return (
    <div className="mt-2 border-t border-slate-200 pt-4">
      <p className="mb-3 text-slate-500">{t.dashboard.auditHint}</p>
      <Button variant="ghost" onClick={() => audit(projectName)} loading={loading}>
        {loading ? t.dashboard.auditing : t.dashboard.auditButton}
      </Button>

      {error && <p className="mt-3 text-red-600">⚠ {error}</p>}

      {data && !loading && (
        <div className="mt-4 space-y-3">
          <p className="italic text-slate-500">{data.summary}</p>
          <ul className="space-y-2">
            {data.suggestions.map((s: AuditSuggestion, i: number) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ring-1 ring-inset ${priorityTone(
                      s.priority
                    )}`}
                  >
                    {s.priority}
                  </span>
                  <span className="text-xs text-slate-400">{s.category}</span>
                  {s.file && <code className="font-mono text-xs text-slate-400">· {s.file}</code>}
                </div>
                <p className="mt-1.5 font-semibold text-slate-700">{s.title}</p>
                {s.suggestion && <p className="mt-1 text-slate-500">{s.suggestion}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TeacherSubsection({ projectName }: { projectName: string }) {
  const { t } = useLanguage();
  const { data, loading, error, explain } = useExplainProject();

  return (
    <div className="mt-2 border-t border-brand-100 pt-4">
      <Button variant="ghost" onClick={() => explain(projectName)} loading={loading}>
        {loading ? t.dashboard.explaining : t.dashboard.explainButton}
      </Button>

      {error && <p className="mt-3 text-red-600">⚠ {error}</p>}

      {data && !loading && (
        <div className="mt-4 space-y-4 rounded-xl border border-brand-100 bg-brand-50/50 p-4">
          <p className="text-sm text-slate-700">{data.summary}</p>
          <TeachingList title={t.dashboard.teachingSteps} items={data.steps} icon="👣" ordered />
          <TeachingList title={t.dashboard.teachingConcepts} items={data.concepts} icon="📚" />
          <TeachingList title={t.dashboard.teachingNext} items={data.next_steps} icon="🎯" />
        </div>
      )}
    </div>
  );
}

function TeachingList({
  title,
  items,
  icon,
  ordered = false,
}: {
  title: string;
  items: string[];
  icon: string;
  ordered?: boolean;
}) {
  if (items.length === 0) return null;
  const ListTag = ordered ? "ol" : "ul";
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
        {icon} {title}
      </p>
      <ListTag
        className={`space-y-1 pl-5 text-sm text-slate-600 ${ordered ? "list-decimal" : "list-disc"}`}
      >
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ListTag>
    </div>
  );
}

function PromptFinalBlock({ prompt }: { prompt: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card title={t.dashboard.finalPrompt} icon={<span>⚙️</span>}>
      <div className="relative">
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 z-10 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          {copied ? t.dashboard.copied : t.dashboard.copy}
        </button>
        <pre className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-4 pr-24 text-sm leading-relaxed text-slate-100">
          <code className="whitespace-pre-wrap break-words font-mono">{prompt}</code>
        </pre>
      </div>
    </Card>
  );
}
