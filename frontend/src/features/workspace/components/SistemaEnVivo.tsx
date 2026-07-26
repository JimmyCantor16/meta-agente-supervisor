import { useEffect, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import {
  ApiError,
  apagarProyecto,
  encenderProyecto,
  estadoProyecto,
  secretosProyecto,
} from "../../../lib/api";
import type { EstadoProyecto, SecretosInfo } from "../types";

/**
 * Panel "Tu sistema en vivo".
 *
 * Resuelve un dolor concreto: el usuario tiene su proyecto pero no sabe si está
 * encendido o apagado, ni en qué puerto, ni cómo abrirlo. Aquí lo enciende con
 * un botón, ve su URL y su puerto, y lo abre — sin saber nada de Docker.
 */
export function SistemaEnVivo({ projectName }: { projectName: string }) {
  const { t } = useLanguage();
  const g = t.envivo;
  const [estado, setEstado] = useState<EstadoProyecto | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    estadoProyecto(projectName)
      .then((e) => vivo && setEstado(e))
      .catch(() => vivo && setEstado({ corriendo: false, url: null, puerto: null }));
    return () => {
      vivo = false;
    };
  }, [projectName]);

  const encender = async () => {
    setTrabajando(true);
    setError(null);
    try {
      setEstado(await encenderProyecto(projectName));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : g.errorEncender);
    } finally {
      setTrabajando(false);
    }
  };

  const apagar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      setEstado(await apagarProyecto(projectName));
    } catch {
      /* no rompe la vista */
    } finally {
      setTrabajando(false);
    }
  };

  const corriendo = estado?.corriendo && estado.url;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              corriendo ? "animate-pulse bg-emerald-500" : "bg-slate-300"
            }`}
          />
          <div>
            <p className="text-sm font-bold text-slate-700">
              {corriendo ? g.encendido : g.apagado}
            </p>
            {corriendo ? (
              <p className="text-xs text-slate-500">
                {g.puerto} {estado?.puerto} · <span className="font-mono">{estado?.url}</span>
              </p>
            ) : (
              <p className="text-xs text-slate-400">{g.apagadoHint}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {corriendo && (
            <a
              href={estado!.url!}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700"
            >
              🔗 {g.abrir}
            </a>
          )}
          {corriendo ? (
            <button
              onClick={() => void apagar()}
              disabled={trabajando}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-50"
            >
              {trabajando ? "…" : g.apagar}
            </button>
          ) : (
            <button
              onClick={() => void encender()}
              disabled={trabajando}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {trabajando ? g.encendiendo : "▶ " + g.encender}
            </button>
          )}
        </div>
      </div>

      {trabajando && !corriendo && (
        <p className="mt-2 text-xs text-slate-400">{g.encendiendoHint}</p>
      )}
      {error && <p className="mt-2 text-xs font-medium text-amber-700">⚠ {error}</p>}

      <SecretosPanel projectName={projectName} />
    </div>
  );
}

/** Carpeta segura para las claves (Azure, etc.): nunca por el chat. */
function SecretosPanel({ projectName }: { projectName: string }) {
  const { t } = useLanguage();
  const g = t.secretos;
  const [abierto, setAbierto] = useState(false);
  const [info, setInfo] = useState<SecretosInfo | null>(null);

  useEffect(() => {
    if (!abierto || info) return;
    secretosProyecto(projectName)
      .then(setInfo)
      .catch(() => {
        /* si falla, no rompe el panel */
      });
  }, [abierto, info, projectName]);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center justify-between text-sm font-semibold text-slate-600"
      >
        <span>🔐 {g.titulo}</span>
        <span className="text-xs text-slate-400">{abierto ? "▴" : "▾"}</span>
      </button>
      {abierto && (
        <div className="mt-2 space-y-2 text-xs text-slate-500">
          <p>{g.intro}</p>
          {info ? (
            <>
              <p>
                {g.carpeta}:{" "}
                <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">
                  {info.carpeta}
                </code>
              </p>
              <p>
                {g.cargadas}:{" "}
                {info.nombres.length === 0 ? (
                  <span className="text-slate-400">{g.ninguna}</span>
                ) : (
                  info.nombres.map((n) => (
                    <span
                      key={n}
                      className="mr-1 inline-block rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-emerald-700"
                    >
                      {n}
                    </span>
                  ))
                )}
              </p>
              <p className="rounded-lg bg-amber-50 p-2 text-amber-800">⚠ {g.aviso}</p>
            </>
          ) : (
            <p className="text-slate-400">…</p>
          )}
        </div>
      )}
    </div>
  );
}
