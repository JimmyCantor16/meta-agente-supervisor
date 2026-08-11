import { useLanguage } from "../../../i18n/LanguageProvider";
import type { ProjectSummary } from "../types";

interface ProjectGalleryProps {
  projects: ProjectSummary[];
  loading: boolean;
  /** Abre el taller del proyecto (auditar + clases del profesor). */
  onOpen?: (name: string) => void;
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
export function ProjectGallery({ projects, loading, onOpen }: ProjectGalleryProps) {
  const { t } = useLanguage();

  return (
    <section>
      <h2 className="mb-4 text-lg font-bold text-ink">{t.gallery.title}</h2>

      {loading ? (
        <p className="text-sm text-ink-faint">…</p>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white p-8 text-center text-sm text-ink-faint">
          {t.gallery.empty}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => (
            <article
              key={p.name}
              onClick={() => onOpen?.(p.name)}
              role={onOpen ? "button" : undefined}
              tabIndex={onOpen ? 0 : undefined}
              onKeyDown={(e) => {
                if (onOpen && (e.key === "Enter" || e.key === " ")) onOpen(p.name);
              }}
              className={`group overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm transition hover:shadow-md ${
                onOpen ? "cursor-pointer hover:border-brand-300" : ""
              }`}
            >
              <div
                className={`flex h-28 items-center justify-center bg-gradient-to-br ${
                  GRADIENTS[i % GRADIENTS.length]
                }`}
              >
                <span className="text-3xl text-white/90 transition group-hover:scale-110">📦</span>
              </div>
              <div className="p-4">
                <p className="truncate font-semibold text-ink" title={p.name}>
                  {p.name}
                </p>
                <div className="mt-0.5 flex items-center justify-between">
                  <p className="text-xs text-ink-faint">
                    {p.files} {t.gallery.files}
                  </p>
                  {onOpen && (
                    <span className="text-xs font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100">
                      {t.gallery.open} →
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
