// Cliente HTTP mínimo hacia el backend.
// En desarrollo, las peticiones a `/api` se redirigen al backend FastAPI
// mediante el proxy de Vite (ver vite.config.ts).

import type { AccountStatus, AuthConfig, AuthUser } from "../features/auth/types";
import type {
  AjusteResult,
  AuditResult,
  EvaluationResult,
  GenerateResult,
  MejoraResult,
  NivelAutonomia,
  ProjectSummary,
  TeachingResult,
  UsageStatus,
} from "../features/workspace/types";
import type { Language } from "../i18n/translations";

// Base de la API. Vacía = rutas relativas, que es lo correcto cuando algo hace
// de proxy hacia el backend (Vite en desarrollo, Nginx en Docker, o un rewrite
// en Render). Si el frontend se despliega suelto (sin proxy), se define
// `VITE_API_URL` en el build y las peticiones van directas al backend.
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

const EVALUATE_ENDPOINT = `${API_BASE}/api/v1/agent/evaluate`;
const FEEDBACK_ENDPOINT = `${API_BASE}/api/v1/agent/feedback`;
const GENERATE_ENDPOINT = `${API_BASE}/api/v1/agent/generate`;
const AUDIT_ENDPOINT = `${API_BASE}/api/v1/agent/audit`;
const EXPLAIN_ENDPOINT = `${API_BASE}/api/v1/agent/explain`;
const ADJUST_ENDPOINT = `${API_BASE}/api/v1/agent/lecciones/ajuste`;
const IMPROVE_ENDPOINT = `${API_BASE}/api/v1/agent/lecciones/mejorar`;
const PROJECTS_ENDPOINT = `${API_BASE}/api/v1/agent/projects`;
const USAGE_ENDPOINT = `${API_BASE}/api/v1/agent/usage`;
const LICENSE_ENDPOINT = `${API_BASE}/api/v1/agent/license`;
const AUTH_CONFIG_ENDPOINT = `${API_BASE}/api/v1/auth/config`;
const AUTH_GOOGLE_ENDPOINT = `${API_BASE}/api/v1/auth/google`;

/**
 * Error tipado para fallos de la API, con el mensaje ya legible para la UI.
 */
export class ApiError extends Error {
  /** Código HTTP asociado (0 si fue fallo de red). */
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * URL del WebSocket de progreso en vivo. Deriva del mismo origen que la API:
 * con proxy (Vite/Nginx) usa el host de la página; en escritorio apunta al
 * puerto del backend embebido.
 */
export function progressSocketUrl(): string {
  if (API_BASE) {
    return API_BASE.replace(/^http/, "ws") + "/api/v1/ws/progreso";
  }
  const esquema = window.location.protocol === "https:" ? "wss" : "ws";
  return `${esquema}://${window.location.host}/api/v1/ws/progreso`;
}

/** Cabecera de autenticación con el token de Google guardado (si hay sesión). */
function authHeaders(): Record<string, string> {
  const credential = window.localStorage.getItem("auth.credential");
  return credential ? { Authorization: `Bearer ${credential}` } : {};
}

/**
 * Si una respuesta autenticada devuelve 401, la sesión expiró: avisamos a la app
 * (AuthProvider) para cerrar sesión y pedir re-login sin romper la experiencia.
 */
function handleAuthExpiry(status: number): void {
  if (status === 401) {
    window.dispatchEvent(new Event("auth-expired"));
  }
}

/** Extrae el `detail` de una respuesta de error de FastAPI. */
async function errorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body?.detail) return typeof body.detail === "string" ? body.detail : fallback;
  } catch {
    // cuerpo no-JSON
  }
  return fallback;
}

/**
 * Envía el prompt del usuario al backend y devuelve la evaluación estructurada.
 *
 * @param prompt Texto del prompt de desarrollo.
 * @param language Idioma deseado para la respuesta del agente ('es' | 'en').
 * @param signal AbortSignal opcional para cancelar la petición.
 * @throws {ApiError} Si la respuesta no es exitosa o la red falla.
 */
