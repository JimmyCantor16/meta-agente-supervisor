# CLAUDE.md — Guía para trabajar en este proyecto con Claude

Este archivo orienta a Claude (y a colaboradores humanos) sobre cómo está
construido el proyecto y cómo extenderlo **respetando la arquitectura**.

## Qué es

Meta-Agente web que convierte una idea en un proyecto de software real y enseña
a completarlo. Backend FastAPI (arquitectura hexagonal) + Frontend React/TS/Tailwind
(feature-driven). IA vía proveedores gratuitos compatibles con OpenAI (Groq por
defecto), con **fallback multi-modelo**.

## Cómo correr / reconstruir

```bash
docker compose up --build            # levanta todo
docker compose up -d --build backend # reconstruye solo backend (cambios de código)
docker compose up -d --force-recreate backend  # recarga .env sin rebuild
docker compose logs -f backend       # logs
```
- Frontend: http://localhost:8080 · API/docs: http://localhost:8000/docs
- Type-check frontend: `cd frontend && npx tsc -b`
- Config y secretos: `backend/.env` (NO se versiona; ver `.env.example`).

## Arquitectura del backend (hexagonal) — REGLA PRINCIPAL

```
domain/         # NO importa nada de infraestructura ni de FastAPI
  entities.py   # modelos Pydantic puros
  ports.py      # interfaces abstractas (ABC) + errores de dominio
application/    # casos de uso; dependen SOLO de puertos (inyección por constructor)
infrastructure/
  adapters/     # implementaciones concretas de los puertos
  entrypoints/  # FastAPI (api.py, auth.py); resuelve la DI con Depends
```

**Para añadir una capacidad nueva de IA, sigue este patrón (ej. el auditor/profesor):**
1. `domain/entities.py`: entidad de salida (modelo Pydantic).
2. `domain/ports.py`: un `XxxPort(ABC)` con el método, y un error de dominio si aplica.
3. `application/xxx.py`: caso de uso que recibe el/los puerto(s) por constructor.
4. `infrastructure/adapters/llm_xxx.py`: adaptador real (usa `MultiModelLLM`).
5. `infrastructure/adapters/mock_xxx.py`: adaptador simulado (para `USE_MOCK_LLM=true`).
6. `infrastructure/entrypoints/api.py`: DTOs, providers `@lru_cache` (elige real/mock
   según `settings.use_mock_llm`), `Depends`, y la ruta.

## Regla de oro de la IA: `MultiModelLLM`

TODOS los adaptadores que llaman a un LLM usan
`infrastructure/adapters/multimodel_llm.py` (NO crean su propio cliente OpenAI).
`MultiModelLLM.chat_json(system, user)` prueba los proveedores de
`settings.resolved_providers` **en orden**; si uno da rate-limit/error, salta al
siguiente. Tiene throttling por proveedor (tier gratis de Groq ≈ 12k tokens/min).

- Config multi-modelo: `LLM_PROVIDERS` (JSON) en `.env`; si está vacío usa el
  `DEEPSEEK_*` único (nombres heredados; en realidad es genérico OpenAI-compat).

## Frontend (feature-driven)

- Estado por feature con hooks en `features/<feature>/hooks/` + componentes.
- **i18n obligatorio**: todo texto visible va en `src/i18n/translations.ts`, y hay
  que rellenarlo en **es Y en** (TypeScript falla si falta una clave).
- Llamadas HTTP en `src/lib/api.ts`; `ApiError` lleva `.status` (útil p. ej. 402=licencia).
- Tema **claro** (estilo Skywork). Colores de marca: `brand-*` en `tailwind.config.js`.

## Convenciones importantes

- **Mocks**: cada agente de IA tiene su mock; con `USE_MOCK_LLM=true` todo funciona
  sin gastar cupo. Úsalo para probar mecánica/UX.
- **Generación iterativa**: `iterative_project_generator.py` planifica → escribe por
  archivo → `_ensure_complete` (crea módulos importados que falten) → `_repair`.
  Mantén cada llamada pequeña por los límites del tier gratis.
- **Errores de dominio → HTTP**: los entrypoints traducen (`ValueError`→422,
  `PromptEvaluationError`/`AuditError`→502, `LicenseRequiredError`→402, etc.).
- **Peticiones con acentos**: al llamar la API desde scripts, envía el body en UTF-8
  (los acentos/ñ mal codificados dan 400 "error parsing the body").

## Gotchas conocidos

- **Groq free**: ~12.000 tokens/min y límites diarios. Si se agota, añade otro
  proveedor a `LLM_PROVIDERS` (Gemini/OpenRouter) — el fallback se encarga.
- **Login Google**: la app OAuth debe estar en **"En producción"** o el usuario
  agregado como **usuario de prueba**, o Google bloquea el acceso. El botón usa
  Google Identity Services; el `GOOGLE_CLIENT_ID` va en `.env` y el frontend lo lee
  de `GET /api/v1/auth/config`.
- **No versionar**: `.env`, `*.db`, `backend/generated/`, `backend/data/` (en `.gitignore`).

## Estado / roadmap

Hecho: multi-modelo, UI Skywork, login Google, licencia, modo profesor, memoria/RAG.
Pendiente: **app de escritorio** (Tauri recomendado — requiere instalar Rust; maneja
mejor el OAuth de Google que Electron). Futuro: escopar la licencia por usuario.
