import { LanguageToggle } from "./LanguageToggle";
import { GitHubLoginButton } from "../features/auth/GitHubLoginButton";
import { GoogleLoginButton } from "../features/auth/GoogleLoginButton";
import { NotificationBell } from "../features/notifications/NotificationBell";
import { useAuth } from "../features/auth/AuthProvider";
import { useLanguage } from "../i18n/LanguageProvider";

interface TopBarProps {
  /** Abre el sidebar en móvil. */
  onMenu: () => void;
}

/**
 * Barra superior (estilo Skywork): botón de menú (móvil), toggle Web/Escritorio,
 * selector de idioma y botón de login.
 */
export function TopBar({ onMenu }: TopBarProps) {
  const { t } = useLanguage();
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
      {/* Menú móvil */}
      <button
        onClick={onMenu}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Menú"
      >
        ☰
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">
        {/* Toggle Web/Escritorio (cosmético por ahora) */}
        <div className="hidden items-center overflow-hidden rounded-lg border border-slate-200 text-xs font-medium sm:flex">
          <span className="bg-brand-50 px-3 py-1.5 text-brand-700">{t.topbar.web}</span>
          <span className="px-3 py-1.5 text-slate-400" title="Próximamente">
            {t.topbar.desktop}
          </span>
        </div>

        <LanguageToggle />

        <NotificationBell />

        {user ? (
          <div className="flex items-center gap-2">
            {user.picture && (
              <img
                src={user.picture}
                alt={user.name}
                className="h-8 w-8 rounded-full border border-slate-200"
                referrerPolicy="no-referrer"
              />
            )}
            <span className="hidden text-sm font-medium text-slate-700 sm:block">
              {user.name}
            </span>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
            >
              {t.topbar.logout}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <GitHubLoginButton />
            <GoogleLoginButton />
          </div>
        )}
      </div>
    </header>
  );
}

