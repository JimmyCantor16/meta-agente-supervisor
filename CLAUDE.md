# CLAUDE.md — Guía para trabajar en este proyecto con Claude

Este archivo orienta a Claude (y a colaboradores humanos) sobre cómo está
construido el proyecto y cómo extenderlo **respetando la arquitectura**.

## Qué es

Meta-Agente web que convierte una idea en un proyecto de software real, **lo
publica en internet** y enseña a completarlo. Backend FastAPI (arquitectura
hexagonal) + Frontend React/TS/Tailwind (feature-driven), más un móvil Flutter
y un escritorio Tauri que hablan con el MISMO backend. IA vía proveedores
gratuitos compatibles con OpenAI (Groq por defecto), con **fallback
multi-modelo**, y un **agente CLI local** (Claude Code) para el trabajo pesado
en las máquinas del equipo.

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

## Agente CLI local: `AgenteCliPort` / `ClaudeCliAgent`

Segundo motor de IA, aparte del multi-modelo: `ClaudeCliAgent`
(`adapters/claude_cli_agent.py`) lanza `claude -p` por `subprocess` usando la
sesión YA logueada de la máquina (patrón heredado de `ripor-extracccion`), así
que el coste va contra la suscripción local y no contra una bolsa de créditos.
Puerto en `domain/ports.py` (`AgenteCliPort`: `disponible`, `probar`,
`ejecutar`, `ejecutar_stream`), error de dominio `AgenteCliError`, y mock
`MockClaudeCli` cuando `USE_MOCK_LLM=true`.

**REGLA DE ORO (costó un bug entero): `validar` es un CHEQUEO y su retorno se
DESCARTA.** `ejecutar()` devuelve el **dict**, nunca la entidad — exactamente
igual que `MultiModelLLM.chat_json`. Quien consuma construye la entidad él:

```python
datos = agente.ejecutar(SYSTEM, user, validar=VeredictoRevision.model_validate)
veredicto = VeredictoRevision.model_validate(datos)   # ← SIEMPRE, aquí
```

Dar por hecho lo contrario (`isinstance(resultado, VeredictoRevision)`) no da
True JAMÁS: así estuvo la revisión automática de entregas muerta al 100% sin
que saltara ninguna alarma, porque el `isinstance` fallaba en silencio. Ver
`revision_entregas._veredicto_desde` como referencia de cómo se hace bien.

Seguridad, innegociable:
- **Nunca** se pasa `--dangerously-skip-permissions`.
- `allowed_tools` sale de una **lista blanca fija** (`Read`, `Write`, `Edit`,
  `Glob`, `Grep` — **Bash NO está**); pedir otra cosa es error, no se filtra en
  silencio. El `cwd` lo confina el llamador a `generated/<slug>`.
- Encoding explícito (`utf-8`) en todo subprocess: en Windows, `text=True` sin
  `encoding` deja mojibake en las tildes.

**En Docker/Render NO existe el binario `claude`.** Por eso la revisión
automática de entregas solo corre en las máquinas del equipo: si
`disponible()` es False (o `REVISION_AUTOMATICA=no`), se degrada con un `log
INFO` y la entrega sigue su curso — nunca es un error ni rompe `/generate`.

## Publicación autónoma: de carpeta a URL viva (fase 1)

El agente publica el MVP él solo, sin que nadie toque el dashboard.

- `DesplieguePort` + `DespliegueRepositoryPort` (`domain/ports.py`), error de
  dominio `DespliegueError` (→ 502), entidad `InfoDespliegue` con estado
  `en_curso | vivo | fallido | caido`.
- `adapters/render_deploy.py` (`RenderDeployAdapter`): copia el proyecto a una
  carpeta temporal **fuera de todo árbol git**, detecta el stack y escribe un
  Dockerfile genérico, crea/reutiliza el repo en GitHub por API REST (nada de
  CLI `gh`: no existe en el contenedor), crea o redespliega un web service
  Docker plan free en Render, y hace poll cada 15 s hasta `live` (tope ~15 min).
  Ningún secreto se loguea: las URLs con token se redactan antes de reportar.
  Mock: `mock_render_deploy.py`.
- `POST /api/v1/agent/projects/{slug}/publicar` responde **202** al instante y
  el deploy corre en una tarea de fondo; el progreso viaja por el WebSocket y
  la verdad del resultado vive en `GET /api/v1/agent/despliegues`.
- Los despliegues se persisten (SQLite, uno vigente por slug) y un **bucle de
  auditoría cada 30 min** vuelve a llamar a cada URL: lo que dejó de responder
  pasa a `caido`, y un `en_curso` huérfano (>45 min) a `fallido`, para que la
  lista no mienta nunca.

