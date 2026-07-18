import { useCallback, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { ApiError, auditProject } from "../../../lib/api";
import type { AuditResult } from "../types";

interface UseAuditProjectResult {
  /** Informe de auditoría, o null. */
  data: AuditResult | null;
  /** Indica si hay una auditoría en curso. */
  loading: boolean;
  /** Mensaje de error legible, o null. */
  error: string | null;
  /** Dispara la auditoría del proyecto dado. */
  audit: (projectName: string) => Promise<void>;
}

/**
 * Hook que encapsula la auditoría de proyectos (agente proactivo).
 */
export function useAuditProject(): UseAuditProjectResult {
  const { lang } = useLanguage();
  const [data, setData] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audit = useCallback(
    async (projectName: string) => {
      setLoading(true);
      setError(null);
      try {
        setData(await auditProject(projectName, lang));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
      } finally {
        setLoading(false);
      }
    },
    [lang]
  );

  return { data, loading, error, audit };
}
