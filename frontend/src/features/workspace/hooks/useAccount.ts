import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import type { AccountStatus } from "../../auth/types";
import { getAccount, requestUpgrade } from "../../../lib/api";

interface UseAccountResult {
  account: AccountStatus | null;
  refresh: () => void;
  upgrade: (plan?: string) => Promise<void>;
}

/** Hook del estado de la cuenta por usuario (límites, plan, admin). */
export function useAccount(): UseAccountResult {
  const { user } = useAuth();
  const [account, setAccount] = useState<AccountStatus | null>(null);

  const refresh = useCallback(() => {
    if (!user) {
      setAccount(null);
      return;
    }
    getAccount().then(setAccount);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upgrade = useCallback(async (plan = "pro") => {
    const status = await requestUpgrade(plan);
    setAccount(status);
  }, []);

  return { account, refresh, upgrade };
}
