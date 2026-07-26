import type { StreamItem } from "../types";

/**
 * Emisoras curadas con streams DIRECTOS y verificados (reproducen en <audio> sin
 * depender de Radio Browser, que a veces está caído). Se muestran de inmediato
 * al abrir Radio; el buscador global (Radio Browser) queda como extra.
 *
 * Todas verificadas reproduciendo el 2026-07-26.
 */
export const DEFAULT_STATIONS: StreamItem[] = [
  // --- Colombia (Bogotá primero, lo que pediste) ---
  { title: "Radiónica", subtitle: "Bogotá · Alternativa · RTVC", url: "https://streaming.rtvc.gov.co/Radio_Radionica/Radionica.stream/playlist.m3u8", kind: "radio" },
  { title: "Radioacktiva", subtitle: "Bogotá · Rock · 97.9 FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_ACTIVAAAC.aac", kind: "radio" },
  { title: "Caracol Radio", subtitle: "Colombia · Noticias", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/CARACOL_RADIO.mp3", kind: "radio" },
  { title: "La Mega", subtitle: "Colombia · Éxitos", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/LA_MEGA.mp3", kind: "radio" },
  { title: "Los 40 Colombia", subtitle: "Colombia · Pop", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_COLOMBIA.mp3", kind: "radio" },
  { title: "Tropicana", subtitle: "Colombia · Tropical", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/TROPICANA.mp3", kind: "radio" },
  { title: "La Kalle", subtitle: "Colombia · Urbano", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/LA_KALLE.mp3", kind: "radio" },
  // --- España ---
  { title: "Los 40", subtitle: "España · Pop", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40.mp3", kind: "radio" },
  { title: "Cadena SER", subtitle: "España · Noticias", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENASER.mp3", kind: "radio" },
  // --- Internacional ---
  { title: "Radio Paradise", subtitle: "Ecléctica · Sin anuncios", url: "https://stream.radioparadise.com/mp3-128", kind: "radio" },
  { title: "KEXP", subtitle: "Seattle · Alternativa", url: "https://kexp-mp3-128.streamguys1.com/kexp128.mp3", kind: "radio" },
  { title: "France Info", subtitle: "Francia · Noticias", url: "https://icecast.radiofrance.fr/franceinfo-midfi.mp3", kind: "radio" },
  { title: "FIP", subtitle: "Francia · Ecléctica", url: "https://icecast.radiofrance.fr/fip-midfi.mp3", kind: "radio" },
  { title: "BBC World Service", subtitle: "Reino Unido · Noticias", url: "https://stream.live.vc.bbcmedia.co.uk/bbc_world_service", kind: "radio" },
];

/** Filtra la lista curada por texto (nombre o descripción). */
export function filterStations(q: string): StreamItem[] {
  const s = q.trim().toLowerCase();
  if (!s) return DEFAULT_STATIONS;
  return DEFAULT_STATIONS.filter(
    (st) => st.title.toLowerCase().includes(s) || st.subtitle.toLowerCase().includes(s),
  );
}
