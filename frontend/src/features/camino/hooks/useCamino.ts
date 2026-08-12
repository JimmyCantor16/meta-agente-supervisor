import { useCallback, useEffect, useState } from "react";
import { ApiError, obtenerCamino } from "../../../lib/api";
import type { Camino } from "../types";

/**
 * Estado de la vista «Mi camino»: carga el camino del alumno al montar y
 * permite recargarlo (tras un error, o al volver a la vista).
 */
export function useCamino() {
  const [camino, setCamino] = useState<Camino | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setCamino(await obtenerCamino());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar tu camino.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { camino, cargando, error, recargar };
}