**Credenciales SOLO por entorno**: `RENDER_API_KEY`, `GITHUB_TOKEN`,
`GITHUB_OWNER`. Se comprueban ANTES de aceptar el encargo: si falta alguna, la
ruta devuelve un **503 limpio** diciendo cuál — no un crash ni un fallo mudo
descubierto media hora después en la lista de despliegues.

## Trabajos de fondo y bandeja de entregas

- **`TrabajoFondo` + `TrabajosRepositoryPort`**: generalización del `estado.json`
  de ripor. Todo lo que tarda (revisión de una entrega, publicación…) queda
  registrado y se consulta en `GET /api/v1/agent/trabajos` (y `/trabajos/{id}`).
  Sobrevive a un refresh del navegador y a un reinicio del proceso: es la
  respuesta persistente a «¿cómo va lo mío?».
- **Bandeja de entregas** (`application/bandeja_entregas.py`): `GET
  /api/v1/agent/entregas` lista las ramas `agente/<slug>` que esperan decisión,
  con el resumen del informe y el veredicto del revisor ya masticados para
  decidir **desde el teléfono**. Aprobar = `merge --no-ff` real, ejecutado en un
  **worktree temporal desacoplado** (el working tree del proyecto no se toca);
  un conflicto → 409 y la entrega queda pendiente. Rechazar = se borra la rama
  sin merge y queda constancia en `data/entregas_rechazadas.jsonl`.

## Modo profesor adaptativo (fase 3)

- **El nivel vive en el USUARIO, no en el curso** (`UserRepositoryPort.get_nivel`
  / `set_nivel`, no abstractos a propósito para no romper repos antiguos): viaja
  entre cursos, así que el segundo curso ya no vuelve a preguntar. Se **reajusta
  con evidencia** tras cada clase (`reajustar_nivel`, pura y testeable: sube o
  baja UN escalón por racha de aciertos a la primera o fallos seguidos, y
  resetea los contadores). El temario lee el nivel por **callable** en cada lote,
  así un reajuste a mitad calibra las clases que aún faltan por escribir.
- **La clase de tipo `cambio` exige un commit REAL** del alumno (`GitAlumnoPort`
  → `adapters/git_alumno.py`), posterior al inicio de la clase y tocando
  `criterio.archivo` si lo hay. La reflexión se sigue pidiendo —explicar lo que
  hiciste es parte de aprender— pero como **complemento**: sola ya no supera la
  clase. Sin el puerto (mocks, cursos de tema libre) se conserva el juicio por
  reflexión de siempre.
- `Clase.reto_avanzado`: desafío extra que el generador solo rellena para nivel
  medio/alto y que el profesor solo menciona si el nivel VIGENTE es alto.
- **Racha y camino**: `ActividadRepositoryPort` guarda una fila por
  (usuario, día) — solo QUE estuvo, no qué hizo — y `GET /api/v1/agent/camino`
  arma racha, cursos, certificados y próximo paso **en el servidor** (nada de
  contadores en el cliente). Ojo con la zona horaria: se escribe y se lee con la
  fecha LOCAL del servidor; mezclar UTC al leer partiría rachas reales de noche.
- El aula (`AulaEnVivo` + `EditorCodigo`) trae **CodeMirror**: el alumno edita,
  compila y el commit queda — que es justo la evidencia que pide la clase.

## Privacidad entre usuarios — REGLA

**Todo listado o difusión que pueda cruzar usuarios filtra por dueño.** El
criterio único es `adapters/duenos_proyecto`: `es_suyo(ruta, sub, es_admin)` y
`dueno_de(ruta)` — el dueño manda, un proyecto sin marca sigue siendo visible
(compatibilidad), y el admin lo ve todo.

- Se aplica ya en la galería de proyectos, en `GET /agent/despliegues`, en la
  bandeja de entregas y en `/trabajos` (un trabajo de otro da **404**, el mismo
  que si no existiera: no se filtra ni la existencia).
- `DIFUSOR.difundir(texto, dueno)` va **SIEMPRE con dueño**. Sin dueño, el aviso
  se reparte entre TODOS los conectados: así se le contó a cualquiera el nombre
  y la URL del sistema de otro. Dos fugas reales entraron por olvidar esto —
  una en la lista de despliegues y otra en los avisos del WebSocket.

Si añades una ruta que lista algo del servidor o un aviso que sale por el
WebSocket, el filtro por dueño es parte de la ruta, no un extra.

