import { useLanguage } from "../../../i18n/LanguageProvider";
import type { ProjectSummary } from "../types";

interface ProjectGalleryProps {
  projects: ProjectSummary[];
  loading: boolean;
}

// Degradados decorativos para las tarjetas (rotan por índice).
const GRADIENTS = [
  "from-indigo-400 to-purple-400",
  "from-emerald-400 to-teal-400",
  "from-amber-400 to-orange-400",
  "from-sky-400 to-blue-500",
  "from-pink-400 to-rose-400",
  "from-violet-400 to-fuchsia-400",
];

/**
 * Galería de proyectos generados, en tarjetas visuales (estilo Skywork).
 */
export function ProjectGallery({ projects, loading }: ProjectGalleryProps) {
  const { t } = useLanguage();

  return (
    <section>
      <h2 className="mb-4 text-lg font-bold text-slate-900">{t.gallery.title}</h2>

      {loading ? (
        <p className="text-sm text-slate-400">…</p>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          {t.gallery.empty}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => (
            <article
              key={p.name}
              className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
            >
              <div
                className={`flex h-28 items-center justify-center bg-gradient-to-br ${
                  GRADIENTS[i % GRADIENTS.length]
                }`}
              >
                <span className="text-3xl text-white/90">📦</span>
              </div>
              <div className="p-4">
                <p className="truncate font-semibold text-slate-800" title={p.name}>
                  {p.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {p.files} {t.gallery.files}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
