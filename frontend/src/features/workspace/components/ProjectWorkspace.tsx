import { Card } from "../../../components/Card";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { AuditSubsection, TeacherSubsection } from "./DashboardEvaluacion";

/**
 * Vista de un proyecto YA generado, abierto desde la galería.
 *
 * Antes el auditor y el profesor solo existían justo después de generar en la
 * misma sesión; un proyecto de ayer era inalcanzable. Aquí viven para siempre.
 */
export function ProjectWorkspace({
  projectName,
  onBack,
}: {
  projectName: string;
  onBack: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
      >
        ← {t.project.back}
      </button>

      <Card title={`📦 ${projectName}`} icon={<span>🛠️</span>}>
        <p className="mb-2 text-sm text-slate-500">{t.project.hint}</p>
        <AuditSubsection projectName={projectName} />
        <TeacherSubsection projectName={projectName} />
      </Card>
    </div>
  );
}
