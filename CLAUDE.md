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

**Si el adaptador exige una forma exacta, pasa el contrato al bucle:**

```python
self._llm.chat_json(SYSTEM, user, validar=MiEntidad.model_validate)
```

`validar` corre DENTRO del fallback: si un proveedor devuelve JSON parseable
pero con la forma equivocada, cuenta como fallo SUYO y lo intenta el siguiente.
Validar después de `chat_json` (con un `model_validate` suelto) es un bug: basta
un modelo caprichoso para tumbar la petición aunque queden proveedores sanos —
así estuvo caído `/evaluate` al 100% en agosto de 2026, con `mistral-small`
devolviendo `prompt_final_optimizado` como objeto en vez de string.

No lo pongas si el adaptador ya es **defensivo** (`data.get(...)` con valores por
defecto, como `llm_diagnostico_mvp` o `skeleton_generator`): esos degradan a
propósito y un validador estricto los volvería más frágiles, no menos.

## Frontend (feature-driven)

- Estado por feature con hooks en `features/<feature>/hooks/` + componentes.
- **i18n obligatorio**: todo texto visible va en `src/i18n/translations.ts`, y hay
  que rellenarlo en **es Y en** (TypeScript falla si falta una clave).
- Llamadas HTTP en `src/lib/api.ts`; `ApiError` lleva `.status` (útil p. ej. 402=licencia).

## Sistema de diseño (tema claro) — REGLA VISUAL

Los tokens viven en `frontend/tailwind.config.js`. **No inventes valores sueltos**:
si necesitas un color, radio o sombra, sale de ahí.

- **Un solo color de marca** (`brand-600` = `#027E6F`) y **cero gradientes**. El
  color solo aparece en CTA, links y estado activo; su fuerza viene de la escasez.
  `accent` (`#00E0AC`) es para resaltados puntuales, nunca fondo de texto.
- **Texto**: `ink` (titulares) / `ink-body` (cuerpo) / `ink-muted` / `ink-faint`.
  Nunca `slate-*` ni negro puro: los grises del sistema van con tinte azulado.
- **Radios**: 6px (`rounded`) es la base; `rounded-lg` (8px) para tarjetas. Los
  radios grandes leen como plantilla.
- **Sombras**: `shadow-card` y `shadow-float`, teñidas (#878DA2). Nunca negras.
- **Titulares**: usa `text-display` / `text-title` / `text-heading`, que ya
  empaquetan tamaño + interlineado ajustado + tracking −1% + peso intermedio.
- **Iconos**: `lucide-react`, monocromos y heredando el color del texto. Los
  emojis **no** son iconografía (sí valen dentro de una frase, como tono).
- Inter se carga como fuente **variable** desde `index.html`. Los pesos
  intermedios (620/670) dependen de eso; con la estática se redondean.

`ProfesorChat.tsx` es la pantalla de referencia ya migrada. El resto se migra
pantalla por pantalla siguiendo ese ejemplo.

## Convenciones importantes

- **Mocks**: cada agente de IA tiene su mock; con `USE_MOCK_LLM=true` todo funciona
  sin gastar cupo. Úsalo para probar mecánica/UX.
- **Generación iterativa**: `iterative_project_generator.py` planifica → escribe por
  archivo → `_ensure_complete` (crea módulos importados que falten) → `_repair`.
  Mantén cada llamada pequeña por los límites del tier gratis.
- **Lo mismo vale para CUALQUIER salida larga**, no solo el código. El temario se
  pedía entero de una vez (18 clases con quiz ≈ 20k tokens) y volvía cortado una
  de cada tres veces; ahora `llm_generador_syllabus.py` hace 1 llamada de índice
  + lotes de 4 clases, y si un lote falla esas clases se quedan con su título en
  vez de perderse el curso. Si añades algo que devuelva una lista larga, trocéalo
  desde el principio.

## Qué debe cumplir un MVP generado

Estas reglas viven en los prompts de `iterative_project_generator.py` y, las que
se pueden comprobar, en los verificadores. Si tocas una, tócala en ambos sitios.

- **Base de datos**: SQLite por defecto; si el encargo pide **MySQL o PostgreSQL
  explícitamente, se usa ese motor**. El entorno de verificación levanta ambos de
  verdad y le presta una base al proyecto (`db_verificacion.py` + los servicios
  `verify-postgres`/`verify-mysql` del compose). La conexión se lee del entorno
  (`DATABASE_URL`, `DB_HOST`…), nunca fija en el código. Siguen prohibidos Mongo,
  Redis y las colas: no hay entorno que los preste.
- **El esquema se crea al arrancar** y se siembran los datos si las tablas están
  vacías. Es el fallo que más veces ha dejado un sistema inservible (`no such
  table: X` en toda la API).
- **Login y registro son DOS pantallas separadas**, con rutas y archivos propios,
  validación en el cliente antes de enviar, el error pegado al campo que falla y
  el botón deshabilitado hasta que el formulario sea válido. El servidor revalida
  siempre y las contraseñas van con hash.
- **Se entrega funcionando, no como esqueleto**: CRUD completo por entidad,
  8-15 registros de semilla creíbles, estados vacíos/carga/error resueltos, y
  nada decorativo (si un botón no lleva a algo que funciona, no se dibuja).
- Los verificadores comprueban que la API no dé 500 **y que no esté vacía**: si
  todas las rutas de listado devuelven `[]`, se manda a reparar con el encargo de
  sembrar datos. Solo salta si están vacías TODAS (≥2), para no perseguir
  fantasmas con un buscador legítimamente vacío.
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
