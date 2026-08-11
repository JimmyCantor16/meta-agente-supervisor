import { useState } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useMultimedia } from "./MultimediaProvider";
import { miniaturaDe, urlPublica } from "./lib/youtube";
import type { YoutubeItem } from "./types";

/**
 * Pestaña de YouTube: el reproductor oficial dentro del panel.
 *
 * No hay buscador a propósito. Buscar exige la Data API de YouTube, con clave y
 * cuota; aquí se sigue el mismo trato que con los canales de TV — pegas lo que
 * quieras y se guarda en TU navegador — pero con una ayuda que la TV no tiene:
 * al pegar el enlace se consulta el título real, así la lista queda legible sin
 * que tengas que escribir nada.
 */
export function YoutubeView() {
  const { t } = useLanguage();
  const m = useMultimedia();
  const g = t.multimedia;

  const [entrada, setEntrada] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);

  const anadir = async () => {
    if (!entrada.trim() || anadiendo) return;
    setAnadiendo(true);
    setAviso(null);
    const error = await m.addYoutube(entrada);
    if (error) setAviso(error);
    else setEntrada("");
    setAnadiendo(false);
  };

  return (
    <div className="space-y-3">
      {/* El hueco donde se posiciona el reproductor. Está SIEMPRE presente
          mientras la pestaña esté abierta: el provider lo mide cada frame y
          coloca encima el iframe, que vive aparte para no recargarse. */}
      <div
        ref={m.registerYtSlot}
        className="aspect-video w-full overflow-hidden rounded-lg bg-slate-900"
      >
        {!m.ytCurrentId && (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-ink-faint">
            {g.ytEmptyPlayer}
          </div>
        )}
      </div>

      {/* Pegar un enlace */}
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-ink-muted">
          {g.ytAddLabel}
        </label>
        <div className="flex gap-1.5">
          <input
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void anadir()}
            placeholder="https://youtu.be/…"
            disabled={anadiendo}
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-surface-muted px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-brand-300 focus:bg-white focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void anadir()}
            disabled={anadiendo || !entrada.trim()}
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            {anadiendo ? "…" : g.ytAdd}
          </button>
        </div>
        {aviso && <p className="mt-1 text-[11px] text-amber-700">{aviso}</p>}
        <p className="mt-1 text-[11px] leading-snug text-ink-faint">{g.ytHint}</p>
      </div>

      {/* Lista del usuario */}
      {m.ytItems.length === 0 ? (
        <p className="px-1 py-3 text-center text-xs text-ink-faint">{g.ytEmptyList}</p>
      ) : (
        <ul className="space-y-1">
          {m.ytItems.map((item) => (
            <Fila key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Fila({ item }: { item: YoutubeItem }) {
  const { t } = useLanguage();
  const m = useMultimedia();
  const sonando = m.ytCurrentId === item.id && m.active === "youtube";
  const miniatura = miniaturaDe({ kind: item.kind, id: item.id });

  return (
    <li
      className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${
        sonando ? "border-brand-300 bg-brand-50" : "border-transparent hover:bg-surface-muted"
      }`}
    >
      <button
        type="button"
        onClick={() => m.playYoutube(item)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={item.titulo}
      >
        <span className="relative h-8 w-14 shrink-0 overflow-hidden rounded bg-surface-muted">
          {miniatura ? (
            <img src={miniatura} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] text-ink-muted">
              ▤
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-ink">{item.titulo}</span>
          <span className="block truncate text-[10px] text-ink-faint">
            {item.kind === "playlist" ? t.multimedia.ytPlaylist : item.autor || "YouTube"}
          </span>
        </span>
        {sonando && <span className="shrink-0 text-[10px] text-brand-600">▶</span>}
      </button>

      {/* Abrir en YouTube: para dar like, comentar o suscribirse, que dentro del
          reproductor incrustado no se puede. Es una salida deliberada, no la vía
          principal: el objetivo es que se quede aquí. */}
      <a
        href={urlPublica({ kind: item.kind, id: item.id })}
        target="_blank"
        rel="noreferrer noopener"
        className="shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100 hover:text-brand-600"
        title={t.multimedia.ytOpenExternal}
        onClick={(e) => e.stopPropagation()}
      >
        ↗
      </a>
      <button
        type="button"
        onClick={() => m.removeYoutube(item.id)}
        className="shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100 hover:text-red-500"
        title={t.multimedia.remove}
      >
        ✕
      </button>
    </li>
  );
}
