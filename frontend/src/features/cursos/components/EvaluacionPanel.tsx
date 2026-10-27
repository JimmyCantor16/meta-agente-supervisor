import { useState } from "react";
import { CircleCheckBig, CircleX, LoaderCircle, RotateCw, Trophy } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useAuth } from "../../auth/AuthProvider";
import type { Reproductor } from "../hooks/useReproductor";
import type { Evaluacion } from "../types";
import { MarkdownEnLinea } from "./Markdown";
import { RetoEditor } from "./RetoEditor";

/**
 * El quiz (y los retos) de una lección o de un módulo.
 *
 * El navegador no sabe cuál es la correcta: manda lo elegido, el servidor
 * corrige y devuelve acierto, opción correcta y explicación de cada pregunta.
 */
export function EvaluacionPanel({ r, evaluacion }: { r: Reproductor; evaluacion: Evaluacion }) {
  const { t } = useLanguage();
  const g = t.cursos;
  const { user } = useAuth();
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const resultado = r.resultados[evaluacion.id];
  // Tras corregir, las opciones se congelan hasta pulsar «Reintentar».
  const [revisando, setRevisando] = useState(false);
  const corregido = revisando && resultado;
  const porId = new Map(resultado?.resultados.map((x) => [x.pregunta_id, x]) ?? []);
  const mejor = r.progreso?.puntajes[evaluacion.id];
  const aprobada = r.aprobada(evaluacion);
  const completas = evaluacion.preguntas.every((p) => respuestas[p.id] !== undefined);
  const enviando = r.enviando === evaluacion.id;

  const enviar = async () => {
    if (await r.evaluar(evaluacion.id, respuestas)) setRevisando(true);
  };
  const reintentar = () => {
    setRespuestas({});
    setRevisando(false);
  };

  return (
    <section className="space-y-5 rounded-lg border border-black/10 bg-white p-5 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-subhead text-ink">{evaluacion.titulo}</h3>
          {evaluacion.preguntas.length > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              {g.passWith(evaluacion.aprobacion_minima)}
              {mejor !== undefined && ` · ${g.bestScore(mejor)}`}
            </p>
          )}
        </div>
        {aprobada && evaluacion.preguntas.length > 0 && (
          <span className="flex items-center gap-1 rounded bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
            <Trophy size={14} aria-hidden /> {g.passed}
          </span>
        )}
      </header>

      {evaluacion.preguntas.length > 0 && (
        <ol className="space-y-5">
          {evaluacion.preguntas.map((p, i) => {
            const res = corregido ? porId.get(p.id) : undefined;
            return (
              <li key={p.id}>
                <fieldset disabled={!!corregido || enviando}>
                  <legend className="text-sm font-semibold text-ink">
                    {i + 1}. <MarkdownEnLinea texto={p.enunciado} />
                  </legend>
                  <div className="mt-2 space-y-1.5">
                    {p.opciones.map((op, k) => {
                      const elegida = respuestas[p.id] === k;
                      const esCorrecta = res && res.correcta === k;
                      const falloAqui = res && elegida && !res.acierto;
                      return (
                        <label
                          key={k}
                          className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-sm transition ${
                            esCorrecta
                              ? "border-brand-600 bg-brand-50 text-ink"
                              : falloAqui
                                ? "border-red-300 bg-red-50 text-ink"
                                : elegida
                                  ? "border-brand-600 text-ink"
                                  : "border-black/10 text-ink-body hover:border-brand-200"
                          }`}
                        >
                          <input
                            type="radio"
                            name={p.id}
                            checked={elegida}
                            onChange={() => setRespuestas((prev) => ({ ...prev, [p.id]: k }))}
                            className="mt-0.5 accent-brand-600"
                          />
                          <span className="flex-1"><MarkdownEnLinea texto={op} /></span>
                          {esCorrecta && <CircleCheckBig size={16} className="shrink-0 text-brand-600" aria-label={g.correct} />}
                          {falloAqui && <CircleX size={16} className="shrink-0 text-red-600" aria-label={g.incorrect} />}
                        </label>
                      );
                    })}
                  </div>
                  {res?.explicacion && (
                    <p className={`mt-2 text-xs ${res.acierto ? "text-brand-800" : "text-ink-body"}`}>
                      <b>{res.acierto ? g.correct : g.incorrect}.</b> <MarkdownEnLinea texto={res.explicacion} />
                    </p>
                  )}
                </fieldset>
              </li>
            );
          })}
        </ol>
      )}

      {evaluacion.preguntas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-4">
          {corregido ? (
            <>
              <p className={`text-sm font-semibold ${resultado.aprobado ? "text-brand-700" : "text-red-700"}`}>
                {resultado.aprobado ? g.scorePassed(resultado.puntaje) : g.scoreFailed(resultado.puntaje)}
              </p>
              <button
                onClick={reintentar}
                className="flex items-center gap-1 rounded border border-black/10 px-3 py-1.5 text-sm font-semibold text-ink-body hover:border-brand-600 hover:text-brand-700"
              >
                <RotateCw size={14} aria-hidden /> {g.retryQuiz}
              </button>
            </>
          ) : (
            <button
              onClick={() => void enviar()}
              disabled={!user || !completas || enviando}
              title={!user ? g.loginToSave : !completas ? g.answerAll : undefined}
              className="flex items-center gap-2 rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
              {g.checkAnswers}
            </button>
          )}
          {!user && <span className="text-xs text-ink-muted">{g.loginToSave}</span>}
        </div>
      )}

      {evaluacion.retos.map((reto) => (
        <RetoEditor key={reto.id} r={r} reto={reto} />
      ))}
    </section>
  );
}
