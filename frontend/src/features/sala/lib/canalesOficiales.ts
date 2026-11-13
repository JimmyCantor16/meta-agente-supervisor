import type { YoutubeItem } from "../../multimedia";

/**
 * Señales OFICIALES que La Sala no reproduce como HLS propio (2026-11-13).
 *
 * Dos clases, según lo que su dueño permite:
 *
 * 1. `directosYoutube`: el directo 24/7 del canal VERIFICADO del propio medio.
 *    Se reproduce con el reproductor oficial de YouTube incrustado (el mismo
 *    del panel), que es justo el uso que YouTube autoriza. Comprobado hoy:
 *    oEmbed 200 con el autor esperado y `playableInEmbed: true`.
 *    OJO: el ID de un directo cambia cuando el medio reinicia la emisión. Por
 *    eso cada uno lleva también `canal`, el enlace estable `/@canal/live`, que
 *    siempre lleva al directo vigente aunque el ID haya caducado.
 *
 * 2. `appsOficiales`: lo que NO se puede incrustar legalmente (Pluto cierra su
 *    CORS a pluto.tv; Caracol/RCN/Citytv van con geobloqueo y sin CORS; Win
 *    Sports y Disney+ son de pago). Se abren en su app/web con `abrirExterno`,
 *    donde el usuario ya tiene su sesión. Nunca se hace proxy de la señal.
 */

export interface DirectoYoutube extends YoutubeItem {
  kind: "video";
  /** Enlace estable al directo vigente del canal (sobrevive a un cambio de ID). */
  canal: string;
  /** "noticias" va a la fila «Infórmate»; "vivo", a «En vivo ahora». */
  fila: "noticias" | "vivo";
}

export const DIRECTOS_YOUTUBE: DirectoYoutube[] = [
  {
    titulo: "Noticias Caracol EN VIVO",
    kind: "video",
    id: "MYZi0THS3B0",
    autor: "Noticias Caracol",
    canal: "https://www.youtube.com/@NoticiasCaracol/live",
    fila: "noticias",
  },
  {
    titulo: "Noticias RCN EN VIVO",
    kind: "video",
    id: "27K7y7Ejw1o",
    autor: "Noticias RCN",
    canal: "https://www.youtube.com/@NoticiasRCN/live",
    fila: "noticias",
  },
  {
    titulo: "Citytv EN VIVO 24/7",
    kind: "video",
    id: "bUFWXxn7s8E",
    autor: "CityTv",
    canal: "https://www.youtube.com/@canalcitytv/live",
    fila: "noticias",
  },
  {
    titulo: "Canal RCN · Señal digital 24 horas",
    kind: "video",
    id: "_ARCBovOsTE",
    autor: "Canal RCN",
    canal: "https://www.youtube.com/@canalrcn/live",
    fila: "vivo",
  },
];

export interface AppOficial {
  nombre: string;
  /** Plataforma donde se ve (lo que el usuario reconoce: «Pluto TV», «Win Play»…). */
  plataforma: string;
  url: string;
  pago: boolean;
}

/**
 * Enlaces profundos a la página EXACTA del canal (no a la portada). Los de
 * Pluto son los canales de Pluto TV Latam `comedy-central-ptv2` y
 * `south-park-pvt2` (api.pluto.tv/v2/channels, 2026-11-13).
 */
export const APPS_OFICIALES: AppOficial[] = [
  { nombre: "Comedy Central", plataforma: "Pluto TV", url: "https://pluto.tv/latam/live-tv/comedy-central-ptv2", pago: false },
  { nombre: "South Park (Comedy Central)", plataforma: "Pluto TV", url: "https://pluto.tv/latam/live-tv/south-park-pvt2", pago: false },
  { nombre: "Caracol TV", plataforma: "caracoltv.com", url: "https://www.caracoltv.com/senal-vivo", pago: false },
  { nombre: "Caracol Play", plataforma: "Caracol TV", url: "https://play.caracoltv.com/en-vivo", pago: false },
  { nombre: "Canal RCN", plataforma: "canalrcn.com", url: "https://www.canalrcn.com/en-vivo", pago: false },
  { nombre: "Citytv", plataforma: "eltiempo.com", url: "https://citytv.eltiempo.com/en-vivo", pago: false },
  { nombre: "Win Sports", plataforma: "Win Play", url: "https://www.winplay.co/", pago: true },
  { nombre: "Star Channel / FOX", plataforma: "Disney+", url: "https://www.disneyplus.com/es-co", pago: true },
];
