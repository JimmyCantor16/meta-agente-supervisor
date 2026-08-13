import { useState } from "react";
import {
  Check,
  CloudOff,
  Copy,
  ExternalLink,
  Globe,
  LoaderCircle,
  Rocket,
  TriangleAlert,
} from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { usePublicacion } from "../hooks/usePublicacion";
import type { EstadoDespliegue } from "../types";

/**
 * Panel «Publicar en internet»: la vía AUTOMÁTICA de publicación.
 *
 * Un botón y ya: el agente crea el repositorio, despliega en Render y aquí se
 * ve el viaje completo — los pasos en vivo mientras trabaja, la URL final como
 * enlace cuando queda vivo, y el motivo honesto si falló o si la página
 * publicada dejó de responder. (La vía manual, guiada por el profesor, sigue
 * viviendo en las clases de PublishGuide.)
 */
export function PublicarEnInternet({ projectName }: { projectName: string }) {
  const { t } = useLanguage();
  const g = t.despliegue;
  const { despliegue, publicando, progreso, error, publicar } = usePublicacion(projectName);
  const [copiado, setCopiado] = useState(false);

  const enCurso = publicando || despliegue?.estado === "en_curso";
  const estado: EstadoDespliegue | null = enCurso ? "en_curso" : despliegue?.estado ?? null;

  const copiar = async () => {
    if (!despliegue?.url) return;
    try {
      await navigator.clipboard.writeText(despliegue.url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <section className="rounded-lg bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Globe className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
          <p className="text-sm font-semibold text-ink-body">{g.titulo}</p>
          {estado && <ChipEstado estado={estado} />}
        </div>

        <button
          onClick={() => void publicar()}
          disabled={enCurso}
          className="inline-flex items-center gap-1.5 rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          {enCurso ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Rocket className="h-4 w-4" aria-hidden />
          )}
          {estado === "vivo"
            ? g.republicar
            : estado === "fallido" || estado === "caido"
              ? g.reintentar
              : g.boton}
        </button>
      </div>

      {/* Sin despliegue y sin nada en marcha: qué hace el botón, en una línea. */}
      {!estado && <p className="mt-2 text-xs text-ink-muted">{g.intro}</p>}

      {/* En curso: el último paso que contó el agente, para que la espera hable. */}
      {estado === "en_curso" && (
        <div className="mt-3 space-y-1">
          {progreso && <p className="text-xs text-ink-body">{progreso}</p>}
          <p className="text-xs text-ink-faint">{g.publicandoHint}</p>
        </div>
      )}

      {/* Vivo: la URL es el protagonista — enlace + copiar. */}
      {estado === "vivo" && despliegue?.url && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-body">{g.vivoTitulo}</p>
          <a
            href={despliegue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
          >
            <span className="truncate">{despliegue.url}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </a>
          <button
            onClick={() => void copiar()}
            className="inline-flex items-center gap-1.5 rounded border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink-body transition hover:border-brand-600 hover:text-brand-700"
          >
            {copiado ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
            {copiado ? g.copiado : g.copiar}
          </button>
          {despliegue.repo && (
            <a
              href={despliegue.repo}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              {g.repo}
            </a>
          )}
        </div>
      )}

      {/* Fallido: el motivo, honesto y completo. */}
      {estado === "fallido" && (
        <div className="mt-3 flex items-start gap-2.5 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{g.falloTitulo}</p>
            {despliegue?.detalle && <p className="mt-0.5">{despliegue.detalle}</p>}
          </div>
        </div>
      )}

      {/* Caído: se publicó, pero la URL no responde ahora. */}
      {estado === "caido" && (
        <div className="mt-3 flex items-start gap-2.5 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">{g.caidoTitulo}</p>
            {despliegue?.detalle && <p className="mt-0.5">{despliegue.detalle}</p>}
            {despliegue?.url && (
              <p className="mt-0.5 truncate font-mono text-xs">{despliegue.url}</p>
            )}
            {despliegue?.ultimo_chequeo && (
              <p className="mt-0.5 text-xs opacity-80">
                {g.ultimoChequeo}: {new Date(despliegue.ultimo_chequeo).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Falló el LANZAMIENTO (la petición, no el deploy): se dice tal cual. */}
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-700">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </section>
  );
}

/** Chip de estado del despliegue, con los tokens del tema. */
function ChipEstado({ estado }: { estado: EstadoDespliegue }) {
  const { t } = useLanguage();
  const g = t.despliegue;
  if (estado === "en_curso") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-muted">
        <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
        {g.chipEnCurso}
      </span>
    );
  }
  if (estado === "vivo") {
    return (
      <span className="inline-flex items-center rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
        {g.chipVivo}
      </span>
    );
  }
  if (estado === "fallido") {
    return (
      <span className="inline-flex items-center rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
        {g.chipFallido}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
      {g.chipCaido}
    </span>
  );
}
