// Tipos del módulo Multimedia (TV en vivo + Radio), portado del patrón de
// C:\Editor (DKEditor): un `StreamItem` normalizado que el reproductor consume
// directamente, y los canales de TV que aporta el propio usuario.

export type StreamKind = "tv" | "radio";

/** Un ítem reproducible (emisora de radio o canal de TV), normalizado para la UI. */
export interface StreamItem {
  title: string;
  /** Género/país/bitrate (radio) o categoría/descripción (TV). */
  subtitle: string;
  /** URL de stream que el <audio>/<video> reproduce directo (HLS .m3u8 en TV). */
  url: string;
  /** Carátula/logo (favicon de la emisora o logo del canal). */
  artwork?: string;
  kind: StreamKind;
}

/**
 * Canal de TV personalizado que el usuario pega (nombre + URL .m3u8). La app NO
 * distribuye canales propios (igual que DKEditor): cada quien agrega los suyos y
 * se guardan localmente en su navegador.
 */
export interface CustomChannel {
  name: string;
  url: string;
  category?: string;
}

/** Dónde vive el vídeo de TV en la pantalla. */
export type VideoPlacement = "hidden" | "docked" | "floating";
