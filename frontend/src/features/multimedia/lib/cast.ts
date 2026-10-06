/**
 * Google Cast desde el navegador: mandar el canal o la emisora a una tele con
 * Chromecast integrado (Google TV, Android TV, un Chromecast de verdad).
 *
 * Cómo funciona: la tele NO recibe el vídeo desde este equipo. Chrome le pasa
 * la URL del stream y la tele lo descarga y lo reproduce ella misma con el
 * «Default Media Receiver» de Google. Por eso aquí se corta el reproductor
 * local mientras dura la sesión (si no, sonaría dos veces) y por eso la tele
 * necesita lo mismo que el navegador: HTTPS (una página segura no puede
 * cargar un `http://`) y CORS abierto en el servidor del canal.
 *
 * Dónde funciona: en Chrome (escritorio y Android) y en Edge, que traen el
 * componente de Cast. Firefox, Safari y el WebView2 del escritorio (Tauri) no
 * lo tienen: el SDK avisa (`__onGCastApiAvailable(false)`) y la opción no se
 * dibuja. El SDK se baja de gstatic solo cuando hace falta, nunca en el
 * arranque de la página.
 *
 * El selector de dispositivos lo abre Chrome, y SOLO dentro de un clic del
 * usuario (`pedirSesionCast`): es la misma regla que un `window.open`.
 */

export type EstadoCast = "no-disponible" | "sin-dispositivos" | "desconectado" | "conectando" | "conectado";

export interface MediaCast {
  url: string;
  titulo: string;
  subtitulo?: string;
  tipo: "tv" | "radio";
}

declare global {
  interface Window {
    __onGCastApiAvailable?: (disponible: boolean) => void;
    cast?: any;
    chrome?: any;
  }
}

const SDK = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
const ESPERA_SDK_MS = 8000;

let carga: Promise<boolean> | null = null;

/** Si este navegador puede siquiera intentarlo (Chromium con `window.chrome`, fuera de Tauri). */
export function castPosible(): boolean {
  if (typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window) return false;
  return typeof window.chrome === "object" && window.chrome !== null;
}

/**
 * Carga el SDK una sola vez y deja el contexto listo con el receptor por
 * defecto de Google. Resuelve `false` si el navegador no sabe de Cast.
 */
