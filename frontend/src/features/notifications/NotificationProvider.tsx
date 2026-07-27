import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";

// Sistema de notificaciones en tiempo real (per-device): centro de avisos con
// historial + toasts + AVISO NATIVO del sistema operativo (Notification API, que
// también funciona dentro de la app de escritorio Tauri y del webview Android).
// Pensado para avisarte cuando un trabajo largo (generar proyecto) termina, para
// que puedas ver TV / oír radio mientras tanto y volver cuando esté listo.

export type NotifKind = "success" | "info" | "error";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  kind: NotifKind;
  url?: string | null;
  ts: number;
  read: boolean;
}

interface NotifInput {
  title: string;
  body: string;
  kind?: NotifKind;
  url?: string | null;
}

interface NotificationContextValue {
  notifs: AppNotification[];
  unread: number;
  permission: NotificationPermission | "unsupported";
  notify: (n: NotifInput) => void;
  markAllRead: () => void;
  clearAll: () => void;
  requestPermission: () => void;
}

const Ctx = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useNotifications fuera de <NotificationProvider>");
  return v;
}

const LS_KEY = "app.notifs";
const MAX = 40;

function loadNotifs(): AppNotification[] {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function newId(): string {
  const c = window.crypto as Crypto | undefined;
  if (c && "randomUUID" in c) return c.randomUUID();
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** True si corremos DENTRO de la app de escritorio (Tauri), no en el navegador. */
function esEscritorio(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

/**
 * Dispara un aviso NATIVO del sistema (ventana emergente de Windows):
 * - En ESCRITORIO usa el plugin de notificaciones de Tauri (toast real de Windows).
 * - En NAVEGADOR usa la Notification API (Chrome/Edge lo muestran como toast de Windows).
 */
async function avisoNativo(title: string, body: string): Promise<void> {
  if (esEscritorio()) {
    try {
      const mod = await import("@tauri-apps/plugin-notification");
      let ok = await mod.isPermissionGranted();
      if (!ok) ok = (await mod.requestPermission()) === "granted";
      if (ok) mod.sendNotification({ title, body });
      return;
    } catch {
      /* si el plugin no está, caemos al Notification web */
    }
  }
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, { body });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* algunos entornos limitan Notification(); el toast in-app basta */
    }
  }
}

/** URL del WebSocket de eventos del backend (mismo canal de progreso en vivo). */
function wsProgresoUrl(): string {
  // Escritorio (Tauri): el backend compartido corre en el mismo PC (Docker :8000).
  if (esEscritorio()) return "ws://localhost:8000/api/v1/ws/progreso";
  // Render: el proxy estático no reenvía WebSocket → directo al backend.
  if (window.location.host.endsWith(".onrender.com")) return "wss://metaagente-backend.onrender.com/api/v1/ws/progreso";
  // Navegador local: mismo origen (nginx hace de proxy al backend).
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/api/v1/ws/progreso`;
}

export function NotificationProvider({ children }: PropsWithChildren) {
  const { t } = useLanguage();
  const [notifs, setNotifs] = useState<AppNotification[]>(loadNotifs);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    esEscritorio() ? "default" : "Notification" in window ? Notification.permission : "unsupported",
  );
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(notifs.slice(0, MAX)));
    } catch {
      /* almacenamiento lleno: no crítico */
    }
  }, [notifs]);

  const requestPermission = useCallback(() => {
    if (esEscritorio()) {
      import("@tauri-apps/plugin-notification")
        .then(async (mod) => {
          const p = await mod.requestPermission();
          setPermission(p === "granted" ? "granted" : "denied");
          if (p === "granted") mod.sendNotification({ title: "Avisos activados", body: "Te avisaré aquí cuando tu sistema esté listo." });
        })
        .catch(() => undefined);
      return;
    }
    if (!("Notification" in window)) return;
    Notification.requestPermission().then((p) => setPermission(p));
  }, []);

  const notify = useCallback((input: NotifInput) => {
    const n: AppNotification = {
      id: newId(),
      title: input.title,
      body: input.body,
      kind: input.kind ?? "info",
      url: input.url ?? null,
      ts: Date.now(),
      read: false,
    };
    setNotifs((prev) => [n, ...prev].slice(0, MAX));

    // Toast en la app (se autodescarta).
    setToasts((prev) => [n, ...prev].slice(0, 4));
    timers.current[n.id] = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== n.id));
    }, 7000);

    // Aviso NATIVO del sistema (ventana emergente de Windows), aunque la ventana
    // esté detrás / estés viendo TV. Escritorio → Tauri; navegador → Notification.
    void avisoNativo(n.title, n.body);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifs((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => setNotifs([]), []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    window.clearTimeout(timers.current[id]);
  }, []);

  const unread = notifs.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);

  // Refs vivos para el WebSocket (evita reconectar en cada render).
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const tRef = useRef(t);
  tRef.current = t;

  // FASE 2: un SOLO proceso (la generación en el backend) → aviso EN VIVO a
  // TODOS los dispositivos conectados (web + escritorio + móvil) al mismo tiempo,
  // por el WebSocket compartido /api/v1/ws/progreso. Reconecta si se cae.
  useEffect(() => {
    let ws: WebSocket | null = null;
    let cerrado = false;
    let retry = 0;
    const conectar = () => {
      try {
        ws = new WebSocket(wsProgresoUrl());
        ws.onmessage = (e: MessageEvent) => {
          const txt = String(e.data || "");
          const tt = tRef.current;
          if (/VIVO|🚀/i.test(txt)) {
            const m = txt.match(/https?:\/\/\S+/);
            notifyRef.current({
              title: tt.notif.generatedTitle,
              body: txt.replace(/^🚀\s*/, ""),
              kind: "success",
              url: m ? m[0] : null,
            });
          } else if (/RETENIDA|no se entrega/i.test(txt)) {
            notifyRef.current({ title: tt.notif.genErrorTitle, body: tt.notif.genErrorBody, kind: "error" });
          }
        };
        ws.onclose = () => {
          if (!cerrado) retry = window.setTimeout(conectar, 5000);
        };
        ws.onerror = () => {
          try {
            ws?.close();
          } catch {
            /* noop */
          }
        };
      } catch {
        retry = window.setTimeout(conectar, 5000);
      }
    };
    conectar();
    return () => {
      cerrado = true;
      window.clearTimeout(retry);
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    };
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({ notifs, unread, permission, notify, markAllRead, clearAll, requestPermission }),
    [notifs, unread, permission, notify, markAllRead, clearAll, requestPermission],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </Ctx.Provider>
  );
}

const ICON: Record<NotifKind, string> = { success: "✅", info: "🔔", error: "⚠️" };
const RING: Record<NotifKind, string> = {
  success: "border-emerald-200",
  info: "border-brand-200",
  error: "border-red-200",
};

function ToastStack({ toasts, onDismiss }: { toasts: AppNotification[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-80 items-start gap-3 rounded-2xl border ${RING[t.kind]} bg-white p-3 shadow-2xl`}
        >
          <span className="text-lg" aria-hidden>
            {ICON[t.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{t.title}</p>
            <p className="mt-0.5 text-xs leading-snug text-slate-500">{t.body}</p>
            {t.url && (
              <a
                href={t.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:underline"
              >
                Abrir ↗
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="text-slate-300 hover:text-slate-600"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