export async function evaluatePrompt(
  prompt: string,
  language: Language,
  signal?: AbortSignal
): Promise<EvaluationResult> {
  let response: Response;

  try {
    response = await fetch(EVALUATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, language }),
      signal,
    });
  } catch (err) {
    // Fallo de red (backend caído, sin conexión, CORS...).
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("No se pudo conectar con el servidor. ¿Está el backend en ejecución?");
  }

  if (!response.ok) {
    // Intentamos extraer el `detail` que envía FastAPI en los errores.
    let detail = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      // Cuerpo no-JSON: conservamos el mensaje genérico.
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as EvaluationResult;
}

/**
 * Envía el voto de utilidad (👍/👎) de una evaluación al backend.
 * Es "best-effort": si falla, no interrumpe la experiencia del usuario.
 *
 * @param evaluationId Id de la evaluación votada.
 * @param helpful true = útil (👍), false = no útil (👎).
 * @throws {ApiError} Si la respuesta no es exitosa o la red falla.
 */
export async function sendFeedback(
  evaluationId: string,
  helpful: boolean
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evaluation_id: evaluationId, helpful }),
    });
  } catch {
    throw new ApiError("No se pudo enviar el feedback.");
  }

  if (!response.ok) {
    throw new ApiError(`No se pudo registrar el feedback (HTTP ${response.status}).`);
  }
}

/**
 * Pide al backend generar un proyecto a partir de un prompt (agente que construye).
 *
 * @param prompt Prompt de ingeniería (normalmente el prompt_final_optimizado).
 * @param language Idioma para la documentación generada.
 * @throws {ApiError} Si la respuesta no es exitosa o la red falla.
 */
export async function generateProject(
  prompt: string,
  language: Language,
  modoInquieto = true
): Promise<GenerateResult> {
  let response: Response;

  try {
    response = await fetch(GENERATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ prompt, language, modo_inquieto: modoInquieto }),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor para generar el proyecto.");
  }

  if (!response.ok) {
    handleAuthExpiry(response.status);
    throw new ApiError(await errorDetail(response, `Error ${response.status}`), response.status);
  }

  return (await response.json()) as GenerateResult;
}

/**
 * Pide al backend auditar un proyecto ya generado (agente proactivo).
 *
 * @param projectName Nombre del proyecto a auditar.
 * @param language Idioma del informe.
 * @throws {ApiError} Si la respuesta no es exitosa o la red falla.
 */
export async function auditProject(
  projectName: string,
  language: Language
): Promise<AuditResult> {
  let response: Response;

  try {
    response = await fetch(AUDIT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_name: projectName, language }),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor para auditar.");
  }

  if (!response.ok) {
    let detail = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      // cuerpo no-JSON
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as AuditResult;
}

/**
 * Pide al backend explicar un proyecto en Modo Profesor.
 */
export async function explainProject(
  projectName: string,
  language: Language
): Promise<TeachingResult> {
  let response: Response;
  try {
    response = await fetch(EXPLAIN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ project_name: projectName, language }),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor para explicar el proyecto.");
  }
  if (!response.ok) {
    let detail = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      // cuerpo no-JSON
    }
    throw new ApiError(detail, response.status);
  }
  return (await response.json()) as TeachingResult;
}

/**
 * Pide un ajuste de clase sobre un proyecto, con el nivel de autonomía elegido:
 * 'explicar' (solo teoría), 'proponer' (muestra el diff) o 'ejecutar'
 * (aplica, verifica y revierte si algo se rompe).
 */
