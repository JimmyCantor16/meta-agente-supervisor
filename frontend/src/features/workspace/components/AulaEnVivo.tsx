import { useEffect, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import {
  ApiError,
  encenderProyecto,
  estadoProyecto,
  leerArchivo,
  listarArchivos,
} from "../../../lib/api";
import type { ArchivoContenido, ArchivoItem } from "../types";

/**
 * Aula en vivo (Fase 1): el código fuente a la izquierda y el sistema corriendo
 * a la derecha, lado a lado. Ver el archivo y su resultado al mismo tiempo es lo
 * que vuelve tangible el aprendizaje. (Editar + Compilar llega en la Fase 2.)
 */
export function AulaEnVivo({ projectName }: { projectName: string }) {
  const { t } = useLanguage();
  const g = t.aula;
  const [archivos, setArchivos] = useState<ArchivoItem[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<ArchivoContenido | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [encendiendo, setEncendiendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const lista = await listarArchivos(projectName);
        if (!vivo) return;
        setArchivos(lista);
        const inicial = elegirInicial(lista);
        if (inicial) void abrir(inicial);
      } catch {
        /* sin archivos: se muestra vacío */
      }
      try {
        const e = await estadoProyecto(projectName);
        if (vivo && e.url) setUrl(e.url);
      } catch {
        /* apagado */
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  const abrir = async (path: string) => {
    setSel(path);
    setCodigo(null);
    try {
      setCodigo(await leerArchivo(projectName, path));
    } catch (err) {
      setCodigo({
        path,
        contenido: err instanceof ApiError ? err.message : "No se pudo leer el archivo.",
        lenguaje: "text",
      });
    }
  };

  const encender = async () => {
    setEncendiendo(true);
    try {
      const e = await encenderProyecto(projectName);
      setUrl(e.url);
    } catch {
      /* el panel de arriba explica el error */
    } finally {
      setEncendiendo(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Izquierda: código fuente */}
      <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">
          📄 {g.codigo}
        </div>
        <div className="flex min-h-0 flex-1">
          <aside className="w-40 shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50 p-1.5">
            {archivos.map((a) => (
              <button
                key={a.path}
                onClick={() => void abrir(a.path)}
                title={a.path}
                className={`block w-full truncate rounded-md px-2 py-1 text-left text-xs transition ${
                  sel === a.path
                    ? "bg-brand-100 font-semibold text-brand-800"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {a.path.split("/").pop()}
              </button>
            ))}
          </aside>
          <div className="min-w-0 flex-1 overflow-auto bg-slate-900">
            {codigo ? (
              <pre className="min-h-full whitespace-pre p-3 text-xs leading-relaxed text-slate-100">
                <code>{codigo.contenido}</code>
              </pre>
            ) : (
              <p className="p-4 text-xs text-slate-400">{g.eligeArchivo}</p>
            )}
          </div>
        </div>
        {sel && (
          <div className="border-t border-slate-200 px-4 py-1.5 font-mono text-[11px] text-slate-400">
            {sel}
          </div>
        )}
      </div>

      {/* Derecha: navegador en vivo */}
      <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">
          <span>🌐 {g.navegador}</span>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:underline">
              {g.abrirAparte} ↗
            </a>
          )}
        </div>
        {url ? (
          <iframe
            title="preview"
            src={url}
            className="min-h-0 flex-1 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-slate-500">{g.apagado}</p>
            <button
              onClick={() => void encender()}
              disabled={encendiendo}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {encendiendo ? g.encendiendo : "▶ " + g.encender}
            </button>
            {encendiendo && <p className="text-xs text-slate-400">{g.encendiendoHint}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

const _PRIORIDAD = ["index.html", "app.js", "server.js", "main.py", "app.py", "App.jsx"];

function elegirInicial(lista: ArchivoItem[]): string | null {
  if (lista.length === 0) return null;
  for (const p of _PRIORIDAD) {
    const hit = lista.find((a) => a.path.endsWith(p));
    if (hit) return hit.path;
  }
  const codigo = lista.find((a) => /\.(html|js|jsx|ts|tsx|py|css)$/i.test(a.path));
  return (codigo ?? lista[0]).path;
}
