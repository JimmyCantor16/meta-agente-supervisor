import { useState } from "react";
import { Card } from "../../../components/Card";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { AuditSubsection, TeacherSubsection } from "./DashboardEvaluacion";
import { MetasProceso } from "./MetasProceso";
import { ProfesorChat } from "./ProfesorChat";

/**
 * Vista de un proyecto YA generado, abierto desde la galería.
 *
 * Dos pestañas: el TALLER (auditar/ajustar) y el CURSO del profesor — el chat
 * interactivo que lleva al alumno de "no entiendo nada" a "mi sistema está en
 * internet y sé cómo funciona", clase a clase, con superación verificable.
 */
export function ProjectWorkspace({
  projectName,
  onBack,
}: {
  projectName: string;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"curso" | "metas" | "taller">("curso");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
        >
          ← {t.project.back}
        </button>
        <div className="flex gap-1.5 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setTab("curso")}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              tab === "curso" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {t.project.tabCurso}
          </button>
          <button
            onClick={() => setTab("metas")}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              tab === "metas" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {t.project.tabMetas}
          </button>
          <button
            onClick={() => setTab("taller")}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              tab === "taller" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {t.project.tabTaller}
          </button>
        </div>
      </div>

      {tab === "curso" ? (
        <ProfesorChat projectName={projectName} />
      ) : tab === "metas" ? (
        <MetasProceso projectName={projectName} />
      ) : (
        <Card title={`📦 ${projectName}`} icon={<span>🛠️</span>}>
          <p className="mb-2 text-sm text-slate-500">{t.project.hint}</p>
          <AuditSubsection projectName={projectName} />
          <TeacherSubsection projectName={projectName} />
        </Card>
      )}
    </div>
  );
}
