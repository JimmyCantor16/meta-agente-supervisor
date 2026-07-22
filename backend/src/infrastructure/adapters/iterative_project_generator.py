"""Generador de proyectos ITERATIVO con auto-reparación.

Resuelve el problema del "un solo disparo": en vez de pedir todo el proyecto en
una respuesta (que se trunca y sale código roto), procede en 3 fases:

  1. PLANIFICAR  -> el modelo diseña la lista de archivos (manifiesto).
  2. ESCRIBIR    -> genera CADA archivo en su propia llamada (queda completo).
  3. REPARAR     -> un pase final detecta y corrige lo que impide ejecutar
                    (imports faltantes, funciones no definidas, incoherencias).

Cada archivo se genera viendo los ya escritos, para mantener coherencia. Usa el
mismo cliente compatible con OpenAI (Groq/DeepSeek/OpenRouter).
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import tempfile

from src.config import Settings
from src.domain.entities import GeneratedFile, GeneratedProject
from src.domain.ports import ProjectGenerationError, ProjectGeneratorPort
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM
from src.infrastructure.adapters.python_syntax_fixes import (
    anadir_imports_faltantes,
    arreglar_define_suelto,
    api_a_rutas_relativas,
    arreglar_estructura_vite,
    completar_dependencias_node,
    crear_stubs_simbolos_js,
    crear_stubs_metodos_modulo,
    garantizar_jwt_secret,
    blindar_sdks_externos,
    tolerar_use_con_objeto,
    inyectar_token_axios,
    enganchar_seed,
    alinear_semilla_con_modelo,
    alinear_contrato_auth,
    alinear_payload_jwt,
    persistir_sesion_local,
    alinear_contrato_contextos,
    desempaquetar_respuestas_api,
    inyectar_login_premium,
    inyectar_estilos_base,
    ocultar_navbar_en_rutas_auth,
    garantizar_contenido_visible,
    arreglar_texto_gradiente_invisible,
    garantizar_manual,
    envolver_con_providers,
    quitar_autoimports,
    quitar_imports_a_backend,
    forzar_motor_bd,
    alinear_modelos_factory,
    romper_ciclo_sequelize,
    garantizar_listen_incondicional,
    frontend_a_esm,
    arreglar_jsx_en_js,
    arreglar_rutas_estaticas,
    crear_css_faltantes,
    sacar_listen_del_then,
    servir_frontend_en_express,
    contrato_markdown,
    resolver_referencias,
    sanear,
)

logger = logging.getLogger(__name__)

# Límites del generador. Con la cadena multi-proveedor (GPT-4.1, Codestral,
# DeepSeek V4...) podemos permitirnos proyectos bastante más completos que
# cuando dependíamos solo del tier mínimo de Groq.
_MAX_FILES = 50  # front + back completos. Viable porque el contrato mantiene
                 # el contexto plano: el coste ya no crece con el nº de archivos.
_MAX_CONTEXT_CHARS = 24_000  # contexto de archivos previos (coherencia)
_MAX_RECIENTES = 6_000  # extracto de los últimos archivos (continuidad de estilo)

# Imports relativos de JS/JSX: `import X from './y'` / `from '../z/w'`.
# Solo los relativos: los paquetes de npm los resuelve node_modules.
_IMPORT_JS = re.compile(r"""(?:from|import)\s+['"](\.{1,2}/[^'"]+)['"]""")


def _resolver_ruta(carpeta: str, relativa: str) -> str | None:
    """Convierte un import relativo en ruta del proyecto (sin extensión)."""
    partes = [p for p in carpeta.split("/") if p]
    for trozo in relativa.split("/"):
        if trozo in ("", "."):
            continue
        if trozo == "..":
            if not partes:
                return None
            partes.pop()
        else:
            partes.append(trozo)
    ruta = "/".join(partes)
    for ext in (".js", ".jsx", ".css"):
        if ruta.endswith(ext):
            return ruta[: -len(ext)] if ext != ".css" else None  # el CSS ya se cubre aparte
    return ruta
_MAX_REPAIR_CHARS = 160_000  # tamaño máximo del proyecto para el pase de reparación
                             # (subido con el tope de archivos, o se saltaría siempre)

# Detecta imports de Python al inicio de línea (from X import ... | import X).
_LOCAL_IMPORT_RE = re.compile(
    r"^\s*(?:from\s+([a-zA-Z_][\w.]*)\s+import|import\s+([a-zA-Z_][\w.]*))",
    re.MULTILINE,
)

# Captura `from [.]* modulo import a, b, c` (incluye imports RELATIVOS).
_FROM_IMPORT_RE = re.compile(
    r"^\s*from\s+(\.*)([\w.]*)\s+import\s+([^\n#]+)",
    re.MULTILINE,
)


_PLANNER_SYS = """\
Eres un arquitecto de software senior. Dado un prompt de ingeniería, diseñas la
lista de archivos de un proyecto EJECUTABLE y COMPLETO (no un boceto).

Devuelve EXCLUSIVAMENTE un JSON válido:
{
  "name": "nombre-del-proyecto",
  "summary": "qué hace, en 1-2 frases",
  "run_instructions": "cómo ejecutarlo tras clonar (comandos)",
  "files": [ { "path": "ruta/relativa", "purpose": "qué contiene y por qué" } ]
}

Reglas:
- El número MÍNIMO de archivos necesario, hasta un máximo de 45. El máximo es un
  techo, NO un objetivo: no inventes archivos para llenarlo. Cada archivo debe
  tener un propósito que ningún otro cubra. Si dudas si hace falta, no lo crees.
  * Señal de relleno (NO lo hagas): duplicar en el frontend utilidades que ya
    están en el backend (`email.js`, `logger.js`, `validations.js`…). El
    navegador no envía correos ni escribe registros del servidor.
- Rutas SIEMPRE relativas (nunca absolutas ni con '..').
- STACK: elige UNO de los dos soportados (los únicos que el sistema sabe
  verificar ejecutando y arrancar para entregar una URL):
  * **Python + FastAPI**: entrada en `backend/main.py` exponiendo
    `app = FastAPI(...)` y `backend/requirements.txt` OBLIGATORIO.
    Persistencia con SQLAlchemy + SQLite (archivo local).
  * **Node + Express**: entrada en `backend/server.js` con su `backend/package.json`
    (con script `start` y TODAS las dependencias declaradas). El servidor DEBE
    escuchar en `process.env.PORT` (`const port = process.env.PORT || 3000`), o
    no se podrá publicar su URL. Persistencia con SQLite (better-sqlite3 o
    sqlite3), sin servicios externos.
  * No mezcles ambos backends, y no uses otros frameworks (NestJS, Django…).
  * Declara las dependencias, NUNCA las generes: se instalan con un comando
    (`pip install` / `npm install`) en una fase posterior.
  * EL SERVIDOR DEBE ESCUCHAR SIEMPRE. Nunca metas `app.listen()` dentro de un
    `.then()` de la base de datos: si esa promesa no se resuelve, el proceso se
    queda vivo, mudo y sin escuchar, y es imposible de diagnosticar. Llama a
    `app.listen(PORT)` en el nivel superior, imprime un mensaje al arrancar, y
    conecta la base de datos aparte con su `.catch()` que registre el error.
