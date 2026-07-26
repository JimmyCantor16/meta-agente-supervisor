// Tipos de autenticación con Google.

export interface AuthConfig {
  enabled: boolean;
  client_id: string;
}

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

// Estado de la cuenta por usuario (límites + licencia + admin).
export interface AccountStatus {
  sub: string;
  email: string;
  name: string;
  plan: string;
  requested_plan: string;
  paid: boolean;
  status: string;
  is_admin: boolean;
  generations_used: number;
  generations_limit: number;
  generations_remaining: number; // -1 = ilimitado
  lessons_used: number;
  lessons_limit: number;
  lessons_remaining: number;
}
