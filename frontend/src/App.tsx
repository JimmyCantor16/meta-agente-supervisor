import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { DashboardEvaluacion } from "./features/workspace/components/DashboardEvaluacion";
import { ProjectGallery } from "./features/workspace/components/ProjectGallery";
import { PromptInput } from "./features/workspace/components/PromptInput";
import { useEvaluatePrompt } from "./features/workspace/hooks/useEvaluatePrompt";
import { useProjects } from "./features/workspace/hooks/useProjects";
import { useUsage } from "./features/workspace/hooks/useUsage";
import { useLanguage } from "./i18n/LanguageProvider";

/**
 * Layout raíz (estilo Skywork): sidebar + topbar + área de trabajo.
 * Tema claro y profesional.
 */
export default function App() {
  const { t } = useLanguage();
  const { data, loading, error, feedback, evaluate, submitFeedback } = useEvaluatePrompt();
  const { projects, loading: loadingProjects, refresh } = useProjects();
  const { usage, refresh: refreshUsage, activate, activateError } = useUsage();

  const [view, setView] = useState("home");
  const [teacherMode, setTeacherMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      <Sidebar
        active={view}
        onNavigate={setView}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenu={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
            {view === "home" && (
              <div className="space-y-8">
                {/* Hero */}
                <div>
                  <p className="text-sm font-medium text-brand-600">{t.hero.greeting}</p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    {t.hero.title}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-500">{t.hero.subtitle}</p>

                  {usage && (
                    <div className="mt-3">
                      {usage.licensed ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          {t.usage.licensed}
                        </span>
                      ) : usage.remaining > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                          {t.usage.freeLeft(usage.remaining)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                          🔒 {t.usage.limitReached}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <PromptInput
                  onSubmit={evaluate}
                  loading={loading}
                  teacherMode={teacherMode}
                  onTeacherToggle={() => setTeacherMode((v) => !v)}
                />

                {error && (
                  <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    <span aria-hidden>⚠</span>
                    <p>{error}</p>
                  </div>
                )}

                {loading && (
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500"
                      style={{ animationName: "spin" }}
                      aria-hidden
                    />
                    {t.states.analyzing}
                  </div>
                )}

                {data && !loading && (
                  <DashboardEvaluacion
                    evaluation={data}
                    feedback={feedback}
                    onFeedback={submitFeedback}
                    teacherMode={teacherMode}
                    onProjectGenerated={() => {
                      refresh();
                      refreshUsage();
                    }}
                    licenseActivate={activate}
                    licenseError={activateError}
                    onLicenseActivated={refreshUsage}
                  />
                )}

                {/* Galería resumida */}
                <ProjectGallery projects={projects.slice(0, 3)} loading={loadingProjects} />
              </div>
            )}

            {view === "projects" && (
              <ProjectGallery projects={projects} loading={loadingProjects} />
            )}

            {view === "learn" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">🎓 {t.nav.learn}</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Activa el <strong>Modo profesor</strong> en la caja de entrada y genera un
                  proyecto. El agente te explicará el código paso a paso y te propondrá retos
                  para que aprendas haciéndolo tú mismo — no te lo da todo hecho.
                </p>
              </div>
            )}

            {view === "help" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">❓ {t.nav.help}</h2>
                <ol className="mt-3 max-w-2xl list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
                  <li>Escribe tu idea en la caja de entrada.</li>
                  <li>Pulsa <strong>{t.promptInput.submit}</strong>.</li>
                  <li>Genera el proyecto y audítalo.</li>
                  <li>Activa el Modo profesor para aprender mientras construyes.</li>
                </ol>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
