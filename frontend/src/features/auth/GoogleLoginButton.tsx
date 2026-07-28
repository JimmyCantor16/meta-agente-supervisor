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
  // de la app no está autorizado. Solución que SÍ funciona: abrir la WEB DE
  // PRODUCCIÓN (origen autorizado en Google) en el navegador real, donde el login
  // funciona. El escritorio ya ve las notificaciones sin sesión. ---
  const WEB_PROD = "https://metaagente-frontend.onrender.com";
  const [aviso, setAviso] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false);
  // Código VISIBLE: la persona lo compara con el que le muestra la web antes de
  // autorizar. Sin esa comparación, un enlace ajeno podría llevarse la sesión.
  const [codigoMostrado, setCodigoMostrado] = useState<string | null>(null);
  const cancelado = useRef(false);

  /** Código de un solo uso (alfanumérico, 16-64), como exige el backend. */
  const nuevoCodigo = (): string => {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
  };

  // PUENTE: la sesión nace en el navegador (origen autorizado) y viaja hasta la
  // app. Se abre la web con un código y se sondea al backend hasta recogerla.
  const entrarPorNavegador = async () => {
    setErrorPuente(null);
    setAviso(null);
    const codigo = nuevoCodigo();
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(`${WEB_PROD}/?puente=${codigo}`);
    } catch {
      setErrorPuente(t.auth.desktopOpenWebManual);
      return;
    }
    // Se muestra el código para que la persona lo compare con el de la web.
    const { codigoVisible } = await import("./AuthProvider");
    setCodigoMostrado(codigoVisible(codigo));
    setAviso(t.auth.desktopOpenedWeb);
    setEsperando(true);
    cancelado.current = false;
    const { recogerCredencialPuente } = await import("../../lib/api");
    // Hasta 5 minutos (lo que vive el código), comprobando cada 2 segundos.
    for (let i = 0; i < 150 && !cancelado.current; i += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const credential = await recogerCredencialPuente(codigo);
      if (!credential) continue;
      try {
        await signIn(credential);
        setEsperando(false);
        setAviso(null);
      } catch {
        setEsperando(false);
        setErrorPuente(t.auth.desktopOpenWebManual);
      }
      return;
    }
    setEsperando(false);
    if (!cancelado.current) setErrorPuente(t.auth.bridgeTimeout);
  };

  // Al desmontar, se corta el sondeo.
  useEffect(
    () => () => {
      cancelado.current = true;
    },
    [],
  );

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
          disabled={esperando}
          className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand-300 disabled:opacity-60"
        >
          <span aria-hidden>{esperando ? "⏳" : "🌐"}</span>
          {esperando ? t.auth.bridgeWaiting : t.auth.bridgeButton}
        </button>
        {esperando && codigoMostrado && (
          <div className="rounded-xl border-2 border-brand-200 bg-brand-50 px-4 py-2.5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
              {t.auth.bridgeConsentCodeLabel}
            </p>
            <p className="font-mono text-xl font-bold tracking-[0.2em] text-brand-800">{codigoMostrado}</p>
          </div>
        )}
        {esperando && <p className="max-w-[220px] text-right text-xs text-slate-500">{t.auth.bridgeHint}</p>}
        {aviso && !esperando && <p className="max-w-[220px] text-right text-xs text-emerald-600">✅ {aviso}</p>}
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
