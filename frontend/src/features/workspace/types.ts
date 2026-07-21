// Tipos compartidos de la feature `workspace`.
// Reflejan exactamente el contrato JSON que devuelve el backend
// (entidad `AgentEvaluation` del dominio).

export type EvaluationStatus = "aprobado" | "sugerir_ajustes";

export interface AgentEvaluation {
  status: EvaluationStatus;
  analisis_critico: string;
  sugerencias_mejora: string[];
  prompt_final_optimizado: string;
}

// La respuesta del backend añade el `id` de la evaluación, necesario para
// asociar el feedback (👍/👎) posterior.
export interface EvaluationResult extends AgentEvaluation {
  id: string;
}

// Resultado de generar un proyecto (agente que construye).
export interface GenerateResult {
  name: string;
  summary: string;
  output_path: string;
  files: string[];
  run_instructions: string;
  /** URL del proyecto ya corriendo (null si no se pudo arrancar). */
  url?: string | null;
  /** Manual de usuario con las credenciales de prueba, para mostrarlo tal cual. */
  manual?: string | null;
}

// Una sugerencia de mejora del agente auditor.
export interface AuditSuggestion {
  title: string;
  category: string;
  priority: string;
  file: string;
  rationale: string;
  suggestion: string;
}

// Resultado de auditar un proyecto (agente proactivo).
export interface AuditResult {
  target: string;
  summary: string;
  suggestions: AuditSuggestion[];
}

// Guía del Modo Profesor.
export interface TeachingResult {
  target: string;
  summary: string;
  steps: string[];
  concepts: string[];
  next_steps: string[];
}

// Resumen de un proyecto en la galería.
export interface ProjectSummary {
  name: string;
  files: number;
}

// Estado de uso y licencia.
export interface UsageStatus {
  used: number;
  limit: number;
  remaining: number; // -1 = ilimitado (licenciado)
  licensed: boolean;
}
