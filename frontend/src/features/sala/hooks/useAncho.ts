import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ancho de un elemento (no de la ventana): La Sala vive al lado del menú, así
 * que lo que decide si algo cabe es SU ancho, no el de la pantalla.
 */
export function useAncho<T extends HTMLElement>() {
  const [ancho, setAncho] = useState(0);
  const obs = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: T | null) => {
    obs.current?.disconnect();
    if (!el) return;
    setAncho(el.getBoundingClientRect().width);
    obs.current = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    obs.current.observe(el);
  }, []);

  useEffect(() => () => obs.current?.disconnect(), []);
  return { ref, ancho };
}
