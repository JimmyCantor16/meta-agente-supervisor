"""Configuración de la aplicación validada desde el entorno (`.env`).

Usa `pydantic-settings` para garantizar un arranque fail-fast: si falta la
clave de API o un valor es inválido, el proceso no levanta y el error es claro.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class LLMProvider(BaseModel):
    """Un proveedor/modelo de IA en la cadena de fallback multi-modelo."""

    name: str = Field(..., description="Etiqueta legible, p. ej. 'groq-70b'.")
    base_url: str = Field(..., description="URL base compatible con OpenAI.")
    api_key: str = Field(..., description="Clave de API del proveedor.")
    model: str = Field(..., description="Identificador del modelo.")


class Settings(BaseSettings):
    """Ajustes tipados leídos de variables de entorno / archivo `.env`."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Proveedor único (compatibilidad) ---
    deepseek_api_key: str = Field(..., min_length=10, description="Clave de API del proveedor por defecto.")
    deepseek_base_url: str = Field(default="https://api.deepseek.com")
    deepseek_model: str = Field(default="deepseek-chat")
    deepseek_temperature: float = Field(default=0.2, ge=0.0, le=2.0)

    # --- Multi-modelo (fallback) ---
    # Lista JSON de proveedores gratuitos que se prueban EN ORDEN. Si el primero
    # se queda sin cupo o da rate-limit, el agente salta al siguiente. Si está
    # vacía, se usa el proveedor único de arriba.
    llm_providers: list[LLMProvider] = Field(
        default_factory=list,
        description="Cadena de proveedores para fallback multi-modelo.",
    )

    # --- Red ---
    request_timeout: float = Field(default=45.0, gt=0.0)
    max_retries: int = Field(default=3, ge=0, le=10)

    # --- Persistencia (memoria del agente) ---
    db_path: str = Field(
        default="evaluations.db",
        description="Ruta del archivo SQLite donde se guardan las evaluaciones.",
    )
    # En despliegues cloud (Render) el disco es efímero: un archivo SQLite se
    # perdería en cada deploy. Si esta variable trae una URL de PostgreSQL, los
    # repositorios usan los adaptadores Postgres en vez de los SQLite.
    database_url: str = Field(
        default="",
        description="URL de PostgreSQL. Vacío = usar SQLite local (`db_path`).",
    )
    # URL interna de Redis (caché/estado compartido entre instancias). Opcional.
    redis_url: str = Field(
        default="",
        description="URL de Redis. Vacío = sin caché distribuida.",
    )

    @property
    def uses_postgres(self) -> bool:
        """True si hay que persistir en PostgreSQL en lugar de SQLite."""
        return self.database_url.startswith(("postgres://", "postgresql://"))

    # --- Agente que construye (proyectos generados) ---
    generated_dir: str = Field(
        default="generated",
        description="Carpeta donde se escriben los proyectos generados.",
    )
    generated_public_host: str = Field(
        default="localhost",
        description="Host con el que se construye la URL de los proyectos arrancados.",
    )

    # --- Licencia / modelo de negocio ---
    free_generation_limit: int = Field(
        default=3,
        ge=1,
        description="Proyectos gratis por usuario antes de requerir pago.",
    )
    free_lesson_limit: int = Field(
        default=3,
        ge=1,
        description="Clases (Modo Profesor) gratis por usuario antes de requerir pago.",
    )
    license_keys: str = Field(
        default="META-PRO-2026",
        description="Claves de licencia globales válidas (modo legacy).",
    )
    super_admin_emails: str = Field(
        default="",
        description="Emails de super-admin (aprueban pagos), separados por comas.",
    )

    @property
    def license_keys_list(self) -> list[str]:
        """Lista de claves de licencia válidas."""
        return [k.strip() for k in self.license_keys.split(",") if k.strip()]

    @property
    def super_admin_emails_list(self) -> list[str]:
        """Lista de emails de super-admin."""
        return [e.strip() for e in self.super_admin_emails.split(",") if e.strip()]

    # --- Modo simulado (pruebas sin saldo de DeepSeek) ---
    use_mock_llm: bool = Field(
        default=False,
        description="Si es True, usa un evaluador falso en vez de llamar a DeepSeek.",
    )

    # --- Login con Google (OAuth) ---
    google_client_id: str = Field(
        default="",
        description="Client ID de Google OAuth. Vacío = login deshabilitado.",
    )

    # --- Observabilidad ---
    log_level: str = Field(default="INFO")

    # --- CORS (frontend) ---
    # Orígenes permitidos para el frontend, separados por comas.
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        description="Orígenes CORS permitidos, separados por comas.",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Convierte la cadena de orígenes CORS en una lista limpia."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_providers(self) -> list[LLMProvider]:
        """Devuelve la cadena de proveedores a usar (fallback multi-modelo).

        Si `llm_providers` está configurada, la usa; si no, construye un único
        proveedor a partir de la config `deepseek_*` (compatibilidad).
        """
        if self.llm_providers:
            return self.llm_providers
        return [
            LLMProvider(
                name="default",
                base_url=self.deepseek_base_url,
                api_key=self.deepseek_api_key,
                model=self.deepseek_model,
            )
        ]


@lru_cache
def get_settings() -> Settings:
    """Devuelve una instancia única (singleton) de `Settings`."""
    return Settings()  # type: ignore[call-arg]
