// Cliente HTTP mínimo hacia el backend.
// En desarrollo, las peticiones a `/api` se redirigen al backend FastAPI
// mediante el proxy de Vite (ver vite.config.ts).

import type { AccountStatus, AuthConfig, AuthUser } from "../features/auth/types";
import type {
  AuditResult,
  EvaluationResult,
  GenerateResult,
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
  language: Language
): Promise<GenerateResult> {
  let response: Response;

  try {
    response = await fetch(GENERATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ prompt, language }),
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
 * Lista los proyectos generados (para la galería). Nunca lanza: devuelve [].
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const response = await fetch(PROJECTS_ENDPOINT);
    if (!response.ok) return [];
    return (await response.json()) as ProjectSummary[];
  } catch {
    return [];
  }
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
