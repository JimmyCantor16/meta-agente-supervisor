import { useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Flame, Lightbulb, Play, SlidersHorizontal } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import type { YoutubeItem } from "../../multimedia";
import { miniaturaDe } from "../../multimedia";
import type { CanalSala, EmisoraSala } from "../hooks/useCanalesSala";
import { dosCifras } from "../hooks/useReloj";
import { fondoCartel } from "../lib/paletas";

type Fila = "vivo" | "radio" | "info" | "aprende" | "estudiar";

interface Props {
  entretenimiento: CanalSala[];
  noticias: CanalSala[];
  emisorasMusica: EmisoraSala[];
  emisorasNoticias: EmisoraSala[];
  ytItems: YoutubeItem[];
  /** URL/ID de lo que suena ahora (para marcar su tarjeta). */
  sonando: { tipo: "tv" | "radio" | "youtube"; id: string } | null;
  racha: number | null;
  onCanal: (c: CanalSala) => void;
  onEmisora: (e: EmisoraSala) => void;
  onYoutube: (y: YoutubeItem) => void;
  onTeletexto: () => void;
  onCamino: () => void;
  onGestionar: () => void;
}

/**
 * «¿Qué ponemos?»: la programación de La Sala en estanterías, una por pilar.
 * El color de cada fila es el de su tecla en el control remoto, para que la
 * relación se aprenda sin explicarla.
 */
