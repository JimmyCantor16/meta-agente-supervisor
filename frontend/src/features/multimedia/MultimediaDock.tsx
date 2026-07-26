import { useEffect } from "react";
import type * as React from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useMultimedia } from "./MultimediaProvider";
import { RadioView } from "./RadioView";
import { TvView } from "./TvView";

const PANEL_W = 300;

/**
 * Pestaña vertical fija en el borde DERECHO ("Multimedia") + panel deslizable con
 * las pestañas TV y Radio, calcado del panel lateral de música de DKEditor pero
 * en la web. El vídeo/audio viven en el Provider (persisten aunque se cierre).
 */
export function MultimediaDock() {
  const { t } = useLanguage();
  const m = useMultimedia();

  return (
    <>
      {/* Pestaña vertical del borde IZQUIERDO */}
      <button
        type="button"
        onClick={m.togglePanel}
        className="fixed left-0 top-1/2 z-50 flex -translate-y-1/2 items-center gap-1.5 rounded-r-xl bg-brand-600 px-2 py-3 text-white shadow-lg transition hover:bg-brand-700"
        style={{ writingMode: "vertical-rl" }}
        title={t.multimedia.title}
      >
        <span className="text-base" style={{ writingMode: "horizontal-tb" }}>
          {m.active === "radio" && m.playing ? "🔊" : m.active === "tv" && m.playing ? "🔴" : "📺"}
        </span>
        <span className="text-xs font-bold tracking-wide">{t.multimedia.title}</span>
      </button>

      {/* Panel deslizable desde la IZQUIERDA (overlay: no empuja el contenido) */}
      <aside
        className="fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200"
        style={{
          width: PANEL_W,
          transform: m.panelOpen ? "translateX(0)" : `translateX(-${PANEL_W}px)`,
        }}
      >
        {/* Cabecera + tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <b className="text-sm font-bold text-slate-800">📺 {t.multimedia.title}</b>
          <button
            type="button"
            onClick={m.closePanel}
            className="text-slate-400 hover:text-slate-700"
            title={t.multimedia.close}
          >
            ✕
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-200 px-3 pt-2">
          <TabBtn active={m.tab === "tv"} onClick={() => m.setTab("tv")}>
            {t.multimedia.tvTab}
          </TabBtn>
          <TabBtn active={m.tab === "radio"} onClick={() => m.setTab("radio")}>
            {t.multimedia.radioTab}
          </TabBtn>
        </div>

        {/* Aviso de error (TV/PiP), se autocierra */}
        <ErrorToast />

        {/* Contenido de la pestaña activa. overflow-x-hidden: las URLs largas de
            los canales nunca deben provocar scroll horizontal (desalinearía el
            vídeo acoplado). */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
          {m.tab === "tv" ? <TvView /> : <RadioView />}
        </div>

        {/* Barra "sonando ahora" (sobre todo útil para la radio) */}
        {m.current && (
          <NowPlaying />
        )}
      </aside>
    </>
  );
}

function ErrorToast() {
  const m = useMultimedia();
  useEffect(() => {
    if (!m.error) return;
    const id = window.setTimeout(m.clearError, 6000);
    return () => window.clearTimeout(id);
  }, [m.error, m.clearError]);
  if (!m.error) return null;
  return (
    <div className="mx-3 mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span aria-hidden>⚠️</span>
      <span className="flex-1">{m.error}</span>
      <button type="button" onClick={m.clearError} className="text-amber-500 hover:text-amber-700">
        ✕
      </button>
    </div>
  );
}

function TabBtn(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-t-lg px-3 py-2 text-sm font-semibold transition ${
        props.active
          ? "border-b-2 border-brand-600 text-brand-700"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {props.children}
    </button>
  );
}

function NowPlaying() {
  const { t } = useLanguage();
  const m = useMultimedia();
  if (!m.current) return null;
  return (
    <div className="flex items-center gap-2.5 border-t border-slate-200 bg-slate-50 px-3 py-2.5">
      <button
        type="button"
        onClick={m.togglePlay}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
        title={m.playing ? t.multimedia.pause : t.multimedia.play}
      >
        {m.buffering ? "⏳" : m.playing ? "⏸" : "▶"}
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{m.current.title}</span>
        <span className="block truncate text-[11px] text-slate-400">
          {m.active === "tv" ? t.multimedia.live : m.current.subtitle}
        </span>
      </span>
      <span title={t.multimedia.volume}>🔈</span>
      <input
        type="range"
        min={0}
        max={100}
        value={m.volume}
        onChange={(e) => m.setVolume(Number(e.target.value))}
        className="h-1 w-20 cursor-pointer accent-brand-600"
      />
      <button
        type="button"
        onClick={m.stop}
        className="text-slate-400 hover:text-red-500"
        title={t.multimedia.stopTitle}
      >
        ⏹
      </button>
    </div>
  );
}
