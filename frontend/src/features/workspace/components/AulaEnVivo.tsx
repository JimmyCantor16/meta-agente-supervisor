import { useEffect, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import {
  ApiError,
  compilarProyecto,
  encenderProyecto,
  estadoProyecto,
  leerArchivo,
  listarArchivos,
  revertirProyecto,
} from "../../../lib/api";
import type { ArchivoContenido, ArchivoItem, MisionClase } from "../types";

/**
 * Aula en vivo: el código fuente EDITABLE a la izquierda y el sistema corriendo
 * a la derecha. Editas, das a Compilar y ves el cambio al instante. Ver el
 * archivo y su resultado al mismo tiempo es lo que vuelve tangible aprender.
 */
export function AulaEnVivo({
  projectName,
  mision = null,
}: {
  projectName: string;
  /** El encargo de la clase: qué archivo tocar y qué debería verse distinto. */
  mision?: MisionClase | null;
}) {
  const { t } = useLanguage();
  const g = t.aula;
  const [archivos, setArchivos] = useState<ArchivoItem[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<ArchivoContenido | null>(null);
  const [editado, setEditado] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [encendiendo, setEncendiendo] = useState(false);
  const [compilando, setCompilando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [refresco, setRefresco] = useState(0);
  const [commit, setCommit] = useState<string | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [hayCambiosMios, setHayCambiosMios] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const lista = await listarArchivos(projectName);
        if (!vivo) return;
        setArchivos(lista);
        // Si la clase encargó un archivo, se abre ESE: es la diferencia entre
        // «modifica el código» y saber exactamente dónde poner las manos.
        const pedido = mision?.archivo && lista.some((a) => a.path === mision.archivo)
          ? mision.archivo
          : elegirInicial(lista);
        if (pedido) void abrir(pedido);
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
  }, [projectName, mision?.archivo]);

  const abrir = async (path: string) => {
    setSel(path);
    setCodigo(null);
    setAviso(null);
    try {
      const c = await leerArchivo(projectName, path);
      setCodigo(c);
      setEditado(c.contenido);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "No se pudo leer el archivo.";
      setCodigo({ path, contenido: msg, lenguaje: "text" });
      setEditado(msg);
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

  const compilar = async () => {
    if (!sel || compilando) return;
    setCompilando(true);
    setAviso(null);
    try {
      const e = await compilarProyecto(projectName, sel, editado);
      setUrl(e.url);
      setRefresco((n) => n + 1); // fuerza recargar el iframe
      setCodigo((c) => (c ? { ...c, contenido: editado } : c));
      // El commit solo existe si arrancó: nada roto entra en la historia. Por
      // eso enseñarlo es una garantía, no un detalle técnico.
      setCommit(e.commit ?? null);
      if (e.commit) setHayCambiosMios(true);
      setAviso(e.commit ? `${g.compilado} · ${g.guardadoComo} ${e.commit}` : g.compilado);
    } catch (err) {
      // No arrancó → no se guardó en la historia, y se dice claramente.
      setCommit(null);
      setAviso(err instanceof ApiError ? err.message : g.errorCompilar);
    } finally {
      setCompilando(false);
    }
  };

  const deshacer = async () => {
    if (deshaciendo) return;
    setDeshaciendo(true);
    setAviso(null);
    try {
      const e = await revertirProyecto(projectName);
      setUrl(e.url);
      setRefresco((n) => n + 1);
      setCommit(null);
      // Recarga el archivo abierto: en disco ya volvió a ser el de antes.
      if (sel) await abrir(sel);
      setAviso(`${g.deshecho}: ${e.deshecho ?? ""}`.trim());
    } catch (err) {
      // El caso normal es «no queda nada tuyo por deshacer»: no es un error
      // del alumno, así que se cuenta tal cual lo explica el servidor.
      setHayCambiosMios(false);
      setAviso(err instanceof ApiError ? err.message : g.errorDeshacer);
    } finally {
      setDeshaciendo(false);
    }
  };

  const modificado = codigo !== null && editado !== codigo.contenido;

  return (
    <div className="space-y-4">
      {/* El encargo de la clase, siempre visible mientras se edita: qué archivo
          y qué debería verse distinto. Sin esto el alumno pierde el norte a la
          tercera prueba. */}
      {mision && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-600">
            {g.claseNumero} {mision.numero}
          </p>
          <p className="mt-0.5 text-sm font-bold text-ink">{mision.titulo}</p>
          {mision.resultadoEsperado && (
            <p className="mt-1.5 text-sm leading-snug text-ink-body">
              <span className="font-semibold">{g.deberiasVer}:</span> {mision.resultadoEsperado}
            </p>
          )}
          {mision.pista && <p className="mt-1 text-xs text-ink-muted">💡 {mision.pista}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Izquierda: código fuente */}
      <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-2 text-sm font-bold text-ink-body">
          <span>📄 {g.codigo}</span>
          <div className="flex items-center gap-2">
            {hayCambiosMios && (
              <button
                onClick={() => void deshacer()}
                disabled={deshaciendo || compilando}
                title={g.deshacerAyuda}
                className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-black/10 hover:text-ink-body disabled:opacity-40"
              >
                {deshaciendo ? g.deshaciendo : "↩ " + g.deshacer}
              </button>
            )}
            <button
              onClick={() => void compilar()}
              disabled={compilando || !modificado}
              title={!modificado ? g.editaPrimero : undefined}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {compilando ? g.compilando : "⚡ " + g.compilar}
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <aside className="w-40 shrink-0 overflow-y-auto border-r border-black/10 bg-surface-muted p-1.5">
            {archivos.map((a) => (
              <button
                key={a.path}
                onClick={() => void abrir(a.path)}
                title={a.path}
                className={`block w-full truncate rounded-md px-2 py-1 text-left text-xs transition ${
                  sel === a.path
                    ? "bg-brand-100 font-semibold text-brand-800"
                    : "text-ink-muted hover:bg-surface-muted"
                }`}
              >
                {a.path.split("/").pop()}
              </button>
            ))}
          </aside>
          <div className="min-w-0 flex-1 bg-slate-900">
            {codigo ? (
              <textarea
                value={editado}
                onChange={(e) => setEditado(e.target.value)}
                spellCheck={false}
                className="h-full min-h-[48vh] w-full resize-none whitespace-pre bg-slate-900 p-3 font-mono text-xs leading-relaxed text-ink-faint focus:outline-none"
              />
            ) : (
              <p className="p-4 text-xs text-ink-faint">{g.eligeArchivo}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-black/10 px-4 py-1.5">
          <span className="shrink-0 font-mono text-[11px] text-ink-faint">{sel || ""}</span>
          {aviso && (
            <span
              className={`truncate text-[11px] font-medium ${commit ? "text-emerald-600" : "text-ink-muted"}`}
            >
              {commit ? "✓ " : ""}
              {aviso}
            </span>
          )}
          {modificado && !aviso && <span className="text-[11px] font-medium text-amber-600">● {g.sinGuardar}</span>}
        </div>
      </div>

      {/* Derecha: navegador en vivo */}
      <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-2 text-sm font-bold text-ink-body">
          <span>🌐 {g.navegador}</span>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:underline">
              {g.abrirAparte} ↗
            </a>
          )}
        </div>
        {url ? (
          <iframe
            key={refresco}
            title="preview"
            src={url}
            className="min-h-0 flex-1 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-ink-muted">{g.apagado}</p>
            <button
              onClick={() => void encender()}
              disabled={encendiendo}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {encendiendo ? g.encendiendo : "▶ " + g.encender}
            </button>
            {encendiendo && <p className="text-xs text-ink-faint">{g.encendiendoHint}</p>}
          </div>
        )}
      </div>
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