export async function adjustModule(
  projectName: string,
  ajuste: string,
  nivel: NivelAutonomia,
  language: Language,
  propuestaId?: string | null
): Promise<AjusteResult> {
  let response: Response;
  try {
    response = await fetch(ADJUST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        project_name: projectName,
        ajuste,
        nivel,
        language,
        propuesta_id: propuestaId ?? null,
      }),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor para ajustar el módulo.");
  }
  if (!response.ok) {
    handleAuthExpiry(response.status);
    throw new ApiError(await errorDetail(response, `Error ${response.status}`), response.status);
  }
  return (await response.json()) as AjusteResult;
}

/**
 * Lanza la pasada de auto-mejora: el agente audita el proyecto y aplica las
 * sugerencias más prioritarias, verificando cada una (o revirtiéndola).
 */
export async function improveProject(
  projectName: string,
  language: Language
): Promise<MejoraResult> {
  let response: Response;
  try {
    response = await fetch(IMPROVE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ project_name: projectName, language }),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor para mejorar el proyecto.");
  }
  if (!response.ok) {
    handleAuthExpiry(response.status);
    throw new ApiError(await errorDetail(response, `Error ${response.status}`), response.status);
  }
  return (await response.json()) as MejoraResult;
}

/**
 * Lista los proyectos generados (para la galería). Nunca lanza: devuelve [].
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  // Manda la sesión: el endpoint la exige desde que se cerró la fuga por la que
  // cualquiera podía enumerar los proyectos de todos. Sin ella devolvía 401 y
  // este método lo tragaba como «no hay proyectos», así que la galería aparecía
  // vacía SIN decir por qué y con ella se caían profesor, taller y aula.
  const response = await fetch(PROJECTS_ENDPOINT, { headers: authHeaders() });
  if (response.status === 401) {
    handleAuthExpiry(401);
    throw new ApiError("Inicia sesión para ver tus proyectos.", 401);
  }
  if (!response.ok) {
    throw new ApiError("No se pudieron cargar tus proyectos.", response.status);
  }
  return (await response.json()) as ProjectSummary[];
}

/** Obtiene la config de login (si está habilitado y el Client ID). Nunca lanza. */
export async function getAuthConfig(): Promise<AuthConfig> {
  try {
    const response = await fetch(AUTH_CONFIG_ENDPOINT);
    if (!response.ok) return { enabled: false, client_id: "" };
    return (await response.json()) as AuthConfig;
  } catch {
    return { enabled: false, client_id: "" };
  }
}

/**
 * Verifica el token de Google en el backend y devuelve el usuario.
 * @throws {ApiError} Si el token es inválido o el login no está configurado.
 */
