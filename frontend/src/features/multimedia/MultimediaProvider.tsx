import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import type * as React from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { searchRadio as apiSearchRadio, topRadio } from "./lib/radioBrowser";
import { DEFAULT_CHANNELS, LEGACY_SEEDED_URLS } from "./lib/defaultChannels";
import { DEFAULT_STATIONS, filterStations } from "./lib/defaultStations";
import { loadCountryIptv } from "./lib/iptv";
import type { CustomChannel, StreamItem, VideoPlacement, YoutubeItem } from "./types";
import { YOUTUBE_SUGERIDOS, consultarOEmbed, parseYoutube } from "./lib/youtube";

/** Las tres fuentes del panel. */
export type PanelTab = "tv" | "radio" | "youtube";

// --- Persistencia local (navegador del usuario) ---
const LS_CHANNELS = "mm.channels";
const LS_VOLUME = "mm.volume";
const LS_YT = "mm.youtube";

/**
 * Carga la API oficial del reproductor de YouTube (una sola vez).
 *
 * Es lo que permite que los botones del panel manden sobre el vídeo incrustado.
 * Sin ella, el iframe es una caja negra: se vería, pero el play/pausa y el
 * volumen del panel no lo tocarían, y habría dos juegos de controles distintos.
 */
let ytApi: Promise<any> | null = null;
function loadYtApi(): Promise<any> {
  if ((window as any).YT?.Player) return Promise.resolve((window as any).YT);
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve, reject) => {
    const anterior = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      if (typeof anterior === "function") anterior();
      resolve((window as any).YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      ytApi = null;
      reject(new Error("iframe_api"));
    };
    document.head.appendChild(s);
  });
  return ytApi;
}

/** Pone un vídeo o una lista en un reproductor ya creado. */
function cargarEnReproductor(player: any, item: YoutubeItem): void {
  try {
    if (item.kind === "playlist") player.loadPlaylist({ list: item.id, listType: "playlist" });
    else player.loadVideoById({ videoId: item.id });
  } catch {
    /* si aún no está listo, onReady lo cargará */
  }
}

// Geometría de la pantalla del recuadro flotante (mini-TV) 16:9. El ancho es
// AJUSTABLE (tirador de esquina): se guarda y el alto se deriva en proporción.
const DEF_SCREEN_W = 336;
const SCREEN_MIN = 224;
const SCREEN_MAX = 760;
const LS_TVW = "mm.tvW";
const clampScreen = (w: number) => Math.max(SCREEN_MIN, Math.min(SCREEN_MAX, Math.round(w)));
const screenHOf = (w: number) => Math.round((w * 9) / 16);
// Marco "tele estilo Simpsons" (solo en modo flotante): mueble de madera con
// bisel, panel de perillas a la derecha, antenas y patitas.
const TV_BEZEL = 12; // bisel superior/izquierdo/inferior
const TV_CTRL = 46; // franja de controles a la derecha

