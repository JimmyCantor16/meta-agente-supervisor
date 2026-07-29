import { useEffect, useRef, useState } from "react";

/**
 * Traduce los mensajes del canal en vivo a un PORCENTAJE de avance.
 *
 * Construir tarda minutos. Sin una señal de progreso, el usuario mira una barra
 * girando sin saber si faltan diez segundos o tres minutos, y se va. Aquí cada
 * fase real del pipeline aporta su tramo, así que el número significa algo.
 *
 * Es deliberadamente aproximado: preferimos avanzar despacio y llegar, que
 * prometer un 90% y quedarnos ahí clavados — eso enfada más que no informar.
 */

export interface Avance {
  /** 0-100. Aproximado y siempre creciente. */
  porcentaje: number;
  /** Qué está pasando ahora, en lenguaje de persona. */
  fase: string;
  /** Detalle fino, cuando lo hay (p. ej. «archivo 7 de 22»). */
  detalle: string;
  /** True mientras haya una construcción en curso. */
  activo: boolean;
}

/** Cada hito reconocible del pipeline, con el punto al que lleva la barra. */
const HITOS: Array<{ patron: RegExp; hasta: number; fase: string }> = [
  { patron: /Cerebro IA listo/i, hasta: 5, fase: "Despertando los modelos" },
  { patron: /arquetipo|Idea única|diseñando/i, hasta: 12, fase: "Entendiendo tu idea" },
  { patron: /Plano listo|Plan: \d+ archivo/i, hasta: 20, fase: "Diseñando la estructura" },
  { patron: /Escribiendo|Escrito \d+\//i, hasta: 55, fase: "Escribiendo el código" },
  { patron: /Instalando/i, hasta: 68, fase: "Instalando dependencias" },
  { patron: /Compilando/i, hasta: 76, fase: "Compilando" },
  { patron: /reparando|Arreglo automático|intento \d+/i, hasta: 82, fase: "Corrigiendo detalles" },
  { patron: /Verificación superada/i, hasta: 90, fase: "Comprobando que funciona" },
  { patron: /inspección|render validado/i, hasta: 96, fase: "Revisando que se vea bien" },
  { patron: /VIVO|🚀/i, hasta: 100, fase: "¡Listo!" },
  { patron: /RETENIDA|no se entrega|fallaron/i, hasta: 100, fase: "Terminó con avisos" },
];

const INACTIVO: Avance = { porcentaje: 0, fase: "", detalle: "", activo: false };

export function useAvance(mensajes: string[]): Avance {
  const [avance, setAvance] = useState<Avance>(INACTIVO);
  // El porcentaje NUNCA baja: ver la barra retroceder destruye la confianza.
  const techo = useRef(0);

  useEffect(() => {
    if (mensajes.length === 0) {
      techo.current = 0;
      setAvance(INACTIVO);
      return;
    }
    const ultimo = mensajes[mensajes.length - 1] ?? "";

    // Progreso fino mientras escribe archivos: es la fase más larga y la que
    // más necesita señal de que algo se mueve.
    const escritura = ultimo.match(/Escribiendo (\d+) de (\d+)/i);
    let porcentaje = techo.current;
    let fase = avance.fase;
    let detalle = "";

    if (escritura) {
      const [, hechos, total] = escritura;
      const fraccion = Number(hechos) / Math.max(1, Number(total));
      porcentaje = Math.round(20 + fraccion * 35); // el tramo de escritura: 20→55
      fase = "Escribiendo el código";
      detalle = `archivo ${hechos} de ${total}`;
    } else {
      for (const hito of HITOS) {
        if (hito.patron.test(ultimo)) {
          porcentaje = hito.hasta;
          fase = hito.fase;
          break;
        }
      }
    }

    techo.current = Math.max(techo.current, porcentaje);
    setAvance({
      porcentaje: techo.current,
      fase,
      detalle,
      activo: techo.current > 0 && techo.current < 100,
    });
    // `avance.fase` se lee pero no debe reactivar el efecto: solo conserva el
    // rótulo cuando llega un mensaje que no corresponde a ningún hito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensajes]);

  return avance;
}
