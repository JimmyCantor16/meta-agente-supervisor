import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Muestra un spinner y deshabilita el botón mientras hay una operación en curso. */
  loading?: boolean;
  /** Variante visual. */
  variant?: "primary" | "ghost";
}

/**
 * Botón reutilizable (tema claro) con estado de carga integrado.
 */
export function Button({
  loading = false,
  variant = "primary",
  disabled,
  children,
  className = "",
  ...rest
}: PropsWithChildren<ButtonProps>) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-50";

  const variants: Record<string, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
    ghost: "border border-black/10 bg-white text-ink-body hover:bg-surface-muted",
  };

  const spinner =
    variant === "primary"
      ? "border-white/40 border-t-white"
      : "border-black/10 border-t-brand-600";

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span
          className={`h-4 w-4 animate-spin rounded-full border-2 ${spinner}`}
          style={{ animationName: "spin" }}
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
