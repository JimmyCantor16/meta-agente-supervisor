/**
 * Punto de entrada del módulo Multimedia.
 *
 * `MultimediaProvider` va por ENCIMA de todo el layout (no al lado): La Sala,
 * que vive dentro del área principal, necesita el mismo reproductor que el
 * panel, y un contexto solo lo ven sus descendientes. `MultimediaDock` es la
 * pestaña del borde + el panel; se monta una vez, dentro del Provider.
 */
export { MultimediaProvider, useMultimedia } from "./MultimediaProvider";
export { MultimediaDock } from "./MultimediaDock";
export { DEFAULT_STATIONS } from "./lib/defaultStations";
export { miniaturaDe } from "./lib/youtube";
export type { StreamItem, YoutubeItem, CustomChannel } from "./types";