## Frontend (feature-driven)

- Estado por feature con hooks en `features/<feature>/hooks/` + componentes.
- **i18n obligatorio**: todo texto visible va en `src/i18n/translations.ts`, y hay
  que rellenarlo en **es Y en** (TypeScript falla si falta una clave).
- Llamadas HTTP en `src/lib/api.ts`; `ApiError` lleva `.status` (útil p. ej. 402=licencia).
- La web es **PWA instalable** (`vite-plugin-pwa`, ver `vite.config.ts`). Regla
  del service worker: `/api/**` va `NetworkOnly` y `/api/**` + `/preview/**`
  están en el `navigateFallbackDenylist` — cachear ahí rompía licencias y
  progreso, y devolvía el shell del Meta-Agente en vez del MVP del usuario.
- **Escritorio**: se construye con `desktop/build-desktop.ps1` (Tauri, modo
  nube: la ventana carga el frontend y habla con el backend compartido). El
  script **hornea** `VITE_API_URL` y `VITE_APP_VERSION` en el build — sin la
  primera, TODO el REST muere dentro de la app. `AvisoVersion.tsx` compara la
  versión horneada contra `GET /api/v1/agent/version-escritorio` y avisa de la
  descarga; esa versión debe coincidir con `tauri.conf.json`, `Cargo.toml`,
  `package.json` y `VERSION_ESCRITORIO` del backend, o el aviso sale para un
  instalador que todavía no existe.

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

**Ojo con el CSS de las apps GENERADAS** (que es otro sistema, el de
`skeleton_dominio_armar._styles`): ahí el `body` tiene un degradado OSCURO y
`--tinta` es oscuro, así que todo lo que se dibuje suelto sobre el body va negro
sobre negro. Las pantallas sueltas necesitan la hoja `.card`. Faltaba, y durante
meses el login y el registro —la PRIMERA pantalla de toda app generada— salieron
ilegibles. Si añades una pantalla que no vive dentro de `.app`, dale `.card`.

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

## Las DOS formas del esqueleto: app de gestión y TIENDA

`SkeletonProjectGenerator` clasifica la idea y elige forma. Dos construyen algo
de verdad y no deben confundirse:

- **`crud_login`** (`DominioApp` → `skeleton_dominio_armar`): una entidad con sus
  campos, login y catálogos de apoyo. Es la forma correcta para casi todo:
  citas, gastos, inventario, clientes.
- **`tienda`** (`DominioTienda` → `skeleton_tienda_armar`): se COMPRA. Catálogo
  público, carrito, checkout, historial y panel del dueño.

**Por qué existe la segunda** (costó una queja en producción): «un carrito de
compras» entraba como `crud_login` y salía un CRUD de «Pedidos» donde se elegía
UN producto de un desplegable y **el total se escribía a mano**. Un pedido con
varias líneas y un total calculado no caben en una entidad plana. La señal para
elegir `tienda` es el carrito o la venta al público, **no** la palabra
«productos»: un almacén donde el dueño apunta su inventario es `crud_login`.

**REGLA INNEGOCIABLE de la tienda: el precio y el total los pone el SERVIDOR**,
leyéndolos de su base. El navegador manda solo `producto_id` y `cantidad`; el
DTO `LineaIn` ni siquiera tiene campo de precio. Un carrito que acepta el precio
del cliente deja comprar por lo que uno quiera con solo abrir las herramientas
del navegador. `pruebas/la_tienda_vende.py` lo comprueba colando un precio de 1.

El stock se descuenta con un UPDATE condicionado (`filter(stock >= unidades)`),
no leyendo-y-escribiendo: entre leer y escribir caben dos compras de la última
unidad. Y las cantidades se agrupan por producto antes de validar, o partir la
compra en dos líneas burla el tope.

Lo que la tienda REUTILIZA (no lo dupliques): el CSS base y la paleta, el
manifest, el service worker, el icono, el compose y los documentos de despliegue
salen de `skeleton_dominio_armar` —por eso esos ayudantes reciben primitivas
(`app_name`, `tono`, `motor`, `tabla`) y no el dominio—, y las pantallas de
entrar y crear cuenta salen tal cual de `skeleton_dominio_front`.

**Si reutilizas un adaptador, respeta los NOMBRES de su puerto.** `TokenService`
lo implementa `JwtTokenService` con `issue`/`username_from`; declararlo con otros
nombres no falla al escribirlo, falla al ARRANCAR con un error sobre clases
abstractas que no menciona el problema real.

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