export function cargarCast(): Promise<boolean> {
  if (carga) return carga;
  carga = new Promise<boolean>((resolve) => {
    if (!castPosible()) {
      resolve(false);
      return;
    }
    const timer = window.setTimeout(() => resolve(false), ESPERA_SDK_MS);
    window.__onGCastApiAvailable = (disponible) => {
      window.clearTimeout(timer);
      const fw = window.cast?.framework;
      const ch = window.chrome?.cast;
      if (!disponible || !fw || !ch) {
        resolve(false);
        return;
      }
      try {
        fw.CastContext.getInstance().setOptions({
          receiverApplicationId: ch.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          // Al volver a la página, se reengancha a la sesión que dejó abierta
          // esta misma web (y no a la de otra pestaña o de otra app).
          autoJoinPolicy: ch.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    const s = document.createElement("script");
    s.src = SDK;
    s.async = true;
    s.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return carga;
}

function contexto(): any | null {
  const fw = window.cast?.framework;
  return fw ? fw.CastContext.getInstance() : null;
}

export function estadoCast(): EstadoCast {
  const fw = window.cast?.framework;
  const ctx = contexto();
  if (!fw || !ctx) return "no-disponible";
  switch (ctx.getCastState()) {
    case fw.CastState.NO_DEVICES_AVAILABLE:
      return "sin-dispositivos";
    case fw.CastState.CONNECTING:
      return "conectando";
    case fw.CastState.CONNECTED:
      return "conectado";
    default:
      return "desconectado";
  }
}

/** Nombre con el que la tele se presenta en la red («TV del salón»). */
export function nombreDispositivoCast(): string | null {
  try {
    return contexto()?.getCurrentSession()?.getCastDevice?.()?.friendlyName ?? null;
  } catch {
    return null;
  }
}

/** Avisa de cada cambio de estado (hay teles, conectando, conectado…). Devuelve el des-suscriptor. */
export function escucharCast(cb: (estado: EstadoCast, dispositivo: string | null) => void): () => void {
  const fw = window.cast?.framework;
  const ctx = contexto();
  if (!fw || !ctx) return () => undefined;
  const h = () => cb(estadoCast(), nombreDispositivoCast());
  ctx.addEventListener(fw.CastContextEventType.CAST_STATE_CHANGED, h);
  return () => ctx.removeEventListener(fw.CastContextEventType.CAST_STATE_CHANGED, h);
}

/**
 * Abre el selector de teles de Chrome. Llamar DENTRO del clic. Resuelve `true`
 * si el usuario eligió una; `false` si cerró el cuadro o no había ninguna.
 */
export async function pedirSesionCast(): Promise<boolean> {
  const ctx = contexto();
  if (!ctx) return false;
  try {
    const error = await ctx.requestSession();
    return !error;
  } catch {
    return false;
  }
}

/** Manda un canal o una emisora a la tele conectada. Rechaza si la tele no pudo cargarlo. */
export async function enviarCast(m: MediaCast): Promise<void> {
  const ch = window.chrome?.cast;
  const sesion = contexto()?.getCurrentSession();
  if (!ch || !sesion) throw new Error("sin sesión de Cast");
  const esHls = /\.m3u8(\?|#|$)/i.test(m.url);
  const tipoMime = esHls ? "application/x-mpegurl" : m.tipo === "radio" ? "audio/mpeg" : "video/mp4";
  const info = new ch.media.MediaInfo(m.url, tipoMime);
  info.streamType = ch.media.StreamType.LIVE;
  if (esHls && m.tipo === "tv") {
    // Los canales van en MPEG-TS; decírselo ahorra a la tele adivinarlo.
    info.hlsSegmentFormat = ch.media.HlsSegmentFormat.TS;
    info.hlsVideoSegmentFormat = ch.media.HlsVideoSegmentFormat.MPEG2_TS;
  }
  if (m.tipo === "radio") {
    const meta = new ch.media.MusicTrackMediaMetadata();
    meta.title = m.titulo;
    if (m.subtitulo) meta.artist = m.subtitulo;
    info.metadata = meta;
  } else {
    const meta = new ch.media.GenericMediaMetadata();
    meta.title = m.titulo;
    if (m.subtitulo) meta.subtitle = m.subtitulo;
    info.metadata = meta;
  }
  const req = new ch.media.LoadRequest(info);
  req.autoplay = true;
  await sesion.loadMedia(req);
}

/** Detiene lo que suena en la tele sin cerrar la sesión (la tele queda en espera). */
export function detenerMediaCast(): void {
  try {
    contexto()?.getCurrentSession()?.getMediaSession()?.stop(null, () => undefined, () => undefined);
  } catch {
    /* sin media cargada */
  }
}

/** Pausa o reanuda en la tele (la tecla de play del panel mientras se envía). */
export function alternarCast(): void {
  const fw = window.cast?.framework;
  if (!fw) return;
  try {
    new fw.RemotePlayerController(new fw.RemotePlayer()).playOrPause();
  } catch {
    /* sin media cargada */
  }
}

/** Volumen de la tele, 0–100: las teclas VOL del control mandan también allí. */
export function volumenCast(v: number): void {
  try {
    void contexto()?.getCurrentSession()?.setVolume(Math.max(0, Math.min(1, v / 100)));
  } catch {
    /* sesión cerrándose */
  }
}

/** Cierra la sesión y para la tele: lo que sonaba vuelve a este equipo. */
export function cortarCast(): void {
  try {
    contexto()?.endCurrentSession(true);
  } catch {
    /* ya cerrada */
  }
}