// --- Marco "tele Simpsons" para la ventana Document PiP (HTML/CSS puro, no React;
// se inyecta en el documento de la ventana del SO). El <video> se mete en .screen.
const SIMPSONS_PIP_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Righteous&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;overflow:hidden;
    font-family:'Trebuchet MS','Segoe UI',system-ui,sans-serif;
    background:linear-gradient(160deg,#9aa3d8 0%,#838ecb 55%,#737fc2 100%)}
  /* La tele LLENA toda la ventana: sin fondo blanco alrededor. */
  .stage{position:absolute;inset:0}
  .ant{position:absolute;left:50%;top:2px;transform:translateX(-50%);overflow:visible}
  .dvd{position:absolute;top:30px;left:50%;transform:translateX(-50%);width:44%;height:16px;
    background:linear-gradient(#454b73,#363b5c);border:3px solid #20233b;border-radius:6px 6px 3px 3px;
    display:flex;align-items:center;justify-content:center;gap:7px}
  .dvd .slot{width:44%;height:3px;background:#20233b;border-radius:2px}
  .dvd .dled{width:5px;height:5px;border-radius:50%;background:#ff4d4d;box-shadow:0 0 5px #ff4d4d}
  .frame{position:absolute;top:50px;left:16px;right:54px;bottom:34px;
    background:#6ec7d6;border:3px solid #20233b;border-radius:14px}
  .screen{position:absolute;inset:5px;border-radius:8px;overflow:hidden;background:#000}
  .screen video{width:100%;height:100%;object-fit:cover;background:#000;display:block}
  .knobs{position:absolute;right:16px;top:58px;display:flex;flex-direction:column;gap:11px;align-items:center}
  .knob{width:17px;height:17px;border-radius:50%;
    background:radial-gradient(circle at 34% 30%,#d7dcf5,#9aa3d8 70%);border:3px solid #20233b}
  .led{width:8px;height:8px;border-radius:50%;background:#ff4d4d;border:2px solid #20233b;box-shadow:0 0 8px #ff4d4d}
  .brand{position:absolute;left:0;right:0;bottom:8px;text-align:center;
    font-family:'Righteous','Trebuchet MS',system-ui,sans-serif;font-size:15px;letter-spacing:1px;
    color:#20233b;text-shadow:0 1px 0 rgba(255,255,255,.25)}
  .brand span{color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35)}
`;
const SIMPSONS_PIP_MARKUP = `
  <div class="stage">
    <svg class="ant" width="140" height="34" viewBox="0 0 140 34">
      <line x1="70" y1="34" x2="16" y2="5" stroke="#20233b" stroke-width="5" stroke-linecap="round"/>
      <line x1="70" y1="34" x2="124" y2="5" stroke="#20233b" stroke-width="5" stroke-linecap="round"/>
      <circle cx="16" cy="5" r="5.5" fill="#20233b"/><circle cx="124" cy="5" r="5.5" fill="#20233b"/>
    </svg>
    <div class="dvd"><div class="slot"></div><div class="dled"></div></div>
    <div class="frame"><div class="screen"></div></div>
    <div class="knobs"><div class="knob"></div><div class="knob"></div><div class="led"></div></div>
    <div class="brand">Jamz Software · <span>Free TV</span></div>
  </div>
`;

// --- hls.js EMPAQUETADO (sin CDN): Vite lo separa en su propio chunk y solo se
// descarga la primera vez que se reproduce un canal HLS. Confiable y offline. ---
let hlsPromise: Promise<any> | null = null;
function loadHls(): Promise<any> {
  if (!hlsPromise) hlsPromise = import("hls.js").then((m) => m.default);
  return hlsPromise;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface MultimediaContextValue {
  // navegación del panel
  panelOpen: boolean;
  togglePanel: () => void;
  closePanel: () => void;
  tab: PanelTab;
  setTab: (t: PanelTab) => void;

  // estado de reproducción (compartido: solo suena una cosa a la vez)
  active: PanelTab | null;
  current: StreamItem | null;
  playing: boolean;
  buffering: boolean;
  volume: number;
  setVolume: (v: number) => void;
  togglePlay: () => void;
  stop: () => void;
  error: string | null;
  clearError: () => void;

  // TV
  channels: CustomChannel[];
  addChannel: (name: string, url: string) => boolean;
  removeChannel: (url: string) => void;
  playTv: (item: StreamItem) => void;
  minimized: boolean;
  placement: VideoPlacement;
  minimizeVideo: () => void; // → recuadro flotante (su propia parte del DOM)
  dockVideo: () => void; // → vuelve a acoplarse en el panel
  requestPip: () => void; // → saca la tele Simpsons a una ventana del SO (Document PiP)
  requestFullscreen: () => void;
  poppedOut: boolean; // → la tele está en una ventana flotante fuera del navegador

  // Radio
  radioItems: StreamItem[];
  radioLoading: boolean;
  radioError: string | null;
  loadTopRadio: (country?: string) => void;
  searchRadio: (q: string) => void;
  playRadio: (item: StreamItem) => void;

  // IPTV (canales de país cargados en vivo desde iptv-org)
  iptvItems: StreamItem[];
  iptvLoading: boolean;
  iptvError: string | null;
  loadIptv: () => void;

  // YouTube (reproductor oficial incrustado, sin salir de la plataforma)
  ytItems: YoutubeItem[];
  addYoutube: (entrada: string, titulo?: string) => Promise<string | null>;
  removeYoutube: (id: string) => void;
  playYoutube: (item: YoutubeItem) => void;
  ytCurrentId: string | null;

  // interno: el panel registra dónde va el vídeo acoplado
  registerSlot: (el: HTMLElement | null) => void;
  registerYtSlot: (el: HTMLElement | null) => void;
}

const Ctx = createContext<MultimediaContextValue | null>(null);

export function useMultimedia(): MultimediaContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMultimedia fuera de <MultimediaProvider>");
  return v;
}

const LS_CHANNELS_VER = "mm.channelsVer";
const CHANNELS_VER = "2"; // subir cuando cambie la lista curada de canales

/**
 * Lista de YouTube del usuario, guardada en SU navegador.
 *
 * Igual que los canales de TV: la primera vez se siembran unas sugerencias y a
 * partir de ahí manda el usuario. Si borra una, no reaparece — la app no
 * mantiene una lista propia que se le imponga.
 */
function readYoutube(): YoutubeItem[] {
  try {
    const raw = window.localStorage.getItem(LS_YT);
    if (raw === null) {
      window.localStorage.setItem(LS_YT, JSON.stringify(YOUTUBE_SUGERIDOS));
      return YOUTUBE_SUGERIDOS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => x && x.id && x.kind) : [];
  } catch {
    return [];
  }
}

function readChannels(): CustomChannel[] {
  try {
    const raw = window.localStorage.getItem(LS_CHANNELS);
    // Primera vez: sembrar la lista curada (solo canales que reproducen).
    if (raw === null) {
      window.localStorage.setItem(LS_CHANNELS, JSON.stringify(DEFAULT_CHANNELS));
      window.localStorage.setItem(LS_CHANNELS_VER, CHANNELS_VER);
      return DEFAULT_CHANNELS;
    }
    const parsed = JSON.parse(raw);
    const stored: CustomChannel[] = Array.isArray(parsed) ? parsed : [];
    // Migración: retira los sembrados viejos (muchos ya caídos), añade los curados
    // nuevos y CONSERVA los canales que el usuario agregó a mano.
    if (window.localStorage.getItem(LS_CHANNELS_VER) !== CHANNELS_VER) {
      const legacy = new Set(LEGACY_SEEDED_URLS);
      const nuevos = new Set(DEFAULT_CHANNELS.map((c) => c.url));
      const userAdded = stored.filter((c) => c && c.url && !legacy.has(c.url) && !nuevos.has(c.url));
      const merged = [...DEFAULT_CHANNELS, ...userAdded];
      window.localStorage.setItem(LS_CHANNELS, JSON.stringify(merged));
      window.localStorage.setItem(LS_CHANNELS_VER, CHANNELS_VER);
      return merged;
    }
    return stored;
  } catch {
    return DEFAULT_CHANNELS;
  }
}

export function MultimediaProvider({ children }: PropsWithChildren) {
  const { t } = useLanguage();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<any>(null);
  const radioHlsRef = useRef<any>(null);
  const slotRef = useRef<HTMLElement | null>(null);
  // Vídeo imperativo (no lo maneja React) para poder moverlo a la ventana PiP.
  const screenHostRef = useRef<HTMLDivElement | null>(null);
  const pipWinRef = useRef<Window | null>(null);
  const [poppedOut, setPoppedOut] = useState(false);
  // Refs vivos para los listeners del vídeo imperativo (evitan cierres obsoletos).
  const activeRef = useRef<PanelTab | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  // --- YouTube ---
  // El iframe vive en un contenedor FIJO que nunca se desprende del DOM. Es la
  // diferencia esencial con el <video> de la TV: un <video> se puede mover de
  // sitio sin perder la reproducción, pero un <iframe> SE RECARGA en cuanto se
  // quita y se vuelve a insertar. Por eso aquí no se mueve nada: se reposiciona
  // con CSS sobre el hueco del panel, y así la música sigue sonando aunque
  // cierres el panel o te vayas a otra pestaña — que es justo lo que se busca.
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytSlotRef = useRef<HTMLElement | null>(null);
  const [ytRect, setYtRect] = useState<Rect | null>(null);
  const [ytCurrentId, setYtCurrentId] = useState<string | null>(null);
  const [ytItems, setYtItems] = useState<YoutubeItem[]>(readYoutube);

  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("tv");

  const [active, setActive] = useState<PanelTab | null>(null);
  const [current, setCurrent] = useState<StreamItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState<number>(() => {
    const v = Number(window.localStorage.getItem(LS_VOLUME));
    return Number.isFinite(v) && v > 0 ? v : 80;
  });
  // El reproductor de YouTube se crea dentro de un callback: necesita leer el
  // volumen actual sin quedarse con el valor del primer render.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const [channels, setChannels] = useState<CustomChannel[]>(readChannels);
  const [minimized, setMinimized] = useState(false);

  // Arranca con la lista curada (suena siempre); Radio Browser la enriquece.
  const [radioItems, setRadioItems] = useState<StreamItem[]>(DEFAULT_STATIONS);
  const [radioLoading, setRadioLoading] = useState(false);
  const [radioError, setRadioError] = useState<string | null>(null);

  const [iptvItems, setIptvItems] = useState<StreamItem[]>([]);
  const [iptvLoading, setIptvLoading] = useState(false);
  const [iptvError, setIptvError] = useState<string | null>(null);

  // Geometría del vídeo flotante y del recuadro acoplado.
  const [floatPos, setFloatPos] = useState({ x: 0, y: 0 });
  const [dockRect, setDockRect] = useState<Rect | null>(null);

  // Ancho de la pantalla flotante (ajustable con el tirador). Alto y mueble se
  // derivan en proporción 16:9.
  const [screenW, setScreenW] = useState<number>(() => {
    const v = Number(window.localStorage.getItem(LS_TVW));
    return Number.isFinite(v) && v > 0 ? clampScreen(v) : DEF_SCREEN_W;
  });
  const screenH = screenHOf(screenW);
  const tvW = screenW + TV_BEZEL + TV_CTRL;
  const tvH = screenH + TV_BEZEL * 2;
  useEffect(() => {
    window.localStorage.setItem(LS_TVW, String(screenW));
  }, [screenW]);

  // Posición inicial del flotante (abajo-derecha), una sola vez.
  useEffect(() => {
    setFloatPos({
      x: window.innerWidth - (DEF_SCREEN_W + TV_BEZEL + TV_CTRL) - 24,
      y: window.innerHeight - (screenHOf(DEF_SCREEN_W) + TV_BEZEL * 2) - 24,
    });
  }, []);

  // Volumen → ambos medios; persiste.
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume / 100;
    if (audioRef.current) audioRef.current.volume = volume / 100;
    // YouTube trabaja en 0-100, no en 0-1: el mismo control gobierna las tres
    // fuentes para que no haya un volumen distinto por pestaña.
    try {
      ytPlayerRef.current?.setVolume?.(volume);
    } catch {
      /* el iframe puede no estar listo */
    }
    window.localStorage.setItem(LS_VOLUME, String(volume));
  }, [volume]);

  // Dónde se ve el vídeo: nada si no hay TV; flotante si está minimizado, con el
  // panel cerrado, o mirando la pestaña de Radio; acoplado en el panel si no.
  const placement: VideoPlacement =
    active !== "tv"
      ? "hidden"
      : minimized || !panelOpen || tab !== "tv"
        ? "floating"
        : "docked";

  const registerSlot = useCallback((el: HTMLElement | null) => {
    slotRef.current = el;
  }, []);

  // Mide el hueco del panel donde va el vídeo acoplado. Solo actualiza el estado
  // si el rect CAMBIÓ (evita re-renders en cada frame del seguimiento).
  const dockRectRef = useRef<Rect | null>(null);
  const measureSlot = useCallback(() => {
    const el = slotRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const next = { left: r.left, top: r.top, width: r.width, height: r.height };
    const prev = dockRectRef.current;
    if (!prev || prev.left !== next.left || prev.top !== next.top || prev.width !== next.width || prev.height !== next.height) {
      dockRectRef.current = next;
      setDockRect(next);
    }
  }, []);

  // Mientras el vídeo esté acoplado, sigue el hueco en CADA frame: así queda
  // perfectamente alineado aunque el panel se abra con transición o hagas scroll.
  useLayoutEffect(() => {
    if (placement !== "docked") return;
    let raf = 0;
    const loop = () => {
      measureSlot();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [placement, measureSlot]);

  // El reproductor de YouTube se ve SOLO con su pestaña abierta. En cualquier
  // otro caso sigue vivo y sonando, apartado fuera de la pantalla: es lo que
  // permite dejar música puesta y seguir estudiando en el resto de la app.
  const ytVisible = active === "youtube" && panelOpen && tab === "youtube";

  useLayoutEffect(() => {
    if (!ytVisible) return;
    let raf = 0;
    const loop = () => {
      const el = ytSlotRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setYtRect((prev) =>
          prev && prev.left === r.left && prev.top === r.top &&
          prev.width === r.width && prev.height === r.height
            ? prev
            : { left: r.left, top: r.top, width: r.width, height: r.height },
        );
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ytVisible]);

  // Crea el <video> IMPERATIVAMENTE (una sola vez) y lo mete en su hueco. Al no
  // ser un nodo de React, se puede mover a la ventana PiP y traerlo de vuelta sin
  // recargar el stream ni romper la reconciliación de React.
  useEffect(() => {
    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    (v as any).playsInline = true;
    Object.assign(v.style, { width: "100%", height: "100%", background: "#000", objectFit: "contain", display: "block" });
    const onPlaying = () => {
      setPlaying(true);
      setBuffering(false);
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onErr = () => {
      if (activeRef.current === "tv") setError(tRef.current.multimedia.tvError);
    };
    const onDbl = () => (v as any).requestFullscreen?.().catch(() => undefined);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("error", onErr);
    v.addEventListener("dblclick", onDbl);
    v.volume = volume / 100;
    videoRef.current = v;
    screenHostRef.current?.appendChild(v);
    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("error", onErr);
      v.removeEventListener("dblclick", onDbl);
      v.remove();
    };
  }, []);

  // --- Motor de reproducción (un solo medio activo, como DKEditor) ---
  const stopVideo = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        /* noop */
      }
      hlsRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
  }, []);

  /** Detiene el reproductor de YouTube sin destruirlo (se reutiliza). */
  const stopYoutube = useCallback(() => {
    const p = ytPlayerRef.current;
    if (!p) return;
    try {
      p.stopVideo?.();
    } catch {
      /* el iframe puede no estar listo todavía */
    }
    setYtCurrentId(null);
  }, []);

  const stopAudio = useCallback(() => {
    if (radioHlsRef.current) {
      try {
        radioHlsRef.current.destroy();
      } catch {
        /* noop */
      }
      radioHlsRef.current = null;
    }
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
  }, []);

  const playTv = useCallback(
    async (item: StreamItem) => {
      setError(null);
      stopAudio();
      stopYoutube();
      setActive("tv");
      setCurrent(item);
      setMinimized(false);
      setBuffering(true);
      const v = videoRef.current;
      if (!v) return;
      stopVideo();
      const isHls = /\.m3u8(\?|#|$)/i.test(item.url);
      try {
        if (isHls) {
          const Hls = await loadHls();
          // Chromium/Firefox: SIEMPRE hls.js (no reproducen HLS nativo de forma
          // fiable aunque canPlayType diga "maybe"). Safari: HLS nativo.
          if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true });
            hlsRef.current = hls;
            hls.loadSource(item.url);
            hls.attachMedia(v);
            hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => undefined));
            hls.on(Hls.Events.ERROR, (_e: unknown, data: any) => {
              if (data?.fatal) setError(t.multimedia.tvError);
            });
            return;
          }
        }
        // HLS nativo (Safari) o vídeo directo (mp4, etc.).
        v.src = item.url;
        v.play().catch(() => undefined);
      } catch (e) {
        setError(e instanceof Error ? e.message : t.multimedia.tvError);
      }
    },
    [stopAudio, stopVideo, stopYoutube, t.multimedia.tvError],
  );

  const playYoutube = useCallback(
    async (item: YoutubeItem) => {
      setError(null);
      // Solo suena una cosa a la vez, igual que entre TV y radio.
      stopVideo();
      stopAudio();
      setActive("youtube");
      setCurrent({ title: item.titulo, subtitle: item.autor || "YouTube", url: item.id, kind: "youtube" });
      setBuffering(true);
      setYtCurrentId(item.id);

      let YT: any;
      try {
        YT = await loadYtApi();
      } catch {
        setBuffering(false);
        setError(tRef.current.multimedia.ytApiError);
        return;
      }
      const host = ytHostRef.current;
      if (!host) return;

      // El reproductor se crea UNA vez y luego se le cambia el contenido con
      // loadVideoById/loadPlaylist. Recrearlo en cada clic volvería a descargar
      // el iframe entero y se oiría un corte entre pista y pista.
      if (!ytPlayerRef.current) {
        const hueco = document.createElement("div");
        host.appendChild(hueco);
        ytPlayerRef.current = new YT.Player(hueco, {
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: (e: any) => {
              e.target.setVolume(volumeRef.current);
              cargarEnReproductor(e.target, item);
            },
            onStateChange: (e: any) => {
              const S = (window as any).YT?.PlayerState || {};
              setPlaying(e.data === S.PLAYING);
              setBuffering(e.data === S.BUFFERING);
            },
            onError: () => {
              setBuffering(false);
              setError(tRef.current.multimedia.ytPlayError);
            },
          },
        });
        return;
      }
      cargarEnReproductor(ytPlayerRef.current, item);
    },
    [stopVideo, stopAudio],
  );

  const addYoutube = useCallback(async (entrada: string, titulo?: string): Promise<string | null> => {
    const ref = parseYoutube(entrada);
    if (!ref) return tRef.current.multimedia.ytBadLink;
    if (ytItems.some((i) => i.id === ref.id)) return tRef.current.multimedia.ytDuplicate;

    // oEmbed confirma que existe y da el título real. Si no contesta (sin red o
    // CORS), NO se bloquea el alta: se guarda con lo que haya escrito el usuario.
    const meta = await consultarOEmbed(ref);
    const nuevo: YoutubeItem = {
      titulo: (titulo || "").trim() || meta?.titulo || tRef.current.multimedia.ytUntitled,
      kind: ref.kind,
      id: ref.id,
      autor: meta?.autor,
    };
    setYtItems((prev) => {
      const next = [...prev, nuevo];
      window.localStorage.setItem(LS_YT, JSON.stringify(next));
      return next;
    });
    return null;
  }, [ytItems]);

  const removeYoutube = useCallback((id: string) => {
    setYtItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      window.localStorage.setItem(LS_YT, JSON.stringify(next));
      return next;
    });
  }, []);

  const registerYtSlot = useCallback((el: HTMLElement | null) => {
    ytSlotRef.current = el;
  }, []);

  const playRadio = useCallback(
    async (item: StreamItem) => {
      setError(null);
      stopYoutube();
      stopVideo();
      setActive("radio");
      setCurrent(item);
      setBuffering(true);
      const a = audioRef.current;
      if (!a) return;
      if (radioHlsRef.current) {
        try {
          radioHlsRef.current.destroy();
        } catch {
          /* noop */
        }
        radioHlsRef.current = null;
      }
      const isHls = /\.m3u8(\?|#|$)/i.test(item.url);
      try {
        if (isHls) {
          const Hls = await loadHls();
          if (Hls.isSupported()) {
            const hls = new Hls();
            radioHlsRef.current = hls;
            hls.loadSource(item.url);
            hls.attachMedia(a);
            hls.on(Hls.Events.MANIFEST_PARSED, () => a.play().catch(() => undefined));
            hls.on(Hls.Events.ERROR, (_e: unknown, d: any) => {
              if (d?.fatal) setError(t.multimedia.radioError);
            });
            return;
          }
        }
        a.src = item.url;
        a.play().catch(() => setError(t.multimedia.radioError));
      } catch {
        setError(t.multimedia.radioError);
      }
    },
    [stopVideo, stopYoutube, t.multimedia.radioError],
  );

  const loadIptv = useCallback(() => {
    setIptvLoading(true);
    setIptvError(null);
    loadCountryIptv("co")
      .then((items) => setIptvItems(items))
      .catch(() => setIptvError(t.multimedia.iptvError))
      .finally(() => setIptvLoading(false));
  }, [t.multimedia.iptvError]);

  const togglePlay = useCallback(() => {
    if (active === "youtube") {
      const p = ytPlayerRef.current;
      if (!p) return;
      // El estado real lo tiene el reproductor, no React: preguntárselo evita
      // que un cambio hecho desde los controles del propio YouTube lo desincronice.
      const S = (window as any).YT?.PlayerState || {};
      try {
        if (p.getPlayerState?.() === S.PLAYING) p.pauseVideo();
        else p.playVideo();
      } catch {
        /* noop */
      }
      return;
    }
    const el = active === "tv" ? videoRef.current : audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => undefined);
    else el.pause();
  }, [active]);

  const stop = useCallback(() => {
    stopVideo();
    stopAudio();
    stopYoutube();
    setActive(null);
    setCurrent(null);
    setPlaying(false);
    setBuffering(false);
  }, [stopVideo, stopAudio, stopYoutube]);

  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.max(0, Math.min(100, Math.round(v))));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // --- Canales de TV del usuario ---
  const persistChannels = useCallback((next: CustomChannel[]) => {
    setChannels(next);
    window.localStorage.setItem(LS_CHANNELS, JSON.stringify(next));
  }, []);

  const addChannel = useCallback(
    (name: string, url: string): boolean => {
      const n = name.trim();
      const u = url.trim();
      if (!n || !/^https?:\/\//i.test(u)) return false;
      if (channels.some((c) => c.url === u)) return true;
      persistChannels([{ name: n, url: u }, ...channels]);
      return true;
    },
    [channels, persistChannels],
  );

  const removeChannel = useCallback(
    (url: string) => {
      persistChannels(channels.filter((c) => c.url !== url));
    },
    [channels, persistChannels],
  );

  // --- Minimizar / acoplar / PiP nativo / pantalla completa ---
  const minimizeVideo = useCallback(() => setMinimized(true), []);
  const dockVideo = useCallback(() => {
    setMinimized(false);
    setPanelOpen(true);
    setTab("tv");
  }, []);

  // Devuelve el <video> imperativo a su hueco en la página.
  const returnVideoHome = useCallback(() => {
    const v = videoRef.current;
    const host = screenHostRef.current;
    if (v && host && v.parentElement !== host) host.appendChild(v);
  }, []);

  // "Sacar del navegador" manteniendo la tele de los Simpsons: usa Document
  // Picture-in-Picture (ventana del SO con HTML/CSS propio). Si el navegador no
  // lo soporta, cae al PiP NATIVO (vídeo pelado, pero también flota fuera).
  const requestPip = useCallback(async () => {
    const v = videoRef.current as any;
    if (!v) return;
    // Si ya está fuera, esto lo cierra (toggle).
    if (pipWinRef.current) {
      pipWinRef.current.close();
      return;
    }
    if (document.pictureInPictureElement) {
      await (document as any).exitPictureInPicture();
      return;
    }
    if (active !== "tv") {
      setError(t.multimedia.pipNeedsTv);
      return;
    }
    const dpip = (window as any).documentPictureInPicture;
    try {
      if (dpip?.requestWindow) {
        const win: Window = await dpip.requestWindow({ width: 360, height: 320 });
        pipWinRef.current = win;
        win.document.title = "Jamz Software - Free TV";
        const style = win.document.createElement("style");
        style.textContent = SIMPSONS_PIP_CSS;
        win.document.head.appendChild(style);
        win.document.body.innerHTML = SIMPSONS_PIP_MARKUP;
        const screen = win.document.querySelector(".screen");
        v.style.objectFit = "cover";
        screen?.appendChild(v); // mover el MISMO nodo (no recarga el stream)
        setPoppedOut(true);
        win.addEventListener("pagehide", () => {
          returnVideoHome();
          pipWinRef.current = null;
          setPoppedOut(false);
        });
        return;
      }
      // Fallback: PiP nativo del navegador.
      if (!(document as any).pictureInPictureEnabled || v.disablePictureInPicture) {
        setError(t.multimedia.pipUnsupported);
        return;
      }
      if (v.readyState < 1) {
        await new Promise<void>((res) => {
          v.addEventListener("loadedmetadata", () => res(), { once: true });
          window.setTimeout(res, 4000);
        });
      }
      await v.requestPictureInPicture();
    } catch {
      setError(t.multimedia.pipFailed);
    }
  }, [active, returnVideoHome, t.multimedia.pipNeedsTv, t.multimedia.pipUnsupported, t.multimedia.pipFailed]);

  const requestFullscreen = useCallback(() => {
    const v = videoRef.current as any;
    v?.requestFullscreen?.().catch(() => undefined);
  }, []);

  // --- Radio: cargar top / buscar ---
  const loadTopRadio = useCallback(
    (country?: string) => {
      setRadioLoading(true);
      setRadioError(null);
      topRadio(country)
        .then((items) => {
          if (items.length) {
            setRadioItems(items);
          } else {
            // Radio Browser vacío → emisoras curadas.
            setRadioItems(DEFAULT_STATIONS);
            setRadioError(t.multimedia.radioFallback);
          }
        })
        .catch(() => {
          // Radio Browser caído → emisoras curadas (siempre suenan).
          setRadioItems(DEFAULT_STATIONS);
          setRadioError(t.multimedia.radioFallback);
        })
        .finally(() => setRadioLoading(false));
    },
    [t.multimedia.radioFallback],
  );

  const searchRadio = useCallback(
    (q: string) => {
      const query = q.trim();
      if (!query) {
        loadTopRadio();
        return;
      }
      setRadioLoading(true);
      setRadioError(null);
      apiSearchRadio(query)
        .then((items) => {
          if (items.length) {
            setRadioItems(items);
          } else {
            setRadioItems(filterStations(query));
            setRadioError(t.multimedia.radioFallback);
          }
        })
        .catch(() => {
          setRadioItems(filterStations(query));
          setRadioError(t.multimedia.radioFallback);
        })
        .finally(() => setRadioLoading(false));
    },
    [loadTopRadio, t.multimedia.radioFallback],
  );

  const togglePanel = useCallback(() => setPanelOpen((o) => !o), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  const value = useMemo<MultimediaContextValue>(
    () => ({
      panelOpen,
      togglePanel,
      closePanel,
      tab,
      setTab,
      active,
      current,
      playing,
      buffering,
      volume,
      setVolume,
      togglePlay,
      stop,
      error,
      clearError,
      channels,
      addChannel,
      removeChannel,
      playTv,
      minimized,
      placement,
      minimizeVideo,
      dockVideo,
      requestPip,
      requestFullscreen,
      poppedOut,
      radioItems,
      radioLoading,
      radioError,
      loadTopRadio,
      searchRadio,
      playRadio,
      iptvItems,
      iptvLoading,
      iptvError,
      loadIptv,
      ytItems,
      addYoutube,
      removeYoutube,
      playYoutube,
      ytCurrentId,
      registerSlot,
      registerYtSlot,
    }),
    [
      panelOpen, togglePanel, closePanel, tab, active, current, playing, buffering,
      volume, setVolume, togglePlay, stop, error, clearError, channels, addChannel, removeChannel,
      playTv, minimized, placement, minimizeVideo, dockVideo, requestPip,
      requestFullscreen, poppedOut, radioItems, radioLoading, radioError, loadTopRadio,
      searchRadio, playRadio, iptvItems, iptvLoading, iptvError, loadIptv, registerSlot,
      ytItems, addYoutube, removeYoutube, playYoutube, ytCurrentId, registerYtSlot,
    ],
  );

  // Cuando la tele está FUERA del navegador (Document PiP), el vídeo vive en la
  // ventana del SO: en la página no se muestra (pero el hueco sigue en el DOM
  // para recuperarlo al cerrar).
  activeRef.current = active;
  const renderPlacement = poppedOut ? "hidden" : placement;
  const showVideo = renderPlacement !== "hidden";
  const floating = renderPlacement === "floating";

  // Geometría del CONTENEDOR del vídeo según dónde viva. Acoplado: z-index por
  // ENCIMA del panel (55 > 50) para que se vea en el hueco. Flotante: mueble TV.
  const wrapperStyle: React.CSSProperties =
    renderPlacement === "docked" && dockRect
      ? {
          position: "fixed",
          left: dockRect.left,
          top: dockRect.top,
          width: dockRect.width,
          height: dockRect.height,
          zIndex: 55,
          overflow: "hidden",
        }
      : floating
        ? {
            position: "fixed",
            // Con el panel (izquierda) abierto, mantén la tele despejada a su derecha.
            left: panelOpen ? Math.max(floatPos.x, 312) : floatPos.x,
            top: floatPos.y,
            width: tvW,
            height: tvH,
            zIndex: 60,
            overflow: "visible", // para que asomen antenas y patitas
          }
        : { position: "fixed", left: -99999, top: -99999, width: 1, height: 1, opacity: 0, pointerEvents: "none" };

  // Posición de la PANTALLA (el hueco del <video>) dentro del contenedor.
  const screenStyle: React.CSSProperties = floating
    ? { position: "absolute", top: TV_BEZEL, left: TV_BEZEL, width: screenW, height: screenH, borderRadius: 6, overflow: "hidden", background: "#000" }
    : { position: "absolute", inset: 0, background: "#000" };

  // Ajuste del vídeo: "cover" en la tele flotante, "contain" acoplado (no en PiP).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || poppedOut) return;
    v.style.objectFit = floating ? "cover" : "contain";
  }, [floating, poppedOut]);

  // Arrastre de la tele flotante (mueve solo su parte del DOM).
  const dragging = useRef<{ dx: number; dy: number } | null>(null);
  const onDragStart = (e: React.PointerEvent) => {
    if (!floating) return;
    dragging.current = { dx: e.clientX - floatPos.x, dy: e.clientY - floatPos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const x = Math.max(8, Math.min(window.innerWidth - tvW - 8, e.clientX - dragging.current.dx));
    const y = Math.max(8, Math.min(window.innerHeight - tvH - 8, e.clientY - dragging.current.dy));
    setFloatPos({ x, y });
  };
  const onDragEnd = () => {
    dragging.current = null;
  };

  // Redimensionar la tele en PROPORCIÓN (tirador de la esquina inferior derecha).
  const resizing = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    resizing.current = { startX: e.clientX, startW: screenW };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizing.current) return;
    setScreenW(clampScreen(resizing.current.startW + (e.clientX - resizing.current.startX)));
  };
  const onResizeEnd = () => {
    resizing.current = null;
  };

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* Audio de radio: invisible, persistente. */}
      <audio
        ref={audioRef}
        onPlaying={() => {
          setPlaying(true);
          setBuffering(false);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onError={() => {
          if (active === "radio") setError(t.multimedia.radioError);
        }}
      />

      {/* Vídeo de TV: UN solo <video> que nunca se re-monta (no recarga el stream
          al pasar de acoplado ⇄ flotante). El marco "tele" es decoración detrás. */}
      <div
        style={wrapperStyle}
        className={floating ? "group" : showVideo ? "group overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-black/20" : ""}
      >
        {floating && (
          <SimpsonsFrame
            playing={playing}
            screenW={screenW}
            screenH={screenH}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onResizeStart={onResizeStart}
            onResizeMove={onResizeMove}
            onResizeEnd={onResizeEnd}
          />
        )}

        {/* Hueco donde vive el <video> imperativo (se mueve a la ventana PiP). */}
        <div ref={screenHostRef} style={screenStyle} />

        {showVideo && (
          <div style={floating ? { position: "absolute", top: TV_BEZEL, left: TV_BEZEL, width: screenW, height: screenH, borderRadius: 6, overflow: "hidden" } : { position: "absolute", inset: 0 }}>
            <VideoOverlay
              floating={floating}
              title={current?.title ?? ""}
              playing={playing}
              buffering={buffering}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
            />
          </div>
        )}
      </div>

      {/* Reproductor oficial de YouTube.
          Este contenedor NO se desmonta nunca ni cambia de sitio en el DOM: un
          <iframe> se recarga en cuanto se quita y se vuelve a insertar, y eso
          cortaría la música cada vez que abres o cierras el panel. Cuando no
          toca verlo se aparta fuera de la pantalla, así que se sigue oyendo. */}
      <div
        ref={ytHostRef}
        aria-hidden={!ytVisible}
        style={
          ytVisible && ytRect
            ? {
                position: "fixed",
                left: ytRect.left,
                top: ytRect.top,
                width: ytRect.width,
                height: ytRect.height,
                zIndex: 55,
                overflow: "hidden",
                borderRadius: 8,
                background: "#000",
              }
            : {
                position: "fixed",
                left: -99999,
                top: -99999,
                width: 320,
                height: 180,
                opacity: 0,
                pointerEvents: "none",
              }
        }
      />
    </Ctx.Provider>
  );
}

/**
 * Marco decorativo "tele estilo Simpsons" para el modo flotante: mueble de
 * madera, antenas en V, franja de perillas + rejilla de altavoz a la derecha,
 * LED de encendido y patitas. Va DETRÁS de la pantalla; el mueble es la zona de
 * arrastre (la pantalla tiene sus propios controles).
 */
function SimpsonsFrame(props: {
  playing: boolean;
  screenW: number;
  screenH: number;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  onResizeMove: (e: React.PointerEvent) => void;
  onResizeEnd: () => void;
}) {
  const { screenW, screenH } = props;
  const OUT = "#20233b"; // contorno negro-azulado (estilo cómic)
  const knob: React.CSSProperties = {
    width: 17,
    height: 17,
    borderRadius: "50%",
    background: "radial-gradient(circle at 34% 30%, #d7dcf5, #9aa3d8 70%)",
    border: `3px solid ${OUT}`,
    boxSizing: "border-box",
  };
  return (
    <>
      {/* Antenas en V con bolitas (salen del aparato de encima) */}
      <svg
        width="150"
        height="54"
        viewBox="0 0 150 54"
        style={{ position: "absolute", top: -58, left: "50%", transform: "translateX(-50%)", overflow: "visible", pointerEvents: "none" }}
      >
        <line x1="75" y1="54" x2="14" y2="6" stroke={OUT} strokeWidth="5" strokeLinecap="round" />
        <line x1="75" y1="54" x2="136" y2="6" stroke={OUT} strokeWidth="5" strokeLinecap="round" />
        <circle cx="14" cy="6" r="6" fill={OUT} />
        <circle cx="136" cy="6" r="6" fill={OUT} />
      </svg>

      {/* Cable rojo con enchufe saliendo por el lado derecho */}
      <svg
        width="46"
        height="66"
        viewBox="0 0 46 66"
        style={{ position: "absolute", right: -34, top: "52%", overflow: "visible", pointerEvents: "none" }}
      >
        <path d="M2 6 C 30 6, 30 40, 20 58" fill="none" stroke="#e8503a" strokeWidth="4" strokeLinecap="round" />
        <rect x="10" y="54" width="18" height="12" rx="2" fill="#f6b73c" stroke={OUT} strokeWidth="2.5" />
        <line x1="16" y1="52" x2="16" y2="56" stroke={OUT} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="23" y1="52" x2="23" y2="56" stroke={OUT} strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      {/* Mueble periwinkle (fondo + zona de arrastre) */}
      <div
        onPointerDown={props.onDragStart}
        onPointerMove={props.onDragMove}
        onPointerUp={props.onDragEnd}
        style={{
          position: "absolute",
          inset: 0,
          cursor: "move",
          borderRadius: 22,
          background: "linear-gradient(160deg, #9aa3d8 0%, #838ecb 60%, #737fc2 100%)",
          border: `3px solid ${OUT}`,
          boxShadow: "0 14px 34px rgba(0,0,0,.4), inset 0 2px 4px rgba(255,255,255,.35)",
        }}
      />

      {/* Aparato (DVD/decodificador) encima de la tele; de él salen las antenas */}
      <div
        style={{
          position: "absolute",
          top: -15,
          left: "50%",
          transform: "translateX(-50%)",
          width: Math.round(screenW * 0.46),
          height: 16,
          background: "linear-gradient(#454b73, #363b5c)",
          border: `3px solid ${OUT}`,
          borderRadius: "6px 6px 3px 3px",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          pointerEvents: "none",
        }}
      >
        <div style={{ width: "44%", height: 3, background: OUT, borderRadius: 2 }} />
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: props.playing ? "#ff4d4d" : "#3aa655",
            boxShadow: props.playing ? "0 0 5px #ff4d4d" : "none",
          }}
        />
      </div>

      {/* Marco turquesa de la pantalla (bisel), con contorno cómic */}
      <div
        style={{
          position: "absolute",
          top: TV_BEZEL - 6,
          left: TV_BEZEL - 6,
          width: screenW + 12,
          height: screenH + 12,
          borderRadius: 14,
          background: "#6ec7d6",
          border: `3px solid ${OUT}`,
          boxSizing: "border-box",
          pointerEvents: "none",
        }}
      />

      {/* Perillas redondas arriba a la derecha + LED de encendido */}
      <div
        style={{
          position: "absolute",
          right: 8,
          top: TV_BEZEL + 2,
          width: TV_CTRL - 16,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={knob} />
        <div style={knob} />
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: props.playing ? "#ff4d4d" : "#3aa655",
            border: `2px solid ${OUT}`,
            boxSizing: "border-box",
            boxShadow: props.playing ? "0 0 8px #ff4d4d" : "none",
          }}
        />
      </div>

      {/* Marca en el bisel inferior */}
      <div
        style={{
          position: "absolute",
          left: TV_BEZEL,
          width: screenW,
          bottom: 1,
          textAlign: "center",
          fontSize: 8.5,
          fontWeight: 800,
          letterSpacing: 0.4,
          color: "#20233b",
          pointerEvents: "none",
          fontFamily: "'Trebuchet MS', system-ui, sans-serif",
        }}
      >
        Jamz Software · <span style={{ color: "#fff", textShadow: "0 1px 1px rgba(0,0,0,.4)" }}>Free TV</span>
      </div>

      {/* Cuatro patitas */}
      {[16, 46, -46, -16].map((off, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            bottom: -9,
            ...(off > 0 ? { left: off } : { right: -off }),
            width: 12,
            height: 12,
            background: OUT,
            borderRadius: "0 0 5px 5px",
          }}
        />
      ))}

      {/* Tirador para ENSANCHAR la tele en proporción (esquina inferior derecha) */}
      <div
        onPointerDown={props.onResizeStart}
        onPointerMove={props.onResizeMove}
        onPointerUp={props.onResizeEnd}
        title="Ajustar tamaño"
        style={{
          position: "absolute",
          right: 1,
          bottom: 1,
          width: 18,
          height: 18,
          cursor: "nwse-resize",
          borderRadius: "0 0 14px 0",
          background: "linear-gradient(135deg, transparent 45%, rgba(255,255,255,.55) 45%, rgba(255,255,255,.55) 55%, transparent 55%, transparent 70%, rgba(255,255,255,.55) 70%, rgba(255,255,255,.55) 80%, transparent 80%)",
          touchAction: "none",
        }}
      />
    </>
  );
}

/**
 * Controles superpuestos del vídeo (aparecen al pasar el ratón), calcados de la
 * `PipWindow` de DKEditor: badge EN VIVO, minimizar/acoplar, PiP, pantalla
 * completa, cerrar, y abajo play/stop.
 */
function VideoOverlay(props: {
  floating: boolean;
  title: string;
  playing: boolean;
  buffering: boolean;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
}) {
  const { t } = useLanguage();
  const m = useMultimedia();
  const { floating, title, buffering } = props;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col opacity-0 transition group-hover:opacity-100">
      {/* Barra superior */}
      <div
        className="pointer-events-auto flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-2.5 py-1.5"
        onPointerDown={floating ? props.onDragStart : undefined}
        onPointerMove={floating ? props.onDragMove : undefined}
        onPointerUp={floating ? props.onDragEnd : undefined}
        style={floating ? { cursor: "move" } : undefined}
      >
        <span className="rounded bg-red-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
          {t.multimedia.live}
        </span>
        <span className="flex-1 truncate text-xs font-semibold text-white">{title}</span>
        {floating ? (
          <OverlayBtn title={t.multimedia.dock} onClick={m.dockVideo}>⧉</OverlayBtn>
        ) : (
          <OverlayBtn title={t.multimedia.minimize} onClick={m.minimizeVideo}>▁</OverlayBtn>
        )}
        <OverlayBtn title={t.multimedia.popOutTitle} onClick={m.requestPip}>◲</OverlayBtn>
        <OverlayBtn title={t.multimedia.fullscreen} onClick={m.requestFullscreen}>⛶</OverlayBtn>
        <OverlayBtn title={t.multimedia.stopTitle} onClick={m.stop}>✕</OverlayBtn>
      </div>

      {/* Spinner de buffering al centro */}
      <div className="flex flex-1 items-center justify-center">
        {buffering && (
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        )}
      </div>

      {/* Barra inferior: play/pause + volumen */}
      <div className="pointer-events-auto flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-1.5">
        <button
          type="button"
          onClick={m.togglePlay}
          className="text-lg leading-none text-white hover:text-brand-300"
          title={m.playing ? t.multimedia.pause : t.multimedia.play}
        >
          {m.playing ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={m.volume}
          onChange={(e) => m.setVolume(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-brand-400"
          title={t.multimedia.volume}
        />
      </div>
    </div>
  );
}

function OverlayBtn(props: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-sm text-white/90 transition hover:bg-white/20 hover:text-white"
    >
      {props.children}
    </button>
  );
}
