import { useLanguage } from "../i18n/LanguageProvider";
import { LANGUAGES } from "../i18n/translations";

/**
 * Botón segmentado ES | EN que cambia el idioma de TODA la interfaz.
 * Resalta el idioma activo y expone `aria-pressed` para lectores de pantalla.
 */
export function LanguageToggle({ oscuro = false }: { oscuro?: boolean }) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      className={`inline-flex overflow-hidden rounded-lg border text-xs font-semibold ${oscuro ? "border-sala-line-2" : "border-black/10"}`}
      role="group"
      aria-label="Selector de idioma"
    >
      {LANGUAGES.map((code) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`px-3 py-1.5 uppercase transition ${
            lang === code
              ? "bg-brand-600 text-white"
              : oscuro
                ? "text-sala-muted hover:bg-white/5"
                : "bg-white text-ink-muted hover:bg-surface-muted"
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
