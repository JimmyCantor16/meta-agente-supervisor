import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useNotifications } from "./NotificationProvider";

const ICON: Record<string, string> = { success: "✅", info: "🔔", error: "⚠️" };

/** Campana con contador de no leídos + panel del centro de avisos. */
export function NotificationBell() {
  const { t } = useLanguage();
  const { notifs, unread, permission, markAllRead, clearAll, requestPermission } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next && unread > 0) markAllRead();
      return next;
    });
  };

  const fmt = (ts: number) => {
    const diff = Math.round((Date.now() - ts) / 60000);
    if (diff < 1) return t.notif.now;
    if (diff < 60) return t.notif.minsAgo(diff);
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-muted hover:text-ink-body"
        title={t.notif.title}
        aria-label={t.notif.title}
      >
        <span className="text-lg" aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-2.5">
            <b className="text-sm font-bold text-ink">{t.notif.title}</b>
            {notifs.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-medium text-ink-faint hover:text-ink-body"
              >
                {t.notif.clear}
              </button>
            )}
          </div>

          {/* Activar avisos del sistema */}
          {permission !== "granted" && permission !== "unsupported" && (
            <button
              type="button"
              onClick={requestPermission}
              className="flex w-full items-center gap-2 border-b border-black/10 bg-brand-50 px-4 py-2.5 text-left text-xs font-semibold text-brand-700 hover:bg-brand-100"
            >
              🔓 {t.notif.enable}
            </button>
          )}
          {permission === "granted" && (
            <div className="border-b border-black/10 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700">
              ✅ {t.notif.enabled}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-ink-faint">{t.notif.empty}</p>
            ) : (
              notifs.map((n) => (
                <div key={n.id} className="flex items-start gap-2.5 border-b border-slate-50 px-4 py-2.5 last:border-0">
                  <span className="text-base" aria-hidden>{ICON[n.kind] ?? "🔔"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-ink-muted">{n.body}</p>
                    {n.url && (
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:underline"
                      >
                        {t.notif.open} ↗
                      </a>
                    )}
                    <p className="mt-0.5 text-[10px] text-ink-faint">{fmt(n.ts)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
