/**
 * Isotipo del Meta-Agente: chispa geométrica sobre degradado de marca.
 * Junto al nombre (en la TopBar/Sidebar) forma el imagotipo del sistema.
 * El mismo dibujo vive en `index.html` como favicon: una sola identidad.
 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="rounded-xl shadow-sm"
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-grad)" />
      <path
        d="M32 12 L37 27 L52 32 L37 37 L32 52 L27 37 L12 32 L27 27 Z"
        fill="#ffffff"
      />
      <circle cx="45" cy="19" r="3.5" fill="#ffffff" opacity="0.85" />
    </svg>
  );
}
