import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { getAuthConfig, loginWithGoogle } from "../../lib/api";
import type { AuthConfig, AuthUser } from "./types";

const STORAGE_KEY = "auth.user";
const CREDENTIAL_KEY = "auth.credential";

interface AuthContextValue {
  /** Usuario autenticado, o null. */
  user: AuthUser | null;
  /** Config del login (habilitado + client_id), o null mientras carga. */
  config: AuthConfig | null;
  /** Verifica el credential de Google en el backend e inicia sesión. */
  signIn: (credential: string) => Promise<void>;
  /** Cierra la sesión. */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Proveedor de autenticación: gestiona el usuario y la config de Google. */
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as AuthUser) : null;
  });
  const [config, setConfig] = useState<AuthConfig | null>(null);

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
    () => ({ user, config, signIn, logout }),
    [user, config, signIn, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return ctx;
}