export async function loginWithGoogle(credential: string): Promise<AuthUser> {
  let response: Response;
  try {
    response = await fetch(AUTH_GOOGLE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor.");
  }
  if (!response.ok) {
    let detail = "No se pudo iniciar sesión.";
    try {
      const body = await response.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      // no-JSON
    }
    throw new ApiError(detail, response.status);
  }
  return (await response.json()) as AuthUser;
}

// --- PUENTE DE SESIÓN para la app de escritorio -----------------------------
// Google bloquea su login dentro del WebView de la app, así que la sesión nace
// en el NAVEGADOR (origen autorizado) y viaja al escritorio por este puente:
// la web deposita el credential ya verificado bajo un código de un solo uso, y
// el escritorio lo recoge. El código caduca a los 5 minutos.
const PUENTE_ENTREGAR_ENDPOINT = `${API_BASE}/api/v1/auth/puente/entregar`;
const PUENTE_RECOGER_ENDPOINT = `${API_BASE}/api/v1/auth/puente/recoger`;

/** La WEB deposita el credential verificado para que lo recoja el escritorio. */
export async function depositarCredencialPuente(
  estado: string,
  credential: string,
): Promise<boolean> {
  try {
    const response = await fetch(PUENTE_ENTREGAR_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado, credential }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** El ESCRITORIO recoge el credential (una sola vez). null si aún no está. */
export async function recogerCredencialPuente(estado: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${PUENTE_RECOGER_ENDPOINT}?estado=${encodeURIComponent(estado)}`,
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { credential?: string };
    return body?.credential ?? null;
  } catch {
    return null;
  }
}

// --- Cuenta por usuario + super-admin ---------------------------------------
const ACCOUNT_ME_ENDPOINT = `${API_BASE}/api/v1/agent/account/me`;
const ACCOUNT_UPGRADE_ENDPOINT = `${API_BASE}/api/v1/agent/account/request-upgrade`;
const ADMIN_PENDING_ENDPOINT = `${API_BASE}/api/v1/agent/admin/pending`;
const ADMIN_APPROVE_ENDPOINT = `${API_BASE}/api/v1/agent/admin/approve`;

/** Estado de la cuenta del usuario autenticado. Null si no hay sesión. */
export async function getAccount(): Promise<AccountStatus | null> {
  try {
    const response = await fetch(ACCOUNT_ME_ENDPOINT, { headers: authHeaders() });
    if (!response.ok) {
      handleAuthExpiry(response.status);
      return null;
    }
    return (await response.json()) as AccountStatus;
  } catch {
    return null;
  }
}

/** El usuario solicita un plan (queda pendiente de aprobación). */
export async function requestUpgrade(plan = "pro"): Promise<AccountStatus> {
  const response = await fetch(ACCOUNT_UPGRADE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ plan }),
  });
  if (!response.ok) {
    handleAuthExpiry(response.status);
    throw new ApiError(await errorDetail(response, "No se pudo solicitar."), response.status);
  }
  return (await response.json()) as AccountStatus;
}

/** (Admin) Lista usuarios pendientes de aprobación de pago. */
export async function adminListPending(): Promise<AccountStatus[]> {
  const response = await fetch(ADMIN_PENDING_ENDPOINT, { headers: authHeaders() });
  if (!response.ok) {
    handleAuthExpiry(response.status);
    throw new ApiError(await errorDetail(response, "Acceso denegado."), response.status);
  }
  return (await response.json()) as AccountStatus[];
}

/** (Admin) Aprueba el pago de un usuario y activa su plan. */
export async function adminApprove(sub: string, plan = "pro"): Promise<AccountStatus> {
  const response = await fetch(ADMIN_APPROVE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ sub, plan }),
  });
  if (!response.ok) throw new ApiError(await errorDetail(response, "No se pudo aprobar."), response.status);
  return (await response.json()) as AccountStatus;
}

/** Obtiene el estado de uso/licencia. Nunca lanza. */
export async function getUsage(): Promise<UsageStatus | null> {
  try {
    const response = await fetch(USAGE_ENDPOINT);
    if (!response.ok) return null;
    return (await response.json()) as UsageStatus;
  } catch {
    return null;
  }
}

/**
 * Activa una licencia. Devuelve el nuevo estado.
 * @throws {ApiError} Si la clave es inválida (400) o falla la red.
 */
export async function activateLicense(key: string): Promise<UsageStatus> {
  let response: Response;
  try {
    response = await fetch(LICENSE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor.");
  }
  if (!response.ok) {
    let detail = "Clave de licencia inválida.";
    try {
      const body = await response.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      // no-JSON
    }
    throw new ApiError(detail, response.status);
  }
  return (await response.json()) as UsageStatus;
}

// ===== Curso interactivo del profesor =====
import type {
  ArchivoContenido,
  ArchivoItem,
  CursoResult,
  DiagnosticoMVP,
  EstadoProyecto,
  MensajeChat,
  MetaProceso,
  NivelResult,
  RelanzarResult,
  SecretosInfo,
  VerificacionClase,
} from "../features/workspace/types";

const CURSO_BASE = `${API_BASE}/api/v1/agent/curso`;
const PROYECTOS_BASE = `${API_BASE}/api/v1/agent/projects`;

/** Estado del proyecto en vivo: ¿encendido?, ¿en qué URL/puerto? */
export async function estadoProyecto(projectName: string): Promise<EstadoProyecto> {
  const r = await fetch(`${PROYECTOS_BASE}/${encodeURIComponent(projectName)}/estado`, {
    headers: { ...authHeaders() },
  });
  if (!r.ok) {
    handleAuthExpiry(r.status);
    throw new ApiError(await errorDetail(r, `Error ${r.status}`), r.status);
  }
  return (await r.json()) as EstadoProyecto;
}

async function proyectoAccion(projectName: string, accion: "encender" | "apagar"): Promise<EstadoProyecto> {
  let r: Response;
  try {
    r = await fetch(`${PROYECTOS_BASE}/${encodeURIComponent(projectName)}/${accion}`, {
      method: "POST",
      headers: { ...authHeaders() },
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor.");
  }
  if (!r.ok) {
    handleAuthExpiry(r.status);
    throw new ApiError(await errorDetail(r, `Error ${r.status}`), r.status);
  }
  return (await r.json()) as EstadoProyecto;
}

/** Enciende el proyecto y devuelve su URL (arranque en frío puede tardar 1-2 min). */
export function encenderProyecto(projectName: string): Promise<EstadoProyecto> {
  return proyectoAccion(projectName, "encender");
}

/** Apaga el proyecto. */
export function apagarProyecto(projectName: string): Promise<EstadoProyecto> {
  return proyectoAccion(projectName, "apagar");
}

/** Carpeta segura de secretos: dónde dejar las claves y qué nombres ya hay. */
export async function secretosProyecto(projectName: string): Promise<SecretosInfo> {
  const r = await fetch(`${PROYECTOS_BASE}/${encodeURIComponent(projectName)}/secretos`, {
    headers: { ...authHeaders() },
  });
  if (!r.ok) {
    handleAuthExpiry(r.status);
    throw new ApiError(await errorDetail(r, `Error ${r.status}`), r.status);
  }
  return (await r.json()) as SecretosInfo;
}

async function proyectoGet<T>(projectName: string, ruta: string): Promise<T> {
  const r = await fetch(`${PROYECTOS_BASE}/${encodeURIComponent(projectName)}/${ruta}`, {
    headers: { ...authHeaders() },
  });
  if (!r.ok) {
    handleAuthExpiry(r.status);
    throw new ApiError(await errorDetail(r, `Error ${r.status}`), r.status);
  }
  return (await r.json()) as T;
}

/** Árbol de archivos del proyecto (para el aula en vivo). */
export async function listarArchivos(projectName: string): Promise<ArchivoItem[]> {
  const r = await proyectoGet<{ archivos: ArchivoItem[] }>(projectName, "archivos");
  return r.archivos;
}

/** Contenido de un archivo del proyecto (solo lectura). */
export function leerArchivo(projectName: string, path: string): Promise<ArchivoContenido> {
  return proyectoGet<ArchivoContenido>(projectName, `archivo?path=${encodeURIComponent(path)}`);
}

/** Guarda un archivo editado y reinicia el proyecto para ver el cambio en vivo. */
export async function compilarProyecto(
  projectName: string,
  path: string,
  contenido: string
): Promise<EstadoProyecto> {
  let r: Response;
  try {
    r = await fetch(`${PROYECTOS_BASE}/${encodeURIComponent(projectName)}/compilar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ path, contenido }),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor.");
  }
  if (!r.ok) {
    handleAuthExpiry(r.status);
    throw new ApiError(await errorDetail(r, `Error ${r.status}`), r.status);
  }
  return (await r.json()) as EstadoProyecto;
}

