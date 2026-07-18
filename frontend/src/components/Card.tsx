import type { PropsWithChildren, ReactNode } from "react";

interface CardProps {
  /** Título opcional mostrado en la cabecera de la tarjeta. */
  title?: string;
  /** Icono o elemento decorativo opcional junto al título. */
  icon?: ReactNode;
  /** Clases extra para personalizar el contenedor. */
  className?: string;
}

/**
 * Contenedor visual reutilizable (tema claro, estilo panel profesional).
 */
export function Card({
  title,
  icon,
  className = "",
  children,
}: PropsWithChildren<CardProps>) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {title && (
        <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          {icon}
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
