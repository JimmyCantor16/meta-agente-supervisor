// YouTube dentro del panel: parseo de enlaces y metadatos SIN clave de API.
//
// Por qué no hay búsqueda: buscar exige la YouTube Data API, que necesita clave
// y tiene cuota. Aquí se sigue el mismo patrón que los canales de TV — el
// usuario pega lo que quiere y se guarda en SU navegador — con una ayuda que la
// TV no tiene: oEmbed, un punto público y sin clave que devuelve el título y la
// miniatura reales. Así lo pegado entra con su nombre de verdad y no como
// "vídeo sin título", y de paso sirve para saber si el enlace existe.

import type { YoutubeItem } from "../types";

/** Lo que se puede pegar: un vídeo suelto o una lista de reproducción. */
export interface YoutubeRef {
  kind: "video" | "playlist";
  /** ID del vídeo (11 caracteres) o de la lista (empieza por PL/UU/RD/OLAK…). */
  id: string;
}

const ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const ID_LISTA = /^[A-Za-z0-9_-]{12,}$/;

/**
 * Saca el vídeo o la lista de CUALQUIER forma de enlace de YouTube.
 *
 * Se aceptan todas las variantes porque el usuario pega lo que le da el botón
 * "Compartir", que cambia según venga del móvil, del escritorio o de un Short.
 */
export function parseYoutube(entrada: string): YoutubeRef | null {
  const texto = (entrada || "").trim();
  if (!texto) return null;

  // Un ID pelado, sin enlace alrededor.
  if (ID_VIDEO.test(texto)) return { kind: "video", id: texto };

  let url: URL;
  try {
    url = new URL(texto.startsWith("http") ? texto : `https://${texto}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (!/^(m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be|music\.youtube\.com)$/.test(host)) {
    return null;
  }

  // La lista manda sobre el vídeo: en `watch?v=X&list=Y` el usuario quiere la
  // lista entera, no quedarse en el vídeo por el que entró.
  const lista = url.searchParams.get("list");
  if (lista && ID_LISTA.test(lista)) return { kind: "playlist", id: lista };

  const v = url.searchParams.get("v");
  if (v && ID_VIDEO.test(v)) return { kind: "video", id: v };

  // youtu.be/ID · /embed/ID · /shorts/ID · /live/ID · /v/ID
  const partes = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be" && partes[0] && ID_VIDEO.test(partes[0])) {
    return { kind: "video", id: partes[0] };
  }
  const i = partes.findIndex((p) => ["embed", "shorts", "live", "v"].includes(p));
  if (i !== -1) {
    const posible = partes[i + 1];
    if (posible === "videoseries") {
      const l = url.searchParams.get("list");
      if (l && ID_LISTA.test(l)) return { kind: "playlist", id: l };
    }
    if (posible && ID_VIDEO.test(posible)) return { kind: "video", id: posible };
  }
  return null;
}

/**
 * URL del reproductor incrustado.
 *
 * Se usa `youtube-nocookie.com` a propósito: es el modo de privacidad oficial de
 * YouTube, que no deja cookies de seguimiento hasta que se le da al play. Y
 * `enablejsapi=1` es lo que permite que los controles del panel (play, pausa,
 * volumen) manden sobre el reproductor.
 */
export function urlDeIncrustacion(ref: YoutubeRef, origen: string): string {
  const base = "https://www.youtube-nocookie.com/embed";
  const params = new URLSearchParams({
    enablejsapi: "1",
    origin: origen,
    rel: "0", // al terminar, sugiere del mismo canal en vez de saltar a cualquier cosa
    modestbranding: "1",
    playsinline: "1",
  });
  if (ref.kind === "playlist") {
    params.set("list", ref.id);
    params.set("listType", "playlist");
    return `${base}/videoseries?${params}`;
  }
  return `${base}/${ref.id}?${params}`;
}

/** Enlace normal, para el botón "abrir en YouTube". */
export function urlPublica(ref: YoutubeRef): string {
  return ref.kind === "playlist"
    ? `https://www.youtube.com/playlist?list=${ref.id}`
    : `https://www.youtube.com/watch?v=${ref.id}`;
}

/**
 * Título y miniatura reales, vía oEmbed (público, sin clave, sin cuota).
 *
 * Devuelve `null` si el enlace no existe, es privado o el vídeo fue retirado:
 * eso permite avisar al pegarlo, en vez de dejar en la lista algo que al pulsar
 * mostrará un reproductor en negro.
 */
export async function consultarOEmbed(
  ref: YoutubeRef,
  senal?: AbortSignal,
): Promise<{ titulo: string; autor: string; miniatura: string } | null> {
  const destino = encodeURIComponent(urlPublica(ref));
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=${destino}&format=json`,
      { signal: senal },
    );
    if (!r.ok) return null;
    const d = await r.json();
    return {
      titulo: String(d.title || "").trim(),
      autor: String(d.author_name || "").trim(),
      miniatura: String(d.thumbnail_url || "").trim(),
    };
  } catch {
    // Sin red o con CORS bloqueado no se puede confirmar. No es motivo para
    // impedir que lo añada: se guarda con el nombre que él escriba.
    return null;
  }
}

/** Miniatura por convención, si oEmbed no contestó (las listas no tienen). */
export function miniaturaDe(ref: YoutubeRef): string {
  return ref.kind === "video"
    ? `https://i.ytimg.com/vi/${ref.id}/mqdefault.jpg`
    : "";
}

/**
 * Sugerencias de arranque para estudiar. Son un punto de partida editable, NO
 * una lista que la app mantenga: si alguna cae, se borra y no vuelve, igual que
 * con los canales de TV.
 *
 * Se eligieron emisiones continuas y de larga vida (llevan años en directo)
 * porque un vídeo suelto se retira y deja el hueco muerto.
 */
export const YOUTUBE_SUGERIDOS: YoutubeItem[] = [
  { titulo: "Lofi hip hop — para concentrarse", kind: "video", id: "jfKfPfyJRdk", categoria: "Estudiar" },
  { titulo: "Synthwave — para programar de noche", kind: "video", id: "4xDzrJKXOOY", categoria: "Estudiar" },
  { titulo: "Jazz suave de fondo", kind: "video", id: "Dx5qFachd3A", categoria: "Estudiar" },
  { titulo: "Sonido de lluvia y truenos", kind: "video", id: "mPZkdNFkNps", categoria: "Ambiente" },
];
