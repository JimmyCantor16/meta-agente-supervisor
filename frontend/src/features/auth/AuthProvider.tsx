import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { depositarCredencialPuente, getAuthConfig, loginWithGoogle } from "../../lib/api";
import { useLanguage } from "../../i18n/LanguageProvider";
import type { AuthConfig, AuthUser } from "./types";

const STORAGE_KEY = "auth.user";
const CREDENTIAL_KEY = "auth.credential";

/** Código del PUENTE de escritorio, si esta web se abrió para dar sesión a la app. */
function codigoPuente(): string | null {
  try {
    const codigo = new URLSearchParams(window.location.search).get("puente");
    return codigo && /^[A-Za-z0-9]{16,64}$/.test(codigo) ? codigo : null;
  } catch {
    return null;
  }
}

/** Quita el `?puente=` de la barra de direcciones (no debe quedar en el historial). */
function limpiarParametroPuente(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("puente");
    window.history.replaceState({}, "", url.toString());
  } catch {
    /* si el navegador no lo permite, no es crítico */
  }
}

/**
 * Código CORTO y legible para que la persona lo compare con el que muestra su
 * app de escritorio (como el emparejamiento de un televisor). Ambos lados lo
 * derivan igual del mismo código secreto.
 */
export function codigoVisible(codigo: string): string {
  const base = codigo.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `${base.slice(0, 4)}-${base.slice(4, 8)}`;
}

interface AuthContextValue {
  /** Usuario autenticado, o null. */
  user: AuthUser | null;
  /** Config del login (habilitado + client_id), o null mientras carga. */
  config: AuthConfig | null;
  /** Verifica el credential de Google en el backend e inicia sesión. */
  signIn: (credential: string) => Promise<void>;
  /** Cierra la sesión. */
  logout: () => void;
  /** True si esta web se abrió para dar sesión a la app de escritorio. */
  esPuenteEscritorio: boolean;
  /** True cuando el token ya viajó al escritorio (puede volver a la app). */
  puenteEntregado: boolean;
  /** Entrega la sesión al escritorio. SOLO tras autorización explícita. */
  autorizarPuente: () => Promise<boolean>;
  /** Descarta la petición del puente. */
  cancelarPuente: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Proveedor de autenticación: gestiona el usuario y la config de Google. */
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    // Si el dato quedó corrupto, arrancar sin sesión en vez de romper la app
    // entera con una pantalla en blanco de la que no se puede salir.
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as AuthUser) : null;
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(CREDENTIAL_KEY);
      return null;
    }
  });
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [esPuenteEscritorio] = useState<boolean>(() => codigoPuente() !== null);
  const [puenteEntregado, setPuenteEntregado] = useState(false);
  const [puenteCancelado, setPuenteCancelado] = useState(false);

  useEffect(() => {
    getAuthConfig().then(setConfig);
  }, []);

  // Si el backend indica que la sesión expiró (401), cerramos sesión para
  // que la UI pida iniciar sesión de nuevo (login fluido).
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(CREDENTIAL_KEY);
    };
    window.addEventListener("auth-expired", onExpired);
    return () => window.removeEventListener("auth-expired", onExpired);
  }, []);

  const signIn = useCallback(async (credential: string) => {
    const authUser = await loginWithGoogle(credential);
    setUser(authUser);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    // Guardamos el token para autenticar las peticiones protegidas (Bearer).
    window.localStorage.setItem(CREDENTIAL_KEY, credential);

    // PUENTE: NO se entrega la sesión automáticamente. Un enlace malicioso
    // (?puente=CODIGO_DEL_ATACANTE) haría que el token de la víctima acabara en
    // manos de quien eligió el código. La entrega exige que la persona COMPARE
    // el código con el que muestra su app y lo autorice a mano.
  }, []);

  /** Entrega la sesión a la app de escritorio (solo tras autorización explícita). */
  const autorizarPuente = useCallback(async (): Promise<boolean> => {
    const codigo = codigoPuente();
    const credential = window.localStorage.getItem(CREDENTIAL_KEY);
    if (!codigo || !credential) return false;
    const ok = await depositarCredencialPuente(codigo, credential);
    setPuenteEntregado(ok);
    if (ok) limpiarParametroPuente();
    return ok;
  }, []);

  /** Descarta la petición del puente (el usuario no la reconoce). */
  const cancelarPuente = useCallback(() => {
    setPuenteCancelado(true);
    limpiarParametroPuente();
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setPuenteEntregado(false);
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(CREDENTIAL_KEY);
    // Evita el auto-login de Google en la próxima visita.
    const google = (window as unknown as { google?: { accounts?: { id?: { disableAutoSelect?: () => void } } } }).google;
    google?.accounts?.id?.disableAutoSelect?.();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user, config, signIn, logout,
      esPuenteEscritorio, puenteEntregado, autorizarPuente, cancelarPuente,
    }),
    [user, config, signIn, logout, esPuenteEscritorio, puenteEntregado, autorizarPuente, cancelarPuente]
  );

  // Se pide permiso SOLO si: vino con código, hay sesión, no se entregó aún y
  // no se canceló. Sin este permiso explícito, la sesión NUNCA sale de aquí.
  const pedirPermiso = esPuenteEscritorio && Boolean(user) && !puenteEntregado && !puenteCancelado;

  return (
    <AuthContext.Provider value={value}>
      {pedirPermiso && <PermisoPuente />}
      {esPuenteEscritorio && puenteEntregado && <AvisoVuelveALaApp />}
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Pantalla de PERMISO del puente: la persona debe comprobar que el código
 * coincide con el que muestra su app de escritorio. Esto es lo que impide que
 * un enlace ajeno («?puente=CODIGO_DEL_ATACANTE») se lleve la sesión.
 */
function PermisoPuente() {
  const { t } = useLanguage();
  const { autorizarPuente, cancelarPuente } = useAuth();
  const [enviando, setEnviando] = useState(false);
  const codigo = codigoPuente();
  if (!codigo) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900">{t.auth.bridgeConsentTitle}</h2>
        <p className="mt-2 text-sm text-slate-600">{t.auth.bridgeConsentBody}</p>

        <div className="my-4 rounded-xl border-2 border-brand-200 bg-brand-50 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            {t.auth.bridgeConsentCodeLabel}
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.2em] text-brand-800">
            {codigoVisible(codigo)}
          </p>
        </div>

        <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          ⚠ {t.auth.bridgeConsentWarning}
        </p>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={cancelarPuente}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t.auth.bridgeConsentCancel}
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => {
              setEnviando(true);
              void autorizarPuente().finally(() => setEnviando(false));
            }}
            className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {enviando ? t.auth.bridgeConsentSending : t.auth.bridgeConsentAuthorize}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Aviso para quien vino desde la app de escritorio: la sesión ya viajó. */
function AvisoVuelveALaApp() {
  const { t } = useLanguage();
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
    >
      <span aria-hidden>✅</span>
      {t.auth.bridgeReturn}
    </div>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return ctx;
}
