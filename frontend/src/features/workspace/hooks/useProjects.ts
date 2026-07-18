import { useCallback, useEffect, useState } from "react";
import { listProjects } from "../../../lib/api";
import type { ProjectSummary } from "../types";

interface UseProjectsResult {
  projects: ProjectSummary[];
  loading: boolean;
  refresh: () => void;
}

/** Hook que carga la lista de proyectos generados (galería). */
export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    listProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { projects, loading, refresh };
}
