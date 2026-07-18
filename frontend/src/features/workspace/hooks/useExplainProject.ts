import { useCallback, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { ApiError, explainProject } from "../../../lib/api";
import type { TeachingResult } from "../types";

interface UseExplainProjectResult {
  data: TeachingResult | null;
  loading: boolean;
  error: string | null;
  explain: (projectName: string) => Promise<void>;
}

/** Hook del Modo Profesor: pide la guía didáctica de un proyecto. */
export function useExplainProject(): UseExplainProjectResult {
  const { lang } = useLanguage();
  const [data, setData] = useState<TeachingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explain = useCallback(
    async (projectName: string) => {
      setLoading(true);
      setError(null);
      try {
        setData(await explainProject(projectName, lang));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
      } finally {
        setLoading(false);
      }
    },
    [lang]
  );

  return { data, loading, error, explain };
}
