import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { obtenerVersionEscritorio, type VersionEscritorio } from "../../lib/api";
import { esEscritorio } from "../../lib/canal";
import { useNotifications } from "../notifications/NotificationProvider";

// Aviso de versión nueva del ESCRITORIO.
//
// El problema: la app de escritorio es un webview Tauri con el frontend
// HORNEADO dentro del instalador. No hay auto-update: quien instala hoy queda
// congelado en la versión de hoy, aunque la web y el backend sigan avanzando.
//
// La solución barata de esta fase no es actualizar sola, es AVISAR: al abrir la
// app se le pregunta al backend cuál es la última versión publicada y, si es
// mayor que la horneada en este build, se muestra un banner discreto con el
// botón de descarga más una notificación nativa (una sola vez por sesión).
//
// Regla de silencio: si el endpoint falla, no hay red, o `url_descarga` viene
// vacía (= no hay instalador publicado todavía), no se muestra NADA. El aviso
// es un extra; jamás debe estorbar el uso normal de la app.

// La versión de ESTE build, horneada por build-desktop.ps1 (VITE_APP_VERSION).
// En la web queda vacía y el componente no hace nada (la web siempre está al día).
const VERSION_HORNEADA = String(import.meta.env.VITE_APP_VERSION ?? "").trim();

/**
 * ¿`candidata` es una versión mayor que `actual`? Comparación semver simple:
 * se parte por puntos y se compara numéricamente tramo a tramo. Un tramo que
 * no sea número cuenta como 0 (mejor quedarse callado que avisar en falso).
 */
export function esVersionMayor(candidata: string, actual: string): boolean {
  if (!candidata || !actual) return false;
  const aNumeros = (v: string) => v.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const a = aNumeros(candidata);
  const b = aNumeros(actual);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** La notificación nativa suena UNA vez por sesión (y por versión), no en cada recarga. */
function yaSeNotifico(version: string): boolean {
  const clave = `aviso.version.notificada:${version}`;
  try {
    if (window.sessionStorage.getItem(clave)) return true;
    window.sessionStorage.setItem(clave, "1");
    return false;
  } catch {
    // Sin sessionStorage no podemos recordar: con el banner basta.
    return true;
  }
}

/**
 * Banner discreto + notificación nativa cuando hay una versión nueva de la app
 * de escritorio. Fuera del escritorio (web/móvil) no renderiza nada nunca.
 */
export function AvisoVersion() {
  const { t } = useLanguage();
  const { notify } = useNotifications();
  const [aviso, setAviso] = useState<VersionEscritorio | null>(null);
  const [cerrado, setCerrado] = useState(false);

  // Refs vivos para que el efecto (que corre una sola vez) no capture valores viejos.
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    // Solo dentro de la app Tauri, y solo si este build lleva versión horneada.
    if (!esEscritorio() || !VERSION_HORNEADA) return;
    let cancelado = false;
    void (async () => {
      // La llamada vive en api.ts (regla del proyecto) y nunca lanza: ante
      // fallo de red o servidor dormido devuelve null y aquí no pasa nada.
      const datos = await obtenerVersionEscritorio();
      // Sin URL de descarga no hay nada que ofrecer: silencio total.
      if (cancelado || !datos || !datos.url_descarga) return;
      if (!esVersionMayor(datos.ultima, VERSION_HORNEADA)) return;
      setAviso(datos);
      if (yaSeNotifico(datos.ultima)) return;
      // Reusa el mecanismo del centro de avisos: toast + notificación NATIVA
      // (en escritorio, el plugin de Tauri) + historial, todo en una llamada.
      notifyRef.current({
        title: tRef.current.desktopUpdate.notifTitle,
        body: tRef.current.desktopUpdate.notifBody(datos.ultima),
        kind: "info",
      });
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (!aviso || cerrado) return null;

  // La descarga se abre en el NAVEGADOR real, no dentro del webview: mismo
  // truco que usa GoogleLoginButton para salir de la app (plugin opener).
  const abrirDescarga = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(aviso.url_descarga);
    } catch {
      // Respaldo (p. ej. probando en navegador): pestaña nueva normal.
      window.open(aviso.url_descarga, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-black/10 bg-white p-3 shadow-card">
        <Download className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
        <p className="min-w-0 flex-1 text-xs leading-snug text-ink-body">
          {t.desktopUpdate.banner(aviso.ultima)}
        </p>
        <button
          type="button"
          onClick={() => void abrirDescarga()}
          className="shrink-0 rounded bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700"
        >
          {t.desktopUpdate.download}
        </button>
        <button
          type="button"
          onClick={() => setCerrado(true)}
          className="shrink-0 text-ink-faint transition hover:text-ink-body"
          aria-label={t.desktopUpdate.dismiss}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
