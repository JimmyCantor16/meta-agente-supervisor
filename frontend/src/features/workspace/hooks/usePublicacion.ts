import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, listarDespliegues, publicarProyecto } from "../../../lib/api";
import { canalDeEscucha } from "../../../lib/canal";
import type { InfoDespliegue } from "../types";

/**
 * Sigue la publicación automática de un proyecto de principio a fin.
 *
 * El contrato tiene dos canales y este hook los junta en un solo estado:
 *   · el POST /publicar responde 202 al instante (el deploy corre detrás),
 *   · los pasos («creando repo…», «Render construyendo…») llegan como texto
 *     por el WebSocket de progreso que ya usan las demás vistas,
 *   · y la VERDAD del resultado (vivo/fallido/caído + URL) vive en el GET
 *     de despliegues, que aquí se sondea mientras haya algo en curso.
 */

export interface Publicacion {
  /** Último despliegue conocido de ESTE proyecto (null si nunca se publicó). */
  despliegue: InfoDespliegue | null;
  /** True desde que se pulsa publicar hasta que el backend da un estado final. */
  publicando: boolean;
  /** Último paso legible que llegó por el canal en vivo. */
  progreso: string;
  /** Fallo al LANZAR la publicación (el fallo del deploy viaja en `despliegue`). */
  error: string | null;
  publicar: () => Promise<void>;
}

// Solo mostramos los pasos que hablan de publicar: el canal es compartido y
// puede traer, por ejemplo, la generación de otro proyecto en paralelo.
const HABLA_DE_PUBLICAR = /public|desplieg|deploy|render|repo|github|servicio/i;

function esDeEstaPublicacion(txt: string, slug: string): boolean {
  return txt.toLowerCase().includes(slug.toLowerCase()) || HABLA_DE_PUBLICAR.test(txt);
}

export function usePublicacion(slug: string): Publicacion {
  const [despliegue, setDespliegue] = useState<InfoDespliegue | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState<string | null>(null);
  // `actualizado_en` que tenía el despliegue al pulsar publicar: mientras el
  // sondeo devuelva ese mismo sello, es el registro VIEJO (el backend aún no
  // escribió el nuevo) y no debe apagar el spinner.
  const selloPrevio = useRef<string | null>(null);

  // Al abrir la vista: ¿este proyecto ya tiene un despliegue? (best-effort;
  // si el endpoint falla, la vista sigue sirviendo para publicar).
  useEffect(() => {
    let vivo = true;
    setDespliegue(null);
    listarDespliegues()
      .then((lista) => {
        if (!vivo) return;
        setDespliegue(lista.find((d) => d.slug === slug) ?? null);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [slug]);

  const activo = publicando || despliegue?.estado === "en_curso";

  // Sondeo del estado real mientras haya una publicación en marcha.
  useEffect(() => {
    if (!activo) return;
    const timer = window.setInterval(() => {
      listarDespliegues()
        .then((lista) => {
          const mio = lista.find((d) => d.slug === slug);
          if (!mio) return;
          setDespliegue(mio);
          const esRegistroNuevo = mio.actualizado_en !== selloPrevio.current;
          if (mio.estado !== "en_curso" && esRegistroNuevo) setPublicando(false);
        })
        .catch(() => undefined); // el sondeo reintenta solo en el siguiente tic
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activo, slug]);

  // Canal en vivo: los pasos del deploy, para que la espera cuente algo.
  useEffect(() => {
    if (!activo) return;
    let ws: WebSocket | null = null;
    let cerrado = false;
    let retry = 0;
    const conectar = () => {
      try {
        ws = new WebSocket(canalDeEscucha().url);
        ws.onmessage = (e: MessageEvent) => {
          const txt = String(e.data || "");
          if (/^👋/.test(txt) || txt.startsWith("{")) return; // saludo / eventos internos
          if (esDeEstaPublicacion(txt, slug)) setProgreso(txt);
        };
        ws.onclose = () => {
          if (!cerrado) retry = window.setTimeout(conectar, 4000);
        };
        ws.onerror = () => {
          try {
            ws?.close();
          } catch {
            /* noop */
          }
        };
      } catch {
        if (!cerrado) retry = window.setTimeout(conectar, 4000);
      }
    };
    conectar();
    return () => {
      cerrado = true;
      window.clearTimeout(retry);
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    };
  }, [activo, slug]);

  const publicar = useCallback(async () => {
    setError(null);
    setProgreso("");
    selloPrevio.current = despliegue?.actualizado_en ?? null;
    setPublicando(true);
    try {
      await publicarProyecto(slug);
    } catch (err) {
      setPublicando(false);
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }, [slug, despliegue]);

  return { despliegue, publicando, progreso, error, publicar };
}
