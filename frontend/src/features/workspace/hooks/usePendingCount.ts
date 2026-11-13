import { useCallback, useEffect, useState } from "react";
import { ACCOUNT_CHANGED_EVENT, adminListPending } from "../../../lib/api";

/** Cada cuánto se revisa la bandeja si no llega ningún aviso por el socket. */
const SONDEO_MS = 60_000;

/**
 * Solicitudes de plan pendientes, para el contador del menú del super-admin.
 *
 * Se relee al llegar un aviso de cuenta (WebSocket) y cada minuto por si el
 * socket está caído. Para quien no es admin no hace ninguna petición.
 */
export function usePendingCount(isAdmin: boolean): [number, (n: number) => void] {
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    adminListPending()
      .then((p) => setCount(p.length))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setCount(0);
      return;
    }
    load();
    const id = window.setInterval(load, SONDEO_MS);
    window.addEventListener(ACCOUNT_CHANGED_EVENT, load);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, load);
    };
  }, [isAdmin, load]);

  return [count, setCount];
}
