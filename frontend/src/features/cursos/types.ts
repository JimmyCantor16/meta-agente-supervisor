// Tipos de la feature `cursos` (catálogo estilo Platzi).
// Reflejan el contrato de `/api/v1/cursos` (dominio `src/domain/catalogo.py`).
// Ojo: las preguntas llegan SIN `correcta` ni su explicación, y los retos sin
// solución: se corrigen en el servidor. Por eso esos campos no existen aquí.

export type NivelCatalogo = "basico" | "intermedio" | "avanzado";

export interface CursoResumen {
  id: string;
  titulo: string;
  descripcion: string;
  nivel: NivelCatalogo;
  tecnologias: string[];
  miniatura: string;
  modulos: number;
  lecciones: number;
  duracion_min: number;
  /** 0-100; 0 si no hay sesión. */
  avance: number;
  certificado: boolean;
}

export interface PasoExplicado {
  titulo: string;
  explicacion: string;
  codigo: string;
  lenguaje: string;
}

export interface SnippetCodigo {
  id: string;
  titulo: string;
  lenguaje: string;
  archivo: string;
  codigo: string;
  explicacion: string;
}

export interface PreguntaOpcion {
  id: string;
  enunciado: string;
  opciones: string[];
}

export interface RetoCodigo {
  id: string;
  enunciado: string;
  lenguaje: string;
  codigo_inicial: string;
  criterios: string[];
  pista: string;
}

export interface Evaluacion {
  id: string;
  titulo: string;
  preguntas: PreguntaOpcion[];
  retos: RetoCodigo[];
  aprobacion_minima: number;
}

export interface Leccion {
  id: string;
  orden: number;
  titulo: string;
  resumen: string;
  duracion_min: number;
  contenido: string;
  pasos: PasoExplicado[];
  snippets: SnippetCodigo[];
  evaluacion: Evaluacion | null;
}

export interface ModuloCurso {
  id: string;
  orden: number;
  titulo: string;
  descripcion: string;
  lecciones: Leccion[];
  evaluacion: Evaluacion | null;
}

export interface CursoCatalogo {
  id: string;
  version: number;
  titulo: string;
  descripcion: string;
  nivel: NivelCatalogo;
  tecnologias: string[];
  miniatura: string;
  publicado: boolean;
  modulos: ModuloCurso[];
}

export interface CertificadoCatalogo {
  folio: string;
  curso_id: string;
  titulo_curso: string;
  nombre: string;
  emitido: string;
}

export interface ProgresoCatalogo {
  lecciones_completadas: string[];
  /** Mejor porcentaje por evaluación (id → 0-100). */
  puntajes: Record<string, number>;
  retos_superados: string[];
  ultima_leccion: string;
  avance: number;
  evaluaciones_aprobadas: string[];
  certificado: CertificadoCatalogo | null;
}

export interface DetalleCurso {
  curso: CursoCatalogo;
  /** null si no hay sesión: se puede leer, no guardar. */
  progreso: ProgresoCatalogo | null;
}

export interface ResultadoPregunta {
  pregunta_id: string;
  elegida: number | null;
  acierto: boolean;
  correcta: number;
  explicacion: string;
}

export interface ResultadoEvaluacion {
  evaluacion_id: string;
  puntaje: number;
  aprobado: boolean;
  mejor_puntaje: number;
  aprobacion_minima: number;
  resultados: ResultadoPregunta[];
}

export interface VeredictoReto {
  aprobado: boolean;
  puntaje: number;
  retroalimentacion: string;
  criterios_cumplidos: string[];
  sugerencias: string[];
}

export interface RespuestaTutor {
  respuesta: string;
  codigo: string;
  lenguaje: string;
  siguiente_paso: string;
}

/** Lo que se pinta en el área de lectura: una lección o la evaluación de un módulo. */
export type Seleccion =
  | { tipo: "leccion"; id: string }
  | { tipo: "evaluacion_modulo"; moduloId: string };
