import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { githubDisponible, iniciarLoginGitHub } from "../../lib/api";

/**
 * Botón «Entrar con GitHub».
 *
 * Alternativa a Google, y para este producto casi más natural: quien viene a
 * construir y publicar software normalmente ya tiene cuenta de GitHub — la
 * misma donde acabará su proyecto.
 *
 * Se oculta solo si el servidor no lo tiene configurado, en vez de mostrar un
 * botón muerto.
 */
export function GitHubLoginButton() {
  const { t } = useLanguage();
  const [disponible, setDisponible] = useState(false);
  const [yendo, setYendo] = useState(false);

  useEffect(() => {
    githubDisponible().then(setDisponible);
  }, []);

  if (!disponible) return null;

  const entrar = async () => {
    setYendo(true);
    try {
      const url = await iniciarLoginGitHub();
      if (url) window.location.href = url;
      else setYendo(false);
    } catch {
      setYendo(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void entrar()}
      disabled={yendo}
      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
        <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 016 0C17.6 4.7 18.6 5 18.6 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
      </svg>
      {yendo ? t.auth.githubGoing : t.auth.githubButton}
    </button>
  );
}
