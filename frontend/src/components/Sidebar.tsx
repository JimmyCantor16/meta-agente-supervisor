import { Logo } from "./Logo";
import { useLanguage } from "../i18n/LanguageProvider";

interface SidebarProps {
  /** Vista activa. */
  active: string;
  /** Cambia de vista. */
  onNavigate: (view: string) => void;
  /** En móvil, indica si está abierto. */
  open: boolean;
  /** Cierra el sidebar (móvil). */
  onClose: () => void;
}

/**
 * Barra lateral de navegación (estilo Skywork): marca + items de navegación.
 * Fija en escritorio; deslizable en móvil.
 */
export function Sidebar({ active, onNavigate, open, onClose }: SidebarProps) {
  const { t } = useLanguage();

  const items = [
    { key: "home", label: t.nav.home, icon: "🏠" },
    { key: "projects", label: t.nav.projects, icon: "📁" },
    { key: "learn", label: t.nav.learn, icon: "🎓" },
    { key: "help", label: t.nav.help, icon: "❓" },
  ];

  return (
    <>
      {/* Overlay móvil */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed z-40 flex h-full w-60 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Marca */}
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Logo size={34} />
          <div>
            <p className="text-sm font-bold leading-tight text-slate-900">{t.brand.name}</p>
            <p className="text-xs text-slate-400">{t.brand.tagline}</p>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                onNavigate(item.key);
                onClose();
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active === item.key
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Pie */}
        <div className="border-t border-slate-100 p-4">
          <div className="rounded-xl bg-gradient-to-br from-brand-50 to-emerald-50 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">100% gratis</p>
            <p className="mt-0.5">Multi-modelo con IA libre.</p>
          </div>
        </div>
      </aside>
    </>
  );
}
