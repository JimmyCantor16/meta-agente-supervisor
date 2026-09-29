import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { APPS_EXTERNAS, abrirExterno } from "../lib/abrirExterno";

/**
 * Logos de Facebook y WhatsApp. Van dibujados aquí porque lucide retiró los
 * iconos de marcas; son los únicos colores ajenos al sistema de diseño, y a
 * propósito: el color de la marca es lo que hace reconocible el acceso.
 */
export function LogoFacebook({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#fff"
        d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z"
      />
    </svg>
  );
}

export function LogoWhatsapp({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="#fff"
        strokeWidth="1.9"
        strokeLinejoin="round"
        d="M12 3.6a8.4 8.4 0 0 0-7.2 12.7L3.6 20.4l4.2-1.1A8.4 8.4 0 1 0 12 3.6z"
      />
      <path
        fill="#fff"
        d="M9.2 7.8c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .5.4l.7 1.6c.1.2.1.4 0 .5l-.4.6c-.1.1-.2.3 0 .5.3.6.8 1.1 1.3 1.5.5.4 1 .6 1.5.8.2.1.4 0 .5-.1l.6-.7c.2-.2.3-.2.5-.1l1.5.7c.2.1.3.2.3.3 0 .4-.1.9-.4 1.2-.4.4-1 .8-1.7.8-.8 0-1.8-.3-3.2-1.2-1.3-.9-2.3-2.2-2.7-2.9-.4-.7-.6-1.4-.6-1.9 0-.7.3-1.2.5-1.6z"
      />
    </svg>
  );
}

export const COLOR_APP = { facebook: "#1877F2", whatsapp: "#25D366" } as const;

/**
 * Enlace a una app externa. Es un `<a>` de verdad (clic central, "copiar
 * enlace"… funcionan como en cualquier web) que en el escritorio se desvía al
 * navegador predeterminado.
 */
export function EnlaceApp(props: {
  app: keyof typeof APPS_EXTERNAS;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}) {
  const url = APPS_EXTERNAS[props.app];
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    abrirExterno(url);
  };
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      title={props.title}
      aria-label={props.title}
      className={props.className}
      style={props.style}
    >
      {props.children}
    </a>
  );
}
