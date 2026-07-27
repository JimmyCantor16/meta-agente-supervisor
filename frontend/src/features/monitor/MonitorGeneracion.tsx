import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useMonitor } from "./useMonitor";
import type { EstadoFase, Resultado } from "./useMonitor";

const COLOR_FASE: Record<EstadoFase, string> = {
  idle: "border-slate-200 bg-slate-50 text-slate-400",
  run: "border-brand-300 bg-brand-50 text-brand-700 animate-pulse",
  ok: "border-emerald-300 bg-emerald-50 text-emerald-700",
  fail: "border-red-300 bg-red-50 text-red-700",
};
const RES: Record<Resultado, { txt: string; cls: string }> = {
  idle: { txt: "En espera", cls: "bg-slate-100 text-slate-500" },
  generando: { txt: "⚙️ Generando…", cls: "bg-brand-50 text-brand-700" },
  exito: { txt: "🎉 ¡Sistema vivo!", cls: "bg-emerald-50 text-emerald-700" },
  retenido: { txt: "🛡️ Retenido (no se entregó roto)", cls: "bg-amber-50 text-amber-700" },
  fallo: { txt: "🛑 Falló", cls: "bg-red-50 text-red-700" },
};
const TIPO_LOG: Record<string, string> = {
  info: "text-slate-500",
  ok: "text-emerald-600",
  warn: "text-amber-600",
  fail: "text-red-600",
  ia: "text-brand-600",
};

/** Monitor en vivo del pipeline de generación (fases, Cerebro IA, métricas). */
export function MonitorGeneracion() {
  const { t } = useLanguage();
  const m = useMonitor();
  const [, tick] = useState(0);

  // Refresca el cronómetro cada segundo mientras genera.
  useEffect(() => {
    if (m.resultado !== "generando") return;
    const id = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [m.resultado]);

  const totalOk = m.proveedores.reduce((a, p) => a + p.ok, 0);
  const totalFail = m.proveedores.reduce((a, p) => a + p.fail, 0);
  const tasa = totalOk + totalFail > 0 ? Math.round((totalOk / (totalOk + totalFail)) * 100) : null;
  const seg = m.inicio ? Math.round(((m.fin ?? Date.now()) - m.inicio) / 1000) : 0;
  const tiempo = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
  const res = RES[m.resultado];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">📡 {t.monitor.title}</h2>
          <p className="text-sm text-slate-500">{t.monitor.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${res.cls}`}>{res.txt}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${m.conectado ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
            <span className={`h-2 w-2 rounded-full ${m.conectado ? "bg-emerald-500" : "bg-slate-300"}`} />
            {m.conectado ? t.monitor.live : t.monitor.offline}
          </span>
        </div>
      </div>

      {/* Fases */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{t.monitor.phases}</p>
        <div className="flex flex-wrap gap-2">
          {m.fases.map((f) => (
            <div key={f.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${COLOR_FASE[f.estado]}`}>
              <span aria-hidden>{f.estado === "ok" ? "✓" : f.estado === "fail" ? "✕" : f.icono}</span>
              <span>{f.nombre}</span>
              {f.detalle && <span className="text-xs opacity-70">· {f.detalle}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Métricas + Cerebro IA */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{t.monitor.metrics}</p>
          <div className="grid grid-cols-2 gap-3">
            <Metric label={t.monitor.files} value={m.archivos ? `${m.archivos.hechos}/${m.archivos.total}` : "—"} />
            <Metric label={t.monitor.repairs} value={String(m.reparaciones)} tone={m.reparaciones > 0 ? "warn" : undefined} />
            <Metric label={t.monitor.switches} value={String(m.saltos)} tone={m.saltos > 0 ? "warn" : undefined} />
            <Metric label={t.monitor.time} value={tiempo} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t.monitor.brain}</p>
            {tasa !== null && (
              <span className="text-xs font-bold text-emerald-600">{tasa}% {t.monitor.hit}</span>
            )}
          </div>
          {m.proveedorActual && (
            <p className="mb-2 text-sm text-slate-700">
              {t.monitor.current}: <b className="text-brand-700">{m.proveedorActual}</b>
            </p>
          )}
          {m.proveedores.length === 0 ? (
            <p className="text-xs text-slate-400">{t.monitor.noBrain}</p>
          ) : (
            <div className="space-y-1.5">
              {m.proveedores.map((p) => (
                <div key={p.nombre} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">🤖 {p.nombre}</span>
                  <span className="flex gap-2">
                    <span className="text-emerald-600">✓ {p.ok}</span>
                    {p.fail > 0 && <span className="text-amber-600">✕ {p.fail}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Log en vivo */}
      <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t.monitor.log}</p>
        <div className="max-h-72 space-y-1 overflow-y-auto font-mono text-xs leading-relaxed">
          {m.log.length === 0 ? (
            <p className="text-slate-500">{t.monitor.waiting}</p>
          ) : (
            m.log.map((l, i) => (
              <div key={i} className={TIPO_LOG[l.tipo] ?? "text-slate-400"}>
                <span className="text-slate-600">{new Date(l.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>{" "}
                {l.texto}
              </div>
            ))
          )}
        </div>
      </div>

      {m.url && (
        <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          🚀 {t.monitor.openUrl}
        </a>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className={`text-lg font-bold ${tone === "warn" ? "text-amber-600" : "text-slate-800"}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
