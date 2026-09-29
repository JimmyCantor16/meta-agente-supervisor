import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowUpRight,
  CircleHelp,
  Compass,
  Folder,
  Gem,
  GraduationCap,
  Rocket,
  ShieldCheck,
  Sofa,
  Sparkles,
} from "lucide-react";
import { Logo } from "./Logo";
import { COLOR_APP, EnlaceApp, LogoFacebook, LogoWhatsapp } from "./AppsExternas";
import { useLanguage } from "../i18n/LanguageProvider";
import { useMultimedia } from "../features/multimedia";

interface SidebarProps {
  /** Vista activa. */
  active: string;
  /** Cambia de vista. */
  onNavigate: (view: string) => void;
  /** En móvil, indica si está abierto. */
  open: boolean;
  /** Cierra el sidebar (móvil). */
  onClose: () => void;
  /** Muestra el ítem de administración (solo super-admin). */
  showAdmin?: boolean;
  /** Tema oscuro de La Sala (el resto del sistema va en claro). */
  oscuro?: boolean;
}

interface Item {
  key: string;
  label: string;
  Icon: LucideIcon;
}

/**
 * Barra lateral: La Sala arriba (la página de inicio), y debajo los módulos
 * agrupados — el Taller IA (el agente con el que se habla, sus proyectos y su
 * publicación), Aprender, y los accesos directos a Facebook y WhatsApp Web.
 * Fija en escritorio; deslizable en móvil.
 */
export function Sidebar({ active, onNavigate, open, onClose, showAdmin = false, oscuro = false }: SidebarProps) {
  const { t } = useLanguage();
  const m = useMultimedia();

  const grupos: { titulo?: string; items: Item[] }[] = [
    { items: [{ key: "sala", label: t.sala.nav, Icon: Sofa }] },
    {
      titulo: t.sala.groupTaller,
      items: [
        { key: "taller", label: t.sala.navCrear, Icon: Sparkles },
        { key: "projects", label: t.nav.projects, Icon: Folder },
        { key: "monitor", label: t.nav.monitor, Icon: Activity },
        { key: "publish", label: t.nav.publish, Icon: Rocket },
      ],
    },
    {
      titulo: t.sala.groupLearn,
      items: [
        { key: "learn", label: t.sala.navCursos, Icon: GraduationCap },
        { key: "camino", label: t.nav.camino, Icon: Compass },
      ],
    },
  ];
  const pie: Item[] = [
    { key: "plans", label: t.nav.plans, Icon: Gem },
    { key: "help", label: t.nav.help, Icon: CircleHelp },
    ...(showAdmin ? [{ key: "admin", label: t.nav.admin, Icon: ShieldCheck }] : []),
  ];

  const c = oscuro
    ? {
        aside: "border-sala-line bg-sala-raise",
        nombre: "text-sala-ink",
        sub: "text-sala-faint",
        grupo: "text-sala-faint",
        on: "bg-brand-400/10 text-sala-ink [&_svg]:text-brand-400",
        off: "text-sala-muted hover:bg-white/5 hover:text-sala-ink",
        borde: "border-sala-line",
        tarjeta: "border border-sala-line bg-sala-panel text-sala-body",
        tarjetaTitulo: "text-sala-ink",
      }
    : {
        aside: "border-black/10 bg-white",
        nombre: "text-ink",
        sub: "text-ink-faint",
        grupo: "text-ink-faint",
        on: "bg-brand-50 text-brand-700",
        off: "text-ink-body hover:bg-surface-muted",
        borde: "border-black/10",
        tarjeta: "bg-brand-50 text-ink-body",
        tarjetaTitulo: "text-ink",
      };

  const ir = (key: string) => {
    onNavigate(key);
    onClose();
  };
  const boton = (it: Item) => (
    <button
      key={it.key}
      type="button"
      onClick={() => ir(it.key)}
      aria-current={active === it.key ? "page" : undefined}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active === it.key ? c.on : c.off
      }`}
    >
      <it.Icon size={18} strokeWidth={1.9} aria-hidden />
      <span className="flex-1 text-left">{it.label}</span>
      {it.key === "sala" && m.playing && (
        <span className="sala-onair" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      )}
    </button>
  );

  return (
    <>
      {/* Overlay móvil */}
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />}

      <aside
        className={`fixed z-40 flex h-full w-60 flex-col border-r transition-transform lg:static lg:translate-x-0 ${c.aside} ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Marca */}
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Logo size={34} />
          <div className="min-w-0">
            <p className={`text-sm font-bold leading-tight ${c.nombre}`}>{t.brand.name}</p>
            <p className={`text-xs leading-snug ${c.sub}`}>{t.sala.tagline}</p>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {grupos.map((gr, i) => (
            <div key={gr.titulo ?? i} className="space-y-1">
              {gr.titulo && (
                <p className={`px-3 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] ${c.grupo}`}>
                  {gr.titulo}
                </p>
              )}
              {gr.items.map(boton)}
            </div>
          ))}

          {/* Apps de uso diario: se abren FUERA, con la sesión del navegador. */}
          <p className={`px-3 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] ${c.grupo}`}>
            {t.sala.groupApps}
          </p>
          <EnlaceApp app="facebook" title={t.sala.openFacebook} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${c.off}`}>
            <span className="grid h-[22px] w-[22px] place-items-center rounded-md" style={{ background: COLOR_APP.facebook }}>
              <LogoFacebook size={14} />
            </span>
            <span className="flex-1">{t.sala.facebook}</span>
            <ArrowUpRight size={15} className="opacity-60" aria-hidden />
          </EnlaceApp>
          <EnlaceApp app="whatsapp" title={t.sala.openWhatsapp} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${c.off}`}>
            <span className="grid h-[22px] w-[22px] place-items-center rounded-md" style={{ background: COLOR_APP.whatsapp }}>
              <LogoWhatsapp size={15} />
            </span>
            <span className="flex-1">{t.sala.whatsapp}</span>
            <ArrowUpRight size={15} className="opacity-60" aria-hidden />
          </EnlaceApp>
        </nav>

        {/* Pie: lo que suena (te sigue por todo el sistema) + cuenta y ayuda */}
        <div className={`space-y-2 border-t p-3 ${c.borde}`}>
          {m.current ? (
            <button type="button" onClick={() => ir("sala")} className={`block w-full rounded-lg p-3 text-left text-xs ${c.tarjeta}`}>
              <span className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] opacity-70">
                {m.playing && (
                  <span className="sala-onair" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                )}
                {t.sala.nowPlaying}
              </span>
              <span className={`mt-1 block truncate text-[13px] font-semibold ${c.tarjetaTitulo}`}>{m.current.title}</span>
              <span className="mt-0.5 block opacity-80">{t.sala.nowPlayingSub}</span>
            </button>
          ) : (
            <div className={`rounded-lg p-3 text-xs ${c.tarjeta}`}>
              <p className={`font-semibold ${c.tarjetaTitulo}`}>100% gratis</p>
              <p className="mt-0.5">Multi-modelo con IA libre.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {pie.map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={() => ir(it.key)}
                aria-current={active === it.key ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  active === it.key ? c.on : c.off
                }`}
              >
                <it.Icon size={15} strokeWidth={1.9} aria-hidden />
                {it.label}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