async function cursoPost<T>(ruta: string, cuerpo: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${CURSO_BASE}/${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el profesor.");
  }
  if (!r.ok) {
    handleAuthExpiry(r.status);
    throw new ApiError(await errorDetail(r, `Error ${r.status}`), r.status);
  }
  return (await r.json()) as T;
}

/** Genera (o recupera) el curso del profesor, adaptado al nivel del alumno. */
export function iniciarCurso(
  projectName: string,
  arquetipo: string,
  language: Language,
  nivel: string = "desconocido"
): Promise<CursoResult> {
  return cursoPost<CursoResult>("iniciar", {
    project_name: projectName,
    arquetipo,
    language,
    nivel,
  });
}

/** ¿Ya existe un curso para este proyecto? (para nivelar antes de generarlo). */
export function existeCurso(projectName: string): Promise<{ existe: boolean; nivel: string }> {
  return cursoGet(`existe?project_name=${encodeURIComponent(projectName)}`);
}

/** Abre una clase (trae su historial; si está vacía, el profesor la inaugura). */
export function abrirClase(cursoId: string, numeroClase: number): Promise<{ mensajes: MensajeChat[] }> {
  return cursoPost("chat", { curso_id: cursoId, numero_clase: numeroClase, abrir: true });
}

/** Envía un mensaje al profesor dentro de una clase. */
export function chatProfesor(
  cursoId: string,
  numeroClase: number,
  mensaje: string,
  language: Language
): Promise<{ mensajes: MensajeChat[] }> {
  return cursoPost("chat", {
    curso_id: cursoId,
    numero_clase: numeroClase,
    mensaje,
    language,
  });
}

