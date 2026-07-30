"""Configuración de la aplicación validada desde el entorno (`.env`).

Usa `pydantic-settings` para garantizar un arranque fail-fast: si falta la
clave de API o un valor es inválido, el proceso no levanta y el error es claro.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class LLMProvider(BaseModel):
    """Un proveedor/modelo de IA en la cadena de fallback multi-modelo.

    Además de cómo conectarse, describe QUÉ SABE HACER y CUÁNTO AGUANTA, para
    que el enrutador mande cada tarea al modelo adecuado en vez de probar a
    ciegas: los modelos pequeños razonan y ordenan prompts, y los de ventana
    grande especializados en código escriben el proyecto.
    """

    name: str = Field(..., description="Etiqueta legible, p. ej. 'groq-70b'.")
    base_url: str = Field(..., description="URL base compatible con OpenAI.")
    api_key: str = Field(..., description="Clave de API del proveedor.")
    model: str = Field(..., description="Identificador del modelo.")

    # --- Qué sabe hacer ---
    # "prompt" = analizar/evaluar/enseñar (peticiones cortas, mucho razonamiento)
    # "code"   = escribir y reparar código (peticiones largas, contexto grande)
    # Vacío = sirve para todo (compatibilidad con configuraciones antiguas).
    roles: list[str] = Field(
        default_factory=list,
        description="Roles que atiende: 'prompt', 'code'. Vacío = todos.",
    )

    # --- Cuánto aguanta ---
    # Ventana de contexto: evita enviar una petición que se sabe que dará 413.
    # Ojo: es el límite REAL de la capa gratuita, no el del modelo. GitHub
    # Models sirve modelos de 128k pero su tier gratis corta la entrada en 8k.
    max_context: int | None = Field(
        default=None,
        description="Tokens máximos por petición. None = desconocido.",
    )
    max_tpm: int | None = Field(
        default=None,
        description="Tokens por minuto del plan gratuito. None = usa el global.",
    )
    max_rpm: int | None = Field(
        default=None,
        description="Peticiones por minuto permitidas. None = sin límite conocido.",
    )
    # Varios modelos de la MISMA cuenta comparten cuota (p. ej. los dos de
    # Mistral comparten los 500k tok/min de la cuenta). Si se deja vacío, cada
    # proveedor lleva su propia contabilidad.
    quota_group: str = Field(
        default="",
        description="Etiqueta de cuota compartida. Vacío = cuota propia.",
    )
    # Coste real de usarlo. Los proveedores con bolsa de créditos que NO se
    # renueva (NVIDIA) deben quedar al final: gastarlos es irreversible.
    exhaustible: bool = Field(
        default=False,
        description="True si consume una bolsa de créditos que no se renueva.",
    )

    @property
    def quota_key(self) -> str:
        """Clave con la que se contabiliza su consumo."""
        return self.quota_group or self.name

    def serves(self, role: str | None) -> bool:
        """Indica si este proveedor atiende el rol pedido."""
        return not self.roles or role is None or role in self.roles


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
    public_base_url: str = Field(
        default="",
        description=(
            "URL pública del backend (p. ej. https://mi-backend.onrender.com). "
            "Si se define, los MVP generados se entregan como "
            "<base>/preview/<slug>/ y se sirven a través del backend, en vez de "
            "una dirección a localhost que fuera del servidor no lleva a ningún "
            "sitio. Déjala vacía en desarrollo local."
        ),
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

    # --- Agente experto (IA de pago de los planes Studio y Business) ---
    # Sin clave, el experto queda inerte: el sistema funciona igual, solo con los
    # modelos gratuitos. Encenderlo es pegar la clave aquí.
    anthropic_api_key: str = Field(
        default="",
        description="Clave de Anthropic. Vacío = el agente experto está apagado.",
    )
    experto_modelo: str = Field(
        default="claude-opus-4-8",
        description="Modelo del agente experto. Baja a claude-haiku-4-5 para abaratar.",
    )
    experto_simulado: bool = Field(
        default=False,
        description="True = usa el experto SIMULADO (prueba la mecánica sin gastar).",
    )
    # Experto DELEGADO: el juicio lo escribe una persona en un JSON. Permite
    # responder «¿se nota la diferencia entre planes?» antes de tener clave, con
    # un juicio de verdad y además reproducible.
    experto_archivo: str = Field(
        default="",
        description="Ruta a un JSON con el juicio del experto. Tiene prioridad sobre la clave.",
    )
    experto_carpeta_gasto: str = Field(
        default="data/gasto-experto",
        description="Dónde se lleva la cuenta del gasto mensual por usuario.",
    )

    # --- Login con Google (OAuth) ---
    github_client_id: str = Field(
        default="",
        description="Client ID de la app OAuth de GitHub. Vacío = login de GitHub apagado.",
    )
    github_client_secret: str = Field(
        default="",
        description="Client Secret de la app OAuth de GitHub.",
    )
    session_secret: str = Field(
        default="",
        description=(
            "Clave con la que el backend firma las sesiones propias (login de "
            "GitHub). Si se deja vacía se genera una al arrancar, lo que cierra "
            "las sesiones en cada reinicio: defínela en producción."
        ),
    )
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
