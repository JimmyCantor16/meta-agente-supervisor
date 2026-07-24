// Tipos compartidos de la feature `workspace`.
// Reflejan exactamente el contrato JSON que devuelve el backend
// (entidad `AgentEvaluation` del dominio).

export type EvaluationStatus = "aprobado" | "sugerir_ajustes";

// Pregunta de aterrizaje con opciones marcables (checkbox) + campo libre.
export interface PreguntaUsuario {
  texto: string;
  opciones: string[];
  permite_otro: boolean;
}

// Plantilla visual propuesta junto al plan, con su paleta declarada.
export interface PlantillaPropuesta {
  nombre: string;
  descripcion: string;
  estilo: string;
  colores: string[];
}

export interface AgentEvaluation {
  status: EvaluationStatus;
  analisis_critico: string;
  sugerencias_mejora: string[];
  /** Preguntas de aterrizaje: datos que solo el usuario puede aportar. */
  preguntas_para_el_usuario?: PreguntaUsuario[];
  /** Plantillas para elegir, combinar o sustituir por una referencia propia. */
  plantillas?: PlantillaPropuesta[];
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

// Cuánta autonomía se le da a la IA en un ajuste de clase.
export type NivelAutonomia = "explicar" | "proponer" | "ejecutar";

// Un archivo tocado por un ajuste, con su diff para revisarlo.
export interface CambioArchivo {
  path: string;
  diff: string;
  es_nuevo: boolean;
  contenido_nuevo: string;
}

// Resultado de un ajuste de clase (explicar / proponer / ejecutar).
export interface AjusteResult {
  proyecto: string;
  ajuste: string;
  nivel: string;
  explicacion: string;
  concepto: string;
  cambios: CambioArchivo[];
  aplicado: boolean;
  verificado: boolean;
  revertido: boolean;
  detalle: string;
  /** Id de la propuesta guardada: al ejecutar con él se aplica EXACTAMENTE lo revisado. */
  propuesta_id?: string | null;
}

// Resultado de la pasada de auto-mejora (audita y aplica verificando).
export interface MejoraResult {
  proyecto: string;
  diagnostico: string;
  sugerencias_totales: number;
  intentadas: number;
  aplicadas: string[];
  revertidas: string[];
  sin_cambios: string[];
}

// ===== Curso interactivo del profesor =====
export interface PreguntaQuizDTO {
  pregunta: string;
  opciones: string[];
}

export interface CriterioClase {
  tipo: "quiz" | "cambio" | "repo_git" | "url_publicada" | "reflexion";
  descripcion: string;
  quiz: PreguntaQuizDTO[];
  aciertos_minimos: number;
  pista: string;
}

export interface ClaseCurso {
  numero: number;
  titulo: string;
  objetivo: string;
  contenido: string;
  reto: string;
  concepto_clave: string;
  criterio: CriterioClase;
}

export interface ProgresoCurso {
  curso_id: string;
  proyecto: string;
  clase_actual: number;
  completadas: number[];
  total_clases: number;
  graduado: boolean;
}

export interface CursoResult {
  titulo_curso: string;
  resumen: string;
  arquetipo: string;
  clases: ClaseCurso[];
  progreso: ProgresoCurso;
}

export interface MensajeChat {
  rol: "profesor" | "alumno";
  texto: string;
}

export interface VerificacionClase {
  superada: boolean;
  mensaje: string;
  avanzo: boolean;
  graduado: boolean;
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