- **El clasificador del esqueleto llama a `chat_json` CON `validar`.** No se lo
  quites. Sin él, un proveedor que devuelve `{"tipo":"crud_login"}` y poco más
  contaba como éxito, la cadena se paraba con modelos sanos sin probar y la
  construcción caía a una plantilla genérica. En agosto de 2026 un «carrito de
  compras» en producción salió como un sitio llamado **«Mi App»** con una lista
  de «elementos» por exactamente esto.
- **Ninguna rama de degradación debe entregar una plantilla con el nombre de
  nadie.** Si no hay dominio construible se delega en el generador libre: un
  intento real sobre la idea, aunque salga imperfecto, vale más que otra app —
  la misma para todos— que no es la que se pidió.
- **`display` en una clase ANULA el atributo `hidden`** (misma especificidad que
  la regla del navegador). Por eso el CSS de la tienda declara
  `[hidden]{display:none !important}`: sin eso, `.cuentas` seguía en pantalla,
  vacía, debajo de «tu carrito está vacío».

- **PERSISTENCIA EN PRODUCCIÓN (el más caro).** Hoy **no hay PostgreSQL viva**:
  la base free del blueprint caducó a los 30 días y el servicio **no recibe
  `DATABASE_URL`**, así que `uses_postgres` es False y TODO —usuarios,
  licencias, cupos, cursos, progreso, despliegues, trabajos y actividad— vive en
  el SQLite de `settings.db_path`. El **único** disco persistente está montado
  en `/app/generated`, de modo que **`DB_PATH=/app/generated/metaagente.db`** es
  lo único que evita que se borre entero en CADA deploy y en cada reinicio (el
  valor por defecto cae en `/app/evaluations.db`, fuera del disco, y el usuario
  se encontraba sin cuenta ni licencia). Va como archivo suelto en la raíz del
  disco a propósito: la galería y la bandeja enumeran `generated/` filtrando por
  `is_dir()`, así que un archivo (y sus `-wal`/`-shm`) es invisible para ellas.
- **El servicio vivo NO está gestionado por blueprint.** Editar `render.yaml` no
  cambia nada en producción: las variables se ponen **por el panel de Render o
  por su API**. El blueprint sirve de documentación y para recrear la infra
  desde cero; si tocas una variable ahí, tócala también en el servicio real.
- **Groq free**: ~12.000 tokens/min y límites diarios. Si se agota, añade otro
  proveedor a `LLM_PROVIDERS` (Gemini/OpenRouter) — el fallback se encarga.
- **Chromium es obligatorio en la imagen**: el `backend/Dockerfile` instala
  Playwright + Chromium y **falla el build** si al final no está. Es
  deliberado: el gate anti-página-en-blanco no puede faltar en silencio (si no,
  la imagen entrega URLs sin verificar y solo queda un ERROR en logs que nadie
  mira a tiempo).
- **Manifest de la PWA**: `/manifest.webmanifest` debe servirse con
  `Content-Type: application/manifest+json` o Chrome lo ignora y la app deja de
  ser instalable. En el static site de Render la cabecera está puesta **por
  API** (ver el comentario de `render.yaml`), no por el build.
- **`claude` no existe en el contenedor**: cualquier capacidad que dependa del
  agente CLI (hoy, la revisión automática de entregas) solo corre en las
  máquinas del equipo. Detéctalo con `disponible()` y degrada, no falles.
- **Login Google**: la app OAuth debe estar en **"En producción"** o el usuario
  agregado como **usuario de prueba**, o Google bloquea el acceso. El botón usa
  Google Identity Services; el `GOOGLE_CLIENT_ID` va en `.env` y el frontend lo lee
  de `GET /api/v1/auth/config`.
- **No versionar**: `.env`, `*.db`, `backend/generated/`, `backend/data/` (en `.gitignore`).

## Estado / roadmap

Hecho: **esqueleto de TIENDA** (catálogo público, carrito, checkout con total
calculado en el servidor, stock y panel del dueño), multi-modelo, UI Skywork,
login Google, licencia, modo profesor,
memoria/RAG, **publicación autónoma en Render** (fase 1), **agente CLI local +
trabajos de fondo y bandeja de entregas** (fase 2), **profesor adaptativo con
nivel por usuario, evidencia en git y camino/racha** (fase 3), PWA instalable,
móvil Flutter que aprueba entregas y **escritorio Tauri** (`build-desktop.ps1`,
modo nube) con aviso de versión nueva.
Pendiente: recrear la PostgreSQL (hoy toda la persistencia es SQLite sobre el
disco), poner el servicio bajo blueprint para que `render.yaml` mande de verdad,
y escopar la licencia por usuario.
