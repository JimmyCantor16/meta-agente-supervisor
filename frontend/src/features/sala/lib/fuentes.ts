// Páginas del Teletexto Jamz y de dónde salen sus titulares.
//
// Se leen DESDE EL NAVEGADOR, sin pasar por el backend, y por eso la lista es
// tan corta: solo sirven los feeds que responden con CORS abierto
// (`Access-Control-Allow-Origin: *`). Comprobado el 2026-09-29 con el origen de
// producción: DW y los feeds de EL PAÍS lo dan; BBC Mundo, France 24, Google
// News, El Tiempo e Infobae NO (el navegador bloquearía la respuesta). Añadir
// una fuente sin comprobar eso deja una página que dice "no disponible" siempre.
//
// Que no pase por el backend es deliberado: mientras producción no tenga
// DATABASE_URL, cada deploy del backend borra usuarios y cursos, y una sección
// de noticias no justifica ese precio.

export type SeccionTtx = "top" | "colombia" | "mundo" | "tecnologia" | "ciencia" | "deportes";

export interface FuenteTtx {
  seccion: SeccionTtx;
  /** Número de página, como en el teletexto de siempre. */
  pagina: number;
  url: string;
  /** Medio que se cita al pie de la página. */
  medio: string;
}

const PAIS = "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com";

export const FUENTES_TTX: FuenteTtx[] = [
  { seccion: "top", pagina: 101, url: "https://rss.dw.com/xml/rss-sp-top", medio: "DW" },
  { seccion: "colombia", pagina: 110, url: `${PAIS}/section/america-colombia/portada`, medio: "EL PAÍS" },
  { seccion: "mundo", pagina: 120, url: `${PAIS}/section/internacional/portada`, medio: "EL PAÍS" },
  { seccion: "tecnologia", pagina: 130, url: `${PAIS}/section/tecnologia/portada`, medio: "EL PAÍS" },
  { seccion: "ciencia", pagina: 140, url: `${PAIS}/section/ciencia/portada`, medio: "EL PAÍS" },
  { seccion: "deportes", pagina: 150, url: `${PAIS}/section/deportes/portada`, medio: "EL PAÍS" },
];

export const PAGINA_INDICE = 100;
export const PAGINA_CAPSULAS = 500;
export const PAGINA_PROGRAMACION = 600;
