/**
 * Logotipo del Meta-Agente: marca con degradado (estilo profesional).
 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-emerald-400 font-bold text-white shadow-sm"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      aria-hidden
    >
      ✦
    </span>
  );
}
