"""Configuración de la aplicación validada desde el entorno (`.env`).

Usa `pydantic-settings` para garantizar un arranque fail-fast: si falta la
clave de API o un valor es inválido, el proceso no levanta y el error es claro.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

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
    # Cómo se le habla. "openai" = API compatible con OpenAI (casi todos);
    # "deepseek_web" = el servicio local `deepseek-web-chat`, que habla con
    # chat.deepseek.com usando la sesión web de la máquina (sin API key);
    # "opencode_cli" = el CLI de OpenCode (`base_url` = ruta del binario).
    kind: str = Field(
        default="openai",
        description="Protocolo: 'openai' (compatible OpenAI), 'deepseek_web' u 'opencode_cli'.",
    )
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

    # --- DeepSeek prioritario (local por la web, o remoto por API) ---
    # "local"  = el servicio `deepseek-web-chat` corriendo en esta máquina (la
    #            segunda terminal). Usa la cuenta web de DeepSeek: sin clave y
    #            sin coste. NO existe en Render: allí va "off" o "remote".
    # "remote" = un endpoint compatible con OpenAI que sirva DeepSeek (la API
    #            oficial u otro proveedor), con su clave.
    # "off"    = la cadena de siempre, sin DeepSeek delante.
    # En los dos primeros modos DeepSeek va PRIMERO en la cadena; si no
    # responde, el fallback sigue con el resto como hasta ahora.
    deepseek_mode: str = Field(
        default="off",
        description="'local' (deepseek-web-chat), 'remote' (API) u 'off'.",
    )
    # Vacía = la de cada modo: http://127.0.0.1:6174 en local (desde Docker,
    # http://host.docker.internal:6174) y https://api.deepseek.com en remoto.
    deepseek_api_url: str = Field(
        default="",
        description="URL de DeepSeek. Vacía = la por defecto del modo.",
    )
    deepseek_remote_key: str = Field(
        default="",
        description="Clave del endpoint remoto de DeepSeek (solo modo 'remote').",
    )
    deepseek_remote_model: str = Field(default="deepseek-chat")
    # Una respuesta por la web (sin streaming) llega entera de una vez: un
    # archivo de código largo tarda bastante más que por una API.
    deepseek_web_timeout: float = Field(default=180.0, gt=0.0)
    # Es la cuenta personal de quien desarrolla: se le pide con mesura.
    deepseek_web_rpm: int = Field(default=10, ge=1)

    # --- OpenRouter: SOLO modelos gratuitos ---
    # Con la clave, estos modelos entran al FINAL de la cadena como red de
    # seguridad. Solo se aceptan ids `:free` y el enrutador `openrouter/free`:
    # cualquier otro se descarta con un aviso, para que un error de tecleo no
    # empiece a gastar saldo.
    openrouter_api_key: str = Field(default="", description="Clave de OpenRouter. Vacía = apagado.")
    openrouter_models: str = Field(
        default="openrouter/free,nvidia/nemotron-3.5-lightning:free,google/gemma-4-31b-it:free",
        description="Modelos gratuitos de OpenRouter, separados por comas, en orden.",
    )

    # --- OpenCode: último respaldo gratis, SOLO en las máquinas del equipo ---
    # "auto" = entra al final de la cadena si el binario de OpenCode está en
    # esta máquina (en Docker/Render no está, así que allí no aparece); "off" =
    # nunca. Es lento (~30-60 s por respuesta): solo responde cuando todo lo
    # demás falló. Ver `adapters/opencode_cli_client.py`.
    opencode_mode: str = Field(default="auto", description="'auto' u 'off'.")
    # DeepSeek gratis vía OpenCode (42 s frente a ~95 s de `big-pickle`).
    opencode_model: str = Field(default="opencode/deepseek-v4.1-flash-free")
    opencode_bin: str = Field(default="", description="Ruta del binario. Vacía = el del PATH.")
    opencode_timeout: float = Field(default=150.0, gt=0.0)

    # --- Red ---
    request_timeout: float = Field(default=45.0, gt=0.0)
    max_retries: int = Field(default=3, ge=0, le=10)

    # --- Persistencia (memoria del agente) ---
    # Sin PostgreSQL, este archivo es TODA la memoria del sistema: usuarios,
    # licencias, cupos, cursos, progreso, despliegues, trabajos y actividad.
    # En un PaaS hay que apuntarlo DENTRO del disco persistente (en Render,
    # `/app/generated/metaagente.db`; ver render.yaml): el valor por defecto es
    # relativo al directorio de trabajo, que en el contenedor es efímero y se
    # borra en cada deploy y en cada reinicio.
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
    # Cada cuántas horas se copia el SQLite (0 = nunca). Mientras esa base sea
    # TODA la memoria del sistema, una copia diaria es la diferencia entre un
    # susto y volver a empezar: el disco sobrevive a un deploy, pero no a un
    # borrado, a una migración a medias ni a que haya que recrear el servicio.
    respaldo_db_horas: float = Field(
        default=24.0,
        ge=0.0,
        description="Cada cuántas horas respaldar el SQLite. 0 = desactivado.",
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

    # --- Publicación automática (GitHub + Render) ---
    # Con esta clave el agente publica cada MVP como servicio PROPIO en Render
    # (repo en GitHub + web service, plan free). Las credenciales de GitHub
    # reutilizan las GITHUB_TOKEN/GITHUB_OWNER ya existentes (entrega en rama).
    render_api_key: str = Field(
        default="",
        description=(
            "API key de Render (Account Settings → API Keys). Vacía = la "
            "publicación automática queda apagada; el resto funciona igual."
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

    # --- Orquesta: agente CLI local y revisión automática de entregas ---
    # El agente CLI (Claude Code) usa la sesión YA logueada de la máquina: el
    # coste va contra la suscripción local, no contra una bolsa de créditos.
    claude_cli_bin: str = Field(
        default="",
        description=(
            "Ruta o nombre del CLI de Claude Code. Vacío = se resuelve por la "
            "variable CLAUDE_CLI_BIN o buscando 'claude' en el PATH."
        ),
    )
    revision_automatica: str = Field(
        default="auto",
        description=(
            "Revisión de cada entrega en rama por el agente CLI: 'auto' = se "
            "lanza en segundo plano si el agente está disponible; 'no' = apagada."
        ),
    )
    revision_publica_si_calidad: int = Field(
        default=0,
        ge=0,
        le=10,
        description=(
            "Umbral (1-10) para publicar automáticamente una entrega APROBADA "
            "por la revisión. 0 = nunca publicar automáticamente."
        ),
    )

    # --- App de escritorio (aviso de versión nueva) ---
    # El escritorio es un webview con el frontend HORNEADO en el instalador:
    # no se actualiza solo. El frontend compara su versión horneada con esta y,
    # si hay una más nueva Y una URL de descarga, muestra el aviso.
    version_escritorio: str = Field(
        default="1.1.0",
        description="Última versión publicada de la app de escritorio (semver).",
    )
    url_descarga_escritorio: str = Field(
        default="",
        description=(
            "URL de descarga del instalador de escritorio. Vacía = todavía no "
            "hay instalador publicado y el aviso de actualización queda mudo."
        ),
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

        Orden: DeepSeek (si `deepseek_mode` lo enciende) → `llm_providers` (o,
        si está vacía, el proveedor único `deepseek_*` de compatibilidad) → los
        gratuitos de OpenRouter. De la parte central se podan los proveedores
        que ya no pueden responder (ver `_proveedor_retirado`).
        """
        base = self.llm_providers or [
            LLMProvider(
                name="default",
                base_url=self.deepseek_base_url,
                api_key=self.deepseek_api_key,
                model=self.deepseek_model,
            )
        ]
        cadena: list[LLMProvider] = []
        for p in [*self._proveedores_deepseek(), *base, *self._proveedores_openrouter(),
                  *self._proveedores_opencode()]:
            p = _con_modelo_vigente(p)
            motivo = _proveedor_retirado(p)
            if motivo:
                _avisar_una_vez(f"Proveedor '{p.name}' descartado de la cadena: {motivo}.")
                continue
            if any(q.name == p.name for q in cadena):
                continue
            cadena.append(p)
        return cadena or base

    def _proveedores_deepseek(self) -> list[LLMProvider]:
        modo = self.deepseek_mode.strip().lower()
        if modo == "local":
            return [
                LLMProvider(
                    name="deepseek-web",
                    kind="deepseek_web",
                    base_url=self.deepseek_api_url or "http://127.0.0.1:6174",
                    api_key="sesion-web",
                    model="deepseek-web",
                    roles=["prompt", "code"],
                    # `/api/deepseek/stream` recorta el prompt a 50.000
                    # caracteres: por encima, la petición ni se intenta.
                    max_context=12_000,
                    max_tpm=200_000,
                    max_rpm=self.deepseek_web_rpm,
                )
            ]
        if modo == "remote":
            if not self.deepseek_remote_key:
                _avisar_una_vez("DEEPSEEK_MODE=remote sin DEEPSEEK_REMOTE_KEY: DeepSeek queda fuera.")
                return []
            return [
                LLMProvider(
                    name="deepseek-remote",
                    base_url=self.deepseek_api_url or "https://api.deepseek.com",
                    api_key=self.deepseek_remote_key,
                    model=self.deepseek_remote_model,
                    roles=["prompt", "code"],
                    max_context=60_000,
                    max_tpm=200_000,
                )
            ]
        if modo not in ("", "off"):
            _avisar_una_vez(f"DEEPSEEK_MODE='{self.deepseek_mode}' no existe (local|remote|off): se ignora.")
        return []

    def _proveedores_openrouter(self) -> list[LLMProvider]:
        if not self.openrouter_api_key:
            return []
        modelos = [m.strip() for m in self.openrouter_models.split(",") if m.strip()]
        return [
            LLMProvider(
                name=f"openrouter-{m.split('/')[-1].removesuffix(':free')}",
                base_url=_OPENROUTER_URL,
                api_key=self.openrouter_api_key,
                model=m,
                roles=["prompt", "code"],
                # Los gratuitos de OpenRouter comparten un tope por cuenta
                # (20 peticiones/minuto), no uno por modelo.
                quota_group="openrouter-free",
                max_rpm=20,
                max_context=100_000,
            )
            for m in modelos
        ]

    def _proveedores_opencode(self) -> list[LLMProvider]:
        if self.opencode_mode.strip().lower() != "auto":
            return []
        from src.infrastructure.adapters.opencode_cli_client import ejecutable_opencode

        exe = ejecutable_opencode(self.opencode_bin)
        if not exe:
            return []
        return [
            LLMProvider(
                name="opencode",
                kind="opencode_cli",
                base_url=exe,
                api_key="cli",
                model=self.opencode_model,
                roles=["prompt", "code"],
                max_context=6_000,
                max_rpm=4,
            )
        ]

    def model_post_init(self, __context: object) -> None:
        """Garantiza que la carpeta de `db_path` existe antes de abrir el SQLite.

        Los repositorios hacen `sqlite3.connect(db_path)` directamente, y sqlite
        NO crea directorios: si la ruta apunta a una carpeta que todavía no
        existe, el arranque muere con «unable to open database file» y la API
        contesta 500 a todo. Mover la base al disco persistente (`DB_PATH=
        /app/generated/...`) hace justamente eso, así que la garantía va aquí,
        una sola vez, en vez de repetirla en cada adaptador.

        Nunca lanza: si el directorio no se puede crear (permisos, disco de solo
        lectura), el error real lo dará sqlite con su propio mensaje.
        """
        try:
            carpeta = Path(self.db_path).expanduser().parent
            if str(carpeta) not in ("", "."):
                carpeta.mkdir(parents=True, exist_ok=True)
        except OSError:  # noqa: S110 - deliberado: el fallo real lo reporta sqlite
            pass


