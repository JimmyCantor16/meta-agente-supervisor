import "../sala.css";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Cast, ExternalLink, Flame, Maximize, PictureInPicture2, X } from "lucide-react";
import { useLanguage } from "../../../i18n/LanguageProvider";
import { useAuth } from "../../auth/AuthProvider";
import { obtenerCamino } from "../../../lib/api";
import { COLOR_APP, EnlaceApp, LogoFacebook, LogoWhatsapp } from "../../../components/AppsExternas";
import { useMultimedia } from "../../multimedia";
import type { StreamItem, YoutubeItem } from "../../multimedia";
import { useCanalesSala } from "../hooks/useCanalesSala";
import type { CanalSala } from "../hooks/useCanalesSala";
import { dosCifras, horaCorta, useReloj } from "../hooks/useReloj";
import { useAncho } from "../hooks/useAncho";
import { paletaDe } from "../lib/paletas";
import { FUENTES_TTX, PAGINA_CAPSULAS, PAGINA_INDICE, PAGINA_PROGRAMACION } from "../lib/fuentes";
import { MuebleSala, TeleSala } from "./TeleSala";
import type { ModoPantalla } from "./TeleSala";
import { ControlRemoto } from "./ControlRemoto";
import type { TeclaColor } from "./ControlRemoto";
import { Teletexto } from "./Teletexto";
import { Capsula } from "./Capsula";
import { Programacion } from "./Programacion";
import { PausaComercial } from "./PausaComercial";

interface Props {
  /** Navega a otra vista del sistema (p. ej. "camino"). */
  onIr: (vista: string) => void;
  /** Lleva una idea al Taller, ya escrita en el cuadro de texto. */
  onLlevarIdea: (idea: string) => void;
}

type Capa = "ttx" | "caps" | null;

/** Por debajo de este ancho, el teletexto y la cápsula no caben DENTRO de la tele. */
const ANCHO_COMPACTO = 760;

/**
 * LA SALA — la página de inicio del sistema: entrar para divertirse,
 * informarse y aprender, y desde ahí (si nace una idea) pasar al Taller.
 *
 * No tiene reproductor propio: usa el del MultimediaProvider, el mismo del
 * panel lateral. Por eso lo que suena aquí sigue sonando al irse al Taller
 * (en la mini tele flotante), y lo que se puso en el panel aparece aquí.
 */
