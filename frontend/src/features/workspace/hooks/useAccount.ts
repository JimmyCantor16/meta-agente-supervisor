import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import type { AccountStatus } from "../../auth/types";
import {
  ACCOUNT_CHANGED_EVENT,
  cancelUpgradeRequest,
  getAccount,
  requestUpgrade,
  submitPaymentReceipt,
} from "../../../lib/api";

interface UseAccountResult {
  account: AccountStatus | null;
  refresh: () => void;
  upgrade: (plan?: string) => Promise<void>;
  /** Guarda el nº de comprobante de la solicitud pendiente. */
  submitReceipt: (receipt: string) => Promise<void>;
  /** Retira la solicitud pendiente. */
  cancelRequest: () => Promise<void>;
}

/** Mientras hay un pago pendiente, cada cuánto se vuelve a mirar la cuenta. */
const SONDEO_PENDIENTE_MS = 15_000;

/**
 * Hook del estado de la cuenta por usuario (límites, plan, admin).
 *
 * Se refresca solo cuando el admin decide: al llegar el aviso por WebSocket
 * (evento de ventana `account-changed`, lo lanza el NotificationProvider) y,
 * por si el socket no está, sondeando cada 15 s mientras el pago está pendiente.
 */
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

  useEffect(() => {
    window.addEventListener(ACCOUNT_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, refresh);
  }, [refresh]);

  const pendiente = account?.status === "pending_payment";
  useEffect(() => {
    if (!pendiente) return;
    const id = window.setInterval(refresh, SONDEO_PENDIENTE_MS);
    return () => window.clearInterval(id);
  }, [pendiente, refresh]);

  const upgrade = useCallback(async (plan = "pro") => {
    setAccount(await requestUpgrade(plan));
  }, []);

  const submitReceipt = useCallback(async (receipt: string) => {
    setAccount(await submitPaymentReceipt(receipt));
  }, []);

  const cancelRequest = useCallback(async () => {
    setAccount(await cancelUpgradeRequest());
  }, []);

  return { account, refresh, upgrade, submitReceipt, cancelRequest };
}
