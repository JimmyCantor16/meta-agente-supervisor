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
  plan_nombre?: string;
  ia_experta?: string;
  // --- Compra de un plan (opcionales: un backend antiguo no los manda) ---
  /** Precio en USD del plan solicitado (0 si no hay solicitud). */
  requested_amount_usd?: number;
  /** Referencia única del pago, MA-XXXXXX. */
  payment_ref?: string;
  /** Nº de comprobante/transacción que pegó el usuario. */
  payment_receipt?: string;
  requested_at?: string;
  approved_at?: string;
  /** Solo llega al super-admin. */
  approved_by?: string;
  /** Motivo del último rechazo o revocación. */
  rejection_reason?: string;
  /** Instrucciones de pago (solo con una solicitud pendiente). */
  payment_instructions?: string;
}
