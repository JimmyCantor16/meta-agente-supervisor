import { useEffect, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { ApiError, iniciarMeta, listarMetas, marcarHito } from "../../../lib/api";
import type { HitoProceso, MetaProceso } from "../types";

/**
 * Fase 2: metas de proceso multi-sesión.
 *
 * Cuando el alumno pide algo que no se logra de un tirón (monetizar un canal,
 * vender por internet), el profesor traza un mapa de hitos honesto — marcando
 * de quién depende cada paso — y lo acompaña sesión a sesión.
 */
export function MetasProceso({ projectName }: { projectName: string }) {
  const { t, lang } = useLanguage();
  const g = t.metas;
  const [metas, setMetas] = useState<MetaProceso[]>([]);
  const [objetivo, setObjetivo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const m = await listarMetas();
        if (vivo) setMetas(m);
      } catch {
        /* sin metas todavía: no es error */
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const crear = async () => {
    if (!objetivo.trim() || creando) return;
    setCreando(true);
    setError(null);
    try {
      const m = await iniciarMeta(objetivo.trim(), `Proyecto: ${projectName}`, lang);
      setMetas((prev) => [m, ...prev]);
      setObjetivo("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : g.errorCrear);
    } finally {
      setCreando(false);
    }
  };

  const toggle = async (metaId: string, indice: number, hecho: boolean) => {
    try {
      const actualizada = await marcarHito(metaId, indice, hecho);
      setMetas((prev) => prev.map((m) => (m.id === metaId ? actualizada : m)));
    } catch {
      /* si falla, no rompe la vista */
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <p className="text-sm font-bold text-ink-body">🎯 {g.titulo}</p>
        <p className="mt-1 text-sm text-ink-muted">{g.intro}</p>
        <div className="mt-3 flex gap-2">
          <input
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void crear()}
            placeholder={g.placeholder}
            disabled={creando}
            className="flex-1 rounded-xl border border-black/10 bg-surface-muted px-4 py-2.5 text-sm focus:border-brand-300 focus:bg-white focus:outline-none"
          />
          <button
            onClick={() => void crear()}
            disabled={creando || !objetivo.trim()}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {creando ? g.trazando : g.trazar}
          </button>
        </div>
        {error && <p className="mt-2 text-xs font-medium text-red-600">⚠ {error}</p>}
      </div>

      {cargando && <p className="text-sm text-ink-faint">{g.cargando}</p>}

      {metas.map((meta) => (
        <MetaCard key={meta.id} meta={meta} onToggle={toggle} />
      ))}

      {!cargando && metas.length === 0 && (
        <p className="rounded-2xl border border-dashed border-black/10 p-6 text-center text-sm text-ink-faint">
          {g.vacio}
        </p>
      )}
    </div>
  );
}

function MetaCard({
  meta,
  onToggle,
}: {
  meta: MetaProceso;
  onToggle: (metaId: string, indice: number, hecho: boolean) => void;
}) {
  const { t } = useLanguage();
  const g = t.metas;
  const pct = meta.total > 0 ? (meta.hechos / meta.total) * 100 : 0;

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-base font-bold text-ink">{meta.objetivo}</p>
      <p className="mt-1 text-sm text-ink-muted">{meta.resumen}</p>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs font-semibold text-ink-muted">
          <span>{g.progreso}</span>
          <span>
            {meta.hechos}/{meta.total}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {meta.hitos.map((h, i) => (
          <HitoRow key={i} hito={h} onToggle={(hecho) => onToggle(meta.id, i, hecho)} />
        ))}
      </ul>
    </div>
  );
}

function HitoRow({ hito, onToggle }: { hito: HitoProceso; onToggle: (hecho: boolean) => void }) {
  const { t } = useLanguage();
  const g = t.metas;
  const badge = {
    sistema: { txt: g.depSistema, cls: "bg-brand-100 text-brand-700" },
    alumno: { txt: g.depAlumno, cls: "bg-emerald-100 text-emerald-700" },
    plataforma: { txt: g.depPlataforma, cls: "bg-amber-100 text-amber-700" },
    tiempo: { txt: g.depTiempo, cls: "bg-surface-muted text-ink-body" },
  }[hito.depende_de];

  return (
    <li className="flex items-start gap-3 rounded-xl border border-black/10 p-3">
      <input
        type="checkbox"
        checked={hito.hecho}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-brand-600"
      />
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-semibold ${hito.hecho ? "text-ink-faint line-through" : "text-ink-body"}`}>
            {hito.titulo}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge.cls}`}>
            {badge.txt}
          </span>
        </div>
        {hito.descripcion && <p className="mt-0.5 text-xs text-ink-muted">{hito.descripcion}</p>}
      </div>
    </li>
  );
}
