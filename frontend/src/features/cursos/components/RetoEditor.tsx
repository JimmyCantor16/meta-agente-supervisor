import { useState } from "react";
import { CircleCheckBig, Lightbulb, LoaderCircle, Send, Target } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useAuth } from "../../auth/AuthProvider";
import { EditorCodigo } from "../../workspace/components/EditorCodigo";
import type { Reproductor } from "../hooks/useReproductor";
import type { RetoCodigo } from "../types";
import { Markdown } from "./Markdown";

const EXTENSION: Record<string, string> = { java: "java", ts: "ts", vue: "vue", sql: "sql", yaml: "yaml" };

/** Un reto de código: el alumno escribe, el tutor IA lo revisa contra los criterios. */
export function RetoEditor({ r, reto }: { r: Reproductor; reto: RetoCodigo }) {
  const { t } = useLanguage();
  const g = t.cursos;
  const { user } = useAuth();
  const [codigo, setCodigo] = useState(reto.codigo_inicial);
  const [verPista, setVerPista] = useState(false);
  const veredicto = r.veredictos[reto.id];
  const superado = r.progreso?.retos_superados.includes(reto.id) ?? false;
  const enviando = r.enviando === reto.id;

  return (
    <div className="space-y-3 border-t border-black/5 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Target size={16} className="text-brand-600" aria-hidden /> {g.challenge}
        </h4>
        {superado && (
          <span className="flex items-center gap-1 text-xs font-semibold text-brand-700">
            <CircleCheckBig size={14} aria-hidden /> {g.challengeDone}
          </span>
        )}
      </div>
      <Markdown texto={reto.enunciado} />
      <div>
        <p className="text-xs font-semibold text-ink-muted">{g.criteria}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-body">
          {reto.criterios.map((c) => (
            <li key={c} className={veredicto?.criterios_cumplidos.includes(c) ? "text-brand-700" : undefined}>
              {c}
            </li>
          ))}
        </ul>
      </div>
      <div className="h-64 overflow-hidden rounded-lg border border-black/10">
        <EditorCodigo
          valor={reto.codigo_inicial}
          path={`reto.${EXTENSION[reto.lenguaje] ?? "txt"}`}
          onCambio={setCodigo}
          className="h-full"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void r.revisarReto(reto.id, codigo)}
          disabled={!user || enviando || !codigo.trim()}
          title={!user ? g.loginToSave : undefined}
          className="flex items-center gap-2 rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}
          {enviando ? g.reviewing : g.submitChallenge}
        </button>
        {reto.pista && (
          <button
            onClick={() => setVerPista((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-brand-700"
          >
            <Lightbulb size={14} aria-hidden /> {verPista ? g.hideHint : g.showHint}
          </button>
        )}
      </div>
      {verPista && <p className="rounded bg-surface-muted p-3 text-xs text-ink-body">{reto.pista}</p>}

      {veredicto && (
        <div
          className={`space-y-2 rounded-lg border p-4 ${
            veredicto.aprobado ? "border-brand-200 bg-brand-50" : "border-black/10 bg-surface-sunken"
          }`}
        >
          <p className={`text-sm font-semibold ${veredicto.aprobado ? "text-brand-800" : "text-ink"}`}>
            {veredicto.aprobado ? g.challengePassed(veredicto.puntaje) : g.challengeFailed(veredicto.puntaje)}
          </p>
          <Markdown texto={veredicto.retroalimentacion} />
          {veredicto.sugerencias.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-body">
              {veredicto.sugerencias.map((s) => <li key={s}>{s}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
