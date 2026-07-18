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
