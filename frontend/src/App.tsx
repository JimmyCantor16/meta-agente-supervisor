import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { useAuth } from "./features/auth/AuthProvider";
import { AdminView } from "./features/workspace/components/AdminView";
import { DashboardEvaluacion } from "./features/workspace/components/DashboardEvaluacion";
import { PlansView } from "./features/workspace/components/PlansView";
import { ProjectGallery } from "./features/workspace/components/ProjectGallery";
import { ProjectWorkspace } from "./features/workspace/components/ProjectWorkspace";
import { PublishGuide } from "./features/workspace/components/PublishGuide";
import { PromptInput } from "./features/workspace/components/PromptInput";
import { Multimedia } from "./features/multimedia";
import { MonitorGeneracion } from "./features/monitor/MonitorGeneracion";
import { useAccount } from "./features/workspace/hooks/useAccount";
import { useEvaluatePrompt } from "./features/workspace/hooks/useEvaluatePrompt";
import { useProjects } from "./features/workspace/hooks/useProjects";
import { useLanguage } from "./i18n/LanguageProvider";

/**
 * Layout raíz (estilo Skywork): sidebar + topbar + área de trabajo.
 * Integra login por usuario, límites por cuenta y panel de super-admin.
 */
export default function App() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { data, loading, error, feedback, evaluate, submitFeedback } = useEvaluatePrompt();
  const { projects, loading: loadingProjects, refresh } = useProjects();
  const { account, refresh: refreshAccount, upgrade } = useAccount();

  const [view, setView] = useState("home");
  // Proyecto abierto desde la galería (taller: auditar + clases del profesor).
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [teacherMode, setTeacherMode] = useState(false);

  const abrirProyecto = (name: string) => {
    setOpenProject(name);
    setView("projects");
  };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Texto sembrado por los chips de ejemplo (remonta el PromptInput vía `key`).
  const [seed, setSeed] = useState("");

  const isAdmin = account?.is_admin ?? false;
  // Sin resultado ni carga: pantalla de bienvenida centrada, estilo chat.
  const chatMode = !data && !loading;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      <Sidebar
        active={view}
        onNavigate={setView}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        showAdmin={isAdmin}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenu={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
            {view === "home" && (
              <div className={chatMode ? "flex min-h-[70vh] flex-col justify-center space-y-8" : "space-y-8"}>
                {/* Hero: centrado estilo chat cuando aún no hay conversación */}
                {chatMode ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-brand-600">{t.hero.greeting}</p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                      {t.hero.chatTitle}
                    </h1>
                    <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
                      {t.hero.chatSubtitle}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-brand-600">{t.hero.greeting}</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                      {t.hero.title}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">{t.hero.subtitle}</p>
                  </div>
                )}

                <div className={chatMode ? "mx-auto w-full max-w-2xl" : ""}>
                  <PromptInput
                    key={seed}
                    initialValue={seed}
                    onSubmit={evaluate}
                    loading={loading}
                    teacherMode={teacherMode}
                    onTeacherToggle={() => setTeacherMode((v) => !v)}
                  />

                  {/* Chips de ejemplo, como los accesos rápidos de un chat de IA */}
                  {chatMode && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {[t.hero.chipCv, t.hero.chipStore, t.hero.chipBooking].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setSeed(chip.replace(/^\S+\s/, ""))}
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}

                  {chatMode && user && account && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {account.paid ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          {t.account.planActive(account.plan)}
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                            🏗️ {t.account.generationsLeft(account.generations_remaining)}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                            🎓 {t.account.lessonsLeft(account.lessons_remaining)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

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
                    isLoggedIn={!!user}
                    account={account}
                    onAfterGenerate={() => {
                      refresh();
                      refreshAccount();
                    }}
                    onRequestUpgrade={upgrade}
                    onViewPlans={() => setView("plans")}
                  />
                )}

                <ProjectGallery
                  projects={projects.slice(0, 3)}
                  loading={loadingProjects}
                  onOpen={abrirProyecto}
                />
              </div>
            )}

            {view === "projects" &&
              (openProject ? (
                <ProjectWorkspace
                  projectName={openProject}
                  onBack={() => setOpenProject(null)}
                />
              ) : (
                <ProjectGallery
                  projects={projects}
                  loading={loadingProjects}
                  onOpen={abrirProyecto}
                />
              ))}

            {view === "monitor" && <MonitorGeneracion />}

            {view === "publish" && <PublishGuide projects={projects} />}

            {view === "plans" && (
              <PlansView
                isLoggedIn={!!user}
                account={account}
                onChoose={(plan) => upgrade(plan)}
              />
            )}

            {view === "admin" && isAdmin && <AdminView />}

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
                  <li>Inicia sesión con Google (arriba a la derecha).</li>
                  <li>Escribe tu idea y pulsa <strong>{t.promptInput.submit}</strong>.</li>
                  <li>Genera el proyecto y audítalo.</li>
                  <li>Activa el Modo profesor para aprender mientras construyes.</li>
                </ol>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Pestaña "Multimedia" (TV en vivo + Radio) fija al borde derecho. */}
      <Multimedia />
    </div>
  );
}
