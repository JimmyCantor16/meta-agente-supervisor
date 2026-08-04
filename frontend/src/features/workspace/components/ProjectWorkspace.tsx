import { useState } from "react";
import { Card } from "../../../components/Card";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { AulaEnVivo } from "./AulaEnVivo";
import { AuditSubsection, TeacherSubsection } from "./DashboardEvaluacion";
import { MetasProceso } from "./MetasProceso";
import { ProfesorChat } from "./ProfesorChat";
import { SistemaEnVivo } from "./SistemaEnVivo";
import type { MisionClase } from "../types";

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
  const [tab, setTab] = useState<"curso" | "aula" | "metas" | "taller">("curso");
  // El encargo de la clase que exige tocar código. Vive aquí porque el profesor
  // lo entrega y el aula lo recibe, y son pestañas hermanas.
  const [mision, setMision] = useState<MisionClase | null>(null);
  // El aula ABIERTA AL LADO del chat, no en otra pestaña.
  //
  // Antes, aceptar el encargo te sacaba de la clase: perdías la conversación
  // justo cuando ibas a necesitarla, y para releer lo que el profesor acababa
  // de explicar había que volver atrás y perder el código. Son las dos mitades
  // de la misma clase, así que se miran a la vez.
  const [aulaAlLado, setAulaAlLado] = useState(false);

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
            onClick={() => setTab("aula")}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              tab === "aula" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {t.project.tabAula}
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

      {/* Panel "Tu sistema en vivo": encender/abrir/apagar, URL y puerto. */}
      <SistemaEnVivo projectName={projectName} />

      {tab === "curso" ? (
        aulaAlLado && mision ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2">
              <p className="min-w-0 text-xs text-brand-800">
                <span className="font-semibold">{t.project.claseYTaller}</span>
                {mision.archivo && (
                  <span className="ml-2 font-mono text-[11px] text-brand-700">{mision.archivo}</span>
                )}
              </p>
              <button
                onClick={() => setAulaAlLado(false)}
                className="shrink-0 text-xs font-semibold text-brand-700 hover:underline"
              >
                {t.project.cerrarAula}
              </button>
            </div>
            {/* El chat se queda estrecho y el aula ancha: ahí van el editor y la
                vista del sistema, que necesitan sitio para ser útiles. */}
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
              <div className="min-w-0">
                <ProfesorChat
                  projectName={projectName}
                  onIrAlAula={(m) => {
                    setMision(m);
                    setAulaAlLado(true);
                  }}
                />
              </div>
              <div className="min-w-0">
                <AulaEnVivo projectName={projectName} mision={mision} />
              </div>
            </div>
          </div>
        ) : (
          <ProfesorChat
            projectName={projectName}
            onIrAlAula={(m) => {
              setMision(m);
              setAulaAlLado(true);
            }}
          />
        )
      ) : tab === "aula" ? (
        <AulaEnVivo projectName={projectName} mision={mision} />
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