_OPENROUTER_URL = "https://openrouter.ai/api/v1"

#: GitHub retiró sus Models: todo lo que apunte ahí devuelve 410 Gone. En
#: producción eran los dos PRIMEROS del rol `prompt` y cobraban un viaje cada
#: uno en cada arranque; se podan aquí para no depender de que alguien edite
#: el panel de Render.
_HOSTS_RETIRADOS = ("models.inference.ai.azure.com", "models.github.ai")

#: Groq retiró sus Llama (404 `model_not_found`, comprobado el 27-oct-2026):
#: con ellos producción se quedó con UN solo modelo vivo. Si el panel o un
#: `.env` viejo aún los nombran, se cambian por el sucesor en vez de pagar el
#: viaje y perder el proveedor (la misma tabla que usa soporte-ia-linkysign).
_MODELOS_VIGENTES = {
    "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
    "llama-3.1-8b-instant": "qwen/qwen3.8-27b",
}

_avisados: set[str] = set()


def _con_modelo_vigente(p: LLMProvider) -> LLMProvider:
    sucesor = _MODELOS_VIGENTES.get(p.model) if "api.groq.com" in p.base_url else None
    if not sucesor:
        return p
    _avisar_una_vez(f"Proveedor '{p.name}': '{p.model}' está retirado, se usa '{sucesor}'.")
    return p.model_copy(update={"model": sucesor})


def _avisar_una_vez(mensaje: str) -> None:
    """La cadena se resuelve muchas veces por proceso: el aviso, una sola."""
    if mensaje not in _avisados:
        _avisados.add(mensaje)
        logging.getLogger(__name__).warning(mensaje)


def _proveedor_retirado(p: LLMProvider) -> str:
    """Motivo por el que un proveedor no debe entrar en la cadena ('' = entra)."""
    if any(host in p.base_url for host in _HOSTS_RETIRADOS):
        return "GitHub Models está retirado (410 Gone)"
    if "openrouter.ai" in p.base_url and not (p.model.endswith(":free") or p.model == "openrouter/free"):
        return f"'{p.model}' no es un modelo gratuito de OpenRouter (solo se admiten ':free')"
    return ""


@lru_cache
def get_settings() -> Settings:
    """Devuelve una instancia única (singleton) de `Settings`."""
    return Settings()  # type: ignore[call-arg]
