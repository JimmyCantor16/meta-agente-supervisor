import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useAuth } from "./AuthProvider";

const GIS_SRC = "https://accounts.google.com/gsi/client";
// En la app de escritorio (API directa, sin proxy) Google bloquea su login
// dentro del WebView: el flujo correcto es el puente por navegador real.
const API_ESCRITORIO = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

function estadoAleatorio(): string {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  const cripto = window.crypto.getRandomValues(new Uint8Array(32));
  for (const b of cripto) s += abc[b % abc.length];
  return s;
}

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
  const [esperando, setEsperando] = useState(false);
  const [errorPuente, setErrorPuente] = useState<string | null>(null);

  // --- Rama ESCRITORIO: login por el navegador real del usuario ---
  const entrarPorNavegador = async () => {
    setErrorPuente(null);
    setEsperando(true);
    const estado = estadoAleatorio();
    try {
      const r = await fetch(`${API_ESCRITORIO}/api/v1/auth/puente/abrir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!r.ok) throw new Error("No se pudo abrir el navegador.");
      // Polling: hasta 2 minutos esperando que el usuario complete el login.
      for (let i = 0; i < 80; i++) {
        await new Promise((res) => window.setTimeout(res, 1500));
        const rec = await fetch(
          `${API_ESCRITORIO}/api/v1/auth/puente/recoger?estado=${estado}`
        );
        if (rec.ok) {
          const { credential } = (await rec.json()) as { credential: string };
          await signIn(credential);
          setEsperando(false);
          return;
        }
      }
      throw new Error("Se agotó el tiempo. Intenta de nuevo.");
    } catch (err) {
      setErrorPuente(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
      setEsperando(false);
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
      <div className="flex flex-col items-start gap-1.5">
        <button
          onClick={() => void entrarPorNavegador()}
          disabled={esperando}
          className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 disabled:opacity-60"
        >
          <span aria-hidden>🌐</span>
          {esperando ? t.auth.bridgeWaiting : t.auth.bridgeButton}
        </button>
        {esperando && <p className="text-xs text-slate-400">{t.auth.bridgeHint}</p>}
        {errorPuente && <p className="text-xs text-red-600">⚠ {errorPuente}</p>}
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
