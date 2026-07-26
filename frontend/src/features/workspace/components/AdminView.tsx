import { useCallback, useEffect, useState } from "react";
import { Button } from "../../../components/Button";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { adminApprove, adminListPending } from "../../../lib/api";
import type { AccountStatus } from "../../auth/types";

/**
 * Panel del super-admin: usuarios pendientes de pago y su aprobación.
 */
export function AdminView() {
  const { t } = useLanguage();
  const [pending, setPending] = useState<AccountStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminListPending()
      .then(setPending)
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (sub: string) => {
    setApproving(sub);
    try {
      // Plan vacío => el backend usa el plan que el usuario solicitó.
      await adminApprove(sub, "");
      load();
    } catch {
      /* ignore */
    } finally {
      setApproving(null);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900">🛡️ {t.admin.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{t.admin.subtitle}</p>

      <div className="mt-5 space-y-3">
        {loading ? (
          <p className="text-sm text-slate-400">…</p>
        ) : pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
            {t.admin.empty}
          </div>
        ) : (
          pending.map((u) => (
            <div
              key={u.sub}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-slate-800">
                  {u.name || u.email}
                  {u.requested_plan && (
                    <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                      → {u.requested_plan}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400">{u.email}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {u.generations_used} proyectos · {u.lessons_used} clases {t.admin.used}
                </p>
              </div>
              <Button onClick={() => approve(u.sub)} loading={approving === u.sub}>
                {approving === u.sub ? t.admin.approving : t.admin.approve}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