- PROHIBIDO DEPENDER DE SERVICIOS EXTERNOS. El sistema se verifica arrancándolo
  en una máquina donde SOLO existe el propio proyecto:
  * NADA de PostgreSQL, MySQL, MongoDB, Redis ni colas de mensajes. Ni sus
    drivers (`pg`, `mysql2`, `mongoose`, `psycopg`, `redis`), ni un servicio en
    `docker-compose.yml` del que dependa el arranque.
  * La base de datos es SIEMPRE **SQLite en un archivo dentro del proyecto**, y
    las tablas se crean al arrancar (o con un script incluido), no con
    migraciones que requieran un servidor levantado.
  * Un proyecto que necesite algo que no venga en el propio repositorio NO se
    puede verificar ni entregar funcionando, y por tanto no sirve.
- FRONTEND: elige el enfoque que pida el prompt. Hay dos soportados:
  * **React con Vite** (si el prompt pide React): `frontend/package.json` con
    `vite` y `@vitejs/plugin-react`, script `"build": "vite build"`, y
    `frontend/vite.config.js` con `base: './'` y salida en `dist`. Componentes
    en `frontend/src/`, entrada `frontend/src/main.jsx` e `frontend/index.html`.
    **`index.html` va en la RAÍZ del frontend (`frontend/index.html`), NUNCA en
    `public/`**, y debe incluir `<script type="module" src="/src/main.jsx">`:
    Vite lo exige ahí y si no el build falla con `Could not resolve entry
    module`. El sistema ejecutará `npm install` y `npm run build` por ti.
  * **HTML + CSS + JS plano** (si no se pide framework): una página por pantalla.
    Ahí el JS corre directo en el navegador: **NUNCA `require(...)` ni
    `module.exports`**, y no declares dos veces el mismo nombre, porque los
    scripts comparten el ámbito global.
- EL BACKEND DEBE SERVIR EL FRONTEND para que todo viva en UNA sola URL:
  * Con React: sirve `frontend/dist` como estáticos y devuelve `index.html` para
    cualquier ruta desconocida (SPA).
  * Con HTML plano: sirve la carpeta `frontend` tal cual.
  * Sin esto no hay una URL única que entregar al usuario.
- NUNCA planifiques `node_modules`, `dist`, `build` ni nada que produzca un
  comando: las dependencias se DECLARAN y se instalan al verificar.
- DEBES incluir frontend Y backend: un backend sin pantallas no es un sistema
  que alguien pueda usar. Planifica una pantalla por cada caso de uso real.
- NO planifiques archivos de PRUEBAS (`tests/`, `*.test.py`, `*_test.py`,
  `conftest.py`). Se generan en una fase posterior, cuando el sistema ya esté
  funcionando y las pruebas puedan EJECUTARSE de verdad. Ahora solo consumirían
  espacio del plan sin poder comprobarse.
- Incluye SIEMPRE: docker-compose.yml, README.md, .env.example, CONFIGURE.md,
  DEPLOY.md (despliegue paso a paso para alguien sin experiencia) y **MANUAL.md**.
- **MANUAL.md** es el manual de usuario final (no técnico): para qué sirve el
  sistema, cómo entrar, **USUARIOS DE PRUEBA con sus credenciales** y un paseo
  por las funciones principales, paso a paso.
- Si el sistema tiene login, incluye **datos semilla** (seed) que creen esos
  usuarios de prueba al arrancar (p. ej. admin/admin123 y user/user123), para
  que se pueda probar el MVP de inmediato sin registrarse.
- OBLIGATORIO — ARCHIVOS DE DEPENDENCIAS (se olvidan y rompen el build):
  * Python: `requirements.txt` (con TODAS las librerías que importe el código).
  * Node/JS: `package.json`.
  * Si hay un Dockerfile que haga `COPY X`, ESE archivo X debe estar en la lista.
- Divide el código en módulos coherentes (NO todo en un solo archivo).
- CRÍTICO — COHERENCIA DE IMPORTS (el error más común, evítalo):
  * Si un archivo importará `paquete.modulo`, ESE `paquete/modulo.py` DEBE estar
    en la lista de archivos.
  * NUNCA planifiques a la vez un archivo `X.py` y un paquete `X/` (colisionan).
    Si necesitas varios routers, planifica el PAQUETE: `backend/routers/__init__.py`,
    `backend/routers/users.py`, `backend/routers/tasks.py`, etc.
  * Incluye un `__init__.py` por cada carpeta de paquete Python.
  * Incluye los archivos base que suelen olvidarse: `database.py`, `models.py`,
    `schemas.py`, `auth.py`, `dependencies.py` según aplique.
- No dejes ningún import local sin su archivo correspondiente.
"""

_WRITER_SYS = """\
Eres un ingeniero de software senior. Escribes el contenido COMPLETO, correcto y
EJECUTABLE de UN solo archivo, coherente con el resto del proyecto.

Devuelve EXCLUSIVAMENTE un JSON válido: { "content": "contenido completo del archivo" }

Reglas:
- Sin placeholders, sin 'TODO', sin '...'. Código real y funcional.
- Imports correctos y COMPLETOS. No uses funciones/variables/clases que no existan.
- Coherente con los archivos ya escritos (mismos nombres de módulos, rutas, modelos).
- Si es código, debe ejecutarse sin errores de import ni de sintaxis.
- COHERENCIA DE VERSIONES (error frecuente y fatal):
  * Python: usa imagen base **python:3.12-slim** o superior en el Dockerfile.
    Si usas sintaxis moderna (`X | None`, `list[str]`, `dict[str, int]`), la
    imagen DEBE ser 3.10+. Nunca pongas python:3.9 con esa sintaxis.
  * En `requirements.txt` NO fijes versiones antiguas: usa rangos modernos
    (p. ej. `fastapi>=0.111`, `pydantic>=2.7`). Si usas Pydantic v2, el código
    debe usar sintaxis v2 (`model_config`, `model_validate`), no la v1.
  * Nunca definas una función que se llame a sí misma sin caso base.
- ORDEN DE PARÁMETROS EN FASTAPI (error de sintaxis MUY frecuente):
  `SyntaxError: parameter without a default follows parameter with a default`.
  Ocurre al poner una dependencia SIN valor por defecto detrás de parámetros que
  sí lo tienen. MAL:
      def listar(skip: int = 0, db: Annotated[Session, Depends(get_db)]):
  BIEN (elige una y sé consistente):
      def listar(db: Annotated[Session, Depends(get_db)], skip: int = 0):
      def listar(skip: int = 0, db: Session = Depends(get_db)):
  Regla simple: todo parámetro que vaya DESPUÉS de uno con `=` debe tener `=`.
- PLANTILLAS JINJA CON FASTAPI: el `request` va PRIMERO (firma moderna).
  MAL:  return templates.TemplateResponse("index.html", {"request": request})
  BIEN: return templates.TemplateResponse(request, "index.html", {})
  Con la forma antigua el código compila pero falla al ejecutarse con
  `TypeError: unhashable type: 'dict'`.
"""

_REPAIR_SYS = """\
Eres un revisor de código riguroso. Recibes TODOS los archivos de un proyecto y
detectas lo que IMPIDE ejecutarlo.

VERIFICA ESPECIALMENTE (son los fallos más frecuentes):
1. Cada `from X import a, b, c`: ¿existe X entre los archivos? ¿define/contiene
   realmente `a`, `b` y `c`? Si no, corrígelo (ajusta el import o crea el contenido).