export function LaSala({ onIr, onLlevarIdea }: Props) {
  const { t, lang } = useLanguage();
  const g = t.sala;
  const { user } = useAuth();
  const m = useMultimedia();
  const { setStageCover } = m;
  const canales = useCanalesSala();
  const ahora = useReloj();
  const { ref: raizRef, ancho } = useAncho<HTMLDivElement>();
  const compacta = ancho > 0 && ancho < ANCHO_COMPACTO;

  const [encendida, setEncendida] = useState(true);
  const [transicion, setTransicion] = useState<"on" | "off" | null>(null);
  const [capa, setCapa] = useState<Capa>(null);
  const [ttxPagina, setTtxPagina] = useState(PAGINA_INDICE);
  const [digitos, setDigitos] = useState("");
  const [osd, setOsd] = useState<{ texto: string; id: number } | null>(null);
  const [rotulo, setRotulo] = useState<{ num: string; nombre: string; sub: string; id: number } | null>(null);
  const [volOsd, setVolOsd] = useState<{ nivel: number; mudo: boolean; id: number } | null>(null);
  const [cambio, setCambio] = useState(0);
  const [giroCanal, setGiroCanal] = useState(0);
  const [giroVol, setGiroVol] = useState(0);
  const [racha, setRacha] = useState<{ dias: number; semana: boolean[] } | null>(null);

  const contador = useRef(0);
  const sig = () => ++contador.current;
  const ultimoTv = useRef<StreamItem | null>(null);
  const ultimaRadio = useRef<StreamItem | null>(null);
  const ultimoYt = useRef<YoutubeItem | null>(null);
  const ultimoTipo = useRef<"tv" | "radio" | "youtube" | null>(null);
  const volPrevio = useRef(60);
  const pantallaRef = useRef<HTMLDivElement | null>(null);
  const salaRef = useRef<HTMLDivElement | null>(null);
  const digitoTimer = useRef<number | null>(null);

  const modo: ModoPantalla =
    m.active === "tv" ? "tv" : m.active === "radio" ? "radio" : m.active === "youtube" ? "youtube" : "idle";
  const canalActual = modo === "tv" ? (canales.todos.find((c) => c.url === m.current?.url) ?? null) : null;

  // Cada cambio de contenido (venga del control, de una tarjeta o del panel):
  // rótulo del canal, número en pantalla, nieve breve y meneo de antenas.
  const clave = m.active && m.current ? `${m.active}|${m.current.url}` : "";
  useEffect(() => {
    const cur = m.current;
    if (!m.active || !cur) return;
    ultimoTipo.current = m.active;
    if (m.active === "tv") {
      ultimoTv.current = cur;
      const c = canales.todos.find((x) => x.url === cur.url);
      const num = c ? dosCifras(c.n) : "TV";
      setOsd({ texto: `CH ${num}`, id: sig() });
      setRotulo({ num, nombre: cur.title, sub: cur.subtitle || g.liveBadge, id: sig() });
    } else if (m.active === "radio") {
      ultimaRadio.current = cur;
      setOsd({ texto: g.osdRadio, id: sig() });
      setRotulo(null);
    } else {
      ultimoYt.current = m.ytItems.find((y) => y.id === cur.url) ?? ultimoYt.current;
      setOsd({ texto: g.osdYoutube, id: sig() });
      setRotulo(null);
    }
    setCambio((x) => x + 1);
    // Solo al cambiar lo que suena; el resto se lee fresco dentro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Con el teletexto o la cápsula dentro de la tele, YouTube se aparta (sigue
  // sonando): su iframe flota por encima y taparía la página.
  useEffect(() => {
    setStageCover(capa !== null && !compacta);
    return () => setStageCover(false);
  }, [capa, compacta, setStageCover]);

  useEffect(() => {
    if (!user) {
      setRacha(null);
      return;
    }
    let vivo = true;
    obtenerCamino()
      .then((c) => vivo && setRacha({ dias: c.racha_dias, semana: c.actividad_semana }))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [user]);

  // --- Acciones ---
  const cerrarCapa = () => {
    setCapa(null);
    setDigitos("");
  };

  const encender = () => {
    if (encendida) return;
    setEncendida(true);
    setTransicion("on");
    window.setTimeout(() => setTransicion(null), 620);
  };

  const reproducirCanal = (c: CanalSala) => {
    encender();
    cerrarCapa();
    m.playTv({ title: c.nombre, subtitle: c.categoria, url: c.url, kind: "tv" });
  };
  const reproducirEmisora = (e: StreamItem) => {
    encender();
    cerrarCapa();
    m.playRadio(e);
  };
  const reproducirYt = (y: YoutubeItem) => {
    encender();
    cerrarCapa();
    void m.playYoutube(y);
  };

  const power = () => {
    if (encendida) {
      setCapa(null);
      setEncendida(false);
      setTransicion("off");
      window.setTimeout(() => setTransicion(null), 560);
      m.stop();
      return;
    }
    encender();
    setCambio((x) => x + 1);
    // Al encender vuelve lo último que sonaba, como una tele de verdad.
    if (ultimoTipo.current === "tv" && ultimoTv.current) m.playTv(ultimoTv.current);
    else if (ultimoTipo.current === "radio" && ultimaRadio.current) m.playRadio(ultimaRadio.current);
    else if (ultimoTipo.current === "youtube" && ultimoYt.current) void m.playYoutube(ultimoYt.current);
  };

  const pasoCanal = (d: 1 | -1) => {
    setGiroCanal((x) => x + 30 * d);
    if (modo === "radio") {
      const lista = canales.emisoras;
      const i = lista.findIndex((e) => e.url === m.current?.url);
      reproducirEmisora(lista[i < 0 ? 0 : (i + d + lista.length) % lista.length]);
      return;
    }
    if (modo === "youtube" && m.ytItems.length) {
      const lista = m.ytItems;
      const i = lista.findIndex((y) => y.id === m.ytCurrentId);
      reproducirYt(lista[i < 0 ? 0 : (i + d + lista.length) % lista.length]);
      return;
    }
    const lista = canales.todos;
    if (!lista.length) return;
    const i = canalActual ? lista.indexOf(canalActual) : -1;
    reproducirCanal(lista[i < 0 ? (d > 0 ? 0 : lista.length - 1) : (i + d + lista.length) % lista.length]);
  };

  const pasoVolumen = (d: 1 | -1) => {
    if (!encendida) return;
    const v = Math.max(0, Math.min(100, m.volume + d * 5));
    m.setVolume(v);
    setGiroVol((x) => x + d * 18);
    setVolOsd({ nivel: Math.round(v / 5), mudo: v === 0, id: sig() });
  };

  const silenciar = () => {
    if (!encendida) return;
    if (m.volume > 0) {
      volPrevio.current = m.volume;
      m.setVolume(0);
      setVolOsd({ nivel: 0, mudo: true, id: sig() });
    } else {
      const v = volPrevio.current || 60;
      m.setVolume(v);
      setVolOsd({ nivel: Math.round(v / 5), mudo: false, id: sig() });
    }
  };

  const irPaginaTtx = (n: number) => {
    setDigitos("");
    if (n === PAGINA_CAPSULAS) {
      setCapa("caps");
      return;
    }
    if (n === PAGINA_PROGRAMACION) {
      cerrarCapa();
      document.getElementById("sala-programacion")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setTtxPagina(FUENTES_TTX.some((f) => f.pagina === n) ? n : PAGINA_INDICE);
  };

  const digito = (d: string) => {
    if (!encendida) return;
    // Con el teletexto abierto, los números marcan PÁGINA (tres cifras).
    if (capa === "ttx") {
      const nueva = (digitos + d).slice(0, 3);
      if (nueva.length === 3) irPaginaTtx(Number(nueva));
      else setDigitos(nueva);
      return;
    }
    const nueva = (digitos + d).slice(-2);
    setDigitos(nueva);
    setOsd({ texto: `CH ${nueva}${nueva.length < 2 ? "_" : ""}`, id: sig() });
    if (digitoTimer.current) window.clearTimeout(digitoTimer.current);
    digitoTimer.current = window.setTimeout(
      () => {
        setDigitos("");
        const c = canales.todos.find((x) => x.n === Number(nueva));
        if (c) reproducirCanal(c);
        else {
          setOsd({ texto: g.osdNoSignal, id: sig() });
          setCambio((x) => x + 1);
        }
      },
      nueva.length >= 2 ? 250 : 1100,
    );
  };

  const tecla = (k: TeclaColor) => {
    encender();
    if (k === "tv") {
      cerrarCapa();
      if (modo === "tv") return;
      if (ultimoTv.current) m.playTv(ultimoTv.current);
      else if (canales.entretenimiento[0]) reproducirCanal(canales.entretenimiento[0]);
    } else if (k === "radio") {
      cerrarCapa();
      if (modo === "radio") return;
      const e = ultimaRadio.current ?? canales.emisorasMusica[0];
      if (e) reproducirEmisora(e);
    } else if (k === "ttx") {
      setDigitos("");
      setTtxPagina(PAGINA_INDICE);
      setCapa((c) => (c === "ttx" ? null : "ttx"));
    } else {
      setCapa((c) => (c === "caps" ? null : "caps"));
    }
  };

  const zap = () => {
    const actual = m.current?.url;
    const tele = canales.todos.filter((c) => c.url !== actual);
    const radios = canales.emisoras.filter((e) => e.url !== actual);
    const azar = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
    if (radios.length && (Math.random() < 0.25 || !tele.length)) reproducirEmisora(azar(radios));
    else if (tele.length) reproducirCanal(azar(tele));
  };

  // Elegir algo en la programación (más abajo) sube hasta la tele si no se ve:
  // si no, el canal empieza a sonar fuera de la vista.
  const verTele = () => {
    const room = salaRef.current?.querySelector(".sala-room");
    if (!room) return;
    const r = room.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) room.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const pantallaCompleta = () => {
    if (modo === "tv" || modo === "youtube") m.requestFullscreen();
    else void pantallaRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  // Atajos de teclado. El manejador lee las acciones de una ref para no
  // re-registrarse en cada render (y no quedarse con un estado viejo).
  const acciones = useRef({ digito, zap, tecla, silenciar, power, pasoCanal, cerrarCapa, capa, panel: m.panelOpen });
  acciones.current = { digito, zap, tecla, silenciar, power, pasoCanal, cerrarCapa, capa, panel: m.panelOpen };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const a = acciones.current;
      if (a.panel) return;
      const k = e.key.toLowerCase();
      if (/^[0-9]$/.test(k)) return a.digito(k);
      if ((k === "arrowup" || k === "arrowdown") && document.activeElement?.closest(".sala-room")) {
        e.preventDefault();
        return a.pasoCanal(k === "arrowup" ? 1 : -1);
      }
      if (k === "escape" && a.capa) return a.cerrarCapa();
      const mapa: Record<string, () => void> = {
        z: a.zap,
        t: () => a.tecla("ttx"),
        a: () => a.tecla("caps"),
        r: () => a.tecla("radio"),
        v: () => a.tecla("tv"),
        m: a.silenciar,
        p: a.power,
      };
      mapa[k]?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- Lo que se pinta ---
  const teclaActiva: TeclaColor | null = !encendida
    ? null
    : capa === "ttx"
      ? "ttx"
      : capa === "caps"
        ? "caps"
        : modo === "radio"
          ? "radio"
          : modo === "tv"
            ? "tv"
            : null;

  const nodoCapa: ReactNode =
    capa === "ttx" ? (
      <Teletexto pagina={ttxPagina} entrada={digitos} onPagina={irPaginaTtx} onCerrar={cerrarCapa} />
    ) : capa === "caps" ? (
      <Capsula onCerrar={cerrarCapa} />
    ) : null;

  const castConectado = m.castEstado === "conectado";
  const castTitulo = castConectado ? g.castStop : m.castEstado === "sin-dispositivos" ? g.castNoDevices : g.cast;
  const alternarTele = castConectado ? m.cortarTele : m.enviarATele;

  const aviso: ReactNode =
    castConectado && (modo === "tv" || modo === "radio") ? (
      <div className="sala-aviso cast">
        <Cast />
        <span>{g.castOn(m.castNombre)}</span>
        <button type="button" onClick={m.cortarTele}>
          {g.castStop}
        </button>
      </div>
    ) : modo === "tv" && (m.poppedOut || m.placement === "floating") ? (
      <div className="sala-aviso">
        <span>{m.poppedOut ? g.inWindow : g.inMini}</span>
        <button type="button" onClick={m.poppedOut ? m.requestPip : m.dockVideo}>
          {g.bringBack}
        </button>
      </div>
    ) : null;

  const h = ahora.getHours();
  const saludo = h >= 5 && h < 12 ? g.morning : h >= 12 && h < 19 ? g.afternoon : g.night;
  const nombre = user?.name?.trim().split(/\s+/)[0];
  const fecha = ahora.toLocaleDateString(lang === "es" ? "es-CO" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const sonando =
    m.active && m.current
      ? { tipo: m.active, id: m.active === "youtube" ? (m.ytCurrentId ?? "") : m.current.url }
      : null;

  return (
    <div
      className="sala"
      ref={(el) => {
        salaRef.current = el;
        raizRef(el);
      }}
    >
      <div className="sala-wrap">
        <header className="sala-top">
          <div>
            <div className="sala-eyebrow">{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</div>
            <h1 className="sala-h1">{nombre ? `${saludo}, ${nombre}` : saludo}</h1>
            <p className="sala-lede">{g.lede}</p>
          </div>
          <div className="sala-tools">
            {racha && (
              <span className="sala-pill" title={g.streakTitle}>
                <Flame size={16} className="sala-flame" />
                <b>{g.streak(racha.dias)}</b>
                <span className="sala-week" aria-hidden>
                  {racha.semana.map((on, i) => (
                    <i key={i} className={on ? "on" : ""} />
                  ))}
                </span>
              </span>
            )}
            <span className="sala-pill sala-clockp">
              <span className="sala-clock">{horaCorta(ahora)}</span>
            </span>
            <span className="sala-sep" />
            <EnlaceApp
              app="facebook"
              className="sala-appbtn"
              style={{ background: COLOR_APP.facebook }}
              title={g.openFacebook}
            >
              <LogoFacebook size={20} />
            </EnlaceApp>
            <EnlaceApp
              app="whatsapp"
              className="sala-appbtn"
              style={{ background: COLOR_APP.whatsapp }}
              title={g.openWhatsapp}
            >
              <LogoWhatsapp size={22} />
            </EnlaceApp>
          </div>
        </header>

        <section className="sala-stage">
          <div className="sala-room" tabIndex={0} aria-label={g.screenLabel}>
            <div className="sala-floor" />
            <TeleSala
              encendida={encendida}
              transicion={transicion}
              modo={modo}
              cambio={cambio}
              osd={osd}
              osdFijo={modo === "tv" && m.error ? g.osdNoSignal : null}
              rotulo={modo === "tv" ? rotulo : null}
              volumen={volOsd}
              radio={
                modo === "radio" && m.current
                  ? { nombre: m.current.title, sub: m.current.subtitle, color: paletaDe(m.current.title)[0] }
                  : null
              }
              ytId={modo === "youtube" ? m.ytCurrentId : null}
              aviso={aviso}
              capa={compacta ? null : nodoCapa}
              giroCanal={giroCanal}
              giroVolumen={giroVol}
              onPerillaCanal={() => pasoCanal(1)}
              onPerillaVolumen={() => pasoVolumen(1)}
              onDobleClic={pantallaCompleta}
              pantallaRef={(el) => {
                pantallaRef.current = el;
              }}
            />
            <MuebleSala />
            {compacta && nodoCapa && <div className="sala-dock">{nodoCapa}</div>}
          </div>

          <ControlRemoto
            activa={teclaActiva}
            mudo={m.volume === 0}
            cast={m.castEstado}
            onCast={alternarTele}
            onPower={power}
            onMute={silenciar}
            onCanal={pasoCanal}
            onVolumen={pasoVolumen}
            onDigito={digito}
            onTecla={tecla}
            onZap={zap}
          />
        </section>

        <div className="sala-now">
          <span className="sala-chnum">
            {modo === "tv" ? (canalActual ? dosCifras(canalActual.n) : "TV") : modo === "radio" ? "FM" : modo === "youtube" ? "YT" : "--"}
          </span>
          <div className="sala-now-t">
            <b>{m.current?.title ?? g.nothing}</b>
            <span>{m.current ? m.current.subtitle : g.nothingSub}</span>
          </div>
          {m.current && (
            <span className={`sala-live${modo === "radio" ? " blue" : modo === "youtube" ? " yt" : ""}`}>
              <i />
              {modo === "radio" ? g.radioBadge : modo === "youtube" ? g.ytBadge : g.liveBadge}
            </span>
          )}
          <div className="sala-now-actions">
            {m.castEstado !== "no-disponible" && (
              <button
                type="button"
                className={`sala-btn${castConectado ? " primary" : ""}`}
                onClick={alternarTele}
                title={castTitulo}
              >
                <Cast size={16} />
                <span className="lbl">{castConectado ? g.castStop : g.cast}</span>
              </button>
            )}
            <button type="button" className="sala-btn" disabled={modo !== "tv"} onClick={m.minimizeVideo} title={g.mini}>
              <PictureInPicture2 size={16} />
              <span className="lbl">{g.mini}</span>
            </button>
            <button type="button" className="sala-btn" disabled={modo !== "tv"} onClick={m.requestPip} title={g.popOut}>
              <ExternalLink size={16} />
              <span className="lbl">{g.popOut}</span>
            </button>
            <button type="button" className="sala-btn" disabled={!encendida} onClick={pantallaCompleta} title={g.fullscreen}>
              <Maximize size={16} />
              <span className="lbl">{g.fullscreen}</span>
            </button>
          </div>
        </div>

        {m.error && (
          <div className="sala-error" role="status">
            <span>{m.error}</span>
            <button type="button" onClick={m.clearError} aria-label={t.multimedia.close}>
              <X size={14} />
            </button>
          </div>
        )}

        <Programacion
          entretenimiento={canales.entretenimiento}
          noticias={canales.noticias}
          emisorasMusica={canales.emisorasMusica}
          emisorasNoticias={canales.emisorasNoticias}
          ytItems={m.ytItems}
          sonando={sonando}
          racha={racha?.dias ?? null}
          onCanal={(c) => {
            reproducirCanal(c);
            verTele();
          }}
          onEmisora={(e) => {
            reproducirEmisora(e);
            verTele();
          }}
          onYoutube={(y) => {
            reproducirYt(y);
            verTele();
          }}
          onTeletexto={() => {
            tecla("ttx");
            verTele();
          }}
          onCamino={() => onIr("camino")}
          onGestionar={m.togglePanel}
        />

        <PausaComercial onLlevar={onLlevarIdea} />

        <footer className="sala-foot">
          {g.shortcuts} <kbd>0</kbd>–<kbd>9</kbd> {g.scGoTo} · <kbd>Z</kbd> {g.scZap} · <kbd>T</kbd> {g.scText} ·{" "}
          <kbd>A</kbd> {g.scLearn} · <kbd>R</kbd> {g.scRadio} · <kbd>M</kbd> {g.scMute} · <kbd>↑</kbd>
          <kbd>↓</kbd> {g.scArrows}
        </footer>
      </div>
    </div>
  );
}
