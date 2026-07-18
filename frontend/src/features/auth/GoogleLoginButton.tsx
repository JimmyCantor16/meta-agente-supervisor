import { useEffect, useRef } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useAuth } from "./AuthProvider";

const GIS_SRC = "https://accounts.google.com/gsi/client";

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

  useEffect(() => {
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
