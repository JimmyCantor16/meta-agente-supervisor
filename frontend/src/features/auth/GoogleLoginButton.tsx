import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useAuth } from "./AuthProvider";

const GIS_SRC = "https://accounts.google.com/gsi/client";
// En la app de escritorio (API directa, sin proxy) Google bloquea su login
// dentro del WebView: el flujo correcto es el puente por navegador real.
const API_ESCRITORIO = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

// Acceso laxo al objeto global de Google Identity Services.
type GoogleId = {
  accounts?: {
    id?: {
      initialize: (opts: { client_id: string; callback: (r: { credential: string }) => void }) => void;
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
    };
  };
};
function googleId(): GoogleId["accounts"] {
  return (window as unknown as { google?: GoogleId }).google?.accounts;
}

/**
 * Botón "Iniciar sesión con Google" (Google Identity Services).
 * Si el login aún no está configurado (sin Client ID), muestra un botón inerte.
 */
export function GoogleLoginButton() {
  const { config, signIn } = useAuth();
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  const [errorPuente, setErrorPuente] = useState<string | null>(null);

  // --- Rama ESCRITORIO: Google BLOQUEA el login dentro del WebView y el origen
  // de la app no está autorizado. Solución que SÍ funciona hoy: abrir la web
  // (localhost:8080, origen autorizado) en el navegador real, donde el login de
  // Google funciona. El escritorio no necesita sesión para ver notificaciones. ---
  const [aviso, setAviso] = useState<string | null>(null);
  const entrarPorNavegador = async () => {
    setErrorPuente(null);
    setAviso(null);
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl("http://localhost:8080");
      setAviso(t.auth.desktopOpenedWeb);
    } catch {
      setErrorPuente(t.auth.desktopOpenWebManual);
    }
  };

  useEffect(() => {
    if (API_ESCRITORIO) return; // escritorio: no se usa GIS embebido
    if (!config?.enabled || !config.client_id) return;

    const render = (): boolean => {
      const accounts = googleId();
      if (!accounts?.id || !ref.current) return false;
      accounts.id.initialize({
        client_id: config.client_id,
        callback: (resp) => {
          void signIn(resp.credential).catch(() => {});
        },
      });
      accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        type: "standard",
        shape: "pill",
        text: "signin_with",
      });
      return true;
    };

    if (render()) return;

    // Carga el script de Google una sola vez y renderiza al terminar.
    let script = document.getElementById("gis-script") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.id = "gis-script";
      document.body.appendChild(script);
    }
    script.addEventListener("load", render, { once: true });
  }, [config, signIn]);

  if (!config) return null;

  // ESCRITORIO: botón propio que abre el navegador real (Google bloquea el WebView).
  if (API_ESCRITORIO && config.enabled) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button
          onClick={() => void entrarPorNavegador()}
          className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-300"
        >
          <span aria-hidden>🌐</span>
          {t.auth.bridgeButton}
        </button>
        {aviso && <p className="max-w-[220px] text-right text-xs text-emerald-600">✅ {aviso}</p>}
        {errorPuente && <p className="max-w-[220px] text-right text-xs text-red-600">⚠ {errorPuente}</p>}
      </div>
    );
  }

  if (!config.enabled) {
    return (
      <button
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white opacity-60"
        title="El login se activará al configurar el Client ID de Google."
        disabled
      >
        {t.topbar.login}
      </button>
    );
  }

  // Contenedor donde Google renderiza su botón oficial.
  return <div ref={ref} />;
}
