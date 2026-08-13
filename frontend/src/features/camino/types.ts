// Tipos de la feature `camino` (Mi camino: racha, cursos y certificados).
// Espejo del contrato JSON de GET /api/v1/agent/camino.

/** Un curso del alumno visto desde el camino: cuánto lleva y si se graduó. */
export interface CursoCamino {
  titulo: string;
  total_clases: number;
  completadas: number;
  graduado: boolean;
}

/** Un certificado ganado: curso terminado y cuándo. */
export interface CertificadoCamino {
  curso: string;
  /** Fecha ISO de la graduación. */
  fecha: string;
}

/** El camino completo del alumno: la razón para volver mañana. */
export interface Camino {
  /** Días seguidos con actividad. */
  racha_dias: number;
  /** Los últimos 7 días, true = hubo actividad ese día. */
  actividad_semana: boolean[];
  cursos: CursoCamino[];
  certificados: CertificadoCamino[];
  /** Qué le conviene hacer ahora, en una frase (CTA). */
  proximo_paso: string;
}
