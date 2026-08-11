import { useState } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useMultimedia } from "./MultimediaProvider";

/**
 * Vista de TV en vivo: el hueco (slot) donde se acopla el vídeo, un formulario
 * para pegar la URL .m3u8 de un canal, y la lista de canales del usuario. La app
 * no trae canales propios (igual que DKEditor); cada quien agrega los suyos.
 */
export function TvView() {
  const { t } = useLanguage();
  const m = useMultimedia();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const add = () => {
    if (m.addChannel(name, url)) {
      setName("");
      setUrl("");
    }
  };

  const dockedHere = m.active === "tv" && m.placement === "docked";

  return (
    <div className="flex flex-col gap-3">
      {/* Hueco del vídeo acoplado (16:9). El vídeo real se posiciona encima. */}
      <div
        ref={m.registerSlot}
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-black/10 bg-slate-900"
      >
        {!dockedHere && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-ink-faint">
            <span className="text-3xl">📺</span>
            <span className="text-xs">{t.multimedia.tvEmpty}</span>
          </div>
        )}
      </div>

      {/* Cuando la tele está FUERA del navegador */}
      {m.active === "tv" && m.poppedOut && (
        <button
          type="button"
          onClick={m.requestPip}
          className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100"
        >
          📺 {t.multimedia.poppedOut} · {t.multimedia.bringBack}
        </button>
      )}

      {/* Barra de acciones del vídeo (visible, no solo al pasar el ratón) */}
      {m.active === "tv" && !m.poppedOut && (
        <div className="flex gap-1.5">
          {m.placement === "floating" ? (
            <button
              type="button"
              onClick={m.dockVideo}
              className="flex-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
            >
              {t.multimedia.dockBack}
            </button>
          ) : (
            <button
              type="button"
              onClick={m.minimizeVideo}
              className="flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink-body hover:border-brand-200 hover:text-brand-700"
              title={t.multimedia.minimize}
            >
              🗕 {t.multimedia.mini}
            </button>
          )}
          <button
            type="button"
            onClick={m.requestPip}
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
            title={t.multimedia.popOutTitle}
          >
            ⧉ {t.multimedia.popOut}
          </button>
          <button
            type="button"
            onClick={m.requestFullscreen}
            className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink-body hover:border-brand-200 hover:text-brand-700"
            title={t.multimedia.fullscreen}
          >
            ⛶
          </button>
        </div>
      )}

      {/* Agregar canal por URL .m3u8 */}
      <div className="space-y-2 rounded-xl border border-black/10 bg-white p-3">
        <p className="text-xs font-semibold text-ink-body">{t.multimedia.tvAddTitle}</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.multimedia.tvNamePh}
          className="w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t.multimedia.tvUrlPh}
          className="w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400"
        />
        <button
          type="button"
          onClick={add}
          className="w-full rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {t.multimedia.tvAdd}
        </button>
        <p className="text-[11px] leading-snug text-ink-faint">{t.multimedia.tvHint}</p>
      </div>

      {/* Lista de canales del usuario */}
      <div className="flex flex-col gap-1.5">
        {m.channels.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-ink-faint">{t.multimedia.tvNoChannels}</p>
        )}
        {m.channels
          .filter(
            // En producción (HTTPS) el navegador BLOQUEA streams http:// por
            // mixed-content: se ocultan para no ofrecer canales que nunca
            // reproducirán. En local (HTTP) se muestran todos.
            (c) =>
              !(
                typeof window !== "undefined" &&
                window.location.protocol === "https:" &&
                c.url.startsWith("http://")
              ),
          )
          .map((c) => {
          const activo = m.current?.url === c.url && m.active === "tv";
          return (
            <div
              key={c.url}
              className={`group flex items-center gap-2 rounded-lg border p-2 transition ${
                activo ? "border-brand-300 bg-brand-50" : "border-black/10 bg-white hover:border-black/10"
              }`}
            >
              <button
                type="button"
                onClick={() => m.playTv({ title: c.name, subtitle: c.category ?? "", url: c.url, kind: "tv" })}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="text-lg">{activo && m.playing ? "🔴" : "📡"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                  <span className="block truncate text-[11px] text-ink-faint">{c.url}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => m.removeChannel(c.url)}
                title={t.multimedia.remove}
                className="text-ink-faint opacity-0 transition hover:text-red-500 group-hover:opacity-100"
              >
                🗑
              </button>
            </div>
          );
        })}
      </div>

      {/* IPTV Colombia: carga en vivo la lista pública de iptv-org */}
      <div className="space-y-2 rounded-xl border border-black/10 bg-white p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-body">🇨🇴 {t.multimedia.iptvTitle}</p>
          {m.iptvItems.length > 0 && (
            <span className="text-[11px] text-ink-faint">{m.iptvItems.length} canales</span>
          )}
        </div>
        <button
          type="button"
          onClick={m.loadIptv}
          disabled={m.iptvLoading}
          className="w-full rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
        >
          {m.iptvLoading ? t.multimedia.iptvLoading : m.iptvItems.length ? t.multimedia.iptvReload : t.multimedia.iptvLoad}
        </button>
        {m.iptvError && <p className="text-[11px] text-red-500">{m.iptvError}</p>}
        <p className="text-[11px] leading-snug text-ink-faint">{t.multimedia.iptvHint}</p>
      </div>

      {m.iptvItems.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {m.iptvItems.map((s) => {
            const activo = m.current?.url === s.url && m.active === "tv";
            return (
              <button
                key={s.url}
                type="button"
                onClick={() => m.playTv(s)}
                className={`flex items-center gap-2.5 rounded-lg border p-2 text-left transition ${
                  activo ? "border-brand-300 bg-brand-50" : "border-black/10 bg-white hover:border-black/10"
                }`}
              >
                {s.artwork ? (
                  <img
                    src={s.artwork}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-contain"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-muted text-sm">
                    📺
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{s.title}</span>
                  <span className="block truncate text-[11px] text-ink-faint">{s.subtitle}</span>
                </span>
                {activo && <span className="text-sm">{m.playing ? "🔴" : "⏸"}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
