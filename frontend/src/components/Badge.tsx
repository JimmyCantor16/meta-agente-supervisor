import type { PropsWithChildren } from "react";

type BadgeTone = "success" | "warning" | "danger" | "neutral";

interface BadgeProps {
  /** Tono semántico que determina el color del badge. */
  tone?: BadgeTone;
}

/**
 * Etiqueta compacta para estados (tema claro).
 */
export function Badge({ tone = "neutral", children }: PropsWithChildren<BadgeProps>) {
  const tones: Record<BadgeTone, string> = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    danger: "bg-red-50 text-red-700 ring-red-200",
    neutral: "bg-surface-muted text-ink-body ring-black/10",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