2. Imports circulares o de un módulo a sí mismo (p. ej. `routers.py` haciendo
   `from .routers import ...`). Corrígelos.
2b. RECURSIÓN INFINITA: una función que se llama a sí misma sin caso base.
   Error típico y GRAVE: `def get_db(): db = next(get_db())` — debe usar la
   sesión real (p. ej. `SessionLocal()`) con try/finally, NO invocarse a sí misma.
   Revisa TODAS las funciones: si el cuerpo llama a la misma función, corrígelo.
2c. Archivos referenciados pero inexistentes: si el Dockerfile hace
   `COPY requirements.txt`, ese archivo debe existir (créalo con las
   dependencias reales que importa el código).
2d. COHERENCIA DE VERSIONES (error fatal frecuente): si el código usa sintaxis
   moderna (`X | None`, `list[str]`), el Dockerfile NO puede usar python:3.9 —
   súbelo a **python:3.12-slim**. Y si `requirements.txt` fija versiones viejas
   (fastapi 0.95, pydantic 1.x) mientras el código usa Pydantic v2, corrige el
   requirements a versiones modernas (`fastapi>=0.111`, `pydantic>=2.7`).
3. Que dos archivos no se contradigan: si `app.py` incluye routers `users, tasks`,
   el módulo de routers debe exponer exactamente esos.
4. Funciones/clases/variables usadas pero nunca definidas; errores de sintaxis.
5. Inseguridades obvias (contraseñas en texto plano, secretos hardcodeados).

Corrige SOLO lo necesario y devuelve EXCLUSIVAMENTE un JSON válido:
{ "files": [ { "path": "ruta", "content": "contenido corregido COMPLETO" } ] }

Incluye únicamente los archivos que cambiaste (completos, no diffs). Si no hay
nada que corregir, devuelve { "files": [] }.
"""


_FIX_SYS = """\
Eres un ingeniero depurando un proyecto que NO ARRANCA. Recibes el error REAL
(traceback) y los archivos del proyecto.

Tu tarea: identificar la causa EXACTA del error y corregirla.

Devuelve EXCLUSIVAMENTE un JSON válido:
{ "files": [ { "path": "ruta", "content": "contenido corregido COMPLETO" } ] }

Reglas:
- Incluye SOLO los archivos que modificas, con su contenido COMPLETO (no diffs).
- Ataca la causa raíz del traceback, no síntomas.
- Errores típicos y su arreglo:
  * `from typing import list` -> usar `list` nativo (Python 3.9+) o `List` de typing.
  * `parameter without a default follows parameter with a default` -> en la firma
    hay una dependencia sin `=` detrás de parámetros que sí lo tienen. Muévela al
    PRINCIPIO de la firma, o dale valor por defecto (`db: Session = Depends(get_db)`).
    Todo parámetro posterior a uno con `=` debe tener `=`.
  * `TypeError: unhashable type: 'dict'` en una plantilla -> `TemplateResponse`
    con la firma antigua. El `request` va primero:
    `TemplateResponse(request, "index.html", {...})`.
  * `RecursionError` -> una función se llama a sí misma; usa la implementación real.
  * ALIAS QUE SE PISA (causa oculta de RecursionError, MUY común): un módulo hace
    `from x import f`, define `def g(): ... f() ...` y al final escribe `f = g`.
    Esa reasignación hace que dentro de `g` la llamada `f()` apunte a `g` ->
    recursión infinita. SOLUCIÓN: elimina el alias, o importa el módulo y llama
    cualificado (`from backend import database` … `database.get_session()`), o
    importa con otro nombre (`from x import f as _f`). NUNCA reasignes al mismo
    nombre que importaste si lo llamas dentro de la función.
  * `ImportError: cannot import name X` -> X no existe en ese módulo: créalo o corrige el import.
  * `TypeError: unsupported operand type(s) for |` -> la imagen Python es < 3.10:
    sube el Dockerfile a python:3.12-slim (o usa Optional[...]).
