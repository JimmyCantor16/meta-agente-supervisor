import { useCallback, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useNotifications } from "../../notifications/NotificationProvider";
import { ApiError, generateProject } from "../../../lib/api";
import type { GenerateResult } from "../types";

interface UseGenerateProjectResult {
  /** Proyecto generado, o null. */
  data: GenerateResult | null;
  /** Indica si hay una generación en curso. */
  loading: boolean;
  /** Mensaje de error legible, o null. */
  error: string | null;
  /** True si el error fue por límite gratuito alcanzado (HTTP 402). */
  licenseRequired: boolean;
  /** Dispara la generación del proyecto para el prompt dado. */
  generate: (prompt: string, modoInquieto?: boolean) => Promise<void>;
}

/**
 * Hook que encapsula la generación de proyectos (agente que construye).
 * Detecta el caso de licencia requerida (402) para que la UI reaccione.
 */
export function useGenerateProject(): UseGenerateProjectResult {
  const { lang, t } = useLanguage();
  const { notify } = useNotifications();
  const [data, setData] = useState<GenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenseRequired, setLicenseRequired] = useState(false);

  const generate = useCallback(
    async (prompt: string, modoInquieto = true) => {
      setLoading(true);
      setError(null);
      setLicenseRequired(false);
      try {
        const result = await generateProject(prompt, lang, modoInquieto);
        setData(result);
        // Aviso: el trabajo largo terminó (puedes estar viendo TV/oyendo radio).
        notify({
          title: t.notif.generatedTitle,
          body: `${t.notif.generatedBody(result.name)} ${result.url ? t.notif.generatedReady : t.notif.generatedNoUrl}`,
          kind: "success",
          url: result.url ?? null,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
          setLicenseRequired(true);
          setError(err.message);
        } else {
          setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
          notify({ title: t.notif.genErrorTitle, body: t.notif.genErrorBody, kind: "error" });
        }
      } finally {
        setLoading(false);
      }
    },
    [lang, t, notify]
  );

  return { data, loading, error, licenseRequired, generate };
}
