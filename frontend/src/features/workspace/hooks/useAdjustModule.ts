import { useCallback, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { ApiError, adjustModule } from "../../../lib/api";
import type { AjusteResult, NivelAutonomia } from "../types";

interface UseAdjustModuleResult {
  data: AjusteResult | null;
  loading: boolean;
  /** Nivel en curso mientras carga (para marcar el botón pulsado). */
  activeNivel: NivelAutonomia | null;
  error: string | null;
  adjust: (
    projectName: string,
    ajuste: string,
    nivel: NivelAutonomia,
    propuestaId?: string | null
  ) => Promise<void>;
  reset: () => void;
}

/** Hook del ajuste de clase: el alumno elige cuánto hace la IA. */
export function useAdjustModule(): UseAdjustModuleResult {
  const { lang } = useLanguage();
  const [data, setData] = useState<AjusteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeNivel, setActiveNivel] = useState<NivelAutonomia | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adjust = useCallback(
    async (
      projectName: string,
      ajuste: string,
      nivel: NivelAutonomia,
      propuestaId?: string | null
    ) => {
      setLoading(true);
      setActiveNivel(nivel);
      setError(null);
      try {
        setData(await adjustModule(projectName, ajuste, nivel, lang, propuestaId));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
      } finally {
        setLoading(false);
        setActiveNivel(null);
      }
    },
    [lang]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, activeNivel, error, adjust, reset };
}
