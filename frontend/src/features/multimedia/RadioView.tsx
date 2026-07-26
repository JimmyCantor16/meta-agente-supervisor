import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useMultimedia } from "./MultimediaProvider";
import { RADIO_COUNTRIES } from "./lib/radioBrowser";

/**
 * Vista de Radio: emisoras más populares al entrar (Radio Browser), búsqueda por
 * nombre y filtro rápido por país. Reproduce la emisora directa vía <audio>.
 */
export function RadioView() {
  const { t } = useLanguage();
  const m = useMultimedia();
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");

  // Carga inicial de las más escuchadas (una sola vez).
  useEffect(() => {
    if (m.radioItems.length === 0 && !m.radioLoading) m.loadTopRadio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickCountry = (code: string) => {
    setCountry(code);
    setQ("");
    m.loadTopRadio(code || undefined);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Buscador */}
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && m.searchRadio(q)}
          placeholder={t.multimedia.radioSearchPh}
          className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400"
        />
        <button
          type="button"
          onClick={() => m.searchRadio(q)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {t.multimedia.search}
        </button>
      </div>

      {/* Filtro por país */}
      <div className="flex flex-wrap gap-1.5">
        {RADIO_COUNTRIES.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => pickCountry(c.code)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
              country === c.code
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-slate-200 bg-white text-slate-500 hover:border-brand-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {m.radioError && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{m.radioError}</p>
      )}

      {m.radioLoading && (
        <div className="flex items-center justify-center py-8">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
        </div>
      )}

      {/* Lista de emisoras */}
      {!m.radioLoading && (
        <div className="flex flex-col gap-1.5">
          {m.radioItems.length === 0 && (
            <p className="px-1 py-6 text-center text-xs text-slate-400">{t.multimedia.radioEmpty}</p>
          )}
          {m.radioItems.map((s) => {
            const activo = m.current?.url === s.url && m.active === "radio";
            return (
              <button
                key={s.url}
                type="button"
                onClick={() => m.playRadio(s)}
                className={`flex items-center gap-2.5 rounded-lg border p-2 text-left transition ${
                  activo ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                {s.artwork ? (
                  <img
                    src={s.artwork}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-md object-cover"
                    onError={(e) => ((e.currentTarget.style.display = "none"))}
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-base">
                    📻
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{s.title}</span>
                  <span className="block truncate text-[11px] text-slate-400">{s.subtitle}</span>
                </span>
                {activo && (
                  <span className="text-sm">{m.buffering ? "⏳" : m.playing ? "🔊" : "⏸"}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
