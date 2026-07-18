import { useCallback, useEffect, useState } from "react";
import { activateLicense, ApiError, getUsage } from "../../../lib/api";
import type { UsageStatus } from "../types";

interface UseUsageResult {
  usage: UsageStatus | null;
  refresh: () => void;
  activate: (key: string) => Promise<boolean>;
  activateError: string | null;
}

/** Hook del estado de uso/licencia (generaciones gratis restantes). */
export function useUsage(): UseUsageResult {
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getUsage().then(setUsage);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activate = useCallback(async (key: string): Promise<boolean> => {
    setActivateError(null);
    try {
      const status = await activateLicense(key);
      setUsage(status);
      return true;
    } catch (err) {
      setActivateError(err instanceof ApiError ? err.message : "Error al activar la licencia.");
      return false;
    }
  }, []);

  return { usage, refresh, activate, activateError };
}
