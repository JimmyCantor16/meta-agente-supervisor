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
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Proveedor de autenticación: gestiona el usuario y la config de Google. */
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as AuthUser) : null;
  });
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [esPuenteEscritorio] = useState<boolean>(() => codigoPuente() !== null);
  const [puenteEntregado, setPuenteEntregado] = useState(false);

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

    // PUENTE: si esta web se abrió desde la app de escritorio, le entregamos la
    // sesión recién nacida (el escritorio la está esperando con su código).
    const codigo = codigoPuente();
    if (codigo) {
      const ok = await depositarCredencialPuente(codigo, credential);
      setPuenteEntregado(ok);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(CREDENTIAL_KEY);
    // Evita el auto-login de Google en la próxima visita.
    const google = (window as unknown as { google?: { accounts?: { id?: { disableAutoSelect?: () => void } } } }).google;
    google?.accounts?.id?.disableAutoSelect?.();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, config, signIn, logout, esPuenteEscritorio, puenteEntregado }),
    [user, config, signIn, logout, esPuenteEscritorio, puenteEntregado]
  );

  return (
    <AuthContext.Provider value={value}>
      {esPuenteEscritorio && puenteEntregado && <AvisoVuelveALaApp />}
      {children}
    </AuthContext.Provider>
  );
}

/** Aviso para quien vino desde la app de escritorio: la sesión ya viajó. */
function AvisoVuelveALaApp() {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
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
