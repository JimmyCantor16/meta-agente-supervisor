import { Award, BookOpen, Clock, Layers, LoaderCircle, RotateCw, TriangleAlert } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useAuth } from "../../auth/AuthProvider";
import { useCatalogo } from "../hooks/useCatalogo";
import type { CursoResumen } from "../types";

/** El catálogo: tarjetas de curso con nivel, duración y avance del alumno. */
export function CatalogoCursos({ onAbrir }: { onAbrir: (cursoId: string) => void }) {
  const { t } = useLanguage();
  const g = t.cursos;
  const { user } = useAuth();
  const { cursos, cargando, error, cargar } = useCatalogo(user?.sub ?? "");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-brand-600">{g.kicker}</p>
        <h1 className="mt-1 text-title text-ink">{g.title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">{g.subtitle}</p>
      </header>

      {cargando && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <LoaderCircle size={16} className="animate-spin" aria-hidden /> {g.loading}
        </div>
      )}

      {error && !cargando && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span className="flex items-start gap-2">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
          </span>
          <button onClick={() => void cargar()} className="flex items-center gap-1 font-semibold hover:underline">
            <RotateCw size={14} aria-hidden /> {g.retry}
          </button>
        </div>
      )}

      {!cargando && !error && cursos.length === 0 && (
        <p className="rounded-lg border border-black/10 bg-white p-6 text-sm text-ink-muted shadow-card">{g.empty}</p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {cursos.map((c) => (
          <TarjetaCurso key={c.id} curso={c} onAbrir={() => onAbrir(c.id)} />
        ))}
      </div>
    </div>
  );
}

function TarjetaCurso({ curso, onAbrir }: { curso: CursoResumen; onAbrir: () => void }) {
  const { t } = useLanguage();
  const g = t.cursos;
  const horas = Math.max(1, Math.round(curso.duracion_min / 60));

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-card">
      {curso.miniatura && (
        <img src={curso.miniatura} alt="" className="aspect-[16/7] w-full bg-surface-muted object-cover" loading="lazy" />
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">{g.level[curso.nivel]}</span>
          {curso.certificado && (
            <span className="flex items-center gap-1 rounded bg-surface-muted px-2 py-0.5 font-semibold text-ink">
              <Award size={12} aria-hidden /> {g.certified}
            </span>
          )}
        </div>
        <h2 className="mt-3 text-subhead text-ink">{curso.titulo}</h2>
        <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{curso.descripcion}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {curso.tecnologias.map((tec) => (
            <span key={tec} className="rounded border border-black/10 px-2 py-0.5 text-xs text-ink-body">
              {tec}
            </span>
          ))}
        </div>

        <dl className="mt-4 flex flex-wrap gap-4 text-xs text-ink-muted">
          <div className="flex items-center gap-1"><Layers size={14} aria-hidden /> {g.modules(curso.modulos)}</div>
          <div className="flex items-center gap-1"><BookOpen size={14} aria-hidden /> {g.lessons(curso.lecciones)}</div>
          <div className="flex items-center gap-1"><Clock size={14} aria-hidden /> {g.hours(horas)}</div>
        </dl>

        <div className="mt-auto pt-5">
          {curso.avance > 0 && (
            <div className="mb-3">
              <div className="mb-1 flex justify-between text-xs text-ink-muted">
                <span>{g.progress}</span>
                <span>{curso.avance}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-surface-muted">
                <div className="h-full bg-brand-600" style={{ width: `${curso.avance}%` }} />
              </div>
            </div>
          )}
          <button
            onClick={onAbrir}
            className="w-full rounded bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            {curso.avance > 0 ? g.continue : g.start}
          </button>
        </div>
      </div>
    </article>
  );
}
