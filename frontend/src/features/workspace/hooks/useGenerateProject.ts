import { useCallback, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
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
  const { lang } = useLanguage();
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
        // El aviso de "sistema listo" lo emite el WebSocket compartido a TODOS los
        // dispositivos (web + escritorio + móvil), no solo a este. Ver NotificationProvider.
        setData(await generateProject(prompt, lang, modoInquieto));
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
          setLicenseRequired(true);
          setError(err.message);
        } else {
          setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
        }
      } finally {
        setLoading(false);
      }
    },
    [lang]
  );

  return { data, loading, error, licenseRequired, generate };
}
