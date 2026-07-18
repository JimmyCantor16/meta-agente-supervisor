import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { LANGUAGES, translations } from "./translations";
import type { Language, Translation } from "./translations";

// Clave para persistir la preferencia de idioma entre sesiones.
const STORAGE_KEY = "app.lang";

interface LanguageContextValue {
  /** Idioma activo. */
  lang: Language;
  /** Fija un idioma concreto. */
  setLang: (lang: Language) => void;
  /** Diccionario de textos del idioma activo. */
  t: Translation;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/** Lee el idioma inicial: preferencia guardada o español por defecto. */
function getInitialLang(): Language {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return LANGUAGES.includes(stored as Language) ? (stored as Language) : "es";
}

/**
 * Proveedor de idioma para toda la app. Envuelve a <App /> en main.tsx.
 * Mantiene el idioma en estado, lo persiste y sincroniza el atributo
 * `lang` del <html> para accesibilidad.
 */
export function LanguageProvider({ children }: PropsWithChildren) {
  const [lang, setLang] = useState<Language>(getInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const changeLang = useCallback((next: Language) => setLang(next), []);

  // Memoizamos el valor para no re-renderizar consumidores sin necesidad.
  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang: changeLang, t: translations[lang] }),
    [lang, changeLang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Hook para consumir el idioma y los textos traducidos.
 * Lanza un error claro si se usa fuera del <LanguageProvider>.
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage debe usarse dentro de <LanguageProvider>.");
  }
  return ctx;
}
