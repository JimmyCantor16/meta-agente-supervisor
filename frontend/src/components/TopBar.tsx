import { LanguageToggle } from "./LanguageToggle";
import { GitHubLoginButton } from "../features/auth/GitHubLoginButton";
import { GoogleLoginButton } from "../features/auth/GoogleLoginButton";
import { NotificationBell } from "../features/notifications/NotificationBell";
import { useAuth } from "../features/auth/AuthProvider";
import { useLanguage } from "../i18n/LanguageProvider";

interface TopBarProps {
  /** Abre el sidebar en móvil. */
  onMenu: () => void;
  /** Tema oscuro de La Sala. */
  oscuro?: boolean;
}

/**
 * Barra superior (estilo Skywork): botón de menú (móvil), toggle Web/Escritorio,
 * selector de idioma y botón de login.
 */
export function TopBar({ onMenu, oscuro = false }: TopBarProps) {
  const { t } = useLanguage();
  const { user, logout } = useAuth();

  return (
    <header
      className={`sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6 ${
        oscuro ? "border-sala-line bg-sala-bg/85 text-sala-body" : "border-black/10 bg-white/80"
      }`}
    >
      {/* Menú móvil */}
      <button
        onClick={onMenu}
        className={`rounded-lg p-2 lg:hidden ${oscuro ? "text-sala-muted hover:bg-white/5" : "text-ink-muted hover:bg-surface-muted"}`}
        aria-label="Menú"
      >
        ☰
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">
        {/* Toggle Web/Escritorio (cosmético por ahora) */}
        <div className={`hidden items-center overflow-hidden rounded-lg border text-xs font-medium sm:flex ${oscuro ? "border-sala-line-2" : "border-black/10"}`}>
          <span className={`px-3 py-1.5 ${oscuro ? "bg-brand-400/10 text-brand-300" : "bg-brand-50 text-brand-700"}`}>{t.topbar.web}</span>
          <span className={`px-3 py-1.5 ${oscuro ? "text-sala-faint" : "text-ink-faint"}`} title="Próximamente">
            {t.topbar.desktop}
          </span>
        </div>

        <LanguageToggle oscuro={oscuro} />

        <NotificationBell />

        {user ? (
          <div className="flex items-center gap-2">
            {user.picture && (
              <img
                src={user.picture}
                alt={user.name}
                className="h-8 w-8 rounded-full border border-black/10"
                referrerPolicy="no-referrer"
              />
            )}
            <span className={`hidden text-sm font-medium sm:block ${oscuro ? "text-sala-body" : "text-ink-body"}`}>
              {user.name}
            </span>
            <button
              onClick={logout}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                oscuro ? "border-sala-line-2 text-sala-muted hover:bg-white/5" : "border-black/10 text-ink-muted hover:bg-surface-muted"
              }`}
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