/** El profesor retoma el proyecto y diagnostica si el MVP sirve de verdad. */
export function diagnosticarMVP(
  projectName: string,
  url: string,
  language: Language
): Promise<DiagnosticoMVP> {
  return cursoPost<DiagnosticoMVP>("diagnostico", {
    project_name: projectName,
    url,
    language,
  });
}

/** El profesor mide el nivel del alumno (bajo/medio/alto) para adaptar el curso. */
export function estimarNivel(
  cursoId: string,
  respuesta: string,
  language: Language
): Promise<NivelResult> {
  return cursoPost<NivelResult>("nivel", { curso_id: cursoId, respuesta, language });
}

/** Repara y RELANZA un MVP que no sirve, recordando su idea original. */
export function relanzarMVP(
  projectName: string,
  language: Language
): Promise<RelanzarResult> {
  return cursoPost<RelanzarResult>("relanzar", { project_name: projectName, language });
}

async function cursoGet<T>(ruta: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${CURSO_BASE}/${ruta}`, { headers: { ...authHeaders() } });
  } catch {
    throw new ApiError("No se pudo conectar con el profesor.");
  }
  if (!r.ok) {
    handleAuthExpiry(r.status);
    throw new ApiError(await errorDetail(r, `Error ${r.status}`), r.status);
  }
  return (await r.json()) as T;
}

/** Traza el mapa de hitos honesto de una meta de proceso (ej: monetizar un canal). */
export function iniciarMeta(
  objetivo: string,
  contexto: string,
  language: Language
): Promise<MetaProceso> {
  return cursoPost<MetaProceso>("meta/iniciar", { objetivo, contexto, language });
}

/** Las metas de proceso del alumno, para retomarlas sesión a sesión. */
export function listarMetas(): Promise<MetaProceso[]> {
  return cursoGet<MetaProceso[]>("metas");
}

/** Marca (o desmarca) un hito de una meta como logrado. */
export function marcarHito(
  metaId: string,
  indice: number,
  hecho: boolean
): Promise<MetaProceso> {
  return cursoPost<MetaProceso>("meta/hito", { meta_id: metaId, indice, hecho });
}

/** El profesor revisa la tarea y decide si el alumno superó la clase. */
export function verificarClase(
  cursoId: string,
  numeroClase: number,
  respuestasQuiz: number[],
  texto: string,
  language: Language
): Promise<VerificacionClase> {
  return cursoPost<VerificacionClase>("verificar", {
    curso_id: cursoId,
    numero_clase: numeroClase,
    respuestas_quiz: respuestasQuiz,
    texto,
    language,
  });
}
