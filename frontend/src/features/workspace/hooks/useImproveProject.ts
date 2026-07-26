import { useCallback, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { ApiError, improveProject } from "../../../lib/api";
import type { MejoraResult } from "../types";

interface UseImproveProjectResult {
  data: MejoraResult | null;
  loading: boolean;
  error: string | null;
  improve: (projectName: string) => Promise<void>;
}

/** Hook de la auto-mejora: audita y aplica las sugerencias verificando cada una. */
export function useImproveProject(): UseImproveProjectResult {
  const { lang } = useLanguage();
  const [data, setData] = useState<MejoraResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const improve = useCallback(
    async (projectName: string) => {
      setLoading(true);
      setError(null);
      try {
        setData(await improveProject(projectName, lang));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
      } finally {
        setLoading(false);
      }
    },
    [lang]
  );

  return { data, loading, error, improve };
}
