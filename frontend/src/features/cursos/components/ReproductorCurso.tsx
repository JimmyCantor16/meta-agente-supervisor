import { useState } from "react";
import {
  ArrowLeft,
  CircleCheckBig,
  Circle,
  ClipboardCheck,
  ListTree,
  LoaderCircle,
  RotateCw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useAuth } from "../../auth/AuthProvider";
import { useReproductor, type Reproductor } from "../hooks/useReproductor";
import type { Seleccion } from "../types";
import { CertificadoCurso } from "./CertificadoCurso";
import { EvaluacionPanel } from "./EvaluacionPanel";
import { LectorLeccion } from "./LectorLeccion";

/**
 * El reproductor de un curso: barra de progreso arriba, temario por módulos a
 * la izquierda (cajón en móvil) y la lección o la evaluación en el centro.
 */
export function ReproductorCurso({ cursoId, onVolver }: { cursoId: string; onVolver: () => void }) {
  const { t } = useLanguage();
  const g = t.cursos;
  const r = useReproductor(cursoId);
  const [temarioAbierto, setTemarioAbierto] = useState(false);

  if (r.cargando && !r.curso) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-ink-muted">
        <LoaderCircle size={16} className="animate-spin" aria-hidden /> {g.loadingCourse}
      </div>
    );
  }
  if (!r.curso) {
    return (
      <div className="space-y-4 p-8">
        <BotonVolver onVolver={onVolver} />
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span className="flex gap-2"><TriangleAlert size={16} className="mt-0.5" aria-hidden /> {r.error}</span>
          <button onClick={() => void r.cargar()} className="flex items-center gap-1 font-semibold hover:underline">
            <RotateCw size={14} aria-hidden /> {g.retry}
          </button>
        </div>
      </div>
    );
  }

  const avance = r.progreso?.avance ?? 0;
  const ir = (s: Seleccion) => {
    r.seleccionar(s);
    setTemarioAbierto(false);
    document.getElementById("lector-curso")?.scrollTo({ top: 0 });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior: volver, título y progreso */}
      <div className="border-b border-black/10 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <BotonVolver onVolver={onVolver} />
          <button
            onClick={() => setTemarioAbierto(true)}
            className="flex items-center gap-1.5 rounded border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-ink-body lg:hidden"
          >
            <ListTree size={14} aria-hidden /> {g.syllabus}
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{r.curso.titulo}</h1>
          <span className="shrink-0 text-xs font-semibold text-ink-muted">{avance}%</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded bg-surface-muted"
          role="progressbar"
          aria-valuenow={avance}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={g.progress}
        >
          <div className="h-full bg-brand-600 transition-all duration-500" style={{ width: `${avance}%` }} />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Temario: fijo en escritorio, cajón en móvil */}
        {temarioAbierto && (
          <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => setTemarioAbierto(false)} aria-hidden />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] overflow-y-auto border-r border-black/10 bg-white transition-transform lg:static lg:z-auto lg:translate-x-0 ${
            temarioAbierto ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 pt-4 lg:hidden">
            <span className="text-sm font-semibold text-ink">{g.syllabus}</span>
            <button onClick={() => setTemarioAbierto(false)} aria-label={g.close}><X size={18} /></button>
          </div>
          <Temario r={r} onIr={ir} />
        </aside>

        <div id="lector-curso" className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
            {r.error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {r.error}
              </div>
            )}
            {r.progreso?.certificado && <CertificadoCurso certificado={r.progreso.certificado} />}
            {r.actual && <LectorLeccion key={r.actual.leccion.id} r={r} onIr={ir} />}
            {r.moduloEvaluado?.evaluacion && (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  {g.moduleN(r.moduloEvaluado.orden)} · {r.moduloEvaluado.titulo}
                </p>
                <EvaluacionPanel key={r.moduloEvaluado.evaluacion.id} r={r} evaluacion={r.moduloEvaluado.evaluacion} />
                {r.siguiente && (
                  <button
                    onClick={() => ir(r.siguiente!)}
                    className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    {g.next}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BotonVolver({ onVolver }: { onVolver: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      onClick={onVolver}
      className="flex items-center gap-1 text-sm font-medium text-ink-muted transition hover:text-brand-700"
    >
      <ArrowLeft size={16} aria-hidden /> <span className="hidden sm:inline">{t.cursos.backToCatalog}</span>
    </button>
  );
}

function Temario({ r, onIr }: { r: Reproductor; onIr: (s: Seleccion) => void }) {
  const { t } = useLanguage();
  const g = t.cursos;
  const { user } = useAuth();
  const sel = r.seleccion;
  if (!r.curso) return null;

  return (
    <nav className="space-y-5 p-4" aria-label={g.syllabus}>
      {!user && <p className="rounded bg-brand-50 p-3 text-xs text-brand-800">{g.loginToSave}</p>}
      {[...r.curso.modulos]
        .sort((a, b) => a.orden - b.orden)
        .map((m) => {
          const lecciones = [...m.lecciones].sort((a, b) => a.orden - b.orden);
          const hechas = lecciones.filter((l) => r.completada(l.id)).length;
          return (
            <section key={m.id}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{g.moduleN(m.orden)}</p>
              <h2 className="mt-0.5 text-sm font-semibold text-ink">{m.titulo}</h2>
              <p className="mt-0.5 text-xs text-ink-faint">{g.doneOf(hechas, lecciones.length)}</p>
              <ul className="mt-2 space-y-0.5">
                {lecciones.map((l) => {
                  const activa = sel?.tipo === "leccion" && sel.id === l.id;
                  const hecha = r.completada(l.id);
                  return (
                    <li key={l.id}>
                      <button
                        onClick={() => onIr({ tipo: "leccion", id: l.id })}
                        aria-current={activa ? "step" : undefined}
                        className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
                          activa ? "bg-brand-50 font-semibold text-brand-800" : "text-ink-body hover:bg-surface-muted"
                        }`}
                      >
                        {hecha ? (
                          <CircleCheckBig size={16} className="mt-0.5 shrink-0 text-brand-600" aria-label={g.completed} />
                        ) : (
                          <Circle size={16} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">{l.titulo}</span>
                        <span className="shrink-0 text-xs font-normal text-ink-faint">{l.duracion_min}′</span>
                      </button>
                    </li>
                  );
                })}
                {m.evaluacion && (
                  <li>
                    <button
                      onClick={() => onIr({ tipo: "evaluacion_modulo", moduloId: m.id })}
                      className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
                        sel?.tipo === "evaluacion_modulo" && sel.moduloId === m.id
                          ? "bg-brand-50 font-semibold text-brand-800"
                          : "text-ink-body hover:bg-surface-muted"
                      }`}
                    >
                      <ClipboardCheck
                        size={16}
                        className={`mt-0.5 shrink-0 ${r.aprobada(m.evaluacion) ? "text-brand-600" : "text-ink-faint"}`}
                        aria-hidden
                      />
                      <span className="flex-1">{m.evaluacion.titulo}</span>
                    </button>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
    </nav>
  );
}
