import { useCallback, useEffect, useState } from "react";
import { ApiError, listarCursosCatalogo } from "../../../lib/api";
import type { CursoResumen } from "../types";

/** El catálogo de cursos publicados (con el avance del usuario si hay sesión). */
export function useCatalogo(recargarCon: unknown) {
  const [cursos, setCursos] = useState<CursoResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setCursos(await listarCursosCatalogo());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }, []);

  // Al iniciar o cerrar sesión cambia el avance que se muestra.
  useEffect(() => {
    void cargar();
  }, [cargar, recargarCon]);

  return { cursos, cargando, error, cargar };
}
