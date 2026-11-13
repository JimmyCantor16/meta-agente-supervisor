import { useEffect, useState } from "react";
import { Cloud, Cpu, Sparkles, Terminal } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { getEstadoPuente, type EstadoPuente } from "../../lib/api";
import type { NivelIA, Trabajando } from "./useMonitor";

const ESTILO_NIVEL: Record<NivelIA, { caja: string; punto: string }> = {
  pago: { caja: "border-brand-600 bg-brand-50 text-brand-700", punto: "bg-brand-600" },
  local: { caja: "border-amber-300 bg-amber-50 text-amber-800", punto: "bg-amber-500" },
  gratis: { caja: "border-black/10 bg-surface-muted text-ink-body", punto: "bg-ink-faint" },
};

/** Cada cuánto se pregunta al servidor si la terminal del equipo sigue conectada. */
const SONDEO_MS = 10_000;

/**
 * «Quién trabaja ahora»: la IA que está resolviendo la tarea en este momento,
 * clasificada en sus tres niveles (pago en la terminal, local, gratis en la
 * nube), y el estado de la terminal del equipo. Es la pantalla que deja VER la
 * diferencia entre planes, en vez de prometerla.
 */
export function QuienTrabaja({ trabajando }: { trabajando: Trabajando | null }) {
  const { t } = useLanguage();
  const [puente, setPuente] = useState<EstadoPuente | null>(null);

  useEffect(() => {
    let vivo = true;
    const leer = () => getEstadoPuente().then((e) => vivo && setPuente(e));
    leer();
    const id = window.setInterval(leer, SONDEO_MS);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, []);

  const niveles: { id: NivelIA; texto: string; Icono: typeof Cpu }[] = [
    { id: "pago", texto: t.monitor.tierPaid, Icono: Sparkles },
    { id: "local", texto: t.monitor.tierLocal, Icono: Cpu },
    { id: "gratis", texto: t.monitor.tierFree, Icono: Cloud },
  ];
  const nombre = trabajando?.nombre === "experto" ? t.monitor.expert : trabajando?.nombre;

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{t.monitor.whoWorks}</p>
          {trabajando ? (
            <p className="mt-1 text-heading text-ink">
              {nombre}{" "}
              <span className="text-sm font-normal text-ink-muted">
                · {trabajando.estado === "trabajando" ? t.monitor.working : t.monitor.answered}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">{t.monitor.nobodyWorks}</p>
          )}
        </div>

        <div className="flex items-center gap-2 rounded border border-black/10 px-3 py-1.5 text-xs">
          <Terminal className="h-4 w-4 text-ink-muted" aria-hidden />
          <span className="font-semibold text-ink">{t.monitor.terminal}:</span>
          {puente?.conectado ? (
            <span className="text-brand-700">
              {t.monitor.terminalOn} · {puente.motores.join(" + ")} · {puente.resueltos} {t.monitor.terminalSolved}
            </span>
          ) : (
            <span className="text-ink-muted">
              {puente?.activo ? t.monitor.terminalOff : t.monitor.terminalOffNoBridge}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {niveles.map(({ id, texto, Icono }) => {
          const activo = trabajando?.nivel === id;
          const estilo = ESTILO_NIVEL[id];
          return (
            <div
              key={id}
              className={`flex items-center gap-2 rounded border px-3 py-2 text-sm transition-opacity ${
                activo ? `${estilo.caja} font-semibold` : "border-black/5 text-ink-faint opacity-60"
              }`}
            >
              <Icono className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">{texto}</span>
              {activo && trabajando?.estado === "trabajando" && (
                <span className={`h-2 w-2 animate-pulse rounded-full ${estilo.punto}`} aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