- No cambies cosas que no tengan que ver con el error.
"""


# Librerías que hacen falta aunque el código NUNCA las importe: FastAPI las
# carga por debajo. Se detectan por lo que el código usa, no por sus imports.
_INDIRECTAS = {
    "jinja2>=3.1": ("Jinja2Templates",),
    "python-multipart>=0.0.9": ("Form(", "UploadFile", "OAuth2PasswordRequestForm"),
    "bcrypt>=4.1": ("CryptContext", "bcrypt"),
    "email-validator>=2.1": ("EmailStr",),
}


def _completar_indirectas(requirements: str, files: list[GeneratedFile]) -> str:
    """Añade las dependencias que el código necesita pero no importa.

    Son la causa de un arranque fallido especialmente desconcertante: el código
    no menciona `jinja2` por ningún lado, pero sin él `Jinja2Templates` revienta
    al importarse. Derivar el requirements.txt solo de los `import` las pierde.
    """
    codigo = "\n".join(f.content for f in files if f.path.endswith(".py"))
    presentes = {
        linea.split("[")[0].split(">")[0].split("=")[0].strip().lower()
        for linea in requirements.split("\n") if linea.strip()
    }

    anadidas = []
    for paquete, marcadores in _INDIRECTAS.items():
        nombre = paquete.split(">")[0].split("[")[0].lower()
        if nombre in presentes:
            continue
        if any(m in codigo for m in marcadores):
            anadidas.append(paquete)

    if anadidas:
        logger.info("Dependencias indirectas añadidas: %s", ", ".join(anadidas))
        requirements = requirements.rstrip("\n") + "\n" + "\n".join(anadidas) + "\n"
    return requirements


def _motor_del_prompt(prompt: str) -> str | None:
    """Motor de base de datos que el usuario pidió en el prompt, si lo nombró."""
    p = prompt.lower()
    if "postgres" in p or "postgresql" in p:
        return "postgres"
    if "mysql" in p or "mariadb" in p:
        return "mysql"
    return None


def _normalizar_proyecto(files: list[GeneratedFile], motor: str | None = None) -> list[GeneratedFile]:
    """Aplica los arreglos mecánicos a cualquier versión del proyecto.

    Sirve tanto para el proyecto recién generado como para el que sale de una
    reparación: son invariantes que deben cumplirse siempre, no un paso único.
    """
    contenidos = crear_css_faltantes({f.path: f.content for f in files})
    if motor:
        contenidos = forzar_motor_bd(contenidos, motor)
    contenidos = alinear_modelos_factory(contenidos)
    contenidos = romper_ciclo_sequelize(contenidos)
    contenidos = garantizar_listen_incondicional(contenidos)
    contenidos = crear_stubs_metodos_modulo(contenidos)
    contenidos = garantizar_jwt_secret(contenidos)
    contenidos = blindar_sdks_externos(contenidos)
    contenidos = tolerar_use_con_objeto(contenidos)
    contenidos = enganchar_seed(contenidos)
    contenidos = alinear_semilla_con_modelo(contenidos)
    contenidos = alinear_contrato_auth(contenidos)
    contenidos = alinear_payload_jwt(contenidos)
    contenidos = persistir_sesion_local(contenidos)
    contenidos = alinear_contrato_contextos(contenidos)
    contenidos = desempaquetar_respuestas_api(contenidos)
    contenidos = inyectar_token_axios(contenidos)
    contenidos = quitar_autoimports(contenidos)
    contenidos = quitar_imports_a_backend(contenidos)
    contenidos = frontend_a_esm(contenidos)
    contenidos = envolver_con_providers(contenidos)
    contenidos = inyectar_login_premium(contenidos)
    contenidos = inyectar_estilos_base(contenidos)
    contenidos = ocultar_navbar_en_rutas_auth(contenidos)
    contenidos = api_a_rutas_relativas(contenidos)
    contenidos = servir_frontend_en_express(contenidos)
    contenidos = completar_dependencias_node(contenidos)
    contenidos = arreglar_jsx_en_js(contenidos)
    contenidos = arreglar_estructura_vite(contenidos)
    contenidos = sacar_listen_del_then(contenidos)
    contenidos = arreglar_define_suelto(contenidos)
    contenidos = garantizar_contenido_visible(contenidos)
    contenidos = arreglar_texto_gradiente_invisible(contenidos)
    contenidos = garantizar_manual(contenidos)
    return [GeneratedFile(path=p, content=c) for p, c in contenidos.items()]


def _arreglar_imports_del_proyecto(
    files: list[GeneratedFile], motor: str | None = None
) -> list[GeneratedFile]:
    """Añade los imports de módulos hermanos que falten, en todo el proyecto.

    Se hace a nivel de proyecto porque un archivo por sí solo no puede saber
    qué módulos existen a su lado.
    """
    modulos_por_carpeta: dict[str, set[str]] = {}
    for f in files:
        if f.path.endswith(".py"):
            carpeta, _, nombre = f.path.rpartition("/")
            if nombre != "__init__.py":
                modulos_por_carpeta.setdefault(carpeta, set()).add(nombre[:-3])

    resultado = []
    for f in files:
        if not f.path.endswith(".py"):
            resultado.append(f)
            continue
        carpeta = f.path.rpartition("/")[0]
        # Módulos hermanos, y los del paquete padre (los routers usan `..`).
        vecinos = set(modulos_por_carpeta.get(carpeta, set()))
        if "/" in carpeta:
            vecinos |= modulos_por_carpeta.get(carpeta.rpartition("/")[0], set())
        vecinos.discard(f.path.rpartition("/")[2][:-3])  # no importarse a sí mismo

        nuevo = anadir_imports_faltantes(f.path, f.content, vecinos)
        resultado.append(
            f if nuevo == f.content else GeneratedFile(path=f.path, content=nuevo)
        )

    # Con los imports ya en su sitio, se reapuntan las referencias que señalan
    # al módulo equivocado (`database.get_db` cuando vive en `dependencies`).
    contenidos = crear_css_faltantes({f.path: f.content for f in resultado})
    if motor:
        contenidos = forzar_motor_bd(contenidos, motor)
    contenidos = sacar_listen_del_then(contenidos)
    contenidos = arreglar_define_suelto(contenidos)
    contenidos = arreglar_jsx_en_js(contenidos)
    contenidos = arreglar_estructura_vite(contenidos)
    # La estructura puede cambiar rutas (index.html sube de `public/`), así que
    # se rehace la lista antes de los pases que dependen de ellas.
    resultado = [GeneratedFile(path=p, content=c) for p, c in contenidos.items()]
    contenidos = arreglar_rutas_estaticas(contenidos)
    contenidos = resolver_referencias(contenidos)
    resultado = [GeneratedFile(path=f.path, content=contenidos[f.path]) for f in resultado]

    # Reapuntar puede estrenar un módulo que aún no estaba importado.
    final = []
    for f in resultado:
        if not f.path.endswith(".py"):
            final.append(f)
            continue
        carpeta = f.path.rpartition("/")[0]
        vecinos = set(modulos_por_carpeta.get(carpeta, set()))
        if "/" in carpeta:
            vecinos |= modulos_por_carpeta.get(carpeta.rpartition("/")[0], set())
        vecinos.discard(f.path.rpartition("/")[2][:-3])
        nuevo = anadir_imports_faltantes(f.path, f.content, vecinos)
        final.append(f if nuevo == f.content else GeneratedFile(path=f.path, content=nuevo))

    # Pipeline COMPLETO al final: los mismos invariantes que en la reparación
    # (completar dependencias npm, servir el frontend, forzar el motor…). Antes
    # la generación y la reparación aplicaban pases distintos, y por eso un
    # proyecto recién generado podía quedar sin el driver de la base de datos.
    return _normalizar_proyecto(final, motor)


def _preparar_correccion(path: str, content: str) -> str:
    """Aplica los arreglos mecánicos antes de juzgar una corrección."""
    return sanear(path, content)


def _normalizar_ruta(path: str, conocidas: set[str]) -> str | None:
    """Devuelve la ruta relativa del proyecto, o None si no es utilizable.

    El agente reparador recibe errores que contienen rutas ABSOLUTAS del
    contenedor (`/app/generated/proyecto/backend/package.json`) y devuelve la
    corrección con ese mismo formato. El escritor lo rechaza —con razón, es su
    defensa contra escrituras fuera del proyecto— pero eso tumbaba la
    generación entera por una diferencia de formato.
    """
    limpia = path.replace("\\", "/").strip()
    if limpia in conocidas:
        return limpia

    segmentos = limpia.split("/")
    # Se busca el sufijo que coincida con un archivo real del proyecto: así se
    # recupera la ruta relativa de una absoluta, sin abrir la puerta a otras.
    utiles = [p for p in segmentos if p not in ("", ".", "..")]
    for inicio in range(len(utiles)):
        candidata = "/".join(utiles[inicio:])
        if candidata in conocidas:
            logger.info("Ruta normalizada: '%s' -> '%s'", path, candidata)
            return candidata

    # Archivo nuevo: solo se acepta si es claramente relativo y seguro. Se
    # comprueba sobre los segmentos ORIGINALES, no sobre los ya filtrados.
    if limpia.startswith("/") or ".." in segmentos or ":" in limpia:
        logger.warning("Descartada corrección con ruta insegura: '%s'", path)
        return None
    return limpia


_SERVICIOS_EXTERNOS = {
    "postgres": ("postgres", "postgresql", "psycopg", '"pg"', "pg^", "pgadmin"),
    "mysql": ("mysql", "mariadb", "mysql2"),
    "mongodb": ("mongodb", "mongoose", "mongo "),
    "redis": ("redis",),
}


def _servicio_externo(manifest: dict) -> str | None:
    """Nombre del servicio externo del que depende el plan, si lo hay.

    Se mira el texto del manifiesto (resumen, instrucciones y propósito de cada
    archivo), que es donde el planificador declara sus intenciones antes de que
    cueste 38 llamadas descubrirlo.
    """
    texto = " ".join([
        str(manifest.get("summary", "")),
        str(manifest.get("run_instructions", "")),
        " ".join(f"{f.get('path','')} {f.get('purpose','')}" for f in manifest.get("files", [])),
    ]).lower()

    for servicio, marcadores in _SERVICIOS_EXTERNOS.items():
        if any(m in texto for m in marcadores):
            # SQLite menciona "sql" pero no es un servicio: no debe confundirse.
            if servicio == "postgres" and "postgres" not in texto and "psycopg" not in texto:
                continue
            return servicio
    return None


def _filtrar_no_generables(planificados: list[dict]) -> tuple[list[dict], list[str]]:
    """Quita del plan lo que no debe generarse como archivo.

    Dos categorías:
      * Dependencias y artefactos de build (`node_modules`, `dist`…). Se
        instalan con un comando; generarlos serían miles de archivos.
      * Pruebas. Se escriben cuando el sistema ya arranca y pueden EJECUTARSE;
        antes son afirmaciones que nadie puede comprobar.
    """
    artefactos = ("node_modules/", "dist/", "build/", ".venv/", "__pycache__/", "vendor/")
    nombres_test = ("conftest.py", "jest.config.js", "pytest.ini")
    # Un modelo no puede escribir un binario como texto: si "genera" un .sqlite
    # produce basura que el código abrirá con un error incomprensible
    # (`file is not a database`). Estos archivos los crea la app al arrancar.
    binarios = (".sqlite", ".sqlite3", ".db", ".pyc", ".log", ".png", ".jpg", ".ico", ".zip")

    def es_prueba(ruta: str) -> bool:
        r = ruta.lower()
        nombre = r.rsplit("/", 1)[-1]
        return (
            r.startswith("tests/") or "/tests/" in r or "/__tests__/" in r
            or nombre.startswith("test_") or nombre.endswith(("_test.py", ".test.js", ".spec.js"))
            or nombre in nombres_test
        )

    # Un proyecto Node no lleva `__init__.py`, ni uno Python lleva package.json
    # en el backend. Mezclarlos no solo produce archivos muertos: dos
    # `__init__.py` sueltos bastaron para que el despachador tratara un
    # proyecto Node como si fuera Python y se saltara toda la verificación.
    rutas = [s["path"].lower() for s in planificados]
    es_node = any(r.endswith("package.json") and "frontend/" not in r for r in rutas)

    conservados, excluidos = [], []
    for spec in planificados:
        ruta = spec["path"]
        r = ruta.lower()
        intruso = es_node and r.endswith((".py", "requirements.txt"))
        if any(a in r for a in artefactos) or r.endswith(binarios) or es_prueba(ruta) or intruso:
            excluidos.append(ruta)
        else:
            conservados.append(spec)
    return conservados, excluidos


def _error_sintaxis_js(content: str) -> str | None:
    """Mensaje de error si el JavaScript no es sintácticamente válido."""
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                         encoding="utf-8") as tmp:
            tmp.write(content)
            ruta = tmp.name
        try:
            resultado = subprocess.run(
                ["node", "--check", ruta], capture_output=True, text=True, timeout=30
            )
            if resultado.returncode == 0:
                return None
            detalle = (resultado.stderr or resultado.stdout).strip()
            return detalle.splitlines()[-1][:160] if detalle else "sintaxis inválida"
        finally:
            os.unlink(ruta)
    except (OSError, subprocess.SubprocessError):
        return None  # Sin Node no se puede juzgar: no se bloquea la corrección.


def _correccion_valida(
    path: str, content: str, anterior: GeneratedFile | None
) -> bool:
    """Decide si una corrección se acepta o se descarta.

    El agente reparador reescribe archivos enteros y a veces devuelve uno con
    un error de SINTAXIS: entonces cada intento dejaba el proyecto peor que
    antes y el bucle no convergía nunca. Aquí se compila la propuesta y, si no
    compila, se conserva la versión anterior. La reparación solo puede mejorar
    o quedarse igual, nunca degradar.
    """
    if path.endswith((".js", ".mjs")):
        # Node está disponible en el contenedor, así que las correcciones de
        # JavaScript se validan igual que las de Python. Aceptarlas a ciegas
        # dejaba que una reparación introdujera un error nuevo.
        error = _error_sintaxis_js(content)
        if error is None:
            return True
        if anterior is None:
            return True
        logger.warning("DESCARTADA la corrección de %s: %s", path, error)
        return False

    if not path.endswith(".py"):
        return True  # Otros formatos no se pueden comprobar así de barato.

    try:
        compile(content, path, "exec")
        return True
    except SyntaxError as exc:
        if anterior is None:
            # No había versión previa: peor es quedarse sin el archivo.
            logger.warning("La corrección de %s no compila (%s), pero es nueva; se acepta.",
                           path, exc.msg)
            return True
        logger.warning(
            "DESCARTADA la corrección de %s: introduce un error de sintaxis (%s, línea %s).",
            path, exc.msg, exc.lineno,
        )
        return False


class IterativeProjectGenerator(ProjectGeneratorPort):
    """Genera proyectos por fases (planificar → escribir → reparar)."""

    def __init__(self, settings: Settings | None = None) -> None:
        # Rol "code": escribir y reparar archivos. Necesita ventana grande y
        # modelos especializados en código (Codestral), no los de 8k.
        self._llm = MultiModelLLM(role="code")

    def generate(self, prompt: str, language: str = "es") -> GeneratedProject:
        # El motor de BD que pidió el usuario se recuerda para imponerlo: si el
        # modelo se desvía a otro (p. ej. SQLite cuando se pidió PostgreSQL), se
        # corrige, porque degradar el motor es entregar algo distinto.
        self._motor = _motor_del_prompt(prompt)
        # 1) PLANIFICAR
        manifest = self._plan(prompt, language)
        planificados = [f for f in manifest.get("files", []) if f.get("path")]
        # No basta con pedirlo en el prompt: se filtra aquí lo que no debe
        # generarse nunca, porque las reglas escritas se incumplen.
        planificados, excluidos = _filtrar_no_generables(planificados)
        if excluidos:
            logger.info("Excluidos del plan (%d): %s", len(excluidos), excluidos[:8])
        if not planificados:
            raise ProjectGenerationError("El planificador no devolvió archivos válidos.")

        specs = self._priorizar(planificados)
        if len(planificados) > _MAX_FILES:
            # Recortar en silencio hacía desaparecer archivos sin dejar rastro.
            conservados = {f["path"] for f in specs}
            descartados = [f["path"] for f in planificados if f["path"] not in conservados]
            logger.warning(
                "El plan traía %d archivos y el máximo es %d. DESCARTADOS: %s",
                len(planificados), _MAX_FILES, descartados,
            )
        logger.info("Plan: %d archivo(s) -> %s", len(specs), [s["path"] for s in specs])

        # 2) ESCRIBIR archivo por archivo (con contexto de los ya escritos)
        files: list[GeneratedFile] = []
        context = ""
        fallidos: list[str] = []
        for i, spec in enumerate(specs, start=1):
            # El contexto que ve el modelo es el CONTRATO de lo ya escrito (qué
            # expone cada archivo) más un extracto de los últimos archivos, en
            # vez de un volcado de código que no le decía dónde vive cada cosa.
            contrato = contrato_markdown({f.path: f.content for f in files})
            try:
                content = self._write_file(prompt, manifest, spec, contrato, context, language)
            except (ProjectGenerationError, LLMError) as exc:
                # Un archivo que falla NO debe tirar el proyecto entero: se
                # anota y se sigue. El pase de completitud lo genera después,
                # igual que hace con los módulos importados que faltan.
                logger.warning("Falló %s (%s). Se intentará en el pase de completitud.",
                               spec["path"], exc)
                fallidos.append(spec["path"])
                continue

            files.append(GeneratedFile(path=spec["path"], content=content))
            # Solo se arrastran los últimos archivos, para dar continuidad de
            # estilo; la coherencia estructural la aporta el contrato.
            context = (f"--- {spec['path']} ---\n{content}\n" + context)[:_MAX_RECIENTES]
            logger.info("Escrito %d/%d: %s", i, len(specs), spec["path"])

        if not files:
            raise ProjectGenerationError("No se pudo escribir ningún archivo del proyecto.")
        if fallidos:
            logger.warning("%d archivo(s) pendientes tras la escritura: %s", len(fallidos), fallidos)

        # 3) COMPLETAR (generar módulos importados pero no creados + __init__.py)
        files = self._ensure_complete(prompt, manifest, files, language)
        files = self._ensure_modulos_js(prompt, manifest, files, language)
        files = self._ensure_requirements(files, language)
        files = _arreglar_imports_del_proyecto(files, getattr(self, "_motor", None))

        # 4) REPARAR (auto-corrección de lo que rompe la ejecución)
        files = self._repair(files, language)

        return GeneratedProject(
            name=manifest.get("name", "proyecto-generado"),
            summary=manifest.get("summary", ""),
            files=files,
            run_instructions=manifest.get("run_instructions", ""),
        )

    # ------------------------------------------------------------------
    @staticmethod
    def _priorizar(planificados: list[dict]) -> list[dict]:
        """Recorta al máximo de archivos SIN perder los imprescindibles.

        Los planificadores tienden a listar el código primero y dejar al final
        `requirements.txt`, `README.md` o `MANUAL.md`. Con un recorte por orden
        de llegada, justo esos desaparecían: sin `requirements.txt` el proyecto
        ni siquiera puede instalar sus dependencias, y sin `MANUAL.md` el usuario
        se queda sin las credenciales de prueba.
        """
        # Sin estos el proyecto no se instala, no se entiende o no se puede usar.
        imprescindibles = (
            "requirements.txt", "package.json", "manual.md", "readme.md", ".env.example",
        )

        def es_imprescindible(spec: dict) -> bool:
            nombre = spec["path"].lower().rsplit("/", 1)[-1]
            # La INTERFAZ es imprescindible: un proyecto sin pantallas no es un
            # sistema que alguien pueda usar. Antes se conservaba el
            # `frontend/package.json` y se descartaba el `index.html`, que es
            # exactamente al revés de lo que importa.
            if nombre.endswith(".html"):
                return True
            return nombre in imprescindibles

        clave = [s for s in planificados if es_imprescindible(s)]
        resto = [s for s in planificados if not es_imprescindible(s)]

        # Los imprescindibles entran siempre; el resto llena el hueco que quede.
        seleccion = clave + resto[: max(0, _MAX_FILES - len(clave))]
        # Se devuelve en el orden original del plan para no romper la coherencia
        # del contexto incremental (cada archivo ve los anteriores).
        elegidos = {s["path"] for s in seleccion}
        return [s for s in planificados if s["path"] in elegidos]

    # ------------------------------------------------------------------
    # Fases
    # ------------------------------------------------------------------
    def _plan(self, prompt: str, language: str) -> dict:
        user = f"[Idioma: {language}]\n\nPROMPT DE INGENIERÍA:\n{prompt}"
        data = self._chat(_PLANNER_SYS, user)
        if "files" not in data:
            raise ProjectGenerationError("El plan no incluye la clave 'files'.")

        # El motor de base de datos que elija el plan SE RESPETA. Degradarlo a
        # SQLite para que arrancara en el entorno de pruebas sería entregar algo
        # distinto de lo que el usuario pidió; el entorno de verificación ahora
        # presta PostgreSQL y MySQL reales para poder comprobarlo tal cual.
        if externo := _servicio_externo(data):
            logger.info("El plan usa %s; se verificará con esa base de datos.", externo)
        return data

    def _write_file(
        self, prompt: str, manifest: dict, spec: dict, contrato: str,
        recientes: str, language: str,
    ) -> str:
        structure = "\n".join(
            f"- {f.get('path')}: {f.get('purpose', '')}" for f in manifest.get("files", [])
        )
        user = (
            f"[Idioma: {language}]\n\n"
            f"PROYECTO: {manifest.get('name')} — {manifest.get('summary')}\n\n"
            f"OBJETIVO GLOBAL (prompt original):\n{prompt}\n\n"
            f"ESTRUCTURA COMPLETA PLANIFICADA:\n{structure}\n\n"
            f"CONTRATO — QUÉ EXPONE CADA ARCHIVO YA ESCRITO:\n"
            f"{contrato or '(ninguno todavía)'}\n\n"
            f"REGLA: usa ÚNICAMENTE símbolos que aparezcan en el contrato, y "
            f"pídeselos al archivo que realmente los declara. Si necesitas algo "
            f"que no está en la lista, defínelo en ESTE archivo.\n\n"
            f"ÚLTIMOS ARCHIVOS (solo como referencia de estilo):\n"
            f"{recientes or '(ninguno todavía)'}\n\n"
            f"Escribe AHORA el contenido completo de: {spec['path']}\n"
            f"Propósito: {spec.get('purpose', '')}"
        )
        data = self._chat(_WRITER_SYS, user)
        content = data.get("content")
        if content is None:
            raise ProjectGenerationError(f"No se generó contenido para {spec['path']}.")

        # Un .py con sintaxis rota contamina el contexto de todos los archivos
        # siguientes (que lo toman como ejemplo) y consume después intentos de
        # reparación. Primero se intenta el arreglo mecánico (gratis y seguro);
        # solo si no basta se vuelve a molestar al modelo.
        if spec["path"].endswith(".py"):
            content = sanear(spec["path"], content)
            try:
                compile(content, spec["path"], "exec")
            except SyntaxError as exc:
                logger.warning("%s vino con error de sintaxis (%s); se reintenta una vez.",
                               spec["path"], exc.msg)
                reintento = self._chat(
                    _WRITER_SYS,
                    user + f"\n\nATENCIÓN: tu intento anterior tenía un ERROR DE SINTAXIS "
                           f"en la línea {exc.lineno}: {exc.msg}. Devuelve el archivo COMPLETO "
                           f"y sintácticamente válido.",
                )
                if (nuevo := reintento.get("content")) is not None:
                    try:
                        compile(nuevo, spec["path"], "exec")
                        content = nuevo
                    except SyntaxError:
                        logger.warning("El reintento de %s sigue roto; se deja al reparador.",
                                       spec["path"])
        return content

    def _ensure_modulos_js(
        self, prompt: str, manifest: dict, files: list[GeneratedFile], language: str
    ) -> list[GeneratedFile]:
        """Genera los módulos JS/JSX que el código importa pero nadie escribió.

        Es el gemelo de `_ensure_complete` para JavaScript. El generador escribe
        `import ProtectedRoute from './components/ProtectedRoute'` dando por
        hecho que existe, y el build muere con `Could not resolve`. El pase de
        reparación no puede salvarlo porque solo edita archivos existentes.
        """
        existentes = {f.path for f in files}
        pendientes: dict[str, str] = {}  # ruta -> quién lo importa

        for f in files:
            if not f.path.endswith((".js", ".jsx")):
                continue
            carpeta = f.path.rsplit("/", 1)[0]
            for relativa in _IMPORT_JS.findall(f.content):
                base = _resolver_ruta(carpeta, relativa)
                if base is None:
                    continue
                # El import va sin extensión: puede ser cualquiera de estas.
                variantes = [base, f"{base}.js", f"{base}.jsx",
                             f"{base}/index.js", f"{base}/index.jsx"]
                if any(v in existentes for v in variantes):
                    continue
                # Un import que se sale de su propia mitad del proyecto
                # (frontend pidiéndole código al backend) es un ERROR, no un
                # archivo que falte: crearlo en `frontend/backend/...` sería
                # inventar una carpeta absurda y esconder el problema.
                mitad_origen = f.path.split("/", 1)[0]
                if base.split("/", 1)[0] != mitad_origen:
                    logger.warning(
                        "Import cruzado inválido en %s -> '%s': el frontend y el "
                        "backend son procesos distintos y no comparten código.",
                        f.path, relativa,
                    )
                    continue

                destino = f"{base}.jsx" if "/components/" in base or "/pages/" in base \
                    else f"{base}.js"
                pendientes.setdefault(destino, f.path)

        if not pendientes:
            return files

        logger.warning("Faltan %d módulo(s) JS que el código importa: %s",
                       len(pendientes), list(pendientes)[:5])
        for destino, quien in pendientes.items():
            try:
                contenido = self._write_missing(prompt, manifest, files, destino, language)
            except (ProjectGenerationError, LLMError) as exc:
                logger.warning("No se pudo generar %s (%s).", destino, exc)
                continue
            if contenido:
                files.append(GeneratedFile(path=destino, content=contenido))
                logger.info("Generado el módulo que faltaba: %s (lo usa %s)", destino, quien)
        return files

    def _ensure_requirements(
        self, files: list[GeneratedFile], language: str
    ) -> list[GeneratedFile]:
        """Garantiza que un proyecto Python lleve su `requirements.txt`.

        Sin él, el verificador monta un entorno vacío y el proyecto falla al
        importar `fastapi`; encima el pase de reparación no puede arreglarlo,
        porque solo edita archivos existentes, no los crea. Es un fallo mortal
        y silencioso, así que se cubre aquí de forma explícita.
        """
        hay_python = any(f.path.endswith(".py") for f in files)
        if not hay_python:
            return files

        # Si ya existe, no se regenera: solo se le añaden las indirectas, que
        # el modelo omite casi siempre por no aparecer como `import`.
        existente = next((f for f in files if f.path.endswith("requirements.txt")), None)
        if existente is not None:
            completo = _completar_indirectas(existente.content, files)
            if completo != existente.content:
                files = [
                    GeneratedFile(path=f.path, content=completo) if f is existente else f
                    for f in files
                ]
            return files

        logger.warning("Falta requirements.txt en un proyecto Python; se genera.")
        codigo = "\n\n".join(
            f"--- {f.path} ---\n{f.content[:2000]}"
            for f in files if f.path.endswith(".py")
        )[:_MAX_CONTEXT_CHARS]

        system = (
            "Eres un ingeniero Python. Dado el código de un proyecto, devuelves "
            'EXCLUSIVAMENTE un JSON: { "content": "contenido de requirements.txt" }.\n'
            "Incluye TODAS las librerías de terceros que el código importa (y solo "
            "esas; nada de la librería estándar). Usa rangos modernos, p. ej. "
            "fastapi>=0.111, uvicorn[standard]>=0.30, sqlalchemy>=2.0, pydantic>=2.7. "
            "Una por línea, sin comentarios.\n"
            "NO OLVIDES LAS DEPENDENCIAS INDIRECTAS (no aparecen como `import` "
            "pero sin ellas la app no arranca):\n"
            "* `Jinja2Templates` necesita `jinja2`.\n"
            "* Los endpoints con `Form(...)` o `UploadFile` necesitan `python-multipart`.\n"
            "* `OAuth2PasswordRequestForm` necesita también `python-multipart`.\n"
            "* El hasheo de contraseñas con passlib suele necesitar `bcrypt`."
        )
        try:
            data = self._chat(system, f"[Idioma: {language}]\n\nCÓDIGO:\n{codigo}")
            contenido = data.get("content")
        except (LLMError, ProjectGenerationError) as exc:
            logger.warning("No se pudo generar requirements.txt (%s).", exc)
            contenido = None

        if not contenido:
            # Mínimo viable: sin esto el proyecto no arranca de ninguna manera.
            contenido = "fastapi>=0.111\nuvicorn[standard]>=0.30\nsqlalchemy>=2.0\npydantic>=2.7\n"

        contenido = _completar_indirectas(contenido, files)

        destino = "backend/requirements.txt" if any(
            f.path.startswith("backend/") for f in files
        ) else "requirements.txt"
        files.append(GeneratedFile(path=destino, content=contenido))
        logger.info("Generado %s", destino)
        return files

    def _ensure_complete(
        self, prompt: str, manifest: dict, files: list[GeneratedFile], language: str
    ) -> list[GeneratedFile]:
        """Detecta imports locales sin archivo y los genera; añade __init__.py.

        Cierra el hueco típico: main.py importa app.database / app.services… que
        el planificador olvidó crear. Repite hasta que no falte nada (acotado).
        """
        files = list(files)

        for _round in range(3):
            paths = {f.path for f in files}
            # Raíces de paquetes locales = primeras carpetas que contienen archivos.
            roots = {p.split("/")[0] for p in paths if "/" in p}

            # 1) Asegura __init__.py en cada carpeta de paquete con .py.
            for path in list(paths):
                if path.endswith(".py") and "/" in path:
                    parts = path.split("/")[:-1]
                    for i in range(len(parts)):
                        pkg = "/".join(parts[: i + 1])
                        init_path = f"{pkg}/__init__.py"
                        if pkg.split("/")[0] in roots and init_path not in paths:
                            files.append(GeneratedFile(path=init_path, content=""))
                            paths.add(init_path)

            # 2) Busca imports locales (absolutos Y relativos) sin su archivo.
            missing: list[str] = []
            for f in files:
                if not f.path.endswith(".py"):
                    continue

                for match in _FROM_IMPORT_RE.finditer(f.content):
                    dots, module, names_raw = match.group(1), match.group(2), match.group(3)

                    if dots:
                        # Import relativo: resolvemos desde la carpeta del archivo.
                        parts = f.path.split("/")[:-1]
                        up = len(dots) - 1
                        if up:
                            parts = parts[:-up] if up <= len(parts) else []
                        rel = "/".join(parts + ([module.replace(".", "/")] if module else []))
                    else:
                        if not module or module.split(".")[0] not in roots:
                            continue  # stdlib o dependencia externa
                        rel = module.replace(".", "/")

                    rel = rel.strip("/")
                    if not rel:
                        continue

                    # ¿El módulo importado existe (como archivo o como paquete)?
                    is_package = any(p.startswith(rel + "/") for p in paths)
                    if f"{rel}.py" not in paths and not is_package:
                        target = f"{rel}.py"
                        if target not in missing:
                            missing.append(target)
                        continue

                    # Si es un paquete, los nombres importados pueden ser submódulos.
                    if is_package:
                        names = [
                            n.strip().split(" as ")[0].strip().strip("()")
                            for n in names_raw.split(",")
                        ]
                        for name in names:
                            if not name or not name.isidentifier():
                                continue
                            sub = f"{rel}/{name}.py"
                            if sub not in paths and f"{rel}/{name}/__init__.py" not in paths:
                                if sub not in missing:
                                    missing.append(sub)

            # 3) Archivos que un Dockerfile copia (COPY x) pero no existen.
            #    Caso típico: `COPY requirements.txt` sin haberlo generado.
            for f in files:
                if not f.path.endswith("Dockerfile") and "Dockerfile" not in f.path:
                    continue
                for line in f.content.splitlines():
                    stripped = line.strip()
                    if not stripped.upper().startswith("COPY "):
                        continue
                    parts = stripped.split()[1:]
                    if len(parts) < 2:
                        continue
                    src = parts[0].lstrip("./")
                    # Solo archivos concretos (con extensión), no carpetas ni comodines.
                    if not src or "*" in src or "." not in src.split("/")[-1]:
                        continue
                    base_dir = "/".join(f.path.split("/")[:-1])
                    candidates = [src, f"{base_dir}/{src}".lstrip("/")] if base_dir else [src]
                    if not any(c in paths for c in candidates):
                        target = candidates[-1]
                        if target not in missing:
                            missing.append(target)

            if not missing:
                break

            for target in missing[:6]:  # acotado para respetar el tier gratis
                logger.info("Completando módulo faltante: %s", target)
                content = self._write_missing(prompt, manifest, files, target, language)
                files.append(GeneratedFile(path=target, content=content))

        return files

    def _write_missing(
        self, prompt: str, manifest: dict, files: list[GeneratedFile], target: str, language: str
    ) -> str:
        """Genera el contenido de un módulo que otros archivos importan."""
        # Aquí el contrato es aún más decisivo: hay que crear justo los símbolos
        # que otros módulos ya están importando, con esos nombres exactos.
        contrato = contrato_markdown({f.path: f.content for f in files})
        usos = self._quien_lo_usa(target, files)
        user = (
            f"[Idioma: {language}]\n\n"
            f"PROYECTO: {manifest.get('name')} — {manifest.get('summary')}\n\n"
            f"OBJETIVO GLOBAL:\n{prompt}\n\n"
            f"CONTRATO — QUÉ EXPONE CADA ARCHIVO EXISTENTE:\n{contrato}\n\n"
            f"FALTA el archivo '{target}': otros módulos lo importan pero no existe.\n"
            f"QUIÉN LO USA Y QUÉ LE PIDE:\n{usos or '(no se detectaron usos concretos)'}\n\n"
            f"Escribe su contenido COMPLETO definiendo EXACTAMENTE esos símbolos, "
            f"con esos nombres, para que el proyecto se ejecute."
        )
        data = self._chat(_WRITER_SYS, user)
        return data.get("content") or ""

    @staticmethod
    def _quien_lo_usa(target: str, files: list[GeneratedFile]) -> str:
        """Líneas de otros archivos que importan o usan el módulo que falta.

        Sin esto, el módulo se genera "a ojo" y define nombres parecidos pero
        distintos a los que sus consumidores esperan.
        """
        modulo = target.rpartition("/")[2][:-3]
        hallazgos: list[str] = []
        for f in files:
            if not f.path.endswith(".py") or f.path == target:
                continue
            for linea in f.content.split("\n"):
                limpia = linea.strip()
                if f"{modulo}." in limpia or f"import {modulo}" in limpia:
                    hallazgos.append(f"  [{f.path}] {limpia[:110]}")
                if len(hallazgos) >= 25:
                    return "\n".join(hallazgos)
        return "\n".join(hallazgos)

    def _repair(self, files: list[GeneratedFile], language: str) -> list[GeneratedFile]:
        blob = "\n\n".join(f"--- {f.path} ---\n{f.content}" for f in files)
        if len(blob) > _MAX_REPAIR_CHARS:
            logger.warning("Proyecto grande; se omite el pase de reparación.")
            return files

        try:
            data = self._chat(_REPAIR_SYS, f"[Idioma: {language}]\n\nARCHIVOS:\n{blob}")
        except ProjectGenerationError as exc:
            logger.warning("Pase de reparación falló (%s); se entrega sin reparar.", exc)
            return files

        by_path = {f.path: f for f in files}
        for fix in data.get("files", []):
            path, content = fix.get("path"), fix.get("content")
            if path and content is not None:
                path = _normalizar_ruta(path, set(by_path))
            if path and content is not None:
                content = _preparar_correccion(path, content)
            if path and content is not None and _correccion_valida(path, content, by_path.get(path)):
                by_path[path] = GeneratedFile(path=path, content=content)
                logger.info("Reparado: %s", path)
        return list(by_path.values())

    # ------------------------------------------------------------------
    # Auto-verificación: corregir con el ERROR REAL de ejecución
    # ------------------------------------------------------------------
    def aplicar_stubs(self, project: GeneratedProject) -> GeneratedProject:
        """Crea stubs para los símbolos que ningún módulo llegó a exportar."""
        original = {f.path: f.content for f in project.files}
        contenidos = crear_stubs_simbolos_js(original)
        contenidos = crear_stubs_metodos_modulo(contenidos)
        if contenidos == original:
            return project
        return GeneratedProject(
            name=project.name, summary=project.summary,
            files=[GeneratedFile(path=p, content=c) for p, c in contenidos.items()],
            run_instructions=project.run_instructions,
        )

    def repair_with_error(self, project: GeneratedProject, error: str) -> GeneratedProject:
        """Corrige el proyecto usando el traceback real que produjo al ejecutarse."""
        blob = "\n\n".join(f"--- {f.path} ---\n{f.content}" for f in project.files)
        if len(blob) > _MAX_REPAIR_CHARS:
            # Si el proyecto es enorme, mandamos solo los .py (donde está el fallo).
            blob = "\n\n".join(
                f"--- {f.path} ---\n{f.content}"
                for f in project.files
                if f.path.endswith(".py")
            )[:_MAX_REPAIR_CHARS]

        user = (
            f"El proyecto FALLÓ al ejecutarse. Este es el error REAL:\n\n"
            f"```\n{error}\n```\n\n"
            f"ARCHIVOS DEL PROYECTO:\n{blob}\n\n"
            f"Corrige EXACTAMENTE la causa de ese error."
        )

        try:
            data = self._chat(_FIX_SYS, user)
        except ProjectGenerationError as exc:
            logger.warning("No se pudo corregir con el error real (%s); se deja igual.", exc)
            return project

        by_path = {f.path: f for f in project.files}
        for fix in data.get("files", []):
            path, content = fix.get("path"), fix.get("content")
            if path and content is not None:
                path = _normalizar_ruta(path, set(by_path))
            if path and content is not None:
                content = _preparar_correccion(path, content)
            if path and content is not None and _correccion_valida(path, content, by_path.get(path)):
                by_path[path] = GeneratedFile(path=path, content=content)
                logger.info("Auto-corregido con error real: %s", path)

        # Los arreglos deterministas se aplican TAMBIÉN aquí. Corrían solo al
        # generar, pero el reparador escribe código nuevo que puede reintroducir
        # justo lo que esos pases resuelven: añadía un `import './x.css'` sin
        # crear el archivo y el build volvía a romperse por un fallo ya resuelto.
        return GeneratedProject(
            name=project.name,
            summary=project.summary,
            files=_normalizar_proyecto(list(by_path.values()), getattr(self, "_motor", None)),
            run_instructions=project.run_instructions,
        )

    # ------------------------------------------------------------------
    # Cliente LLM (multi-modelo con fallback)
    # ------------------------------------------------------------------
    def _chat(self, system: str, user: str) -> dict:
        """Llama al LLM (con fallback entre proveedores) y devuelve JSON."""
        try:
            return self._llm.chat_json(system, user, temperature=0.2)
        except LLMError as exc:
            raise ProjectGenerationError(str(exc)) from exc
