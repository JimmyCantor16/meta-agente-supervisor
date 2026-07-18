import { useCallback, useRef, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { ApiError, evaluatePrompt, sendFeedback } from "../../../lib/api";
import type { EvaluationResult } from "../types";

interface UseEvaluatePromptResult {
  /** Resultado de la última evaluación exitosa, o null. */
  data: EvaluationResult | null;
  /** Indica si hay una petición en curso. */
  loading: boolean;
  /** Mensaje de error legible, o null. */
  error: string | null;
  /** Voto de feedback ya emitido para el resultado actual (null si ninguno). */
  feedback: boolean | null;
  /** Dispara la evaluación del prompt dado. */
  evaluate: (prompt: string) => Promise<void>;
  /** Envía el voto de utilidad (👍/👎) del resultado actual. */
  submitFeedback: (helpful: boolean) => Promise<void>;
  /** Limpia el estado (resultado y error). */
  reset: () => void;
}

/**
 * Hook que encapsula el estado de la consulta al backend:
 * carga, error, resultado, feedback y cancelación de peticiones en vuelo.
 */
export function useEvaluatePrompt(): UseEvaluatePromptResult {
  const { lang } = useLanguage();
  const [data, setData] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<boolean | null>(null);

  // Referencia al controlador para cancelar una petición previa si llega otra.
  const abortRef = useRef<AbortController | null>(null);

  const evaluate = useCallback(
    async (prompt: string) => {
      // Cancela cualquier petición anterior aún en vuelo.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setFeedback(null); // Nuevo resultado => feedback reiniciado.

      try {
        // Enviamos el idioma activo para que el agente responda en él.
        const result = await evaluatePrompt(prompt, lang, controller.signal);
        setData(result);
      } catch (err) {
        // Ignoramos las cancelaciones intencionales.
        if ((err as Error).name === "AbortError") return;
        const message =
          err instanceof ApiError ? err.message : "Ocurrió un error inesperado.";
        setError(message);
      } finally {
        // Solo apagamos el loader si esta petición sigue siendo la vigente.
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [lang]
  );

  const submitFeedback = useCallback(
    async (helpful: boolean) => {
      if (!data) return;
      // Actualización optimista: reflejamos el voto de inmediato en la UI.
      setFeedback(helpful);
      try {
        await sendFeedback(data.id, helpful);
      } catch {
        // Feedback best-effort: si falla, revertimos el voto sin molestar al usuario.
        setFeedback(null);
      }
    },
    [data]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setFeedback(null);
  }, []);

  return { data, loading, error, feedback, evaluate, submitFeedback, reset };
}
