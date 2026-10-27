import { useState } from "react";
import { ArrowRight, Check, Clock, LoaderCircle } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useAuth } from "../../auth/AuthProvider";
import type { Reproductor } from "../hooks/useReproductor";
import type { Seleccion } from "../types";
import { BloqueCodigo } from "./BloqueCodigo";
import { EvaluacionPanel } from "./EvaluacionPanel";
import { Markdown } from "./Markdown";
import { TutorPanel, type CodigoAdjunto } from "./TutorPanel";

/** Una lección: explicación, paso a paso, código, su quiz y el tutor IA. */
export function LectorLeccion({ r, onIr }: { r: Reproductor; onIr: (s: Seleccion) => void }) {
  const { t } = useLanguage();
  const g = t.cursos;
  const { user } = useAuth();
  // Fragmento que el alumno pidió explicar desde un bloque de código.
  const [adjunto, setAdjunto] = useState<CodigoAdjunto | null>(null);

  if (!r.actual || !r.curso) return null;
  const { modulo, leccion } = r.actual;
  const hecha = r.completada(leccion.id);
  const indice = r.lista.findIndex((x) => x.leccion.id === leccion.id) + 1;

  const preguntarPor = (codigo: string, lenguaje: string, titulo: string) => {
    setAdjunto({ codigo, lenguaje, titulo });
    document.getElementById("tutor-curso")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <article className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          {g.moduleN(modulo.orden)} · {g.lessonNofM(indice, r.lista.length)}
        </p>
        <h2 className="mt-1 text-heading text-ink">{leccion.titulo}</h2>
        {leccion.resumen && <p className="mt-2 text-sm text-ink-muted">{leccion.resumen}</p>}
        <p className="mt-2 flex items-center gap-1 text-xs text-ink-faint">
          <Clock size={12} aria-hidden /> {g.minutes(leccion.duracion_min)}
          {hecha && (
            <span className="ml-2 flex items-center gap-1 font-semibold text-brand-700">
              <Check size={12} aria-hidden /> {g.completed}
            </span>
          )}
        </p>
      </header>

      <Markdown texto={leccion.contenido} />

      {leccion.pasos.length > 0 && (
        <section>
          <h3 className="text-subhead text-ink">{g.stepByStep}</h3>
          <ol className="mt-3 space-y-4">
            {leccion.pasos.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold text-ink">{p.titulo}</p>
                  <Markdown texto={p.explicacion} />
                  {p.codigo && (
                    <BloqueCodigo
                      codigo={p.codigo}
                      lenguaje={p.lenguaje || "text"}
                      onPreguntar={() => preguntarPor(p.codigo, p.lenguaje, p.titulo)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {leccion.snippets.length > 0 && (
        <section className="space-y-5">
          <h3 className="text-subhead text-ink">{g.code}</h3>
          {leccion.snippets.map((s) => (
            <div key={s.id} className="space-y-2">
              <p className="text-sm font-semibold text-ink">{s.titulo}</p>
              <BloqueCodigo
                codigo={s.codigo}
                lenguaje={s.lenguaje}
                titulo={s.archivo || s.lenguaje}
                onPreguntar={() => preguntarPor(s.codigo, s.lenguaje, s.titulo)}
              />
              {s.explicacion && <Markdown texto={s.explicacion} />}
            </div>
          ))}
        </section>
      )}

      {leccion.evaluacion ? (
        <EvaluacionPanel r={r} evaluacion={leccion.evaluacion} />
      ) : (
        !hecha && (
          <button
            onClick={() => void r.completar(leccion.id)}
            disabled={!user || r.enviando === "completar"}
            title={!user ? g.loginToSave : undefined}
            className="flex items-center gap-2 rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {r.enviando === "completar" ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
            {g.markDone}
          </button>
        )
      )}

      <TutorPanel
        cursoId={r.curso.id}
        leccionId={leccion.id}
        adjunto={adjunto}
        onQuitarAdjunto={() => setAdjunto(null)}
      />

      {r.siguiente && (
        <div className="flex justify-end border-t border-black/10 pt-5">
          <button
            onClick={() => onIr(r.siguiente!)}
            className="flex items-center gap-2 rounded border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink-body shadow-sm transition hover:border-brand-600 hover:text-brand-700"
          >
            {r.siguiente.tipo === "evaluacion_modulo" ? g.goToModuleExam : g.next}
            <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      )}
    </article>
  );
}
