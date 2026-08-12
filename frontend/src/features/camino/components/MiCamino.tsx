import { useEffect, useState } from "react";
import {
  ArrowRight,
  Award,
  Flame,
  GraduationCap,
  LoaderCircle,
  Lock,
  Printer,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useCamino } from "../hooks/useCamino";
import type { Camino, CertificadoCamino } from "../types";

/**
 * «Mi camino»: la razón para volver mañana.
 *
 * Reúne en una vista la racha de días (con los 7 puntos de la semana), los
 * cursos con su avance, los certificados ganados (imprimibles) y el próximo
 * paso sugerido como CTA. Sigue el sistema de diseño de `tailwind.config.js`:
 * un solo color de marca, radios 6-8, sombras teñidas, iconos lucide.
 */
export function MiCamino({
  onContinuar,
  onEmpezar,
}: {
  /** Lleva al alumno a sus proyectos (donde vive su curso). */
  onContinuar?: () => void;
  /** Lleva a quien aún no tiene nada a escribir su primera idea. */
  onEmpezar?: () => void;
}) {
  const { t } = useLanguage();
  const g = t.camino;
  const { camino, cargando, error, recargar } = useCamino();

  // Certificado elegido para imprimir: se pinta en una capa solo-impresión y
  // se dispara window.print() (así la hoja sale limpia, sin la app alrededor).
  const [certAImprimir, setCertAImprimir] = useState<CertificadoCamino | null>(null);
  useEffect(() => {
    if (!certAImprimir) return;
    const timer = window.setTimeout(() => {
      window.print();
      setCertAImprimir(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [certAImprimir]);

  if (cargando) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-brand-600" strokeWidth={2} />
          <p className="mt-4 text-sm text-ink-muted">{g.cargando}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <TriangleAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={2} />
        <span className="flex-1">{error}</span>
        <button
          onClick={() => void recargar()}
          className="shrink-0 text-xs font-semibold text-red-700 underline"
        >
          {g.reintentar}
        </button>
      </div>
    );
  }

  if (!camino) return null;

  const sinCursos = camino.cursos.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-heading text-ink">{g.titulo}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{g.subtitulo}</p>
      </div>

      {/* Estado vacío: sin cursos no hay racha que contar; se invita a empezar. */}
      {sinCursos ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-card">
          <GraduationCap className="mx-auto h-8 w-8 text-ink-faint" strokeWidth={1.6} />
          <p className="mt-3 text-subhead text-ink">{g.vacioTitulo}</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-muted">
            {g.vacioCuerpo}
          </p>
          {onEmpezar && (
            <button
              onClick={onEmpezar}
              className="mt-5 inline-flex items-center gap-1.5 rounded bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {g.vacioCta}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
            {/* Racha: el número grande y los 7 puntos de la semana. */}
            <div className="rounded-lg bg-white p-5 shadow-card">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <Flame className="h-3.5 w-3.5 text-brand-600" strokeWidth={2.2} />
                {g.rachaTitulo}
              </p>
              <p className="mt-2 text-title text-ink">{camino.racha_dias}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{g.rachaDias(camino.racha_dias)}</p>
              <div className="mt-4">
                <div className="flex items-center gap-1.5" role="img" aria-label={g.ultimos7}>
                  {puntosSemana(camino).map((activo, i) => (
                    <span
                      key={i}
                      className={`h-2.5 w-2.5 rounded-sm ${activo ? "bg-brand-600" : "bg-black/10"}`}
                    />
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-ink-faint">{g.ultimos7}</p>
              </div>
            </div>

            {/* Próximo paso: el CTA que convierte la visita en una acción. */}
            <div className="flex flex-col justify-between gap-4 rounded-lg bg-ink p-5 text-white sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                  {g.proximoPaso}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/90">
                  {camino.proximo_paso}
                </p>
              </div>
              {onContinuar && (
                <button
                  onClick={onContinuar}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  {g.continuar}
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                </button>
              )}
            </div>
          </div>

          {/* Cursos con barra de avance: trofeo al graduado, candado al resto. */}
          <div className="rounded-lg bg-white p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {g.cursosTitulo}
            </p>
            <ul className="mt-3 space-y-3.5">
              {camino.cursos.map((c, i) => {
                const pct =
                  c.total_clases > 0
                    ? Math.min(100, (c.completadas / c.total_clases) * 100)
                    : 0;
                return (
                  <li key={`${c.titulo}-${i}`} className="flex items-start gap-3">
                    {c.graduado ? (
                      <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2} />
                    ) : (
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" strokeWidth={2} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className="text-sm font-semibold text-ink">{c.titulo}</p>
                        <p className="text-xs tabular-nums text-ink-muted">
                          {c.graduado
                            ? g.graduadoChip
                            : g.clasesDe(c.completadas, c.total_clases)}
                        </p>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-black/[0.08]">
                        <div
                          className="h-full rounded-sm bg-brand-600 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Certificados: tarjeta sobria, con impresión limpia. */}
          <div className="rounded-lg bg-white p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {g.certificadosTitulo}
            </p>
            {camino.certificados.length === 0 ? (
              <p className="mt-2.5 text-sm text-ink-muted">{g.sinCertificados}</p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {camino.certificados.map((cert, i) => (
                  <li
                    key={`${cert.curso}-${i}`}
                    className="flex items-start gap-3 rounded-lg border border-black/10 p-4"
                  >
                    <Award className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" strokeWidth={1.8} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-ink">{cert.curso}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {g.otorgadoEl} {fechaLegible(cert.fecha)}
                      </p>
                      <button
                        onClick={() => setCertAImprimir(cert)}
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-ink-body transition hover:border-brand-600 hover:text-brand-700"
                      >
                        <Printer className="h-3.5 w-3.5" strokeWidth={2} />
                        {g.imprimir}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {certAImprimir && <CertificadoImprimible cert={certAImprimir} />}
    </div>
  );
}

/**
 * Los 7 puntos de la semana, siempre 7: si el backend manda menos (o nada),
 * se rellena con días sin actividad en vez de romper el dibujo.
 */
function puntosSemana(camino: Camino): boolean[] {
  const semana = (camino.actividad_semana ?? []).slice(0, 7);
  while (semana.length < 7) semana.unshift(false);
  return semana;
}

/** Fecha ISO → legible; si no parsea, se muestra tal cual llegó. */
function fechaLegible(fechaIso: string): string {
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return fechaIso;
  return fecha.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * La hoja del certificado, visible SOLO al imprimir: la capa cubre la página
 * y el resto de la app queda oculto por las reglas @media print.
 */
function CertificadoImprimible({ cert }: { cert: CertificadoCamino }) {
  const { t } = useLanguage();
  const g = t.camino;
  return (
    <>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #certificado-imprimible, #certificado-imprimible * { visibility: visible !important; }
        #certificado-imprimible { position: fixed !important; inset: 0 !important; opacity: 1 !important; }
      }`}</style>
      <div
        id="certificado-imprimible"
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-white opacity-0"
      >
        <div className="max-w-xl border border-black/20 px-14 py-16 text-center">
          <Award className="mx-auto h-10 w-10 text-brand-600" strokeWidth={1.5} />
          <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-ink-muted">
            {g.certificadoDe}
          </p>
          <h1 className="mt-3 text-heading text-ink">{cert.curso}</h1>
          <p className="mt-6 text-sm text-ink-body">
            {g.otorgadoEl} {fechaLegible(cert.fecha)}
          </p>
          <p className="mt-10 text-xs text-ink-faint">
            {t.brand.name} · {t.brand.tagline}
          </p>
        </div>
      </div>
    </>
  );
}
