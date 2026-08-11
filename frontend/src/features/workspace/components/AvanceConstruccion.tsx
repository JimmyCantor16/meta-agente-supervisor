import { useLanguage } from "../../../i18n/LanguageProvider";
import { useAvance } from "../hooks/useAvance";

interface Props {
  /** Mensajes del canal en vivo, en orden de llegada. */
  progreso: string[];
}

/**
 * Barra de avance con acompañamiento.
 *
 * Construir un sistema tarda minutos. Antes aquí solo había una consola de logs
 * técnicos que un usuario sin experiencia no entiende, y una espera muda. Ahora
 * hay tres cosas: cuánto falta, qué está pasando dicho en cristiano, y la
 * invitación a hacer otra cosa mientras tanto — que es justo la promesa del
 * producto: ver la tele mientras tu idea se convierte en software.
 */
export function AvanceConstruccion({ progreso }: Props) {
  const { t } = useLanguage();
  const avance = useAvance(progreso);

  if (progreso.length === 0) return null;

  const terminado = avance.porcentaje >= 100;

  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-b from-brand-50/70 to-white p-5">
      {/* Cuánto falta */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-brand-800">
            {avance.fase || t.avance.preparando}
          </p>
          {avance.detalle && (
            <p className="mt-0.5 text-xs text-ink-muted">{avance.detalle}</p>
          )}
        </div>
        <p className="font-mono text-2xl font-extrabold tabular-nums text-brand-700">
          {avance.porcentaje}
          <span className="text-base font-bold">%</span>
        </p>
      </div>

      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-brand-100"
        role="progressbar"
        aria-valuenow={avance.porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={avance.fase}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            terminado ? "bg-emerald-500" : "bg-gradient-to-r from-brand-400 to-brand-600"
          }`}
          style={{ width: `${avance.porcentaje}%` }}
        />
      </div>

      {/* Acompañar la espera: el sistema avisa cuando termine */}
      {!terminado && (
        <div className="mt-4 rounded-xl bg-white/70 p-3 ring-1 ring-brand-100">
          <p className="text-xs leading-relaxed text-ink-body">
            <span aria-hidden>☕ </span>
            {t.avance.acompanamiento}
          </p>
        </div>
      )}

      {terminado && (
        <p className="mt-3 text-xs font-semibold text-emerald-700">
          <span aria-hidden>✓ </span>
          {t.avance.terminado}
        </p>
      )}
    </div>
  );
}
