import { useEffect, useState } from "react";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { GoogleLoginButton } from "../../auth/GoogleLoginButton";
import { useLanguage } from "../../../i18n/LanguageProvider";
import type { AccountStatus } from "../../auth/types";
import { progressSocketUrl } from "../../../lib/api";
import { useAdjustModule } from "../hooks/useAdjustModule";
import { useAuditProject } from "../hooks/useAuditProject";
import { useExplainProject } from "../hooks/useExplainProject";
import { useGenerateProject } from "../hooks/useGenerateProject";
import { useImproveProject } from "../hooks/useImproveProject";
import type {
  AuditSuggestion,
  CambioArchivo,
  EvaluationResult,
  MejoraResult,
  NivelAutonomia,
} from "../types";

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

  // --- Pre-Flight: respuestas del usuario a las preguntas de aterrizaje ---
  const preguntas = evaluation.preguntas_para_el_usuario ?? [];
  const plantillas = evaluation.plantillas ?? [];
  const [marcadas, setMarcadas] = useState<Record<number, string[]>>({});
  const [otros, setOtros] = useState<Record<number, string>>({});
  const [plantillasSel, setPlantillasSel] = useState<number[]>([]);
  const [referenciaPropia, setReferenciaPropia] = useState("");
  useEffect(() => {
    setMarcadas({});
    setOtros({});
    setPlantillasSel([]);
    setReferenciaPropia("");
  }, [evaluation.id]);

  const toggleOpcion = (i: number, opcion: string) =>
    setMarcadas((prev) => {
      const actual = prev[i] ?? [];
      return {
        ...prev,
        [i]: actual.includes(opcion)
          ? actual.filter((o) => o !== opcion)
          : [...actual, opcion],
      };
    });

  const togglePlantilla = (i: number) =>
    setPlantillasSel((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );

  // El prompt que se genera lleva las respuestas del usuario incrustadas:
  // datos reales en vez de relleno inventado.
  const contestadas = preguntas
    .map((q, i) => {
      const partes = [...(marcadas[i] ?? [])];
      const otro = (otros[i] ?? "").trim();
      if (otro) partes.push(otro);
      return { q: q.texto, a: partes.join("; ") };
    })
    .filter((par) => par.a.length > 0);

  const bloques: string[] = [];
  if (contestadas.length > 0) {
    bloques.push(
      `${t.preflight.dataHeader}\n${contestadas.map((par) => `- ${par.q}: ${par.a}`).join("\n")}`
    );
  }
  const elegidas = plantillasSel.map((i) => plantillas[i]).filter(Boolean);
  const referencia = referenciaPropia.trim();
  if (elegidas.length > 0 || referencia) {
    const lineas = elegidas.map(
      (p) => `- ${p.nombre} (${p.estilo}): ${p.descripcion} Paleta: ${p.colores.join(", ")}`
    );
    if (elegidas.length > 1) lineas.push(t.plantillas.combineNote);
    if (referencia) lineas.push(`${t.plantillas.refNote} ${referencia}`);
    bloques.push(`${t.plantillas.dataHeader}\n${lineas.join("\n")}`);
  }
  const promptEnriquecido =
    bloques.length === 0
      ? prompt_final_optimizado
      : `${prompt_final_optimizado}\n\n${bloques.join("\n\n")}`;

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

      {/* Pre-Flight: la conversación que aterriza la idea con datos reales */}
      {preguntas.length > 0 && (
        <Card title={t.preflight.title} icon={<span>💬</span>}>
          <p className="mb-4 text-sm text-slate-500">{t.preflight.hint}</p>
          <div className="space-y-5">
            {preguntas.map((pregunta, i) => (
              <div key={i} className="space-y-2">
                {/* Burbuja del agente */}
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-brand-100 bg-brand-50 px-4 py-2.5 text-sm text-brand-900">
                  {pregunta.texto}
                </div>
                {/* Respuesta: opciones marcables + campo libre opcional */}
                <div className="ml-auto w-[85%] space-y-2">
                  {pregunta.opciones.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {pregunta.opciones.map((opcion) => {
                        const activa = (marcadas[i] ?? []).includes(opcion);
                        return (
                          <label
                            key={opcion}
                            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                              activa
                                ? "border-brand-400 bg-brand-50 text-brand-800"
                                : "border-slate-200 bg-white text-slate-600 hover:border-brand-200"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={activa}
                              onChange={() => toggleOpcion(i, opcion)}
                              className="h-4 w-4 accent-brand-600"
                            />
                            {opcion}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {(pregunta.permite_otro || pregunta.opciones.length === 0) && (
                    <input
                      type="text"
                      value={otros[i] ?? ""}
                      onChange={(e) => setOtros((prev) => ({ ...prev, [i]: e.target.value }))}
                      placeholder={
                        pregunta.opciones.length > 0
                          ? t.preflight.otherPlaceholder
                          : t.preflight.answerPlaceholder
                      }
                      className="block w-full rounded-2xl rounded-br-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs font-medium text-slate-400">
            {t.preflight.answeredNote(contestadas.length, preguntas.length)}
          </p>
        </Card>
      )}

      {/* Plantillas: elige una, combina varias, o trae tu propia referencia */}
      {plantillas.length > 0 && (
        <Card title={t.plantillas.title} icon={<span>🎨</span>}>
          <p className="mb-4 text-sm text-slate-500">{t.plantillas.hint}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plantillas.map((p, i) => {
              const activa = plantillasSel.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => togglePlantilla(i)}
                  aria-pressed={activa}
                  className={`rounded-2xl border-2 p-4 text-left transition ${
                    activa
                      ? "border-brand-500 bg-brand-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-brand-200"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">{p.nombre}</span>
                    {activa && <span aria-hidden>✅</span>}
                  </div>
                  <div className="mb-2 flex gap-1.5">
                    {p.colores.map((c) => (
                      <span
                        key={c}
                        title={c}
                        className="h-6 w-6 rounded-full border border-slate-200"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-slate-500">{p.descripcion}</p>
                  {p.estilo && (
                    <p className="mt-1.5 text-xs font-medium uppercase tracking-wide text-brand-600">
                      {p.estilo}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          {plantillasSel.length > 1 && (
            <p className="mt-3 text-sm font-medium text-brand-700">🧬 {t.plantillas.combining}</p>
          )}
          <input
            type="text"
            value={referenciaPropia}
            onChange={(e) => setReferenciaPropia(e.target.value)}
            placeholder={t.plantillas.refPlaceholder}
            className="mt-4 block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </Card>
      )}

      <PromptFinalBlock prompt={prompt_final_optimizado} />

      <GenerateProjectSection
        prompt={promptEnriquecido}
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
  const [modoInquieto, setModoInquieto] = useState(true);
  // Consola en vivo: mientras se genera, un WebSocket narra cada paso.
  const [progreso, setProgreso] = useState<string[]>([]);

  useEffect(() => {
    if (data) onAfterGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (!loading) return;
    setProgreso([]);
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(progressSocketUrl());
      socket.onmessage = (ev) =>
        setProgreso((prev) => [...prev.slice(-60), String(ev.data)]);
    } catch {
      // sin socket también se puede vivir: queda el spinner de siempre
    }
    return () => {
      if (socket) socket.close();
    };
  }, [loading]);

  useEffect(() => {
    const caja = document.getElementById("consola-progreso");
    if (caja) caja.scrollTop = caja.scrollHeight;
  }, [progreso]);

  return (
    <Card title={t.dashboard.generatedTitle} icon={<span>🏗️</span>}>
      <p className="mb-4 text-sm text-slate-500">{t.dashboard.generateHint}</p>

      {!isLoggedIn ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-4">
          <p className="text-sm text-brand-700">🔐 {t.account.loginToGenerate}</p>
          <GoogleLoginButton />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={() => generate(prompt, modoInquieto)} loading={loading}>
            {loading ? t.dashboard.generating : t.dashboard.generateButton}
          </Button>
          <label
            className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600"
            title={t.dashboard.inquietoHint}
          >
            <input
              type="checkbox"
              checked={modoInquieto}
              onChange={(e) => setModoInquieto(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            ⚡ {t.dashboard.inquietoLabel}
          </label>
        </div>
      )}

      {/* Consola en vivo: el sistema narra su construcción por WebSocket */}
      {loading && progreso.length > 0 && (
        <div
          id="consola-progreso"
          className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-emerald-300"
          aria-live="polite"
        >
          {progreso.map((linea, i) => (
            <div key={i} className={i === progreso.length - 1 ? "text-emerald-100" : ""}>
              {linea}
            </div>
          ))}
        </div>
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

          {/* El entregable: tu sistema YA corriendo, listo para abrir */}
          {data.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border-2 border-emerald-300 bg-emerald-50 px-5 py-4 text-center transition hover:bg-emerald-100"
            >
              <span className="block text-base font-bold text-emerald-800">
                🚀 {t.dashboard.projectRunning}
              </span>
              <span className="mt-1 block font-mono text-sm text-emerald-700 underline">
                {data.url}
              </span>
            </a>
          )}

          {/* Los usuarios de prueba se muestran AQUÍ: quien va a probar el
              sistema no debería tener que abrir un archivo para entrar. */}
          {data.manual && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="mb-2 text-sm font-bold text-sky-900">
                📋 {t.dashboard.howToUse}
              </p>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-sky-900">
                {data.manual}
              </pre>
            </div>
          )}

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

          {/* SIEMPRE al final: dónde quedó tu proyecto. Con URL, enlace grande;
              sin URL, la verdad y qué sigue — nunca silencio. */}
          {data.url ? (
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border-2 border-emerald-300 bg-emerald-50 px-5 py-4 text-center transition hover:bg-emerald-100"
            >
              <span className="block text-sm font-semibold text-emerald-700">
                🔗 {t.dashboard.finalUrlLabel}
              </span>
              <span className="mt-1 block font-mono text-base font-bold text-emerald-800 underline">
                {data.url}
              </span>
            </a>
          ) : (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-5 py-4 text-center">
              <span className="block text-sm font-semibold text-amber-800">
                ⚠️ {t.dashboard.noUrl}
              </span>
            </div>
          )}
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

export function AuditSubsection({ projectName }: { projectName: string }) {
  const { t } = useLanguage();
  const { data, loading, error, audit } = useAuditProject();
  const improve = useImproveProject();

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

          {/* La respuesta a "¿y quién las implementa?": el propio agente,
              verificando cada cambio y revirtiendo lo que rompa. */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="mb-2 text-sm text-emerald-800">{t.dashboard.improveHint}</p>
            <Button onClick={() => improve.improve(projectName)} loading={improve.loading}>
              {improve.loading ? t.dashboard.improving : t.dashboard.improveButton}
            </Button>
            {improve.error && <p className="mt-2 text-red-600">⚠ {improve.error}</p>}
            {improve.data && !improve.loading && <MejoraResumen data={improve.data} />}
          </div>
        </div>
      )}
    </div>
  );
}

function MejoraResumen({ data }: { data: MejoraResult }) {
  const { t } = useLanguage();
  const vacio =
    data.aplicadas.length === 0 && data.revertidas.length === 0 && data.sin_cambios.length === 0;
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="italic text-slate-600">
        <span className="font-semibold not-italic text-emerald-800">
          {t.dashboard.improveDiagnosis}:
        </span>{" "}
        {data.diagnostico}
      </p>
      {vacio && <p className="text-slate-500">{t.dashboard.improveNothing}</p>}
      {data.aplicadas.length > 0 && (
        <ResultadoLista titulo={t.dashboard.improveApplied} items={data.aplicadas} icon="✅" />
      )}
      {data.revertidas.length > 0 && (
        <ResultadoLista titulo={t.dashboard.improveReverted} items={data.revertidas} icon="↩️" />
      )}
      {data.sin_cambios.length > 0 && (
        <ResultadoLista titulo={t.dashboard.improveNoChanges} items={data.sin_cambios} icon="⏭" />
      )}
    </div>
  );
}

function ResultadoLista({ titulo, items, icon }: { titulo: string; items: string[]; icon: string }) {
  return (
    <div>
      <p className="font-semibold text-slate-700">{titulo}</p>
      <ul className="mt-1 space-y-1 text-slate-600">
        {items.map((it, i) => (
          <li key={i}>
            {icon} {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TeacherSubsection({ projectName }: { projectName: string }) {
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

      <AdjustPanel projectName={projectName} />
    </div>
  );
}

/** Panel del ajuste de clase: el alumno pide un cambio y elige la autonomía. */
function AdjustPanel({ projectName }: { projectName: string }) {
  const { t } = useLanguage();
  const [ajuste, setAjuste] = useState("");
  const { data, loading, activeNivel, error, adjust } = useAdjustModule();

  // Si hay una propuesta revisada para ESTE mismo ajuste, "Hazlo tú" la
  // aplica byte a byte (contrato de aplicación exacta): lo aprobado es lo
  // aplicado, sin volver a llamar a la IA.
  const propuestaVigente =
    data && data.nivel === "proponer" && data.propuesta_id && data.ajuste === ajuste.trim()
      ? data.propuesta_id
      : null;

  const lanzar = (nivel: NivelAutonomia) => {
    if (ajuste.trim().length === 0 || loading) return;
    void adjust(
      projectName,
      ajuste.trim(),
      nivel,
      nivel === "ejecutar" ? propuestaVigente : null
    );
  };

  const botones: Array<{ nivel: NivelAutonomia; label: string }> = [
    { nivel: "explicar", label: t.dashboard.adjustExplain },
    { nivel: "proponer", label: t.dashboard.adjustPropose },
    { nivel: "ejecutar", label: t.dashboard.adjustExecute },
  ];

  return (
    <div className="mt-4 rounded-xl border border-brand-100 bg-white p-4">
      <p className="text-sm font-bold text-slate-700">🛠 {t.dashboard.adjustTitle}</p>
      <p className="mt-1 text-sm text-slate-500">{t.dashboard.adjustHint}</p>

      <textarea
        value={ajuste}
        onChange={(e) => setAjuste(e.target.value)}
        placeholder={t.dashboard.adjustPlaceholder}
        rows={2}
        className="mt-3 w-full resize-y rounded-lg border border-slate-200 p-2.5 text-sm text-slate-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        {botones.map(({ nivel, label }) => (
          <Button
            key={nivel}
            variant={nivel === "ejecutar" ? "primary" : "ghost"}
            onClick={() => lanzar(nivel)}
            loading={loading && activeNivel === nivel}
            disabled={ajuste.trim().length === 0 || loading}
          >
            {label}
          </Button>
        ))}
      </div>
      {loading && (
        <p className="mt-2 text-sm text-slate-500">
          {activeNivel === "ejecutar" ? t.dashboard.adjustWorkingExec : t.dashboard.adjustWorking}
        </p>
      )}
      {error && <p className="mt-2 text-red-600">⚠ {error}</p>}

      {data && !loading && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="whitespace-pre-wrap text-slate-700">{data.explicacion}</p>
          {data.concepto && (
            <p className="text-slate-600">
              <span className="font-semibold text-brand-700">📚 {t.dashboard.adjustConcept}:</span>{" "}
              {data.concepto}
            </p>
          )}

          {data.nivel === "ejecutar" &&
            (data.revertido ? (
              <p className="rounded-lg bg-amber-50 p-2.5 font-medium text-amber-800">
                {t.dashboard.adjustReverted}
              </p>
            ) : data.aplicado && data.verificado ? (
              <p className="rounded-lg bg-emerald-50 p-2.5 font-medium text-emerald-800">
                {t.dashboard.adjustApplied}
              </p>
            ) : null)}
          {data.nivel === "proponer" && data.cambios.length > 0 && (
            <p className="rounded-lg bg-sky-50 p-2.5 text-sky-800">
              {t.dashboard.adjustProposed}
              {data.propuesta_id && (
                <span className="mt-1 block text-xs text-sky-600">
                  🔏 {t.dashboard.adjustExactNote}
                </span>
              )}
            </p>
          )}
          {data.detalle && <p className="text-xs italic text-slate-400">{data.detalle}</p>}

          {data.cambios.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
                🗂 {t.dashboard.adjustChanges}
              </p>
              <div className="space-y-2">
                {data.cambios.map((c: CambioArchivo) => (
                  <details key={c.path} className="rounded-lg border border-slate-200 bg-slate-50">
                    <summary className="cursor-pointer px-3 py-2 font-mono text-xs text-slate-600">
                      {c.path}
                      {c.es_nuevo && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                          {t.dashboard.adjustNewFile}
                        </span>
                      )}
                    </summary>
                    <pre className="max-h-72 overflow-auto border-t border-slate-200 bg-slate-900 p-3 text-xs leading-relaxed">
                      {(c.diff || c.contenido_nuevo).split("\n").map((linea, i) => (
                        <div key={i} className={diffTone(linea)}>
                          {linea || " "}
                        </div>
                      ))}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Colorea cada línea del diff unificado como en un visor de cambios. */
function diffTone(linea: string): string {
  if (linea.startsWith("+") && !linea.startsWith("+++")) return "text-emerald-400";
  if (linea.startsWith("-") && !linea.startsWith("---")) return "text-red-400";
  if (linea.startsWith("@@")) return "text-sky-400";
  return "text-slate-300";
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
