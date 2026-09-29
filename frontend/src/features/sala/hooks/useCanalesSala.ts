import { useMemo } from "react";
import { DEFAULT_STATIONS, useMultimedia } from "../../multimedia";
import type { StreamItem } from "../../multimedia";
import { paletaDe } from "../lib/paletas";
import type { Paleta } from "../lib/paletas";

/** Un canal tal como lo ve La Sala: con número en el mando y su cartel. */
export interface CanalSala {
  /** Número de canal (1, 2, 3…): el que se teclea en el control remoto. */
  n: number;
  nombre: string;
  url: string;
  categoria: string;
  paleta: Paleta;
}

export interface EmisoraSala extends StreamItem {
  paleta: Paleta;
}

const ES_NOTICIAS = /noticias|news/i;

/**
 * Los canales del usuario (los mismos del panel Multimedia, con sus añadidos)
 * numerados, y las emisoras curadas repartidas entre música y noticias.
 *
 * En producción (HTTPS) se quitan los canales `http://`: el navegador los
 * bloquearía por contenido mixto, y un canal que nunca va a verse no merece
 * número. Es el mismo filtro que aplica el panel.
 */
export function useCanalesSala() {
  const m = useMultimedia();

  return useMemo(() => {
    const https = window.location.protocol === "https:";
    const todos: CanalSala[] = m.channels
      .filter((c) => !(https && c.url.startsWith("http://")))
      .map((c, i) => ({
        n: i + 1,
        nombre: c.name,
        url: c.url,
        categoria: c.category ?? "",
        paleta: paletaDe(c.name),
      }));
    // Las curadas siempre suenan (Radio Browser, el buscador global, se cae a
    // ratos): son la base fiable para las estanterías y el cambio de emisora.
    const emisoras: EmisoraSala[] = DEFAULT_STATIONS.map((e) => ({ ...e, paleta: paletaDe(e.title) }));
    return {
      todos,
      entretenimiento: todos.filter((c) => !ES_NOTICIAS.test(c.categoria)),
      noticias: todos.filter((c) => ES_NOTICIAS.test(c.categoria)),
      emisoras,
      emisorasMusica: emisoras.filter((e) => !ES_NOTICIAS.test(e.subtitle)),
      emisorasNoticias: emisoras.filter((e) => ES_NOTICIAS.test(e.subtitle)),
    };
  }, [m.channels]);
}