export function Programacion(p: Props) {
  const { t } = useLanguage();
  const g = t.sala;
  const [filtro, setFiltro] = useState<Fila | "todo">("todo");
  const [volteadas, setVolteadas] = useState<Set<number>>(new Set());

  const filtros: { k: Fila | "todo"; label: string; color?: string }[] = [
    { k: "todo", label: g.fAll },
    { k: "vivo", label: g.fLive, color: "var(--tecla-red)" },
    { k: "radio", label: g.fRadio, color: "var(--tecla-blue)" },
    { k: "info", label: g.fInfo, color: "var(--tecla-yellow)" },
    { k: "aprende", label: g.fLearn, color: "var(--tecla-green)" },
    { k: "estudiar", label: g.fStudy, color: "var(--tecla-yt)" },
  ];
  const ver = (f: Fila) => filtro === "todo" || filtro === f;
  const esta = (tipo: "tv" | "radio" | "youtube", id: string) => p.sonando?.tipo === tipo && p.sonando.id === id;

  const tarjetaCanal = (c: CanalSala) => (
    <button
      key={c.url}
      type="button"
      className={`sala-card${esta("tv", c.url) ? " on" : ""}`}
      onClick={() => p.onCanal(c)}
    >
      <div className="sala-poster" style={{ background: fondoCartel(c.paleta) }}>
        <span className="num">{dosCifras(c.n)}</span>
        <span className="tag">
          <span className="sala-live">
            <i />
            {g.liveBadge}
          </span>
        </span>
        <span className="play">
          <span>
            <Play size={18} fill="currentColor" />
          </span>
        </span>
      </div>
      <div className="sala-meta">
        <div className="t">{c.nombre}</div>
        <div className="s">{c.categoria}</div>
      </div>
    </button>
  );

  const tarjetaEmisora = (e: EmisoraSala) => (
    <button
      key={e.url}
      type="button"
      className={`sala-card sala-rcard${esta("radio", e.url) ? " on" : ""}`}
      onClick={() => p.onEmisora(e)}
    >
      <span className="sala-vinyl" style={{ "--c": e.paleta[0] } as CSSProperties} />
      <div className="sala-meta">
        <div className="t">{e.title}</div>
        <div className="s">{e.subtitle}</div>
      </div>
    </button>
  );

  return (
    <section className="sala-guide" id="sala-programacion">
      <div className="sala-g-head">
        <div>
          <div className="sala-eyebrow">{g.guideEyebrow}</div>
          <h2 className="sala-h2">{g.guideTitle}</h2>
        </div>
        <div className="sala-chips">
          {filtros.map((f) => (
            <button
              key={f.k}
              type="button"
              className={`sala-chip${filtro === f.k ? " on" : ""}`}
              style={f.color ? ({ "--c": f.color } as CSSProperties) : undefined}
              onClick={() => setFiltro(f.k)}
              aria-pressed={filtro === f.k}
            >
              {f.color && <span className="dot" />}
              {f.label}
            </button>
          ))}
          <button type="button" className="sala-chip" onClick={p.onGestionar} title={g.manageTitle}>
            <SlidersHorizontal size={14} />
            {g.manage}
          </button>
        </div>
      </div>

      {ver("vivo") && (
        <Estanteria titulo={g.rowLive} color="var(--tecla-red)" cuenta={g.countChannels(p.entretenimiento.length)}>
          {p.entretenimiento.map(tarjetaCanal)}
        </Estanteria>
      )}

      {ver("radio") && (
        <Estanteria titulo={g.rowRadio} color="var(--tecla-blue)" cuenta={g.countStations(p.emisorasMusica.length)}>
          {p.emisorasMusica.map(tarjetaEmisora)}
        </Estanteria>
      )}

      {ver("info") && (
        <Estanteria titulo={g.rowInfo} color="var(--tecla-yellow)" cuenta={g.infoCount}>
          {p.noticias.map(tarjetaCanal)}
          <button type="button" className="sala-card sala-tcard" onClick={p.onTeletexto}>
            <span className="ico sala-vt" style={{ background: "#000", color: "#FFFF00", fontSize: 20 }}>
              P100
            </span>
            <b>{g.ttxCardTitle}</b>
            <p>{g.ttxCardBody}</p>
          </button>
          {p.emisorasNoticias.map(tarjetaEmisora)}
        </Estanteria>
      )}

      {ver("aprende") && (
        <Estanteria titulo={g.rowLearn} color="var(--tecla-green)" cuenta={g.learnCount} ancha>
          {g.capsulas.map((c, i) => {
            const on = volteadas.has(i);
            return (
              <button
                key={c.q}
                type="button"
                className={`sala-flip${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() =>
                  setVolteadas((s) => {
                    const n = new Set(s);
                    if (n.has(i)) n.delete(i);
                    else n.add(i);
                    return n;
                  })
                }
              >
                <div className="in">
                  <div className="sala-face">
                    <span className="k">
                      <Lightbulb size={13} />
                      {g.didYouKnow}
                    </span>
                    <p className="q">{c.q}</p>
                    <span className="hint">{g.tapAnswer}</span>
                  </div>
                  <div className="sala-face back">
                    <span className="k">
                      <Check size={13} />
                      {g.answer}
                    </span>
                    <p className="a">{c.e}</p>
                    <span className="hint">{g.tapBack}</span>
                  </div>
                </div>
              </button>
            );
          })}
          <button type="button" className="sala-card sala-tcard" onClick={p.onCamino}>
            <span className="ico" style={{ background: "rgba(255,139,62,.14)", color: "#FF8B3E" }}>
              <Flame size={20} />
            </span>
            <b>{g.caminoTitle(p.racha ?? 0)}</b>
            <p>{g.caminoBody}</p>
            <span className="mt-auto text-[13px] font-semibold text-brand-400">{g.caminoCta}</span>
          </button>
        </Estanteria>
      )}

      {ver("estudiar") && (
        <Estanteria titulo={g.rowStudy} color="var(--tecla-yt)" cuenta={g.studyCount} ancha>
          {p.ytItems.length === 0 ? (
            <div className="sala-empty">{g.ytEmpty}</div>
          ) : (
            p.ytItems.map((y) => (
              <button
                key={y.id}
                type="button"
                className={`sala-card${esta("youtube", y.id) ? " on" : ""}`}
                onClick={() => p.onYoutube(y)}
              >
                <div className="sala-poster">
                  <MiniaturaYt item={y} />
                  <span className="play">
                    <span>
                      <Play size={18} fill="currentColor" />
                    </span>
                  </span>
                </div>
                <div className="sala-meta">
                  <div className="t">{y.titulo}</div>
                  <div className="s">YouTube{y.categoria ? ` · ${y.categoria}` : y.autor ? ` · ${y.autor}` : ""}</div>
                </div>
              </button>
            ))
          )}
        </Estanteria>
      )}
    </section>
  );
}

/**
 * Miniatura de YouTube con respaldo. Los directos largos (el lofi de siempre)
 * a veces no tienen miniatura en el CDN: YouTube responde 404 o una imagen
 * gris de 120 px. En ambos casos se pinta un cartel propio en vez del hueco.
 */
function MiniaturaYt({ item }: { item: YoutubeItem }) {
  const [fallo, setFallo] = useState(item.kind === "playlist");
  if (fallo) {
    return (
      <span
        className="absolute inset-0 grid place-items-center text-white"
        style={{ background: "radial-gradient(80% 90% at 20% 10%, #ff003355, transparent 60%), #1a1030" }}
      >
        <Play size={28} />
      </span>
    );
  }
  return (
    <img
      alt=""
      loading="lazy"
      src={miniaturaDe(item)}
      onError={() => setFallo(true)}
      onLoad={(e) => e.currentTarget.naturalWidth <= 120 && setFallo(true)}
    />
  );
}

function Estanteria(props: { titulo: string; color: string; cuenta: string; ancha?: boolean; children: ReactNode }) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement | null>(null);
  const mover = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: el.clientWidth * 0.8 * dir });
  };
  return (
    <div className="sala-row">
      <div className="sala-row-h">
        <span className="key" style={{ "--c": props.color } as CSSProperties} />
        <h3>{props.titulo}</h3>
        <span className="count">{props.cuenta}</span>
        <span className="sala-arrows">
          <button type="button" onClick={() => mover(-1)} aria-label={t.sala.prev}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => mover(1)} aria-label={t.sala.next}>
            <ChevronRight size={18} />
          </button>
        </span>
      </div>
      <div ref={ref} className={`sala-shelf${props.ancha ? " wide" : ""}`}>
        {props.children}
      </div>
    </div>
  );
}
