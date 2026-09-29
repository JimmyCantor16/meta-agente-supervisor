import { useEffect, useState } from "react";

/** La hora actual, refrescada cada `cadaMs` (por defecto, cada 20 s). */
export function useReloj(cadaMs = 20_000): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), cadaMs);
    return () => window.clearInterval(id);
  }, [cadaMs]);
  return ahora;
}

export const dosCifras = (n: number) => String(n).padStart(2, "0");

export function horaCorta(d: Date): string {
  return `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`;
}
