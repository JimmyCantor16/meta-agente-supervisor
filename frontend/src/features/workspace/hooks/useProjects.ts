import { useCallback, useEffect, useState } from "react";
import { listProjects } from "../../../lib/api";
import type { ProjectSummary } from "../types";

interface UseProjectsResult {
  projects: ProjectSummary[];
  loading: boolean;
  /** Motivo por el que no se pudieron cargar, o null si todo fue bien. */
  error: string | null;
  refresh: () => void;
}

/** Hook que carga la lista de proyectos del usuario (galería). */
export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    listProjects()
      .then(setProjects)
      // Un fallo se DICE. Antes se tragaba y la galería aparecía vacía como si
      // no hubiera proyectos, cuando en realidad faltaba la sesión.
      .catch((e: unknown) => {
        setProjects([]);
        setError(e instanceof Error ? e.message : "No se pudieron cargar tus proyectos.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { projects, loading, error, refresh };
}
