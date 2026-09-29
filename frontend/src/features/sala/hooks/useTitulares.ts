import { useEffect, useState } from "react";

/** Un titular del teletexto: lo justo para leerlo y abrir la noticia. */
export interface Titular {
  titulo: string;
  url: string;
}

// Diez minutos de caché por feed: pasar de página en página (o volver al
// índice y entrar otra vez) no debe repetir la descarga.
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { hora: number; items: Titular[] }>();

/**
 * Descarga y lee un feed RSS. Solo se aceptan enlaces `https://`: el titular
 * se abre con un clic, y un `javascript:` colado en el feed no debe llegar ahí.
 */
export async function cargarTitulares(url: string, signal?: AbortSignal): Promise<Titular[]> {
  const guardado = cache.get(url);
  if (guardado && Date.now() - guardado.hora < TTL_MS) return guardado.items;

  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = new DOMParser().parseFromString(await r.text(), "text/xml");
  if (xml.querySelector("parsererror")) throw new Error("RSS ilegible");

  const items = Array.from(xml.querySelectorAll("item"))
    .map((it) => ({
      titulo: (it.querySelector("title")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      url: (it.querySelector("link")?.textContent ?? "").trim(),
    }))
    .filter((x) => x.titulo && x.url.startsWith("https://"))
    .slice(0, 24);

  cache.set(url, { hora: Date.now(), items });
  return items;
}

/** Titulares de una página del teletexto (null = página sin feed). */
export function useTitulares(url: string | null) {
  const [items, setItems] = useState<Titular[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) {
      setItems([]);
      setError(false);
      return;
    }
    const ctl = new AbortController();
    setCargando(true);
    setError(false);
    cargarTitulares(url, ctl.signal)
      .then((x) => {
        setItems(x);
        setError(x.length === 0);
      })
      .catch(() => {
        if (!ctl.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!ctl.signal.aborted) setCargando(false);
      });
    return () => ctl.abort();
  }, [url]);

  return { items, cargando, error };
}
