"""Arreglos deterministas de sintaxis para el código Python generado.

Algunos errores del código generado son puramente mecánicos: tienen una única
solución correcta y no hace falta un modelo de lenguaje para aplicarla. Pedirle
al agente que "no cometa ese error" resultó poco fiable —se le indicó la regla
de forma explícita y volvió a cometerlo—, así que se corrige aquí, en código.

Hoy cubre el más frecuente con FastAPI:

    SyntaxError: parameter without a default follows parameter with a default

que aparece al escribir la dependencia detrás de parámetros con valor por defecto:

    def listar(skip: int = 0, db: Annotated[Session, Depends(get_db)]): ...

La solución mecánica es mover los parámetros sin valor por defecto delante de
los que sí lo tienen; el significado de la función no cambia porque FastAPI
resuelve estos argumentos por nombre.
"""

from __future__ import annotations

import ast
import json
import logging
import os
import re
import subprocess
import tempfile


def _js_valido(codigo: str) -> bool:
    """True si el código JavaScript es sintácticamente válido (`node --check`).

    Sirve para que un arreglo determinista NUNCA entregue código roto: si su
    transformación no pasa `node --check`, se descarta y se conserva el original.
    """
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as t:
            t.write(codigo)
            ruta = t.name
        try:
            r = subprocess.run(["node", "--check", ruta], capture_output=True, timeout=20)
            return r.returncode == 0
        finally:
            os.unlink(ruta)
    except (OSError, subprocess.SubprocessError):
        return True  # Sin node no se puede juzgar: no se bloquea el arreglo.

logger = logging.getLogger(__name__)

_DEF = re.compile(r"\b(?:async\s+)?def\s+\w+\s*\(")
_APERTURA = {"(": ")", "[": "]", "{": "}"}

# Módulos que arrancan la aplicación: nunca son origen de símbolos compartidos.
_ENTRADAS = {"main", "app", "server", "wsgi", "asgi"}


def sanear(path: str, content: str) -> str:
    """Devuelve el código corregido si se puede arreglar mecánicamente.

    Se aplican dos familias de arreglos:
      * de API obsoleta, que compilan pero fallan al ejecutarse;
      * de sintaxis, solo si el archivo no compila.
    Si nada aplica, devuelve el contenido tal cual: nunca empeora lo que recibe.
    """
    if not path.endswith(".py"):
        return content

    # ORDEN IMPORTANTE: primero la sintaxis. Los arreglos de API exigen que el
    # resultado compile para aceptarse, así que sobre un archivo que aún no
    # compila se descartarían siempre, aunque fueran correctos.
    try:
        compile(content, path, "exec")
    except SyntaxError as exc:
        if "follows parameter with a default" not in (exc.msg or ""):
            return content  # No sabemos arreglar este error; nada más que hacer.
        content = _aplicar(path, content, _reordenar_parametros, "parámetros reordenados")
        try:
            compile(content, path, "exec")
        except SyntaxError:
            return content  # Sigue sin compilar: los arreglos de API no aplican.

    return _aplicar(path, content, _modernizar_template_response,
                    "TemplateResponse actualizado a la firma moderna")


def _aplicar(path: str, content: str, arreglo, descripcion: str) -> str:
    """Aplica un arreglo solo si produce algo que compila."""
    propuesta = arreglo(content)
    if propuesta is None or propuesta == content:
        return content
    try:
        compile(propuesta, path, "exec")
    except SyntaxError:
        return content  # El arreglo rompió algo: se descarta.
    logger.info("Arreglo automático en %s: %s.", path, descripcion)
    return propuesta


# ----------------------------------------------------------------------
def contrato_markdown(archivos: dict[str, str]) -> str:
    """Índice de lo que expone cada archivo, para dárselo al siguiente agente.

    Sustituye al volcado de código anterior como contexto. Enviar 24.000
    caracteres de código no evitaba que el modelo escribiera `database.get_db`
    cuando `get_db` vive en otro módulo: recibía mucho texto pero se le perdía
    DÓNDE vive cada cosa. Un índice de símbolos es ~15 veces más pequeño y
    responde justo esa pregunta.

    Se calcula parseando el código, sin llamar a ningún modelo: es gratis y no
    puede equivocarse, cosa que un resumen escrito por un agente sí podría.
    """
    lineas: list[str] = []
    otros: list[str] = []

    for path in sorted(archivos):
        if path.endswith(".py"):
            simbolos = _firmas(archivos[path])
        elif path.endswith((".js", ".mjs")):
            simbolos = _firmas_js(archivos[path])
        else:
            otros.append(path)
            continue

        lineas.append(f"### {path}")
        lineas.extend(f"- {s}" for s in simbolos) if simbolos else lineas.append(
            "- (sin símbolos públicos)"
        )
        lineas.append("")

    if otros:
        lineas.append("### Otros archivos ya creados")
        lineas.extend(f"- {p}" for p in otros)

    return "\n".join(lineas).strip()


_JS_FUNC = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)", re.M)
_JS_ARROW = re.compile(r"^\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>", re.M)
_JS_CLASS = re.compile(r"^\s*(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?", re.M)
_JS_EXPORTS = re.compile(r"module\.exports\s*=\s*\{([^}]*)\}", re.S)
_JS_EXPORT_UNO = re.compile(r"^\s*(?:module\.)?exports\.(\w+)\s*=", re.M)
_JS_RUTA = re.compile(r"\b(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)", re.I)
_JS_MODELO = re.compile(r"\b(?:sequelize|db)\.define\s*\(\s*['\"](\w+)", re.I)


def _firmas_js(contenido: str) -> list[str]:
    """Símbolos que expone un archivo JavaScript.

    Node no ofrece un analizador sintáctico accesible desde Python, así que se
    extraen por patrones. Es menos riguroso que el AST de Python, pero cubre lo
    que el modelo necesita saber —qué funciones y rutas existen y dónde— y es
    muchísimo mejor que dejar los proyectos Node sin contrato, que era la razón
    por la que Node arrastraba más errores de coherencia.
    """
    salida: list[str] = []

    for nombre, args in _JS_FUNC.findall(contenido):
        salida.append(f"{nombre}({args.strip()})")
    for nombre, args in _JS_ARROW.findall(contenido):
        salida.append(f"{nombre}({args.strip()})")
    for nombre, base in _JS_CLASS.findall(contenido):
        salida.append(f"class {nombre}" + (f" extends {base}" if base else ""))
    for nombre in _JS_MODELO.findall(contenido):
        salida.append(f"modelo {nombre}")

    # Endpoints: para un router es lo único que de verdad importa fuera.
    rutas = [f"{m.upper()} {r}" for m, r in _JS_RUTA.findall(contenido)]
    salida.extend(f"ruta {r}" for r in rutas[:15])

    # Lo que el módulo exporta de verdad.
    exportados: list[str] = []
    for bloque in _JS_EXPORTS.findall(contenido):
        exportados += [
            p.split(":")[0].strip() for p in bloque.split(",")
            if p.strip() and not p.strip().startswith("//")
        ]
    exportados += _JS_EXPORT_UNO.findall(contenido)
    if exportados:
        salida.append("exporta: " + ", ".join(dict.fromkeys(e for e in exportados if e)))

    return list(dict.fromkeys(salida))


def _firmas(contenido: str) -> list[str]:
    """Funciones, clases y constantes que el módulo expone, con su firma."""
    try:
        arbol = ast.parse(contenido)
    except SyntaxError:
        return []

    salida: list[str] = []
    for nodo in arbol.body:
        if isinstance(nodo, (ast.FunctionDef, ast.AsyncFunctionDef)):
            salida.append(_firma_funcion(nodo))
        elif isinstance(nodo, ast.ClassDef):
            bases = ", ".join(_texto(b) for b in nodo.bases)
            campos = [
                n.target.id for n in nodo.body
                if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name)
            ]
            metodos = [
                n.name for n in nodo.body
                if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                and not n.name.startswith("_")
            ]
            detalle = f"class {nodo.name}({bases})" if bases else f"class {nodo.name}"
            if campos:
                detalle += " · campos: " + ", ".join(campos[:12])
            if metodos:
                detalle += " · métodos: " + ", ".join(metodos[:8])
            salida.append(detalle)
        elif isinstance(nodo, ast.Assign):
            for destino in nodo.targets:
                if isinstance(destino, ast.Name) and not destino.id.startswith("_"):
                    salida.append(destino.id)
    return salida


def _firma_funcion(nodo: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    """Renderiza `nombre(arg: tipo, ...) -> retorno`."""
    partes = []
    args = nodo.args
    for arg in args.args:
        partes.append(f"{arg.arg}: {_texto(arg.annotation)}" if arg.annotation else arg.arg)
    if args.vararg:
        partes.append(f"*{args.vararg.arg}")
    for arg in args.kwonlyargs:
        partes.append(f"{arg.arg}: {_texto(arg.annotation)}" if arg.annotation else arg.arg)
    if args.kwarg:
        partes.append(f"**{args.kwarg.arg}")

    retorno = f" -> {_texto(nodo.returns)}" if nodo.returns else ""
    prefijo = "async " if isinstance(nodo, ast.AsyncFunctionDef) else ""
    return f"{prefijo}{nodo.name}({', '.join(partes)}){retorno}"


def _texto(nodo: ast.AST | None) -> str:
    """Anotación como texto, recortada para que el contrato no se infle."""
    if nodo is None:
        return ""
    try:
        texto = ast.unparse(nodo)
    except Exception:  # noqa: BLE001
        return "?"
    return texto if len(texto) <= 60 else texto[:57] + "..."


# ----------------------------------------------------------------------
def arreglar_estructura_vite(archivos: dict[str, str]) -> dict[str, str]:
    """Coloca el `index.html` donde Vite lo necesita y con su script de entrada.

    El generador mezcla convenciones: escribe `frontend/public/index.html`, que
    es lo de Create React App, cuando Vite exige `frontend/index.html` en la
    raíz. El build falla en 20 ms con

        Could not resolve entry module "index.html"

    y el proyecto se queda sin interfaz. Además, el index de CRA no incluye el
    `<script type="module">` que carga la aplicación, así que aunque estuviera
    en su sitio la página saldría en blanco.
    """
    frontends = {
        ruta.rsplit("/", 1)[0] for ruta in archivos
        if ruta.endswith("package.json") and "vite" in archivos[ruta].lower()
    }
    if not frontends:
        return archivos

    resultado = dict(archivos)
    for base in frontends:
        prefijo = f"{base}/" if base else ""
        raiz = f"{prefijo}index.html"
        publico = f"{prefijo}public/index.html"

        if raiz not in resultado and publico in resultado:
            resultado[raiz] = resultado.pop(publico)
            logger.info("Arreglo automático: '%s' movido a '%s' (lo exige Vite).",
                        publico, raiz)

        if raiz in resultado:
            resultado[raiz] = _asegurar_script_entrada(resultado[raiz], resultado, prefijo)

    return resultado


_JSX = re.compile(r"</[A-Za-z][\w.]*>|<[A-Z][\w.]*[\s/>]|<>\s*$", re.M)
# Sin ancla de inicio de línea: el modelo a veces escribe TODO el archivo en una
# sola línea, y con `^...import` solo se veía el primer import de cada línea.
_IMPORT_CSS = re.compile(r"""import\s+['"](\.{1,2}/[^'"]+\.css)['"]""")


_IMPORT_NOMBRADO_JS = re.compile(
    r"""(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(['"](\.{1,2}/[^'"]+)['"]\)"""
    r"""|import\s*\{([^}]+)\}\s*from\s*['"](\.{1,2}/[^'"]+)['"]"""
)
_EXPORTA_JS = re.compile(
    r"""module\.exports\s*=\s*\{([^}]*)\}|(?:module\.)?exports\.(\w+)\s*=|"""
    r"""export\s+(?:const|let|var|function|class)\s+(\w+)|export\s*\{([^}]*)\}"""
)


def revisar_simbolos_js(archivos: dict[str, str]) -> str | None:
    """Detecta símbolos importados que el módulo de origen NO exporta.

    Produce el fallo más desconcertante de Node, porque el import parece
    correcto y el programa muere al usarlo:

        TypeError: authorizeRoles is not a function

    Se devuelve un informe para que el agente reparador vea de golpe todos los
    desajustes, en vez de descubrirlos de uno en uno al arrancar.
    """
    exportados: dict[str, set[str]] = {}
    for ruta, contenido in archivos.items():
        if ruta.endswith((".js", ".jsx")):
            exportados[ruta.rsplit(".", 1)[0]] = _simbolos_exportados_js(contenido)

    problemas: dict[str, dict] = {}
    for ruta, contenido in archivos.items():
        if not ruta.endswith((".js", ".jsx")):
            continue
        carpeta = ruta.rsplit("/", 1)[0]
        for grupo in _IMPORT_NOMBRADO_JS.findall(contenido):
            nombres_txt = grupo[0] or grupo[2]
            relativa = grupo[1] or grupo[3]
            if not nombres_txt or not relativa:
                continue
            base = _resolver(carpeta, relativa)
            if base is None:
                continue
            base = base.rsplit(".", 1)[0] if base.endswith((".js", ".jsx")) else base
            disponibles = exportados.get(base)
            if disponibles is None:
                continue  # El módulo no existe: eso lo cubre otro pase.

            for nombre in (n.split(":")[0].strip() for n in nombres_txt.split(",")):
                if nombre and nombre not in disponibles:
                    problemas.setdefault(base, {"faltan": set(), "tiene": disponibles,
                                                "usado_por": set()})
                    problemas[base]["faltan"].add(nombre)
                    problemas[base]["usado_por"].add(ruta)

    if not problemas:
        return None

    total = sum(len(d["faltan"]) for d in problemas.values())
    logger.warning("Símbolos JS que no existen: %d, en %d módulo(s).", total, len(problemas))

    # Se agrupa POR MÓDULO DE ORIGEN. Listar 17 imports sueltos hacía que el
    # reparador los fuera parcheando de uno en uno y no convergiera; agrupados
    # son dos o tres archivos a los que añadir unas funciones, que es una única
    # acción clara por archivo.
    lineas = []
    for modulo, datos in sorted(problemas.items()):
        usado = sorted(datos["usado_por"])[:3]
        lineas.append(
            f"  · {modulo}.js DEBE EXPORTAR ADEMÁS: {', '.join(sorted(datos['faltan']))}\n"
            f"      (ahora solo exporta: {', '.join(sorted(datos['tiene'])) or 'nada'})\n"
            f"      lo necesitan: {', '.join(usado)}"
        )

    return (
        f"FALTAN EXPORTS. {total} símbolo(s) se importan pero sus módulos no los "
        f"definen; al usarlos el programa muere con `X is not a function`.\n"
        f"LA FORMA CORRECTA DE ARREGLARLO es IMPLEMENTAR Y EXPORTAR lo que falta "
        f"en cada módulo de origen (NO cambiar los imports uno por uno, que son "
        f"muchos y están bien):\n" + "\n".join(lineas[:8])
    )


def crear_stubs_simbolos_js(archivos: dict[str, str]) -> dict[str, str]:
    """Genera stubs para los símbolos que un módulo debe exportar y no tiene.

    Cuando faltan MUCHAS funciones a la vez (p. ej. seis validaciones), el
    reparador no las implementa en una pasada y el bucle se atasca. Antes que
    entregar nada, se añaden stubs SEGUROS que exportan cada símbolo: el sistema
    compila y arranca, y esas funciones quedan como ejercicio para el modo
    profesor. Un MVP que funciona con validaciones a medias vale más que uno que
    no arranca.
    """
    exportados = {
        ruta.rsplit(".", 1)[0]: _simbolos_exportados_js(cont)
        for ruta, cont in archivos.items() if ruta.endswith((".js", ".jsx"))
    }

    # Qué símbolos faltan en cada módulo de origen (misma detección del informe).
    faltan_por_modulo: dict[str, set[str]] = {}
    for ruta, contenido in archivos.items():
        if not ruta.endswith((".js", ".jsx")):
            continue
        carpeta = ruta.rsplit("/", 1)[0]
        for grupo in _IMPORT_NOMBRADO_JS.findall(contenido):
            nombres_txt = grupo[0] or grupo[2]
            relativa = grupo[1] or grupo[3]
            if not nombres_txt or not relativa:
                continue
            base = _resolver(carpeta, relativa)
            if base is None:
                continue
            base = base.rsplit(".", 1)[0] if base.endswith((".js", ".jsx")) else base
            disponibles = exportados.get(base)
            if disponibles is None:
                continue
            for nombre in (n.split(":")[0].strip() for n in nombres_txt.split(",")):
                if nombre and nombre not in disponibles and nombre.isidentifier():
                    faltan_por_modulo.setdefault(base, set()).add(nombre)

    if not faltan_por_modulo:
        return archivos

    resultado = dict(archivos)
    for base, faltan in faltan_por_modulo.items():
        ruta = next((f"{base}{e}" for e in (".js", ".jsx") if f"{base}{e}" in archivos), None)
        if ruta is None:
            continue
        contenido = resultado[ruta]
        es_esm = "export " in contenido and "module.exports" not in contenido
        es_backend = "/backend/" in f"/{ruta}"

        if es_esm:
            # Frontend/ESM: se añade cada export al final.
            cuerpo = ("() => ({ isValid: true, errors: {} })" if not es_backend
                      else "(req, res, next) => next()")
            stubs = "".join(
                f"\nexport const {n} = {cuerpo}; // TODO: implementar (stub automático)"
                for n in sorted(faltan)
            )
            resultado[ruta] = contenido.rstrip() + "\n" + stubs + "\n"
        else:
            # Backend/CommonJS: se define cada stub y se amplía module.exports.
            lista = ", ".join(sorted(faltan))
            defs = "".join(
                f"\nconst {n} = (req, res, next) => next(); // TODO: implementar (stub automático)"
                for n in sorted(faltan)
            )
            nuevo, hubo = _CJS_EXPORTS_LISTA.subn(
                lambda m: f"module.exports = {{ {m.group(1).strip()}, {lista} }};", contenido
            )
            if hubo:
                # Las defs deben ir ANTES del module.exports; se insertan al inicio.
                resultado[ruta] = defs.lstrip("\n") + "\n" + nuevo
            else:
                resultado[ruta] = (
                    defs.lstrip("\n") + "\n" + contenido.rstrip()
                    + f"\nmodule.exports = {{ ...(module.exports || {{}}), {lista} }};\n"
                )

        logger.info("Arreglo automático en %s: %d stub(s) generados para no atascar "
                    "el arranque: %s", ruta, len(faltan), sorted(faltan))
    return resultado


_REQUIRE_DEFAULT_LOCAL = re.compile(
    r"""(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*(['"])(\.{1,2}/[^'"]+)\2\s*\)"""
)


# Métodos que YA trae cualquier modelo/instancia de Sequelize (u ORMs afines).
# Stubbearlos fue catastrófico: tapaban `User.findOne`, `sequelize.define`, etc.,
# y dejaban la capa de datos entera sin funcionar. NUNCA se stubbean.
_METODOS_ORM = frozenset({
    # instancia de conexión
    "define", "authenticate", "sync", "transaction", "query", "close",
    "getQueryInterface", "model", "models", "literal", "fn", "col", "where",
    # métodos de modelo
    "create", "bulkCreate", "findOne", "findAll", "findByPk", "findOrCreate",
    "findAndCountAll", "count", "max", "min", "sum", "update", "destroy",
    "upsert", "build", "save", "reload", "increment", "decrement",
    "belongsTo", "hasOne", "hasMany", "belongsToMany", "addHook", "beforeCreate",
    "scope", "unscoped", "init", "associate", "restore", "truncate",
})


def _es_modulo_orm(contenido: str) -> bool:
    """¿El módulo exporta una instancia de ORM o de un cliente de BD nativo?

    Estos módulos NUNCA se stubbean: sus métodos (`run`, `get`, `all`,
    `findOne`…) los trae la librería, no el archivo. Lección de
    'multiplicando-aventuras': un stub adjuntado sobre `new sqlite3.Database`
    PISÓ los métodos reales y todo callback de BD murió en silencio (login
    colgado para siempre).
    """
    return bool(
        re.search(r"\bsequelize\s*\.\s*define\s*\(", contenido)
        or re.search(r"\bnew\s+Sequelize\s*\(", contenido)
        or re.search(r"\bDataTypes\b", contenido)
        or re.search(r"=>\s*\{[^}]*sequelize\.define", contenido, re.S)  # fábrica (sequelize) => {...}
        or re.search(r"\bnew\s+sqlite3\.Database\s*\(", contenido)
        or re.search(r"require\(\s*['\"]better-sqlite3['\"]\s*\)", contenido)
        or re.search(r"\bnew\s+Database\s*\(", contenido)
    )


def crear_stubs_metodos_modulo(archivos: dict[str, str]) -> dict[str, str]:
    """Añade stubs para métodos de módulo usados pero no exportados.

    El router hace `const auth = require('./middleware/auth')` y luego usa
    `auth.authorize(...)`. Si `auth.js` no exporta `authorize`, esa expresión es
    `undefined`, y Express muere con "Route.post() requires a callback but got
    undefined". Es como los stubs de símbolos importados, pero para el acceso
    `modulo.metodo`, que el detector de imports destructurados no ve.

    GUARDAS (aprendidas a la mala): jamás stubbea métodos de un modelo o de la
    conexión Sequelize —los trae el ORM— ni reemplaza `module.exports` cuando ya
    apunta a algo que no es un objeto literal (un modelo, un router, una
    instancia): en ese caso ADJUNTA la propiedad para no destruir el export real.
    """
    exportados = {
        ruta.rsplit(".", 1)[0]: _simbolos_exportados_js(cont)
        for ruta, cont in archivos.items() if ruta.endswith((".js", ".jsx"))
    }
    # Módulos que NO se pueden tocar: son instancias/modelos del ORM.
    intocables = {
        ruta.rsplit(".", 1)[0]
        for ruta, cont in archivos.items()
        if ruta.endswith((".js", ".jsx")) and _es_modulo_orm(cont)
    }
    faltan_por_modulo: dict[str, set[str]] = {}

    for ruta, contenido in archivos.items():
        if not ruta.endswith((".js", ".jsx")):
            continue
        carpeta = ruta.rsplit("/", 1)[0]
        # alias local -> módulo del proyecto que representa
        alias: dict[str, str] = {}
        for var, _, rel in _REQUIRE_DEFAULT_LOCAL.findall(contenido):
            base = _resolver(carpeta, rel)
            if base:
                base = base.rsplit(".", 1)[0] if base.endswith((".js", ".jsx")) else base
                if base in exportados:
                    alias[var] = base
        if not alias:
            continue
        # usos `alias.metodo`
        for var, base in alias.items():
            if base in intocables:
                continue  # es un modelo/conexión Sequelize: no se stubbea nada
            for m in re.finditer(rf"\b{re.escape(var)}\.(\w+)", contenido):
                metodo = m.group(1)
                if metodo in _METODOS_ORM:
                    continue  # método propio del ORM: existe aunque no se "exporte"
                if metodo not in exportados.get(base, set()) and metodo.isidentifier():
                    faltan_por_modulo.setdefault(base, set()).add(metodo)

    if not faltan_por_modulo:
        return archivos

    resultado = dict(archivos)
    for base, metodos in faltan_por_modulo.items():
        ruta = next((f"{base}{e}" for e in (".js", ".jsx") if f"{base}{e}" in archivos), None)
        if ruta is None:
            continue
        contenido = resultado[ruta]
        es_esm = "export " in contenido and "module.exports" not in contenido
        # Stub que sirve tanto de middleware como de fábrica de middleware.
        cuerpo = "(...args) => (req, res, next) => (next ? next() : undefined)"
        if es_esm:
            stubs = "".join(f"\nexport const {m} = {cuerpo}; // TODO (stub automático)"
                            for m in sorted(metodos))
            nuevo = contenido.rstrip() + "\n" + stubs + "\n"
        else:
            lista = ", ".join(sorted(metodos))
            defs = "".join(f"\nconst {m} = {cuerpo}; // TODO (stub automático)"
                           for m in sorted(metodos))
            nuevo2, hubo = _CJS_EXPORTS_LISTA.subn(
                lambda mm: f"module.exports = {{ {mm.group(1).strip()}, {lista} }};", contenido)
            if hubo:
                # Había un export objeto-literal: se inyecta dentro. Seguro.
                nuevo = defs.lstrip("\n") + "\n" + nuevo2
            else:
                # `module.exports` apunta a un modelo/router/instancia. NO se
                # reemplaza: se ADJUNTA cada método como propiedad, y SOLO si no
                # existe ya — una instancia (sqlite3.Database) trae los suyos y
                # pisarlos mata la aplicación en silencio.
                attach = "".join(
                    f"\nif (module.exports && module.exports.{m} === undefined) "
                    f"module.exports.{m} = {m};"
                    for m in sorted(metodos))
                nuevo = (defs.lstrip("\n") + "\n" + contenido.rstrip() + attach + "\n")
        if _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: %d método(s) de módulo con stub "
                        "(usados como `modulo.metodo` sin existir): %s",
                        ruta, len(metodos), sorted(metodos))
    return resultado


def garantizar_jwt_secret(archivos: dict[str, str]) -> dict[str, str]:
    """Da un valor por defecto a `process.env.JWT_SECRET`.

    El login llama `jwt.sign(payload, process.env.JWT_SECRET, ...)`. Si la
    variable no está en el entorno (casi nunca lo está en la verificación),
    `jsonwebtoken` lanza "secretOrPrivateKey must have a value" y el login
    devuelve 400: el usuario ve un formulario que "no hace nada". Se le da un
    secreto de desarrollo cuando no viene del entorno. Idempotente (el lookahead
    evita volver a envolver lo ya envuelto).
    """
    patron = re.compile(r"process\.env\.JWT_SECRET(?!\s*\|\|)")
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith((".js", ".jsx")) or "JWT_SECRET" not in contenido:
            continue
        nuevo = patron.sub("(process.env.JWT_SECRET || 'dev_secret_no_produccion')", contenido)
        if nuevo != contenido and _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: JWT_SECRET con valor por defecto.", ruta)
    return resultado


def inyectar_token_axios(archivos: dict[str, str]) -> dict[str, str]:
    """Adjunta el token JWT guardado a cada petición de axios.

    Tras iniciar sesión, el frontend guarda `user.token` pero no lo manda en las
    llamadas siguientes; las rutas protegidas responden 401 y las pantallas salen
    vacías (o parecen rotas). Se añade UN interceptor en el módulo de API. Solo
    actúa si el proyecto usa axios y aún no tiene un interceptor de request.

    LECCIÓN (tienda de repostería): si el módulo crea una INSTANCIA con
    `axios.create()`, el interceptor debe registrarse en esa instancia — uno
    global jamás se ejecuta para las llamadas de la instancia. Y si un llamador
    puso un header explícito roto ('Bearer undefined' porque olvidó pasar el
    token), el guardado tiene prioridad.
    """
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith((".js", ".jsx")):
            continue
        usa_axios = "from 'axios'" in contenido or 'from "axios"' in contenido
        exporta_api = "/auth/login" in contenido or "API_URL" in contenido or "/api" in contenido
        if not (usa_axios and exporta_api) or "interceptors.request" in contenido:
            continue

        def _inter(objetivo: str) -> str:
            return (
                "\n// Adjunta el token JWT guardado (si existe) a cada petición.\n"
                f"{objetivo}.interceptors.request.use((config) => {{\n"
                "  try {\n"
                "    const u = JSON.parse(localStorage.getItem('user') || 'null');\n"
                "    const previo = config.headers.Authorization;\n"
                "    // Solo se respeta un header explícito si tiene forma real de JWT:\n"
                "    // 'Bearer undefined' o 'Bearer [object Object]' se corrigen solos.\n"
                "    const roto = !previo || !/^Bearer [A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/.test(previo);\n"
                "    if (u && u.token && roto) config.headers.Authorization = `Bearer ${u.token}`;\n"
                "  } catch (e) { /* noop */ }\n"
                "  return config;\n"
                "});\n"
            )

        m_inst = re.search(r"(?:const|let|var)\s+(\w+)\s*=\s*axios\.create\(", contenido)
        if m_inst:
            # En la instancia, justo después de su creación.
            fin = _fin_de_sentencia(contenido, m_inst.start())
            nuevo = (contenido[:fin] + "\n" + _inter(m_inst.group(1))
                     + contenido[fin:])
        else:
            m = re.search(r"^\s*import\s+axios\s+from\s+['\"]axios['\"];?\s*$",
                          contenido, re.M)
            if m:
                nuevo = contenido[:m.end()] + "\n" + _inter("axios") + contenido[m.end():]
            else:
                nuevo = _inter("axios") + contenido
        if _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: interceptor de token axios.", ruta)
    return resultado


def enganchar_seed(archivos: dict[str, str]) -> dict[str, str]:
    """Llama a la función semilla tras inicializar la base de datos.

    Es común que el modelo escriba `config/seed.js` (crea el usuario admin y
    datos base) pero NUNCA lo invoque desde el arranque: la BD queda vacía y no
    hay con qué iniciar sesión. Se detecta la semilla y el `.then()` de
    `initialize()`/`sync()` en el entry y se cuela la llamada dentro.
    """
    # 1) localizar el archivo semilla: en el NOMBRE o en la CARPETA (el modelo
    #    también escribe `seeders/index.js`), que cree usuarios/datos.
    seed_mod = None
    auto_ejecuta = False
    for ruta, cont in archivos.items():
        if not ruta.endswith(".js") or "seed" not in ruta.lower():
            continue
        if not re.search(r"\.(create|bulkCreate|findOrCreate)\s*\(", cont):
            continue
        exporta = bool(re.search(r"module\.exports\s*=", cont))
        # ¿se ejecuta a sí misma al final? (`seedDatabase();` suelto)
        se_llama = bool(re.search(r"^\s*\w*[sS]eed\w*\s*\(\s*\)\s*;?\s*$", cont, re.M))
        if exporta or se_llama:
            seed_mod = ruta
            auto_ejecuta = se_llama and not exporta
            break
    if seed_mod is None:
        return archivos

    seed_base = seed_mod[:-3]  # sin .js
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".js") or ruta == seed_mod:
            continue
        # entry = el que encadena initialize()/sync() con .then y sirve rutas
        m = re.search(r"(\w[\w.]*)\.(initialize|sync)\s*\([^)]*\)\s*\.then\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{",
                      contenido)
        if m is None or "app." not in contenido:
            continue
        if "require(" in contenido and "seed" in contenido.lower() and "seedDatabase" in contenido:
            continue  # ya enganchado
        carpeta = ruta.rsplit("/", 1)[0]
        rel = _ruta_relativa_import(carpeta, seed_base)
        if auto_ejecuta:
            # La semilla corre sola al ser requerida: basta requerirla DENTRO
            # del then (con la BD ya lista), protegida para no tumbar nada.
            m2 = re.search(r"(\.(initialize|sync)\s*\([^)]*\)\s*\.then\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{)",
                           contenido)
            if m2 is None:
                continue
            inserta = (m2.group(1) +
                       f"\n    try {{ require('{rel}'); }} "
                       f"catch (e) {{ console.warn('semilla:', e.message); }}")
            cuerpo = contenido[:m2.start()] + inserta + contenido[m2.end():]
        else:
            req_line = f"const seedDatabase = require('{rel}');\n"
            # insertar require tras el primer require del archivo
            mr = re.search(r"^(const .*=\s*require\([^)]*\);\s*)$", contenido, re.M)
            cuerpo = contenido if mr is None else contenido[:mr.end()] + "\n" + req_line + contenido[mr.end():]
            if mr is None:
                cuerpo = req_line + contenido
            # hacer el callback async y colar el await seed dentro del then
            m2 = re.search(r"(\.(initialize|sync)\s*\([^)]*\)\s*\.then\s*\(\s*)(async\s*)?(\(\s*\)\s*=>\s*\{)", cuerpo)
            if m2 is None:
                continue
            inserta = m2.group(1) + "async " + m2.group(4) + "\n    await seedDatabase();"
            cuerpo = cuerpo[:m2.start()] + inserta + cuerpo[m2.end():]
        if _js_valido(cuerpo):
            resultado[ruta] = cuerpo
            logger.info("Arreglo automático en %s: se engancha la semilla (%s).", ruta, seed_mod)
    return resultado


def _ruta_relativa_import(desde_carpeta: str, hacia_base: str) -> str:
    """Ruta de import estilo Node ('./x' o '../y/z') entre dos rutas del proyecto."""
    desde = desde_carpeta.split("/") if desde_carpeta else []
    hacia = hacia_base.split("/")
    i = 0
    while i < len(desde) and i < len(hacia) - 1 and desde[i] == hacia[i]:
        i += 1
    subidas = ["../"] * (len(desde) - i) or ["./"]
    resto = hacia[i:]
    return "".join(subidas) + "/".join(resto)


def alinear_contrato_auth(archivos: dict[str, str]) -> dict[str, str]:
    """Realinea los nombres del contrato de autenticación.

    Tres roturas típicas que dejan `login` como `undefined` (y en producción
    minificado: "i is not a function"):
      1) el contexto importa `{ login, register }` de la API, pero la API exporta
         `loginUser`/`registerUser`;
      2) el `value` del Provider expone `handleLogin` pero los componentes piden
         `login` (idem logout/register);
    Se corrige (1) aliasando el import y (2) añadiendo alias al `value`.
    """
    resultado = dict(archivos)
    alias_metodos = {"login": "handleLogin", "logout": "handleLogout", "register": "handleRegister"}

    # --- (1) imports de la API con nombres que no existen ---
    # símbolos exportados por cada módulo
    exp = {r.rsplit(".", 1)[0]: _simbolos_exportados_js(c)
           for r, c in archivos.items() if r.endswith((".js", ".jsx"))}
    for ruta, contenido in list(resultado.items()):
        if not ruta.endswith((".js", ".jsx")):
            continue
        carpeta = ruta.rsplit("/", 1)[0]
        nuevo = contenido
        for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*['\"]([^'\"]+)['\"]", contenido):
            nombres = [n.strip() for n in m.group(1).split(",") if n.strip()]
            rel = m.group(2)
            base = _resolver(carpeta, rel)
            if not base:
                continue
            base = base.rsplit(".", 1)[0] if base.endswith((".js", ".jsx")) else base
            disponibles = exp.get(base)
            if not disponibles:
                continue
            reemplazos = {}
            for n in nombres:
                if " as " in n:
                    continue
                if n not in disponibles:
                    # busca un exportado que sea `<n>User` o `<n>...` de sentido
                    for cand in (f"{n}User", f"{n}Usuario"):
                        if cand in disponibles:
                            reemplazos[n] = cand
                            break
            if reemplazos:
                nuevos_nombres = [f"{reemplazos[n]} as {n}" if n in reemplazos else n for n in nombres]
                bloque_nuevo = "import { " + ", ".join(nuevos_nombres) + " } from '" + rel + "'"
                nuevo = nuevo.replace(m.group(0).rstrip(";"), bloque_nuevo)
        if nuevo != contenido and _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: import de API realineado.", ruta)

    # --- (2) alias en el value del Provider de auth ---
    for ruta, contenido in list(resultado.items()):
        if not ruta.endswith(".jsx"):
            continue
        if "createContext" not in contenido or "Provider" not in contenido:
            continue
        m = re.search(r"value=\{\{([^}]*)\}\}", contenido)
        if m is None:
            continue
        cuerpo_val = m.group(1)
        claves = {p.split(":")[0].strip() for p in cuerpo_val.split(",") if p.strip()}
        extra = [f"{corto}: {largo}" for corto, largo in alias_metodos.items()
                 if largo in claves and corto not in claves]
        if not extra:
            continue
        nuevo_val = "value={{" + cuerpo_val.rstrip() + ", " + ", ".join(extra) + "}}"
        nuevo = contenido[:m.start()] + nuevo_val + contenido[m.end():]
        if _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: alias de auth en el Provider (%s).",
                        ruta, ", ".join(a.split(':')[0] for a in extra))
    return resultado


# Plantilla dorada del login (split-screen glassmorphism). Se inyecta tal cual,
# sustituyendo el login pobre que suele generar el modelo. Marcadores:
#   __USEAUTH_IMPORT__  línea de import de useAuth (se reusa la del proyecto)
#   __COMP__            nombre del componente (según el archivo)
#   __BRAND__           marca visible
#   __ADMIN_DEST__ / __GENERAL_DEST__  rutas de aterrizaje tras el login
_LOGIN_PREMIUM = r"""import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
__USEAUTH_IMPORT__
import './Login.css';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
    <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/>
  </svg>
);
const GithubIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M12 1a11 11 0 0 0-3.48 21.44c.55.1.75-.24.75-.53v-1.86c-3.06.67-3.7-1.47-3.7-1.47-.5-1.28-1.23-1.62-1.23-1.62-1-.68.08-.67.08-.67 1.1.08 1.68 1.14 1.68 1.14.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.7-1.47-2.44-.28-5.01-1.22-5.01-5.44 0-1.2.43-2.18 1.14-2.95-.11-.28-.5-1.4.11-2.92 0 0 .93-.3 3.05 1.13a10.6 10.6 0 0 1 5.56 0c2.12-1.43 3.05-1.13 3.05-1.13.61 1.52.22 2.64.11 2.92.71.77 1.14 1.75 1.14 2.95 0 4.23-2.58 5.15-5.03 5.43.39.34.74 1 .74 2.02v3c0 .29.2.64.76.53A11 11 0 0 0 12 1Z"/>
  </svg>
);
const EyeIcon = ({ off }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? (<><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" /></>)
        : (<><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" /></>)}
  </svg>
);
const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const __COMP__ = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [tocado, setTocado] = useState({ email: false, password: false });
  const auth = useAuth() || {};
  const navigate = useNavigate();

  const errEmail = tocado.email && !emailValido(email);
  const okEmail = emailValido(email);
  const errPass = tocado.password && password.length < 4;
  const okPass = password.length >= 4;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setTocado({ email: true, password: true });
    if (!emailValido(email) || password.length < 4) return;
    setCargando(true);
    try {
      const fn = auth.login || auth.signIn || auth.iniciarSesion;
      const usuario = fn ? await fn(email, password) : null;
      const destino = usuario && usuario.role === 'admin' ? '__ADMIN_DEST__' : '__GENERAL_DEST__';
      navigate(destino);
    } catch (err) {
      setError((err && err.response && err.response.data && err.response.data.error) || (err && err.message) || 'No se pudo iniciar sesión.');
    } finally {
      setCargando(false);
    }
  };

  const claseInput = (er, ok) => 'campo ' + (er ? 'campo--error ' : '') + (ok ? 'campo--ok' : '');

  return (
    <div className="auth">
      <aside className="auth__marca">
        <div className="auth__aurora" aria-hidden="true" />
        <div className="auth__marca-top"><span className="auth__logo">◈ __BRAND__</span></div>
        <div className="auth__marca-cuerpo">
          <h1 className="auth__titular">Bienvenido a<br />__BRAND__.</h1>
          <p className="auth__subtitular">Gestiona toda tu operación desde un solo lugar, de forma simple y ordenada.</p>
        </div>
        <div className="auth__marca-pie">© {new Date().getFullYear()} __BRAND__ · Panel de administración</div>
      </aside>
      <main className="auth__panel">
        <div className="auth__card">
          <div className="auth__card-head">
            <h2>Iniciar sesión</h2>
            <p>Bienvenido de vuelta. Ingresa tus credenciales.</p>
          </div>
          {error && <div className="auth__alerta" role="alert">{error}</div>}
          <form onSubmit={handleSubmit} noValidate>
            <label className="auth__label" htmlFor="email">Correo electrónico</label>
            <div className={claseInput(errEmail, okEmail)}>
              <input id="email" type="email" autoComplete="username" placeholder="tucorreo@ejemplo.com"
                value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTocado((t) => ({ ...t, email: true }))} />
            </div>
            {errEmail && <span className="auth__hint">Ingresa un correo válido.</span>}
            <div className="auth__label-row">
              <label className="auth__label" htmlFor="password">Contraseña</label>
              <a className="auth__link" href="#recuperar" onClick={(e) => e.preventDefault()}>¿Olvidaste tu contraseña?</a>
            </div>
            <div className={claseInput(errPass, okPass)}>
              <input id="password" type={verPass ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} onBlur={() => setTocado((t) => ({ ...t, password: true }))} />
              <button type="button" className="campo__ojo" onClick={() => setVerPass((v) => !v)} aria-label="Mostrar u ocultar contraseña"><EyeIcon off={verPass} /></button>
            </div>
            {errPass && <span className="auth__hint">Mínimo 4 caracteres.</span>}
            <button type="submit" className="auth__btn" disabled={cargando}>
              {cargando ? <span className="auth__spinner" aria-hidden="true" /> : null}
              {cargando ? 'Ingresando…' : 'Iniciar sesión'}
            </button>
          </form>
          <div className="auth__sep"><span>o continúa con</span></div>
          <div className="auth__social">
            <button type="button" className="auth__social-btn" onClick={(e) => e.preventDefault()}><GoogleIcon /> Google</button>
            <button type="button" className="auth__social-btn" onClick={(e) => e.preventDefault()}><GithubIcon /> GitHub</button>
          </div>
          <p className="auth__pie">¿No tienes una cuenta? <a className="auth__link" href="#crear" onClick={(e) => e.preventDefault()}>Crear una cuenta</a></p>
        </div>
      </main>
    </div>
  );
};

export default __COMP__;
"""

# CSS de la plantilla dorada (glassmorphism). Se escribe junto al componente.
_LOGIN_PREMIUM_CSS = """/* Login premium split-screen (glassmorphism) — inyectado por el generador */
/* position:fixed => el login ocupa la pantalla ENTERA aunque la app lo meta
   dentro de un contenedor con ancho máximo y padding. */
.auth { position:fixed; inset:0; overflow-y:auto; z-index:10; min-height:100vh; display:grid; grid-template-columns:1.05fr 1fr; font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; color:#0b1020; background:#f5f6fb; }
.auth__marca { position:relative; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between; padding:3rem 3.25rem; color:#eef0ff; background:linear-gradient(150deg,#14103a 0%,#2a1a6b 45%,#4b1e8f 100%); }
.auth__aurora { position:absolute; inset:-30%; background:radial-gradient(38% 38% at 20% 25%,rgba(124,92,255,.55),transparent 70%),radial-gradient(42% 42% at 80% 30%,rgba(236,72,153,.45),transparent 70%),radial-gradient(45% 45% at 60% 90%,rgba(56,189,248,.40),transparent 70%); filter:blur(10px); animation:aurora 16s ease-in-out infinite alternate; }
@keyframes aurora { 0%{transform:translate3d(0,0,0) scale(1);} 50%{transform:translate3d(3%,-2%,0) scale(1.08);} 100%{transform:translate3d(-3%,2%,0) scale(1.04);} }
.auth__marca>* { position:relative; z-index:1; }
.auth__logo { font-weight:800; letter-spacing:.14em; font-size:.95rem; }
.auth__titular { font-size:clamp(2rem,3.4vw,3rem); line-height:1.08; font-weight:800; letter-spacing:-.02em; margin:0 0 1rem; }
.auth__subtitular { font-size:1.02rem; line-height:1.6; color:#c8c9f2; max-width:32ch; opacity:.88; }
.auth__marca-pie { font-size:.78rem; opacity:.6; }
.auth__panel { display:flex; align-items:center; justify-content:center; padding:2rem; background:radial-gradient(60% 60% at 50% 0%,rgba(109,94,252,.10),transparent 60%),#f5f6fb; }
.auth__card { width:min(100%,420px); background:rgba(255,255,255,.72); backdrop-filter:blur(18px) saturate(160%); -webkit-backdrop-filter:blur(18px) saturate(160%); border:1px solid rgba(255,255,255,.8); box-shadow:0 20px 60px -20px rgba(24,16,72,.35); border-radius:22px; padding:2.25rem; animation:subir .55s cubic-bezier(.16,1,.3,1) both; }
@keyframes subir { from{opacity:0; transform:translateY(18px);} to{opacity:1; transform:translateY(0);} }
.auth__card-head h2 { margin:0; font-size:1.6rem; font-weight:800; letter-spacing:-.02em; }
.auth__card-head p { margin:.35rem 0 1.4rem; color:#626a85; font-size:.92rem; }
.auth__label { display:block; font-size:.82rem; font-weight:600; color:#384063; margin-bottom:.4rem; }
.auth__label-row { display:flex; align-items:baseline; justify-content:space-between; margin-top:1rem; }
.auth__link { color:#6d5efc; text-decoration:none; font-size:.8rem; font-weight:600; }
.auth__link:hover { text-decoration:underline; }
.campo { display:flex; align-items:center; background:#fff; border:1.5px solid #e2e5f0; border-radius:12px; padding:0 .5rem 0 .9rem; transition:border-color .18s,box-shadow .18s; }
.campo:focus-within { border-color:#6d5efc; box-shadow:0 0 0 4px rgba(109,94,252,.14); }
.campo input { flex:1; border:0; outline:0; background:transparent; padding:.8rem 0; font-size:.95rem; color:#0b1020; }
.campo input::placeholder { color:#9aa0b8; }
.campo--error { border-color:#ef4444 !important; }
.campo--ok { border-color:#22c55e; }
.campo__ojo { border:0; background:transparent; cursor:pointer; color:#8b93ad; padding:.4rem; display:grid; place-items:center; }
.auth__hint { display:block; margin-top:.4rem; color:#ef4444; font-size:.78rem; }
.auth__btn { width:100%; margin-top:1.4rem; display:flex; align-items:center; justify-content:center; gap:.55rem; border:0; border-radius:12px; cursor:pointer; padding:.9rem 1rem; font-size:.98rem; font-weight:700; color:#fff; background:linear-gradient(135deg,#6d5efc,#a855f7); box-shadow:0 10px 24px -8px rgba(109,94,252,.7); transition:transform .12s,box-shadow .18s,filter .18s; }
.auth__btn:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.05); }
.auth__btn:disabled { opacity:.8; cursor:default; }
.auth__spinner { width:16px; height:16px; border-radius:50%; border:2.5px solid rgba(255,255,255,.4); border-top-color:#fff; animation:girar .7s linear infinite; }
@keyframes girar { to { transform:rotate(360deg); } }
.auth__alerta { background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:.7rem .9rem; border-radius:10px; font-size:.85rem; margin-bottom:1rem; }
.auth__sep { display:flex; align-items:center; gap:1rem; margin:1.4rem 0; color:#9aa0b8; font-size:.78rem; }
.auth__sep::before,.auth__sep::after { content:''; flex:1; height:1px; background:#e2e5f0; }
.auth__social { display:grid; grid-template-columns:1fr 1fr; gap:.75rem; }
.auth__social-btn { display:flex; align-items:center; justify-content:center; gap:.5rem; border:1.5px solid #e2e5f0; background:#fff; border-radius:12px; padding:.7rem; font-size:.9rem; font-weight:600; color:#384063; cursor:pointer; transition:border-color .16s,background .16s,transform .12s; }
.auth__social-btn:hover { border-color:#cfd4e6; background:#fafbff; transform:translateY(-1px); }
.auth__pie { text-align:center; margin:1.5rem 0 0; font-size:.86rem; color:#626a85; }
@media (max-width:880px) { .auth { grid-template-columns:1fr; } .auth__marca { display:none; } .auth__panel { min-height:100vh; } }
@media (prefers-reduced-motion:reduce) { .auth__aurora,.auth__card,.auth__spinner { animation:none; } }
"""


def inyectar_login_premium(archivos: dict[str, str]) -> dict[str, str]:
    """Sustituye el login pobre por una pantalla split-screen premium.

    Regla de oro: no hacer daño. Solo actúa si el proyecto es React y hay UN
    componente de login claramente identificable (importa useAuth y tiene un
    campo de contraseña). Reusa la MISMA línea de import de useAuth del proyecto,
    y crea `Login.css` a su lado. Si algo no calza, devuelve todo intacto.
    """
    es_react = any(p.endswith("main.jsx") or p.endswith("App.jsx") for p in archivos)
    if not es_react:
        return archivos

    candidatos = []
    for ruta, cont in archivos.items():
        if not ruta.endswith(".jsx"):
            continue
        if "useAuth" not in cont:
            continue
        tiene_pass = ('type="password"' in cont or "type='password'" in cont
                      or "type={showPassword" in cont or "password" in cont.lower() and "input" in cont.lower())
        nombre = ruta.rsplit("/", 1)[-1].lower()
        if tiene_pass and ("login" in nombre or "signin" in nombre or "iniciar" in nombre):
            candidatos.append(ruta)
    if len(candidatos) != 1:
        return archivos  # ambiguo: mejor no tocar

    ruta = candidatos[0]
    cont = archivos[ruta]
    # Nota: el código generado suele apilar varios imports en la MISMA línea, así
    # que no se ancla a inicio/fin de línea; se extrae solo el import de useAuth.
    m = re.search(r"import\s*\{[^}]*\buseAuth\b[^}]*\}\s*from\s*['\"][^'\"]+['\"]\s*;?", cont)
    if m is None:
        return archivos
    useauth_import = m.group(0).strip()
    if not useauth_import.endswith(";"):
        useauth_import += ";"

    # marca a partir del texto del proyecto (título del index.html o package name)
    marca = "Panel"
    for r2, c2 in archivos.items():
        if r2.endswith("index.html"):
            t = re.search(r"<title>\s*([^<]+?)\s*</title>", c2)
            if t:
                marca = t.group(1).strip()[:28]
                break
    # rutas de aterrizaje según las que existan en el proyecto
    texto = "\n".join(archivos.values())
    def_dest = "/"
    admin_dest = "/admin" if 'path="/admin"' in texto or "path='/admin'" in texto else (
        "/dashboard" if "/dashboard" in texto else def_dest)
    general_dest = "/dashboard" if "/dashboard" in texto else (
        "/access-control" if "/access-control" in texto else def_dest)

    comp = re.sub(r"[^A-Za-z0-9]", "", ruta.rsplit("/", 1)[-1].rsplit(".", 1)[0]) or "Login"
    if comp[0].isdigit():
        comp = "Login" + comp

    nuevo = (_LOGIN_PREMIUM
             .replace("__USEAUTH_IMPORT__", useauth_import)
             .replace("__COMP__", comp)
             .replace("__BRAND__", marca)
             .replace("__ADMIN_DEST__", admin_dest)
             .replace("__GENERAL_DEST__", general_dest))
    if not _js_valido(nuevo):
        return archivos

    resultado = dict(archivos)
    resultado[ruta] = nuevo
    css_ruta = ruta.rsplit("/", 1)[0] + "/Login.css"
    resultado[css_ruta] = _LOGIN_PREMIUM_CSS
    logger.info("Arreglo automático: login premium inyectado en %s (marca '%s', dest admin '%s').",
                ruta, marca, admin_dest)
    return resultado


_ESTILOS_BASE = """/* Estilos base premium — inyectados por el generador.
   El modelo escribe classNames ('navbar', 'nav-links', 'form-group'...) pero
   casi nunca su CSS: sin esto la app sale en HTML crudo (links azules
   subrayados y viñetas). Aquí se visten las clases convencionales. */
:root { --brand:#6d5efc; --brand-2:#a855f7; --ink:#0b1020; --muted:#626a85; --tenue:#9aa0b8;
  --linea:#e7e9f3; --fondo:#f5f6fb; --panel:#fff; --radio:14px; --sombra:0 8px 24px -18px rgba(24,16,72,.3); }
* { box-sizing:border-box; }
body { margin:0; font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; color:var(--ink); background:var(--fondo); -webkit-font-smoothing:antialiased; }
h1,h2,h3 { letter-spacing:-.02em; }
.navbar { background:rgba(255,255,255,.85); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border-bottom:1px solid var(--linea); position:sticky; top:0; z-index:50; }
.navbar-container { max-width:1180px; margin:0 auto; padding:.75rem 1.5rem; display:flex; align-items:center; justify-content:space-between; gap:1.5rem; }
.navbar-logo { font-weight:800; font-size:1.05rem; color:var(--ink); text-decoration:none; white-space:nowrap; }
.navbar-logo::before { content:'\\25C8'; color:var(--brand); margin-right:.45rem; }
.nav-menu { list-style:none; display:flex; align-items:center; flex-wrap:wrap; gap:.25rem; margin:0; padding:0; }
.nav-item { display:flex; }
.nav-links { display:inline-flex; align-items:center; padding:.5rem .8rem; border-radius:10px; font-size:.9rem; font-weight:600; color:var(--muted); text-decoration:none; background:transparent; border:0; cursor:pointer; font-family:inherit; transition:background .16s,color .16s; }
.nav-links:hover { background:#f1f0ff; color:var(--brand); }
.nav-menu li:last-child .nav-links, .nav-links--salir { color:#fff; background:linear-gradient(135deg,var(--brand),var(--brand-2)); box-shadow:0 8px 18px -10px rgba(109,94,252,.8); }
.nav-menu li:last-child .nav-links:hover, .nav-links--salir:hover { filter:brightness(1.06); color:#fff; }
.app { min-height:100vh; }
.content, .container { max-width:1180px; margin:0 auto; padding:2rem 1.5rem 3rem; }
.card, .section, .panel { background:var(--panel); border:1px solid var(--linea); border-radius:var(--radio); padding:1.4rem; box-shadow:var(--sombra); margin-bottom:1.1rem; }
.form-group { margin-bottom:1rem; display:flex; flex-direction:column; }
.form-group label, form label { font-size:.82rem; font-weight:600; color:#384063; margin-bottom:.4rem; }
input:not([type='checkbox']):not([type='radio']), select, textarea { width:100%; border:1.5px solid var(--linea); border-radius:12px; background:#fff; padding:.7rem .9rem; font-size:.95rem; font-family:inherit; color:var(--ink); outline:0; transition:border-color .18s,box-shadow .18s; }
input:focus, select:focus, textarea:focus { border-color:var(--brand); box-shadow:0 0 0 4px rgba(109,94,252,.14); }
input::placeholder, textarea::placeholder { color:var(--tenue); }
button, .btn { display:inline-flex; align-items:center; justify-content:center; gap:.5rem; border:0; border-radius:12px; padding:.7rem 1.15rem; font-size:.93rem; font-weight:700; font-family:inherit; color:#fff; background:linear-gradient(135deg,var(--brand),var(--brand-2)); box-shadow:0 10px 22px -12px rgba(109,94,252,.8); cursor:pointer; transition:transform .12s,filter .18s; }
button:hover:not(:disabled), .btn:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.05); }
button:disabled, .btn:disabled { opacity:.6; cursor:default; }
table { width:100%; border-collapse:collapse; font-size:.92rem; background:var(--panel); border-radius:var(--radio); overflow:hidden; }
th { text-align:left; font-size:.76rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); padding:.7rem .8rem; border-bottom:1px solid var(--linea); background:#fafbff; }
td { padding:.7rem .8rem; border-bottom:1px solid #f3f4fa; }
tr:last-child td { border-bottom:0; }
tbody tr:hover { background:#fafbff; }
.section ul, .card ul, .lista { list-style:none; margin:0; padding:0; display:grid; gap:.5rem; }
.section ul li, .card ul li, .lista li { padding:.65rem .8rem; border:1px solid var(--linea); border-radius:10px; background:#fff; font-size:.92rem; }
.error, .alert-error { background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:.7rem .9rem; border-radius:10px; font-size:.88rem; margin:.6rem 0; }
.success, .alert-success { background:#f0fdf4; border:1px solid #bbf7d0; color:#15803d; padding:.7rem .9rem; border-radius:10px; font-size:.88rem; margin:.6rem 0; }
@media (max-width:780px) { .navbar-container { flex-direction:column; align-items:flex-start; gap:.6rem; } .content, .container { padding:1.25rem 1rem 2.5rem; } }
"""


def inyectar_estilos_base(archivos: dict[str, str]) -> dict[str, str]:
    """Crea la hoja de estilos base y la importa en el arranque del frontend.

    El modelo escribe `className="navbar"`, `"nav-links"`, `"form-group"`… y casi
    nunca el CSS correspondiente: la app se ve como HTML sin estilos (links
    azules subrayados, viñetas). Esto viste las clases convencionales de una vez
    y sube el listón estético de TODAS las pantallas, no solo del login.
    """
    entrada = next((p for p in archivos if p.endswith("main.jsx")), None)
    if entrada is None:
        return archivos
    carpeta = entrada.rsplit("/", 1)[0]
    ruta_css = f"{carpeta}/estilos-base.css"
    resultado = dict(archivos)
    if ruta_css not in resultado:
        resultado[ruta_css] = _ESTILOS_BASE
    cont = resultado[entrada]
    if "estilos-base.css" not in cont:
        m = re.search(r"import\s+React\s+from\s+['\"]react['\"];?", cont)
        linea = "\nimport './estilos-base.css';\n"
        nuevo = cont[:m.end()] + linea + cont[m.end():] if m else linea + cont
        if _js_valido(nuevo):
            resultado[entrada] = nuevo
            logger.info("Arreglo automático: hoja de estilos base inyectada (%s).", ruta_css)
    return resultado


def ocultar_navbar_en_rutas_auth(archivos: dict[str, str]) -> dict[str, str]:
    """Esconde la barra de navegación en el login (y en registro).

    El login es una pantalla completa; un menú encima —y sin estilos— la parte
    por la mitad. Se envuelve el `return` en un ternario en lugar de hacer un
    `return` temprano: así TODOS los hooks se siguen llamando en el mismo orden
    y React no protesta con "rendered fewer hooks than expected".
    """
    rutas = "['/login','/register','/registro','/signup']"
    resultado = dict(archivos)
    for ruta, cont in archivos.items():
        if not ruta.endswith(".jsx"):
            continue
        nombre = ruta.rsplit("/", 1)[-1].lower()
        if "navbar" not in nombre and "header" not in nombre and "menu" not in nombre:
            continue
        if "_rutaActual" in cont or "react-router-dom" not in cont:
            continue
        if cont.count("return (") != 1:
            continue  # forma inesperada: no se toca
        nuevo = cont
        # 1) asegurar useLocation en el import de react-router-dom
        m = re.search(r"import\s*\{([^}]*)\}\s*from\s*['\"]react-router-dom['\"]", nuevo)
        if m is None:
            continue
        if "useLocation" not in m.group(1):
            nuevo = nuevo[:m.start(1)] + m.group(1).rstrip() + ", useLocation" + nuevo[m.end(1):]
        # 2) llamar el hook al abrir el componente (siempre, sin condicionales)
        mc = re.search(r"(const|function)\s+\w+\s*=?\s*\([^)]*\)\s*(=>)?\s*\{", nuevo)
        if mc is None:
            continue
        nuevo = nuevo[:mc.end()] + " const _rutaActual = useLocation().pathname;" + nuevo[mc.end():]
        # 3) el return se vuelve condicional
        nuevo = nuevo.replace("return (", f"return {rutas}.includes(_rutaActual) ? null : (", 1)
        if _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: barra oculta en rutas de login.", ruta)
    return resultado


def garantizar_contenido_visible(archivos: dict[str, str]) -> dict[str, str]:
    """Neutraliza las animaciones de scroll que dejan la página EN BLANCO.

    Patrón recurrente del modelo ("animaciones sutiles al hacer scroll"):

        section.style.opacity = '0';            // al cargar: TODO oculto
        window.addEventListener('scroll', ...)  // revela… solo si haces scroll

    Resultado: la página carga sin errores de consola pero no se ve NADA
    (y la rama else del listener re-oculta lo que sale del viewport). Como el
    contenido correcto está en el HTML, la única solución con garantía es no
    permitir jamás que el JS ponga la página en opacidad 0: se cambia cada
    `opacity = '0'` por '1' y el transform de ocultación por su posición final.
    La transición CSS se conserva; la fiabilidad gana a la animación.
    """
    resultado = dict(archivos)
    patron_op = re.compile(r"(\.style\.opacity\s*=\s*)(['\"])0(?:\.\d+)?\2")
    patron_tr = re.compile(
        r"(\.style\.transform\s*=\s*)(['\"])translate[XY]?\([^)]+\)\2")
    for ruta, contenido in archivos.items():
        if not ruta.endswith((".js", ".jsx")):
            continue
        nuevo = patron_op.sub(r"\g<1>\g<2>1\g<2>", contenido)
        nuevo = patron_tr.sub(r"\g<1>\g<2>none\g<2>", nuevo)
        if nuevo != contenido and _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: animación de scroll que ocultaba "
                        "el contenido, neutralizada.", ruta)

    # El mismo patrón en CSS: `section { opacity: 0; }` esperando a un JS que
    # añada la clase "visible". Solo se toca el selector de secciones.
    patron_css = re.compile(
        r"((?:^|\})\s*(?:section|main|article)[^{]*\{[^}]*?opacity\s*:\s*)0(?:\.\d+)?",
        re.S)
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".css"):
            continue
        nuevo = patron_css.sub(r"\g<1>1", contenido)
        if nuevo != contenido:
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: secciones con opacity 0 en CSS, "
                        "puestas visibles.", ruta)
    return resultado


def arreglar_texto_gradiente_invisible(archivos: dict[str, str]) -> dict[str, str]:
    """Repara el texto con gradiente que queda INVISIBLE sobre su propio fondo.

    Patrón del modelo: un título con el efecto de texto-gradiente
    (`background-clip: text; color: transparent`) usando EXACTAMENTE el mismo
    `linear-gradient(...)` que el fondo de su contenedor. Resultado: camuflaje
    perfecto — el nombre del titular desaparece del hero. Si el mismo gradiente
    aparece en otra regla sin clip (el contenedor), el texto recortado se pasa
    a color sólido blanco, que sobre ese fondo siempre se lee.
    """
    patron_regla = re.compile(r"([^{}]+)\{([^}]*)\}", re.S)
    patron_grad = re.compile(r"linear-gradient\([^)]*\)")
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".css"):
            continue
        reglas = patron_regla.findall(contenido)
        con_clip, sin_clip = [], set()
        for selector, cuerpo in reglas:
            grads = set(patron_grad.findall(cuerpo))
            if not grads:
                continue
            if "background-clip" in cuerpo and "transparent" in cuerpo:
                con_clip.append((selector.strip(), cuerpo, grads))
            else:
                sin_clip |= grads
        nuevo = contenido
        for selector, cuerpo, grads in con_clip:
            if not (grads & sin_clip):
                continue  # el gradiente del texto no coincide con ningún fondo
            cuerpo_nuevo = re.sub(r"color\s*:\s*transparent\s*;?",
                                  "color: #ffffff;", cuerpo)
            nuevo = nuevo.replace(cuerpo, cuerpo_nuevo)
        if nuevo != contenido:
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: texto-gradiente invisible sobre "
                        "el mismo gradiente, pasado a color sólido.", ruta)
    return resultado


# SDKs que EXIGEN credenciales al instanciarse: sin variables de entorno,
# lanzan y tumban el proceso entero al cargar el módulo.
_SDKS_CON_CREDENCIALES = ("twilio", "stripe", "mercadopago", "@sendgrid",
                          "nodemailer", "paypal")

_CABECERA_SDK_SEGURO = """\
// [inyectado] Un SDK externo sin credenciales NO puede tumbar el arranque:
// si falta configuración, se degrada a un doble simulado que responde a
// cualquier llamada. La función real se activa sola al configurar el .env.
const _sdkStub = new Proxy(function () {}, {
  get: (t, p) => (p === 'then' ? undefined : _sdkStub),
  apply: () => _sdkStub,
  construct: () => _sdkStub,
});
const _sdkSeguro = (init, nombre) => {
  try { const v = init(); return v == null ? _sdkStub : v; }
  catch (e) {
    console.warn(`[aviso] ${nombre || 'SDK externo'} sin credenciales; se simula:`, e.message);
    return _sdkStub;
  }
};
"""


def _fin_de_sentencia(texto: str, inicio: int) -> int:
    """Índice tras el `;` que cierra la sentencia, respetando paréntesis/llaves."""
    nivel = 0
    en_cadena: str | None = None
    i = inicio
    while i < len(texto):
        c = texto[i]
        if en_cadena:
            if c == "\\":
                i += 2
                continue
            if c == en_cadena:
                en_cadena = None
        elif c in "'\"`":
            en_cadena = c
        elif c in "([{":
            nivel += 1
        elif c in ")]}":
            nivel -= 1
        elif c == ";" and nivel <= 0:
            return i + 1
        elif c == "\n" and nivel <= 0:
            # sentencia sin `;` (ASI): termina en el salto de línea
            return i
        i += 1
    return len(texto)


def blindar_sdks_externos(archivos: dict[str, str]) -> dict[str, str]:
    """Impide que un SDK externo sin credenciales tumbe el servidor al arrancar.

    Patrón letal del modelo (visto con Twilio en la tienda de repostería):

        const client = twilio(process.env.SID, process.env.TOKEN);  // module-level

    Sin variables de entorno, el constructor LANZA al hacer `require` del módulo
    y el proceso entero muere: "Error: username is required". El LLM reparador
    no lo arregla (reescribe lo mismo). Aquí se envuelve la instanciación en
    `_sdkSeguro`: si falla, devuelve un doble (Proxy recursivo) que absorbe
    cualquier cadena de llamadas, y la app arranca. La función real se activa
    sola cuando el usuario configura sus credenciales.
    """
    patron_asig = re.compile(r"(?:const|let|var)\s+\w+\s*=\s*")
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".js") or "_sdkSeguro" in contenido:
            continue
        if not any(s in contenido for s in _SDKS_CON_CREDENCIALES):
            continue
        nuevo = contenido
        cambios = 0
        # de atrás hacia adelante para no invalidar los índices al reemplazar
        for m in list(patron_asig.finditer(contenido))[::-1]:
            fin = _fin_de_sentencia(contenido, m.end())
            rhs = contenido[m.end():fin].rstrip().rstrip(";")
            if not any(s in rhs for s in _SDKS_CON_CREDENCIALES):
                continue
            if "require(" in rhs and "(" not in rhs.split("require", 1)[0] and rhs.count("(") == 1:
                continue  # es solo `require('twilio')` sin instanciar: inofensivo
            sdk = next(s for s in _SDKS_CON_CREDENCIALES if s in rhs)
            envuelto = f"_sdkSeguro(() => {rhs}, '{sdk}');"
            nuevo = nuevo[:m.end()] + envuelto + nuevo[fin:]
            cambios += 1
        if not cambios:
            continue
        nuevo = _CABECERA_SDK_SEGURO + nuevo
        if _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: %d SDK(s) externo(s) blindado(s) "
                        "(el arranque ya no depende de credenciales).", ruta, cambios)
    return resultado


def tolerar_use_con_objeto(archivos: dict[str, str]) -> dict[str, str]:
    """Hace que `app.use(modulo)` funcione aunque el módulo exporte un objeto.

    Desajuste típico entre archivos generados por llamadas separadas:
    `middleware/errorMiddleware.js` exporta `{ errorHandler, notFound }` y
    `server.js` hace `app.use(errorMiddleware)` con el objeto entero. Express
    revienta al arrancar: "app.use() requires a middleware function". Se
    sustituye por una forma que registra la función si lo es, o todas las
    funciones del objeto si no:

        app.use(...(typeof X === 'function' ? [X]
                    : Object.values(X).filter((f) => typeof f === 'function')))
    """
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".js") or "app.use(" not in contenido:
            continue
        # variables que vienen de un require LOCAL (./ o ../): solo esas se tocan
        locales = {m.group(1) for m in re.finditer(
            r"(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['\"]\.\.?/", contenido)}
        if not locales:
            continue
        nuevo = contenido
        for var in locales:
            patron = re.compile(rf"app\.use\(\s*{re.escape(var)}\s*\)")
            # Del objeto solo se registran los MANEJADORES DE ERROR (arity 4).
            # Un catch-all tipo `notFound` registrado aquí taparía todo lo que
            # se monte después (p. ej. el bloque que sirve el frontend).
            seguro = (f"app.use(...(typeof {var} === 'function' ? [{var}] "
                      f": Object.values({var}).filter((f) => typeof f === 'function' "
                      f"&& f.length === 4)))")
            nuevo = patron.sub(seguro, nuevo)
        if nuevo != contenido and _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: app.use() tolerante a módulos "
                        "que exportan un objeto de middlewares.", ruta)
    return resultado


def alinear_contrato_contextos(archivos: dict[str, str]) -> dict[str, str]:
    """Añade alias en los Providers para las claves que piden los consumidores.

    Generalización del arreglo del contrato de auth: el Provider expone
    `value={{ cart, ... }}` pero un componente destructura `cartItems` del
    mismo contexto → `undefined`, y al primer `.reduce()`/`.map()` React se cae
    con la página en blanco. Si la clave pedida y una expuesta son variantes
    obvias (una es prefijo de la otra, p. ej. `cart` ↔ `cartItems`), se añade
    el alias `cartItems: cart` al value. Solo actúa con candidato ÚNICO.
    """
    # contexto -> claves expuestas en su value={{...}}
    proveedores: dict[str, tuple[str, set[str]]] = {}  # nombre ctx -> (ruta, claves)
    for ruta, cont in archivos.items():
        if not ruta.endswith(".jsx") or "createContext" not in cont:
            continue
        mctx = re.search(r"const\s+(\w+)\s*=\s*createContext", cont)
        mval = re.search(r"value=\{\{([^}]*)\}\}", cont)
        if not mctx or not mval:
            continue
        claves = {p.split(":")[0].strip() for p in mval.group(1).split(",") if p.strip()}
        proveedores[mctx.group(1)] = (ruta, claves)
    if not proveedores:
        return archivos

    # qué piden los consumidores de cada contexto
    pedidas: dict[str, set[str]] = {}
    for ruta, cont in archivos.items():
        if not ruta.endswith((".jsx", ".js")):
            continue
        for m in re.finditer(r"const\s*\{([^}]*)\}\s*=\s*useContext\(\s*(\w+)\s*\)", cont):
            nombres = {n.strip() for n in m.group(1).split(",") if n.strip() and " as " not in n}
            pedidas.setdefault(m.group(2), set()).update(nombres)

    resultado = dict(archivos)
    for ctx, faltantes in pedidas.items():
        if ctx not in proveedores:
            continue
        ruta, expuestas = proveedores[ctx]
        alias = {}
        for pedida in faltantes - expuestas:
            cands = [e for e in expuestas
                     if len(e) >= 3 and (pedida.lower().startswith(e.lower())
                                         or e.lower().startswith(pedida.lower()))]
            if len(cands) == 1:
                alias[pedida] = cands[0]
        if not alias:
            continue
        cont = resultado[ruta]
        mval = re.search(r"value=\{\{([^}]*)\}\}", cont)
        if mval is None:
            continue
        nuevo_val = ("value={{" + mval.group(1).rstrip() + ", "
                     + ", ".join(f"{k}: {v}" for k, v in alias.items()) + "}}")
        nuevo = cont[:mval.start()] + nuevo_val + cont[mval.end():]
        if _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: alias de contexto %s (%s).",
                        ruta, ctx, ", ".join(f"{k}→{v}" for k, v in alias.items()))
    return resultado


_JWT_VERIFY = re.compile(r"(const|let|var)\s+(\w+)\s*=\s*jwt\.verify\(")


def alinear_payload_jwt(archivos: dict[str, str]) -> dict[str, str]:
    """Tolera payloads JWT anidados al leer el id del usuario.

    Desajuste visto en la tienda de repostería: el login firma
    `jwt.sign({ user: { id } })` pero el middleware lee `decoded.id` →
    `findByPk(undefined)` → `req.user = null` → 500 en toda ruta protegida.
    Cada `decoded.id` (o `.userId`) tras un `jwt.verify` se vuelve tolerante
    a ambas formas: plana y anidada en `user`. Es identidad si ya era plana.
    """
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".js") or "jwt.verify" not in contenido:
            continue
        nuevo = contenido
        for m in _JWT_VERIFY.finditer(contenido):
            var = m.group(2)
            for campo in ("id", "userId"):
                nuevo = re.sub(
                    rf"\b{var}\.{campo}\b(?!\s*[=(])",
                    f"(({var}.user && {var}.user.{campo}) ?? {var}.{campo})",
                    nuevo)
        if nuevo != contenido and _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: lectura tolerante del "
                        "payload JWT (plano o anidado en 'user').", ruta)
    return resultado


_USESTATE_USUARIO = re.compile(
    r"const\s*\[\s*(user|usuario|currentUser)\s*,\s*(set[A-Z]\w*)\s*\]\s*=\s*useState\(\s*null\s*\)")


def persistir_sesion_local(archivos: dict[str, str]) -> dict[str, str]:
    """La sesión del login sobrevive a recargar la página.

    Patrón letal visto en la tienda de repostería: el AuthContext hace
    `setUser(res)` tras el login pero NUNCA lo guarda en localStorage. El
    interceptor de axios (que lee `localStorage.user.token`) no encuentra
    token, `/profile` devuelve 401 en cada carga y `user` vuelve a null:
    el checkout muere con "Cannot read properties of null (reading 'id')".

    Arreglo: (1) el estado inicial se hidrata desde localStorage; (2) las
    llamadas al setter pasan por un wrapper que persiste el usuario (o lo
    borra al hacer logout). Solo actúa en contextos de autenticación.
    """
    resultado = dict(archivos)
    for ruta, cont in archivos.items():
        if not ruta.endswith(".jsx") or "createContext" not in cont:
            continue
        # Solo contextos de AUTENTICACIÓN: definen un login y guardan un usuario.
        if not re.search(r"\b(login|signIn|iniciarSesion)\w*", cont):
            continue
        if "_setUsuarioPersistente" in cont or "localStorage.setItem('user'" in cont:
            continue
        m = _USESTATE_USUARIO.search(cont)
        if m is None:
            continue
        var, setter = m.group(1), m.group(2)

        # 1) Toda llamada al setter persiste (la declaración no es una llamada).
        nuevo = re.sub(rf"\b{setter}\s*\(", "_setUsuarioPersistente(", cont)

        # 2) Estado inicial hidratado desde localStorage.
        init = (f"const [{var}, {setter}] = useState(() => {{ "
                f"try {{ return JSON.parse(window.localStorage.getItem('user')) || null; }} "
                f"catch (e) {{ return null; }} }})")
        m2 = _USESTATE_USUARIO.search(nuevo)
        if m2 is None:
            continue
        nuevo = nuevo[:m2.start()] + init + nuevo[m2.end():]

        # 3) El wrapper, justo después de la línea del useState.
        fin_linea = nuevo.find("\n", m2.start() + len(init))
        if fin_linea == -1:
            continue
        wrapper = (
            "\n  // [inyectado] La sesión se guarda para sobrevivir a la recarga.\n"
            f"  const _setUsuarioPersistente = (u) => {{\n"
            f"    try {{\n"
            f"      if (u && typeof u === 'object' && !Array.isArray(u) && Object.keys(u).length > 0) {{\n"
            f"        const _prev = JSON.parse(window.localStorage.getItem('user')) || {{}};\n"
            f"        if (!u.token && _prev.token) u = {{ ...u, token: _prev.token }};\n"
            f"        window.localStorage.setItem('user', JSON.stringify(u));\n"
            f"      }} else {{ window.localStorage.removeItem('user'); }}\n"
            f"    }} catch (e) {{ /* sin almacenamiento */ }}\n"
            f"    {setter}(u);\n"
            f"  }};\n")
        nuevo = nuevo[:fin_linea + 1] + wrapper + nuevo[fin_linea + 1:]

        # 4) Si el Provider expone el setter crudo (value={{ ..., setUser }}),
        #    los consumidores lo llamarían SIN persistir: se redirige al wrapper.
        mval = re.search(r"value=\{\{[^}]*\}\}", nuevo)
        if mval is not None:
            val = mval.group(0)
            val2 = re.sub(rf"\b{setter}\s*([,}}])",
                          rf"{setter}: _setUsuarioPersistente\1", val)
            val2 = re.sub(rf":\s*{setter}\b", ": _setUsuarioPersistente", val2)
            nuevo = nuevo[:mval.start()] + val2 + nuevo[mval.end():]

        resultado[ruta] = nuevo
        logger.info("Arreglo automático en %s: la sesión de '%s' persiste en "
                    "localStorage (sobrevive a la recarga).", ruta, var)
    return resultado


def desempaquetar_respuestas_api(archivos: dict[str, str]) -> dict[str, str]:
    """Tolera el DOBLE desempaquetado de las respuestas de la API.

    El helper de API ya devuelve `response.data`, pero el componente vuelve a
    hacer `res.data` al guardar en el estado: `setProducts(res.data)` deja el
    estado en `undefined` y el primer `.map()` tumba la página EN BLANCO.
    Se sustituye cada `setX(res.data)` por una forma que acepta ambas
    convenciones (el dato directo o el envuelto en `.data`).

    LECCIÓN (flujo de compra de la repostería): el fallback NO puede ser `[]`
    a secas — un login que devuelve un OBJETO usuario quedaba convertido en
    array vacío y la sesión nunca se persistía. Si la respuesta no es un
    array ni trae `.data`, se conserva TAL CUAL.
    """
    patron = re.compile(r"\b(set[A-Z]\w*)\(\s*(\w+)\.data\s*\)")
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith((".jsx", ".js")):
            continue
        nuevo = patron.sub(
            r"\1(Array.isArray(\2) ? \2 : ((\2 && \2.data !== undefined) ? \2.data : (\2 || [])))",
            contenido)
        if nuevo != contenido and _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: respuesta de API tolerante al "
                        "doble desempaquetado.", ruta)
    return resultado


_DEFINE_MODELO = re.compile(r"""\.\s*define\(\s*(['"])(\w+)\1\s*,\s*\{""")
_ENUM_VALORES = re.compile(r"DataTypes\.ENUM\(([^)]*)\)")
_TIPO_CAMPO = re.compile(r"DataTypes\.(\w+)")


def _campos_objeto(cuerpo: str) -> list[tuple[str, str]]:
    """Pares (clave, definición) del nivel superior de un objeto literal JS."""
    campos: list[tuple[str, str]] = []
    nivel = 0
    comilla: str | None = None
    inicio_def = None
    clave = None
    i = 0
    while i < len(cuerpo):
        c = cuerpo[i]
        if comilla:
            if c == "\\":
                i += 2
                continue
            if c == comilla:
                comilla = None
        elif c in "'\"`":
            comilla = c
        elif c in "([{":
            nivel += 1
        elif c in ")]}":
            nivel -= 1
        elif nivel == 0:
            if clave is None:
                m = re.match(r"(\w+)\s*:", cuerpo[i:])
                if m:
                    clave = m.group(1)
                    inicio_def = i + m.end()
                    i += m.end()
                    continue
            elif c == ",":
                campos.append((clave, cuerpo[inicio_def:i]))
                clave = None
        i += 1
    if clave is not None:
        campos.append((clave, cuerpo[inicio_def:]))
    return campos


def _objetos_de_registro(texto: str, inicio: int, fin: int) -> list[tuple[int, int]]:
    """Spans de los objetos `{...}` de registro dentro de un create/bulkCreate.

    Son las llaves NO anidadas en otra llave (pueden ir dentro de `[...]`).
    """
    spans: list[tuple[int, int]] = []
    pila: list[str] = []
    comilla: str | None = None
    i = inicio
    while i < fin:
        c = texto[i]
        if comilla:
            if c == "\\":
                i += 2
                continue
            if c == comilla:
                comilla = None
        elif c in "'\"`":
            comilla = c
        elif c == "{":
            if "{" not in pila:
                cierra = _cierre(texto, i)
                if cierra is None or cierra > fin:
                    return spans
                spans.append((i, cierra))
                i = cierra + 1
                continue
            pila.append(c)
        elif c in "([":
            pila.append(c)
        elif c in ")]}":
            if pila:
                pila.pop()
        i += 1
    return spans


def _valor_enum_cercano(valor: str, valores: tuple[str, ...]) -> str:
    """El valor permitido más parecido; si no hay uno claro, el primero."""
    v = valor.lower()
    cands = [x for x in valores
             if x.lower().startswith(v[:4]) or v.startswith(x.lower()[:4])]
    return cands[0] if len(cands) == 1 else valores[0]


def _placeholder_por_tipo(info: dict) -> str:
    if info.get("enum"):
        return f"'{info['enum'][0]}'"
    tipo = info.get("tipo", "")
    if tipo in ("INTEGER", "BIGINT", "FLOAT", "DOUBLE", "DECIMAL", "REAL"):
        return "0"
    if tipo == "BOOLEAN":
        return "false"
    if tipo in ("DATE", "DATEONLY"):
        return "new Date()"
    if tipo in ("JSON", "JSONB"):
        return "{}"
    if tipo == "ARRAY":
        return "[]"
    return "'pendiente'"


def alinear_semilla_con_modelo(archivos: dict[str, str]) -> dict[str, str]:
    """Alinea los datos de semilla con las restricciones del modelo Sequelize.

    Dos desajustes vistos en producción (tienda de repostería) que matan el
    seed en silencio y dejan el catálogo VACÍO con la app "funcionando":

    1. Valor fuera del ENUM: la semilla trae `role: 'user'` pero el modelo
       declara `ENUM('customer', 'admin')` → violación de constraint.
       Se sustituye por el valor permitido más parecido (o el primero).
    2. Campo NOT NULL ausente: el modelo exige `address` sin defaultValue y
       la semilla no lo trae → INSERT rechazado. Se inserta un placeholder
       acorde al tipo en cada objeto de `Model.create/bulkCreate`.

    Solo toca archivos de semilla ('seed' en la ruta) y valida con node.
    """
    modelos: dict[str, dict[str, dict]] = {}
    for ruta, cont in archivos.items():
        if not ruta.endswith(".js") or ".define(" not in cont:
            continue
        for m in _DEFINE_MODELO.finditer(cont):
            abre = cont.index("{", m.start())
            cierra = _cierre(cont, abre)
            if cierra is None:
                continue
            campos: dict[str, dict] = {}
            for nombre, deftxt in _campos_objeto(cont[abre + 1:cierra]):
                info: dict = {}
                menum = _ENUM_VALORES.search(deftxt)
                if menum:
                    info["enum"] = re.findall(r"['\"]([^'\"]+)['\"]", menum.group(1))
                mtipo = _TIPO_CAMPO.search(deftxt)
                info["tipo"] = mtipo.group(1) if mtipo else ""
                info["requerido"] = bool(
                    re.search(r"allowNull\s*:\s*false", deftxt)
                    and "defaultValue" not in deftxt
                    and "autoIncrement" not in deftxt
                    and "primaryKey" not in deftxt)
                campos[nombre] = info
            modelos[m.group(2).lower()] = campos
    if not modelos:
        return archivos

    # campo -> valores ENUM permitidos (se descarta si dos modelos discrepan)
    enum_de: dict[str, tuple[str, ...] | None] = {}
    for campos in modelos.values():
        for c, info in campos.items():
            if info.get("enum"):
                v = tuple(info["enum"])
                enum_de[c] = None if enum_de.get(c, v) != v else v
    enums = {c: v for c, v in enum_de.items() if v}

    resultado = dict(archivos)
    for ruta, cont in archivos.items():
        if "seed" not in ruta.lower() or not ruta.endswith(".js"):
            continue
        nuevo = cont
        notas: list[str] = []

        for campo, valores in enums.items():
            patron = re.compile(rf"\b({campo})\s*:\s*(['\"])([^'\"]*)\2")

            def _rep(m: re.Match) -> str:
                if m.group(3) in valores:
                    return m.group(0)
                elegido = _valor_enum_cercano(m.group(3), valores)
                notas.append(f"{m.group(1)}: '{m.group(3)}'→'{elegido}'")
                return f"{m.group(1)}: {m.group(2)}{elegido}{m.group(2)}"

            nuevo = patron.sub(_rep, nuevo)

        for m in list(re.finditer(r"\b(\w+)\.(?:bulkCreate|create)\s*\(", nuevo))[::-1]:
            nombre = m.group(1).lower()
            campos = modelos.get(nombre) or modelos.get(nombre.rstrip("s"))
            if not campos:
                continue
            fin_llamada = _cierre(nuevo, m.end() - 1)
            if fin_llamada is None:
                continue
            requeridos = {c: i for c, i in campos.items() if i["requerido"]}
            if not requeridos:
                continue
            for abre, cierra in _objetos_de_registro(nuevo, m.end(), fin_llamada)[::-1]:
                presentes = {c for c, _ in _campos_objeto(nuevo[abre + 1:cierra])}
                faltan = [(c, i) for c, i in requeridos.items() if c not in presentes]
                if not faltan:
                    continue
                extra = ", ".join(f"{c}: {_placeholder_por_tipo(i)}" for c, i in faltan)
                nuevo = nuevo[:abre + 1] + " " + extra + "," + nuevo[abre + 1:]
                notas.extend(f"+{c} (NOT NULL sin valor)" for c, _ in faltan)

        if notas and nuevo != cont and _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: semilla alineada con el "
                        "modelo (%s).", ruta, "; ".join(notas))
    return resultado


def tolerar_audio_faltante(archivos: dict[str, str]) -> dict[str, str]:
    """`audio.play()` sin el mp3 presente no debe ensuciar la consola.

    Los proyectos generados declaran efectos (`new Audio('/assets/x.mp3')`)
    cuyo archivo no existe: `play()` rechaza con "no supported source" y el
    error aparece en consola. Se le añade un `.catch` silencioso: el juego
    sigue perfecto, con o sin audio.
    """
    patron = re.compile(r"\b(\w+)\.play\(\)\s*;")
    resultado = dict(archivos)
    for ruta, cont in archivos.items():
        if not ruta.endswith((".js", ".jsx")) or "new Audio" not in cont:
            continue
        nuevo = patron.sub(r"\1.play().catch(() => {});", cont)
        if nuevo != cont:
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: audio tolerante a archivos "
                        "faltantes.", ruta)
    return resultado


def blindar_find_en_props(archivos: dict[str, str]) -> dict[str, str]:
    """`prop.find(...)` no puede asumir que la prop es un array.

    Visto en 'multiplicando-aventuras': `progress.find(...)` explotaba cuando
    el estado llegaba como objeto (respuesta envuelta) o undefined. Cada
    `x.find(`, `x.map(`, `x.filter(` o `x.reduce(` sobre un identificador en
    minúscula se blinda con `(Array.isArray(x) ? x : [])`. Es identidad cuando
    ya era un array.
    """
    patron = re.compile(r"(?<![\w.)\]])([a-z]\w*)\.(find|map|filter|reduce)\(")
    resultado = dict(archivos)
    for ruta, cont in archivos.items():
        if not ruta.endswith(".jsx"):
            continue

        def _rep(m: re.Match) -> str:
            var = m.group(1)
            if var in ("this", "window", "document", "console", "localStorage",
                       "sessionStorage", "res", "response"):
                return m.group(0)
            return f"(Array.isArray({var}) ? {var} : []).{m.group(2)}("

        nuevo = patron.sub(_rep, cont)
        if nuevo != cont:
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: métodos de array blindados "
                        "contra props no-array.", ruta)
    return resultado


_URL_CSS = re.compile(r"background(?:-image)?\s*:\s*url\(\s*['\"]?([^'\")]+)['\"]?\s*\)[^;]*;")

_DEGRADADOS_ALEGRES = (
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
)


def reemplazar_fondos_inexistentes(archivos: dict[str, str]) -> dict[str, str]:
    """Un fondo CSS que apunta a una imagen inexistente se vuelve degradado.

    Patrón visto en 'multiplicando-aventuras': el hero declaraba
    `background-image: url('/assets/images/hero.jpg')` pero esa imagen no
    existe en el proyecto → el texto blanco del hero quedaba sobre el fondo
    claro de la página, ilegible. Si el archivo referenciado no está en el
    proyecto, el fondo pasa a un degradado digno; el texto blanco vuelve a
    leerse.
    """
    rutas = {r.lower() for r in archivos}

    def _existe(url: str) -> bool:
        limpio = url.split("?")[0].split("#")[0].lstrip("./").lstrip("/").lower()
        if not limpio or limpio.startswith(("http", "data:")):
            return True  # externo o embebido: no es asunto nuestro
        return any(r.endswith(limpio) for r in rutas)

    resultado = dict(archivos)
    for ruta, cont in archivos.items():
        if not ruta.endswith(".css"):
            continue
        i = 0
        cambios = 0

        def _rep(m: re.Match) -> str:
            nonlocal i, cambios
            if _existe(m.group(1)):
                return m.group(0)
            grad = _DEGRADADOS_ALEGRES[i % len(_DEGRADADOS_ALEGRES)]
            i += 1
            cambios += 1
            return f"background: {grad};"

        nuevo = _URL_CSS.sub(_rep, cont)
        if cambios:
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: %d fondo(s) con imagen "
                        "inexistente sustituido(s) por degradado.", ruta, cambios)
    return resultado


def importar_componentes_jsx_faltantes(archivos: dict[str, str]) -> dict[str, str]:
    """Añade el import de componentes JSX usados pero nunca importados.

    Patrón visto en 'multiplicando-aventuras': cinco pantallas montaban
    `<EmptyState …/>` sin importarlo → `ReferenceError: EmptyState is not
    defined` y la ruta entera en blanco. Si el componente existe como archivo
    hermano en el proyecto, el import se puede deducir sin inventar nada.
    """
    import posixpath

    definidos: dict[str, str] = {}  # nombre -> ruta sin extensión
    for ruta, cont in archivos.items():
        if ruta.endswith(".jsx") and re.search(
                rf"export default {re.escape(ruta.rsplit('/', 1)[-1][:-4])}\b", cont):
            nombre = ruta.rsplit("/", 1)[-1][:-4]
            definidos[nombre] = ruta[:-4]

    resultado = dict(archivos)
    for ruta, cont in archivos.items():
        if not ruta.endswith(".jsx"):
            continue
        usados = set(re.findall(r"<([A-Z]\w+)[\s/>]", cont))
        faltan = [n for n in usados
                  if n in definidos
                  and definidos[n] != ruta[:-4]
                  and not re.search(rf"\bimport\s+{n}\b", cont)]
        if not faltan:
            continue
        carpeta = posixpath.dirname(ruta)
        lineas_import = []
        for n in sorted(faltan):
            rel = posixpath.relpath(definidos[n], carpeta or ".")
            if not rel.startswith("."):
                rel = "./" + rel
            lineas_import.append(f"import {n} from '{rel}';")
        m = None
        for m in re.finditer(r"^import\b[^\n]*;?\s*$", cont, re.M):
            pass
        if m is not None:
            nuevo = cont[:m.end()] + "\n" + "\n".join(lineas_import) + cont[m.end():]
        else:
            nuevo = "\n".join(lineas_import) + "\n" + cont
        resultado[ruta] = nuevo
        logger.info("Arreglo automático en %s: imports JSX añadidos (%s).",
                    ruta, ", ".join(sorted(faltan)))
    return resultado


_RETURN_OBJETO = re.compile(r"return\s*\{")


def neutralizar_componentes_que_devuelven_objetos(archivos: dict[str, str]) -> dict[str, str]:
    """Un 'componente' que devuelve un objeto no puede renderizarse como JSX.

    Patrón visto en 'multiplicando-aventuras': el modelo escribe un hook
    (devuelve `{ handleX, handleY }`) pero lo nombra como componente y lo monta
    `<MicroInteractions />` → React error #31 y la app ENTERA en blanco.

    Si un componente de un .jsx se usa como JSX en otro archivo y su return es
    un objeto literal (sin JSX dentro), ese return pasa a `null` conservando el
    objeto en una variable: la app renderiza, y los handlers siguen definidos
    por si una clase posterior los conecta de verdad.
    """
    # nombre de componente -> ruta donde se define
    definidos: dict[str, str] = {}
    for ruta, cont in archivos.items():
        if not ruta.endswith(".jsx"):
            continue
        m = re.search(r"const\s+(\w+)\s*=\s*\(", cont)
        if m and f"export default {m.group(1)}" in cont:
            definidos[m.group(1)] = ruta

    # cuáles se montan como JSX en algún otro archivo
    montados: set[str] = set()
    for ruta, cont in archivos.items():
        if not ruta.endswith(".jsx"):
            continue
        for nombre, origen in definidos.items():
            if ruta != origen and re.search(rf"<{nombre}[\s/>]", cont):
                montados.add(nombre)

    resultado = dict(archivos)
    for nombre in montados:
        ruta = definidos[nombre]
        cont = resultado[ruta]
        m = _RETURN_OBJETO.search(cont)
        if m is None:
            continue
        abre = cont.index("{", m.start())
        cierra = _cierre(cont, abre)
        if cierra is None:
            continue
        cuerpo = cont[abre:cierra + 1]
        if "<" in cuerpo:  # devuelve JSX: es un componente de verdad
            continue
        # Transformación puramente local con llaves balanceadas (_cierre):
        # no hay forma de romper la sintaxis, y JSX no pasa por node --check.
        nuevo = (cont[:m.start()]
                 + f"const _handlers = {cuerpo}; void _handlers; return null"
                 + cont[cierra + 1:])
        resultado[ruta] = nuevo
        logger.info("Arreglo automático en %s: '%s' devolvía un objeto y se "
                    "montaba como JSX (React #31) — ahora devuelve null.",
                    ruta, nombre)
    return resultado


_LOGO_SVG = """\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{c1}"/>
      <stop offset="1" stop-color="{c2}"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#g)"/>
  <text x="32" y="43" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif"
        font-size="30" font-weight="800" fill="#ffffff">{inicial}</text>
</svg>
"""

_TITULO_GENERICO = re.compile(r"<title>\s*(vite app|document|app|index)?\s*</title>", re.I)


def garantizar_identidad_visual(archivos: dict[str, str]) -> dict[str, str]:
    """Todo proyecto sale con isotipo, favicon y título reales (imagotipo).

    El modelo suele entregar pestañas sin identidad ('Vite App', sin favicon).
    Aquí se garantiza: un `logo.svg` (isotipo con degradado + inicial del
    proyecto), el favicon apuntándole, y un `<title>` con nombre real. Si el
    modelo ya creó su propio logo, no se toca nada.
    """
    indexes = [r for r in archivos if r.endswith("index.html")]
    if not indexes:
        return archivos

    # Nombre del proyecto: del package.json o del primer <h1>/<title> no genérico.
    nombre = ""
    for ruta, cont in archivos.items():
        if ruta.endswith("package.json"):
            m = re.search(r'"name"\s*:\s*"([^"]+)"', cont)
            if m:
                nombre = m.group(1)
                break
    if not nombre:
        for ruta in indexes:
            m = re.search(r"<h1[^>]*>([^<]{3,60})</h1>", archivos[ruta])
            if m:
                nombre = m.group(1).strip()
                break
    nombre = (nombre or "app").replace("-", " ").replace("_", " ").strip()
    titulo = nombre.title()
    inicial = next((c for c in titulo if c.isalnum()), "A").upper()

    resultado = dict(archivos)

    ya_hay_logo = any("logo" in r.lower() and r.endswith(".svg") for r in archivos)
    usa_vite = any(r.endswith("vite.config.js") for r in archivos)
    ruta_logo = "frontend/public/logo.svg" if usa_vite else "frontend/logo.svg"
    if not ya_hay_logo:
        resultado[ruta_logo] = _LOGO_SVG.format(c1="#6366f1", c2="#ec4899", inicial=inicial)
        logger.info("Identidad visual: creado %s (isotipo '%s').", ruta_logo, inicial)

    href_logo = "/logo.svg" if usa_vite else "logo.svg"
    for ruta in indexes:
        cont = resultado[ruta]
        nuevo = cont
        if 'rel="icon"' not in nuevo and "rel='icon'" not in nuevo:
            nuevo = nuevo.replace(
                "</head>",
                f'    <link rel="icon" type="image/svg+xml" href="{href_logo}">\n</head>',
                1,
            )
        nuevo = _TITULO_GENERICO.sub(f"<title>{titulo}</title>", nuevo)
        if "<title>" not in nuevo:
            nuevo = nuevo.replace("</head>", f"    <title>{titulo}</title>\n</head>", 1)
        if nuevo != cont:
            resultado[ruta] = nuevo
            logger.info("Identidad visual en %s: favicon y título reales.", ruta)
    return resultado


def garantizar_manual(archivos: dict[str, str]) -> dict[str, str]:
    """Garantiza que todo proyecto se entregue con un MANUAL.md.

    Parte de la definición de "hecho" del producto: entregado = URL viva +
    manual con credenciales y modo de uso. El planificador a veces lo omite
    (si el prompt del usuario lista entregables sin mencionarlo), así que se
    genera aquí de forma determinista: título del index.html o del
    package.json, credenciales extraídas de la semilla si existen, y pasos de
    uso. Si el proyecto ya trae su MANUAL.md, no se toca.
    """
    if any(p.rsplit("/", 1)[-1].upper() == "MANUAL.MD" for p in archivos):
        return archivos

    # Título: <title> del index.html, o el name del package.json, o genérico.
    titulo = "Proyecto generado"
    for ruta, cont in archivos.items():
        if ruta.endswith("index.html"):
            m = re.search(r"<title>\s*([^<]+?)\s*</title>", cont)
            if m:
                titulo = m.group(1).strip()
                break
    else:
        for ruta, cont in archivos.items():
            if ruta.endswith("package.json"):
                m = re.search(r'"name"\s*:\s*"([^"]+)"', cont)
                if m:
                    titulo = m.group(1)
                    break

    # Credenciales: pares usuario/contraseña de los archivos de semilla.
    credenciales: list[tuple[str, str]] = []
    for ruta, cont in archivos.items():
        if "seed" not in ruta.rsplit("/", 1)[-1].lower():
            continue
        usuarios = re.findall(r"username:\s*['\"]([^'\"]+)['\"]", cont)
        claves = re.findall(r"(?:bcrypt\.hash\(|password:\s*)['\"]([^'\"]+)['\"]", cont)
        for i, u in enumerate(usuarios):
            clave = claves[i] if i < len(claves) else (claves[-1] if claves else "?")
            credenciales.append((u, clave))

    if credenciales:
        seccion_acceso = "## Usuarios de prueba\n\n" + "\n".join(
            f"- **{u}** — contraseña: `{c}`" for u, c in credenciales
        )
    else:
        seccion_acceso = ("## Acceso\n\nEste proyecto no requiere inicio de sesión: "
                          "se usa directamente al abrir la URL.")

    listado = "\n".join(f"- `{p}`" for p in sorted(archivos))
    manual = (
        f"# Manual de uso — {titulo}\n\n"
        f"## Cómo empezar\n\n"
        f"1. Abre en el navegador la **URL** que entrega el sistema al terminar la generación.\n"
        f"2. La página carga lista para usarse; no hay que instalar nada.\n\n"
        f"{seccion_acceso}\n\n"
        f"## Archivos del proyecto\n\n{listado}\n\n"
        f"---\n"
        f"*Manual generado automáticamente. Los campos marcados como pendientes "
        f"(si los hay) deben completarse por el propietario del proyecto.*\n"
    )
    resultado = dict(archivos)
    resultado["MANUAL.md"] = manual
    logger.info("Arreglo automático: MANUAL.md generado (%d credencial(es) detectada(s)).",
                len(credenciales))
    return resultado


def _simbolos_exportados_js(contenido: str) -> set[str]:
    """Nombres que un módulo JS pone a disposición de los demás."""
    simbolos: set[str] = set()
    for bloque, uno, declarado, llaves in _EXPORTA_JS.findall(contenido):
        for texto in (bloque, llaves):
            if texto:
                simbolos.update(
                    p.split(":")[0].strip() for p in texto.split(",") if p.strip()
                )
        if uno:
            simbolos.add(uno)
        if declarado:
            simbolos.add(declarado)
    return {s for s in simbolos if s and s.isidentifier()}


_SYNC_THEN = re.compile(
    r"""(?P<db>[\w.]+)\s*\.\s*sync\s*\((?P<args>[^)]*)\)\s*\.\s*then\s*\(\s*"""
    r"""(?:async\s*)?\(\s*\)\s*=>\s*\{""",
)


def sacar_listen_del_then(archivos: dict[str, str]) -> dict[str, str]:
    """Saca `app.listen()` de dentro del `.then()` de la base de datos.

    Es el patrón más repetido y más difícil de diagnosticar de Express:

        sequelize.sync().then(() => { app.listen(PORT, ...); });

    Si esa promesa no se resuelve —o se rechaza, porque casi nunca lleva
    `.catch()`— el proceso queda VIVO, MUDO y SIN ESCUCHAR. Desde fuera es
    indistinguible de un cuelgue, y el usuario recibe una URL que no responde.

    Se le indicó al modelo por prompt y siguió escribiéndolo igual: lo tiene
    demasiado grabado. Así que se corrige aquí: el servidor escucha SIEMPRE y
    la base de datos se conecta aparte, informando si falla.
    """
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".js") or "app.listen" not in contenido:
            continue

        m = _SYNC_THEN.search(contenido)
        if m is None:
            continue

        # Se localiza la llave de cierre REAL contando anidamiento. Con una
        # expresión regular se cortaba por la primera `}`, dejando el bloque
        # descuadrado: producía código que compilaba de casualidad.
        abre = contenido.index("{", m.end() - 1)
        cierra = _cierre(contenido, abre)
        if cierra is None:
            continue

        cuerpo = contenido[abre + 1 : cierra]
        if "listen" not in cuerpo:
            continue  # ese `.then()` no arranca el servidor

        # Tras la llave viene el `)` del `.then(` y quizá un `;`.
        fin = cierra + 1
        while fin < len(contenido) and contenido[fin] in " \t\n)r;":
            if contenido[fin] == ";":
                fin += 1
                break
            fin += 1

        nuevo = (
            contenido[: m.start()]
            + cuerpo.strip()
            + "\n\n// La base de datos se prepara aparte: si falla, se registra,\n"
            + "// pero el servidor ya está escuchando y se puede diagnosticar.\n"
            + f"{m.group('db')}.sync({m.group('args')})\n"
            + "  .then(() => console.log('Base de datos lista'))\n"
            + "  .catch((err) => console.error('Error con la base de datos:', err));\n"
            + contenido[fin:]
        )
        # Un arreglo NUNCA debe entregar código roto: si la transformación no
        # es JavaScript válido, se descarta y se conserva el original.
        if not _js_valido(nuevo):
            logger.warning("El arreglo de `app.listen()` en %s habría roto la "
                           "sintaxis; se deja el original.", ruta)
            continue
        resultado[ruta] = nuevo
        logger.info("Arreglo automático en %s: `app.listen()` sacado del "
                    "`.then()` de la base de datos.", ruta)
    return resultado


_DEFINE_SUELTO = re.compile(r"""^define\(\s*(['"])(\w+)\1""", re.M)


def arreglar_define_suelto(archivos: dict[str, str]) -> dict[str, str]:
    """Corrige `define('X', {...})` sin su objeto ni su asignación.

    El modelo escribe bien unos modelos y en otro se deja el prefijo:

        const User = sequelize.define('User', {...})   // bien
        define('Plan', {...})                          // ReferenceError

    El módulo revienta al importarse con `define is not defined`, y como eso
    ocurre en la cadena de `require` del servidor, este ni llega a escuchar.
    """
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".js") or "define(" not in contenido:
            continue
        if "sequelize" not in contenido:
            continue

        arreglado, n = _DEFINE_SUELTO.subn(
            lambda m: f"const {m.group(2)} = sequelize.define({m.group(1)}{m.group(2)}{m.group(1)}",
            contenido,
        )
        if not n:
            continue

        # Si el modelo no se exportaba (porque nunca llegó a existir), se añade.
        nombre = _DEFINE_SUELTO.search(contenido).group(2)
        if "module.exports" not in arreglado:
            arreglado = arreglado.rstrip() + f"\n\nmodule.exports = {nombre};\n"

        resultado[ruta] = arreglado
        logger.info("Arreglo automático en %s: `define(...)` suelto -> "
                    "`const %s = sequelize.define(...)`.", ruta, nombre)
    return resultado


# Módulos que trae Node de serie: no van en package.json.
_NODE_BUILTINS = {
    "fs", "path", "http", "https", "crypto", "os", "util", "events", "stream",
    "url", "querystring", "zlib", "buffer", "child_process", "cluster", "dns",
    "net", "tls", "readline", "assert", "process", "console", "timers", "string_decoder",
}
# require('x') / require("x") / from 'x' / from "x" — solo el primer segmento.
_REQUIRE_PKG = re.compile(
    r"""require\(\s*['"]([^'".][^'"]*)['"]\s*\)|from\s+['"]([^'".][^'"]*)['"]"""
)
# Versión razonable para paquetes habituales que el modelo olvida declarar.
_VERSIONES_NPM = {
    "express-validator": "^7.0.1", "bcryptjs": "^2.4.3", "jsonwebtoken": "^9.0.2",
    "cors": "^2.8.5", "dotenv": "^16.4.5", "sequelize": "^6.37.1", "pg": "^8.11.3",
    "sqlite3": "^5.1.7", "mysql2": "^3.9.2", "morgan": "^1.10.0", "helmet": "^7.1.0",
    "multer": "^1.4.5-lts.1", "axios": "^1.6.8", "moment": "^2.30.1",
    "express": "^4.19.2", "body-parser": "^1.20.2", "cookie-parser": "^1.4.6",
}


_NEW_SEQUELIZE = re.compile(
    r"""new\s+Sequelize\s*\(\s*\{[^{}]*?dialect\s*:\s*['"](\w+)['"][^{}]*?\}\s*\)""",
    re.S,
)

_CONEXION_POR_MOTOR = {
    "postgres": (
        "new Sequelize(process.env.DATABASE_URL, {\n"
        "  dialect: 'postgres',\n  logging: false,\n})"
    ),
    "mysql": (
        "new Sequelize(process.env.DATABASE_URL, {\n"
        "  dialect: 'mysql',\n  logging: false,\n})"
    ),
}


_CREA_SEQUELIZE = re.compile(
    r"""^([ \t]*)(?:const|let|var)\s+(\w+)\s*=\s*new\s+Sequelize\s*\([^;]*?\)\s*;""",
    re.M | re.S,
)


def garantizar_listen_incondicional(archivos: dict[str, str]) -> dict[str, str]:
    """Asegura que el servidor escuche SIEMPRE, aunque la base de datos falle.

    El modelo mete `app.listen()` dentro de la cadena de promesas de la base de
    datos: `sequelize.authenticate().then(() => sequelize.sync()).then(() =>
    app.listen())`. Si la conexión falla o tarda, el `.then()` no corre y el
    servidor nunca escucha. Peor: el `.catch()` traga el error, así que queda
    vivo y mudo. Aquí, si `app.listen(` solo aparece ANIDADO (nunca en el nivel
    superior), se comenta el interno y se añade un `app.listen()` incondicional
    al final: el servidor arranca aunque la base de datos no esté lista.
    """
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".js") or "app.listen" not in contenido:
            continue

        posiciones = [m.start() for m in re.finditer(r"\bapp\.listen\s*\(", contenido)]
        if not posiciones:
            continue
        # ¿Hay alguna en el nivel superior (profundidad 0 de llaves/paréntesis)?
        hay_top_level = any(_profundidad(contenido, pos) == 0 for pos in posiciones)
        if hay_top_level:
            continue  # ya escucha incondicionalmente

        # Todas están anidadas: se neutralizan y se añade una al final. Se usa
        # `process.env.PORT` DIRECTAMENTE, no la variable `PORT` del código, que
        # a veces se define dentro del `.then()` y no existe en el nivel superior
        # (daría `ReferenceError: PORT is not defined`, que `node --check` no ve
        # porque es de runtime, no de sintaxis).
        nuevo = re.sub(r"\bapp\.listen\s*\(", "app.__listenNeutralizado(", contenido)
        nuevo += (
            "\n\n// El servidor escucha SIEMPRE, aunque la base de datos falle o "
            "tarde.\n// (app.__listenNeutralizado ignora las llamadas anidadas "
            "originales.)\n"
            "app.__listenNeutralizado = () => {};\n"
            "const _PORT = process.env.PORT || 3000;\n"
            "app.listen(_PORT, () => console.log('Servidor escuchando en el puerto', _PORT));\n"
        )
        if _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: `app.listen()` garantizado al "
                        "nivel superior (escucha aunque la BD falle).", ruta)
    return resultado


def _profundidad(texto: str, pos: int) -> int:
    """Nivel de anidamiento de llaves/paréntesis en la posición dada."""
    prof = 0
    comilla = None
    i = 0
    while i < pos:
        c = texto[i]
        if comilla:
            if c == "\\":
                i += 2
                continue
            if c == comilla:
                comilla = None
        elif c in "\"'`":
            comilla = c
        elif c in "{(":
            prof += 1
        elif c in "})":
            prof -= 1
        i += 1
    return prof


_MODELO_FACTORY_USO = re.compile(
    r"""require\(\s*['"](\.{1,2}/(?:models/)?\w+)['"]\s*\)\s*\("""
)


def alinear_modelos_factory(archivos: dict[str, str]) -> dict[str, str]:
    """Convierte los modelos a factory `(sequelize) => Model` cuando se usan así.

    `database.js` hace `require('./models/socio')(sequelize)`, esperando que el
    modelo sea una función que recibe `sequelize`. Pero el modelo suele exportar
    la instancia directa (`module.exports = Socio`), y entonces la llamada
    revienta con `require(...) is not a function`. Se detecta qué modelos se
    invocan como factory y se envuelven en `(sequelize) => { ...; return Model }`.
    """
    # Módulos que ALGÚN archivo llama como factory: `require('./models/x')(...)`.
    llamados: set[str] = set()
    for ruta, cont in archivos.items():
        if not ruta.endswith((".js", ".jsx")):
            continue
        carpeta = ruta.rsplit("/", 1)[0]
        for m in _MODELO_FACTORY_USO.finditer(cont):
            base = _resolver(carpeta, m.group(1))
            if base:
                llamados.add(base.rsplit(".", 1)[0] if base.endswith(".js") else base)

    if not llamados:
        return archivos

    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        base = ruta.rsplit(".", 1)[0]
        if base not in llamados or not ruta.endswith(".js"):
            continue
        if re.search(r"module\.exports\s*=\s*(?:async\s*)?\(?\s*sequelize", contenido):
            continue  # ya es factory

        m = re.search(r"(?:const|let|var)\s+(\w+)\s*=\s*sequelize\.define\(", contenido)
        me = re.search(r"module\.exports\s*=\s*(\w+)\s*;?", contenido)
        if not m or not me:
            continue
        modelo = m.group(1)

        cuerpo = contenido
        # La instancia llega como argumento: fuera el import propio de sequelize.
        cuerpo = re.sub(r"^[ \t]*(?:const|let|var)\s+sequelize\s*=\s*require\([^)]*\)\s*;?\s*$",
                        "", cuerpo, flags=re.M)
        # Se quita el export final; se devolverá dentro de la factory.
        cuerpo = re.sub(r"module\.exports\s*=\s*\w+\s*;?\s*$", "", cuerpo).rstrip()

        nuevo = (
            "module.exports = (sequelize) => {\n"
            + "\n".join("  " + l if l.strip() else l for l in cuerpo.split("\n"))
            + f"\n  return {modelo};\n}};\n"
        )
        if _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: modelo convertido a factory "
                        "`(sequelize) => %s` (database.js lo llama así).", ruta, modelo)
    return resultado


def romper_ciclo_sequelize(archivos: dict[str, str]) -> dict[str, str]:
    """Exporta la instancia de Sequelize ANTES de requerir los modelos.

    Patrón muy común que causa `TypeError: sequelize.define is not a function`:
    un `database.js` crea la instancia, luego hace `require('./models/...')` y
    solo al final `module.exports = sequelize`. Como los modelos importan ese
    mismo `database.js`, cuando lo cargan aún no ha exportado nada (es `{}`), y
    `sequelize.define` no existe. Se sube el `module.exports = sequelize` a justo
    después de crear la instancia, rompiendo el ciclo.
    """
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".js") or "new Sequelize" not in contenido:
            continue
        if "require('./models" not in contenido and 'require("./models' not in contenido:
            continue

        m = _CREA_SEQUELIZE.search(contenido)
        if m is None:
            continue
        var = m.group(2)
        export_re = re.compile(rf"^[ \t]*module\.exports\s*=\s*{var}\s*;?\s*$", re.M)
        if not export_re.search(contenido):
            continue

        # Se quita el export de donde esté y se pone tras crear la instancia.
        sin_export = export_re.sub("", contenido)
        insercion = m.end()
        nuevo = (sin_export[:insercion] + f"\nmodule.exports = {var};"
                 + sin_export[insercion:])
        # Recolocar índices: sin_export puede haber acortado antes de `insercion`.
        # Más seguro: reconstruir buscando de nuevo en sin_export.
        m2 = _CREA_SEQUELIZE.search(sin_export)
        if m2:
            nuevo = (sin_export[:m2.end()] + f"\nmodule.exports = {var};"
                     + sin_export[m2.end():])

        if _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: `module.exports = %s` subido "
                        "antes de los require de modelos (rompe el ciclo).", ruta, var)
    return resultado


def forzar_motor_bd(archivos: dict[str, str], motor: str) -> dict[str, str]:
    """Impone el motor de base de datos que el usuario pidió.

    El modelo, aunque el prompt diga PostgreSQL, a veces genera el proyecto con
    `dialect: 'sqlite'`. Degradar el motor a capricho es entregar algo distinto
    de lo pedido, así que se reescribe la conexión de Sequelize al motor
    correcto, leyendo la URL de `DATABASE_URL` (que el verificador inyecta).
    """
    plantilla = _CONEXION_POR_MOTOR.get(motor)
    if plantilla is None:  # sqlite u otro: no se fuerza nada
        return archivos

    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".js") or "new Sequelize" not in contenido:
            continue

        def cambiar(m: re.Match) -> str:
            return plantilla if m.group(1) != motor else m.group(0)

        nuevo = _NEW_SEQUELIZE.sub(cambiar, contenido)
        if nuevo != contenido and _js_valido(nuevo):
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: conexión de base de datos "
                        "forzada a '%s' (el usuario lo pidió).", ruta, motor)
    return resultado


def completar_dependencias_node(archivos: dict[str, str]) -> dict[str, str]:
    """Añade al package.json los paquetes npm que el código importa pero no declara.

    Es el gemelo Node de las dependencias indirectas de Python: el modelo escribe
    `require('express-validator')` y se olvida de ponerlo en `dependencies`. El
    servidor muere al arrancar con `Cannot find module 'express-validator'`.
    Se procesa cada package.json con los .js de SU carpeta (backend y frontend
    tienen paquetes distintos).
    """
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith("package.json"):
            continue
        try:
            pkg = json.loads(contenido)
        except json.JSONDecodeError:
            continue

        base = ruta.rsplit("/", 1)[0] if "/" in ruta else ""
        declaradas = set(pkg.get("dependencies", {})) | set(pkg.get("devDependencies", {}))

        usadas: set[str] = set()
        for otra, cont in archivos.items():
            if not otra.endswith((".js", ".jsx")) or not otra.startswith(base):
                continue
            for m in _REQUIRE_PKG.finditer(cont):
                nombre = m.group(1) or m.group(2)
                # `@scope/pkg` cuenta entero; `pkg/sub` cuenta solo `pkg`.
                raiz = "/".join(nombre.split("/")[:2]) if nombre.startswith("@") \
                    else nombre.split("/")[0]
                if raiz and raiz not in _NODE_BUILTINS:
                    usadas.add(raiz)

            # Drivers que Sequelize carga en RUNTIME según el dialect: no
            # aparecen como `require`, pero sin ellos el server muere con
            # "Please install <driver> package manually".
            for dialecto, driver in (("sqlite", "sqlite3"), ("postgres", "pg"),
                                     ("mysql", "mysql2"), ("mariadb", "mariadb")):
                if re.search(rf"dialect\s*:\s*['\"]{dialecto}", cont):
                    usadas.add(driver)

        faltan = usadas - declaradas
        if not faltan:
            continue

        pkg.setdefault("dependencies", {})
        for paquete in sorted(faltan):
            pkg["dependencies"][paquete] = _VERSIONES_NPM.get(paquete, "latest")
        resultado[ruta] = json.dumps(pkg, indent=2, ensure_ascii=False) + "\n"
        logger.info("Arreglo automático en %s: añadidas %d dependencia(s) npm: %s",
                    ruta, len(faltan), sorted(faltan))
    return resultado


# URL absoluta a la API en localhost con puerto fijo: 'http://localhost:3000/api'
_API_ABSOLUTA = re.compile(
    r"""(['"])https?://(?:localhost|127\.0\.0\.1)(?::\d+)?(/[^'"]*)?\1"""
)


def api_a_rutas_relativas(archivos: dict[str, str]) -> dict[str, str]:
    """Cambia las URLs absolutas a la API por rutas relativas en el frontend.

    El modelo escribe `baseURL: 'http://localhost:3000/api'`. Como el sistema se
    sirve desde el mismo backend en OTRO puerto (8100, o el que toque), esa URL
    apunta a un servidor que no existe y el login falla con CONNECTION REFUSED.
    Una ruta relativa (`/api`) funciona sea cual sea el host y el puerto, porque
    el navegador la resuelve contra la página que ya está abierta.
    """
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        # Solo el frontend: en el backend una URL localhost puede ser legítima.
        if "frontend/" not in ruta or not ruta.endswith((".js", ".jsx", ".ts", ".tsx")):
            continue
        if not _API_ABSOLUTA.search(contenido):
            continue

        nuevo = _API_ABSOLUTA.sub(lambda m: f"{m.group(1)}{m.group(2) or '/'}{m.group(1)}", contenido)
        if nuevo != contenido:
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: API absoluta -> ruta relativa "
                        "(funciona en cualquier host/puerto).", ruta)
    return resultado


_CJS_EXPORTS_LISTA = re.compile(r"module\.exports\s*=\s*\{([^}]*)\}\s*;?")
_CJS_EXPORTS_UNO = re.compile(r"module\.exports\s*=\s*(\w+)\s*;?")
_CJS_REQUIRE_NOMBRADO = re.compile(
    r"""const\s*\{([^}]+)\}\s*=\s*require\(\s*(['"])([^'"]+)\2\s*\)\s*;?"""
)
_CJS_REQUIRE_DEFAULT = re.compile(
    r"""const\s+(\w+)\s*=\s*require\(\s*(['"])([^'"]+)\2\s*\)\s*;?"""
)


_IMPORT_A_BACKEND = re.compile(
    r"""import\s+(?:\{[^}]*\}|[\w*]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+"""
    r"""['"](\.{1,2}/[^'"]*backend/[^'"]*)['"]\s*;?""",
)


_IMPORT_CUALQUIERA = re.compile(
    r"""import\s+(?:\{[^}]*\}|[\w*]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+"""
    r"""['"](\.{1,2}/[^'"]+)['"]\s*;?""",
)


def quitar_autoimports(archivos: dict[str, str]) -> dict[str, str]:
    """Elimina los imports de un archivo hacia SÍ MISMO.

    El modelo a veces escribe, dentro de `utils/validations.js`,
    `import { validateDocument } from '../utils/validations'` — es decir, el
    archivo se importa a sí mismo. Como también define `validateDocument`, el
    build muere con "Identifier already declared". Se borra ese import: los
    símbolos ya están definidos localmente.
    """
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith((".js", ".jsx")):
            continue
        carpeta = ruta.rsplit("/", 1)[0]
        propio = ruta.rsplit(".", 1)[0]

        def es_autoimport(m: re.Match) -> str:
            base = _resolver(carpeta, m.group(1))
            if base is None:
                return m.group(0)
            base = base.rsplit(".", 1)[0] if base.endswith((".js", ".jsx")) else base
            return "" if base == propio else m.group(0)

        nuevo = _IMPORT_CUALQUIERA.sub(es_autoimport, contenido)
        if nuevo != contenido:
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: eliminado el import a sí mismo "
                        "(causaba 'already declared').", ruta)
    return resultado


def quitar_imports_a_backend(archivos: dict[str, str]) -> dict[str, str]:
    """Elimina los imports del frontend que apuntan al backend.

    El frontend y el backend son procesos separados: no comparten código. El
    modelo a veces escribe en un archivo del frontend
    `import { validateSocio } from '../../backend/utils/validations'`, lo que
    además de ser imposible provoca "Identifier already declared" cuando ese
    mismo símbolo se define también localmente. Esos imports se borran; el símbolo
    debe venir de un módulo del propio frontend o definirse ahí.
    """
    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if "frontend/" not in ruta or not ruta.endswith((".js", ".jsx")):
            continue
        nuevo, n = _IMPORT_A_BACKEND.subn("", contenido)
        if n:
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: eliminado(s) %d import(s) al "
                        "backend (frontend y backend no comparten código).", ruta, n)
    return resultado


def envolver_con_providers(archivos: dict[str, str]) -> dict[str, str]:
    """Envuelve `<App />` con los Context Providers que la app necesita.

    Error clásico de React: un módulo define `AuthProvider` y un hook `useAuth`,
    los componentes usan `useAuth()`, pero `main.jsx` renderiza `<App/>` SIN
    envolverlo en `<AuthProvider>`. Entonces `useAuth()` devuelve `undefined` y
    toda la app revienta al renderizar (`Cannot destructure ... of undefined`).
    Aquí se importa cada `*Provider` exportado y se envuelve `<App />`.
    """
    main = next((r for r in archivos if r.endswith(("main.jsx", "main.js",
                 "index.jsx")) and "/src/" in r), None)
    if main is None or "<App" not in archivos[main]:
        return archivos
    contenido = archivos[main]

    # Providers exportados en el proyecto (default o nombrado), con su ruta.
    providers: list[tuple[str, str, bool]] = []  # (nombre, ruta_import, es_default)
    src = main.rsplit("/", 1)[0]
    for ruta, cont in archivos.items():
        if not ruta.endswith((".jsx", ".js")) or "/src/" not in ruta or ruta == main:
            continue
        modulo = ruta.rsplit(".", 1)[0]
        rel = "./" + modulo.split("/src/", 1)[1] if "/src/" in modulo else None
        if rel is None:
            continue
        # Ajustar la ruta relativa desde main (que está en src/).
        rel = "./" + ruta.split("/src/", 1)[1].rsplit(".", 1)[0]
        if re.search(r"export\s+default\s+(\w*Provider)\b", cont):
            nombre = re.search(r"export\s+default\s+(\w*Provider)\b", cont).group(1)
            providers.append((nombre, rel, True))
        for m in re.finditer(r"export\s+(?:const|function|class)\s+(\w*Provider)\b", cont):
            providers.append((m.group(1), rel, False))

    # Solo los que aún no estén ya en main.jsx.
    faltan = [(n, r, d) for n, r, d in providers if f"<{n}" not in contenido]
    if not faltan:
        return archivos

    imports = "".join(
        f"import {n} from '{r}';\n" if d else f"import {{ {n} }} from '{r}';\n"
        for n, r, d in faltan
    )
    apertura = "".join(f"<{n}>" for n, _, _ in faltan)
    cierre = "".join(f"</{n}>" for n, _, _ in reversed(faltan))
    nuevo = imports + re.sub(r"(<App\s*/>)", apertura + r"\1" + cierre, contenido, count=1)

    if _js_valido(nuevo) or nuevo.count("<App") == contenido.count("<App"):
        logger.info("Arreglo automático en %s: <App/> envuelto con %s.",
                    main, [n for n, _, _ in faltan])
        resultado = dict(archivos)
        resultado[main] = nuevo
        return resultado
    return archivos


def frontend_a_esm(archivos: dict[str, str]) -> dict[str, str]:
    """Convierte el frontend de CommonJS a ES Modules.

    El modelo mezcla los dos sistemas: unos archivos usan `export`/`import`
    (ESM) y otros `module.exports`/`require` (CommonJS). Vite trata todo como
    ESM, así que no puede resolver un `import { x }` de un módulo que exporta
    con `module.exports`, y el build muere con errores de "variable no
    encontrada". Se normaliza TODO el frontend a ESM.
    """
    hay_vite = any(
        r.endswith("package.json") and "vite" in c.lower() and "frontend" in r
        for r, c in archivos.items()
    )
    if not hay_vite:
        return archivos

    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if "frontend/" not in ruta or not ruta.endswith((".js", ".jsx")):
            continue
        if "module.exports" not in contenido and "require(" not in contenido:
            continue

        nuevo = contenido
        # require nombrado -> import nombrado
        nuevo = _CJS_REQUIRE_NOMBRADO.sub(
            lambda m: f"import {{ {m.group(1).strip()} }} from '{m.group(3)}';", nuevo)
        # require simple -> import por defecto
        nuevo = _CJS_REQUIRE_DEFAULT.sub(r"import \1 from '\3';", nuevo)
        # module.exports = { a, b } -> export { a, b }
        nuevo = _CJS_EXPORTS_LISTA.sub(
            lambda m: f"export {{ {m.group(1).strip()} }};", nuevo)
        # module.exports = Nombre -> export default Nombre
        nuevo = _CJS_EXPORTS_UNO.sub(r"export default \1;", nuevo)

        if nuevo != contenido:
            resultado[ruta] = nuevo
            logger.info("Arreglo automático en %s: CommonJS -> ESM (Vite lo exige).", ruta)
    return resultado


def servir_frontend_en_express(archivos: dict[str, str]) -> dict[str, str]:
    """Hace que el backend Express sirva el frontend compilado de React.

    El generador escribe un `server.js` con solo las rutas `/api/...` y se olvida
    de servir el `frontend/dist` que produce Vite. El servidor arranca, pero `/`
    devuelve 404: el usuario abre la URL y no ve NADA. Como todo vive en una
    sola URL, el backend tiene que servir también la interfaz.

    Se inserta, justo antes de `app.listen`, el montaje de los estáticos y el
    fallback a `index.html` para las rutas del router de React (SPA).
    """
    # ¿Hay un frontend con build (React/Vite) en el proyecto?
    hay_build = any(
        r.endswith("package.json") and "vite" in c.lower() and "frontend" in r
        for r, c in archivos.items()
    )
    if not hay_build:
        return archivos

    resultado = dict(archivos)
    for ruta, contenido in archivos.items():
        if not ruta.endswith("server.js") or "app.listen" not in contenido:
            continue
        if "express.static" in contenido and "dist" in contenido:
            continue  # ya lo sirve

        # La ruta a dist depende de dónde esté server.js respecto al frontend.
        # backend/server.js -> ../frontend/dist ; server.js -> ./frontend/dist
        prof = ruta.count("/")
        subir = ".., " if False else ""  # (placeholder, se calcula abajo)
        rel = "../frontend/dist" if "backend/" in ruta else "./frontend/dist"

        bloque = (
            "\n// --- Servir el frontend compilado (React/Vite) ---\n"
            "const path = require('path');\n"
            f"const _distDir = path.join(__dirname, '{rel}');\n"
            "app.use(express.static(_distDir));\n"
            "app.get(/^(?!\\/api).*/, (req, res) => "
            "res.sendFile(path.join(_distDir, 'index.html')));\n\n"
        )

        idx = contenido.index("app.listen")
        # Se sube al principio de la línea del listen.
        inicio = contenido.rfind("\n", 0, idx) + 1
        resultado[ruta] = contenido[:inicio] + bloque + contenido[inicio:]
        logger.info("Arreglo automático en %s: el backend ahora sirve el frontend "
                    "compilado (%s) y hace fallback SPA.", ruta, rel)
    return resultado


def crear_css_faltantes(archivos: dict[str, str]) -> dict[str, str]:
    """Crea las hojas de estilo que el código importa pero nadie escribió.

    Un `import './index.css'` sin su archivo rompe el build entero:

        Could not resolve "./index.css" from "src/main.jsx"

    El planificador se olvida de listarlas porque no las considera código. Se
    generan vacías (con un comentario): el objetivo es que el sistema compile y
    se pueda usar, y unos estilos ausentes no impiden nada.
    """
    resultado = dict(archivos)
    creados: list[str] = []

    for ruta, contenido in archivos.items():
        if not ruta.endswith((".js", ".jsx", ".ts", ".tsx")):
            continue
        carpeta = ruta.rsplit("/", 1)[0]
        for relativa in _IMPORT_CSS.findall(contenido):
            destino = _resolver(carpeta, relativa)
            if destino and destino not in resultado:
                resultado[destino] = (
                    f"/* {destino.rsplit('/', 1)[-1]} — generado automáticamente:\n"
                    f"   lo importa {ruta} pero no venía en el plan. */\n"
                )
                creados.append(destino)

    if creados:
        logger.info("Arreglo automático: creadas %d hoja(s) de estilo que faltaban: %s",
                    len(creados), creados[:5])
    return resultado


def _resolver(carpeta: str, relativa: str) -> str | None:
    """Convierte una ruta relativa de import en ruta del proyecto."""
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
    return "/".join(partes)


def arreglar_jsx_en_js(archivos: dict[str, str]) -> dict[str, str]:
    """Renombra a `.jsx` los archivos `.js` que contienen JSX.

    Vite (esbuild) solo transforma JSX en archivos con extensión `.jsx`. Un
    componente de React escrito en un `.js` compila en la cabeza del modelo
    pero revienta el build con un error de sintaxis en la posición del primer
    `<`, que además es ilegible cuando el archivo viene en una sola línea.

    Los imports no se tocan porque en un proyecto Vite se escriben sin
    extensión (`from './utils/auth'`), que es la convención habitual.
    """
    hay_vite = any(
        ruta.endswith("package.json") and "vite" in contenido.lower()
        for ruta, contenido in archivos.items()
    )
    if not hay_vite:
        return archivos

    resultado = dict(archivos)
    renombrados: list[str] = []
    for ruta, contenido in archivos.items():
        if not ruta.endswith(".js") or "/src/" not in ruta:
            continue
        if not _JSX.search(contenido):
            continue
        nueva = ruta[:-3] + ".jsx"
        if nueva in resultado:
            continue
        resultado[nueva] = resultado.pop(ruta)
        renombrados.append(f"{ruta} -> {nueva}")

    if renombrados:
        logger.info("Arreglo automático: %d archivo(s) con JSX renombrados a .jsx: %s",
                    len(renombrados), renombrados[:6])
    return resultado


def _asegurar_script_entrada(html: str, archivos: dict[str, str], prefijo: str) -> str:
    """Añade el `<script type="module">` de entrada si falta."""
    if 'type="module"' in html:
        return html

    entrada = next(
        (n for n in ("src/main.jsx", "src/main.js", "src/index.jsx", "src/index.js")
         if f"{prefijo}{n}" in archivos),
        None,
    )
    if entrada is None or "</body>" not in html:
        return html

    logger.info("Arreglo automático: añadido el script de entrada '%s' al index.html.", entrada)
    return html.replace(
        "</body>", f'    <script type="module" src="/{entrada}"></script>\n  </body>'
    )


# ----------------------------------------------------------------------
_MONTAJES = {
    "StaticFiles": (".css", ".js", ".png", ".jpg", ".svg", ".ico"),
    "Jinja2Templates": (".html",),
}
_ANCLA = "_BASE_DIR"


def arreglar_rutas_estaticas(archivos: dict[str, str]) -> dict[str, str]:
    """Ancla las rutas de plantillas y estáticos a la carpeta REAL que existe.

    Dos fallos que van juntos y solo aparecen al arrancar la aplicación:

    1. La ruta se resuelve contra el directorio de trabajo, no contra el
       archivo. `directory="../frontend/static"` funciona si arrancas dentro de
       `backend/`, pero apunta FUERA del proyecto si arrancas desde la raíz,
       que es lo normal. Se ancla a `__file__`, que no depende de dónde se
       lance el proceso.
    2. La carpeta referenciada no existe: el planificador dejó el frontend
       plano y el código lo escribió anidado. Se apunta a la carpeta que de
       verdad contiene esos archivos.

    Si no hay una carpeta clara a la que apuntar, no se toca nada.
    """
    carpetas: dict[str, set[str]] = {}
    for path in archivos:
        carpeta, _, nombre = path.rpartition("/")
        extension = "." + nombre.rpartition(".")[2] if "." in nombre else ""
        carpetas.setdefault(carpeta, set()).add(extension)

    resultado = dict(archivos)
    for path, contenido in archivos.items():
        if not path.endswith(".py") or not any(m in contenido for m in _MONTAJES):
            continue
        nuevo = _anclar_rutas(path, contenido, carpetas)
        if nuevo != contenido:
            resultado[path] = nuevo
    return resultado


def _anclar_rutas(path: str, contenido: str, carpetas: dict[str, set[str]]) -> str:
    """Reescribe los `directory=` de StaticFiles/Jinja2Templates."""
    origen = path.rpartition("/")[0]
    resultado = contenido
    cambios = 0

    for clase, extensiones in _MONTAJES.items():
        destino = _mejor_carpeta(carpetas, extensiones)
        if destino is None:
            continue
        relativa = _ruta_relativa(origen, destino)

        # Se sustituye el literal del `directory=` dentro de esa llamada.
        patron = re.compile(
            re.escape(clase) + r"\s*\(\s*directory\s*=\s*(['\"])(.*?)\1",
        )

        def cambiar(m: re.Match) -> str:
            return f'{clase}(directory=str({_ANCLA} / "{relativa}")'

        resultado, n = patron.subn(cambiar, resultado)
        cambios += n

    if not cambios:
        return contenido

    resultado = _asegurar_ancla(resultado)
    try:
        compile(resultado, path, "exec")
    except SyntaxError:
        return contenido

    logger.info("Arreglo automático en %s: %d ruta(s) ancladas al archivo.", path, cambios)
    return resultado


def _mejor_carpeta(carpetas: dict[str, set[str]], extensiones: tuple[str, ...]) -> str | None:
    """Carpeta del proyecto que contiene ese tipo de archivos."""
    candidatas = [c for c, exts in carpetas.items() if exts & set(extensiones)]
    if not candidatas:
        return None
    # La menos profunda: si hay `frontend` y `frontend/static`, gana la que
    # realmente agrupa los archivos servidos.
    return min(candidatas, key=lambda c: (c.count("/"), len(c)))


def _ruta_relativa(origen: str, destino: str) -> str:
    """Ruta de `origen` a `destino` en formato POSIX."""
    partes_o = [p for p in origen.split("/") if p]
    partes_d = [p for p in destino.split("/") if p]
    comun = 0
    while comun < min(len(partes_o), len(partes_d)) and partes_o[comun] == partes_d[comun]:
        comun += 1
    return "/".join([".."] * (len(partes_o) - comun) + partes_d[comun:]) or "."


def _asegurar_ancla(contenido: str) -> str:
    """Define `_BASE_DIR` (la carpeta del archivo) si aún no está."""
    if _ANCLA in contenido.split("\n")[0:1] or f"{_ANCLA} =" in contenido:
        return contenido

    try:
        arbol = ast.parse(contenido)
    except SyntaxError:
        return contenido

    fin = 0
    for nodo in arbol.body:
        if isinstance(nodo, (ast.Import, ast.ImportFrom)):
            fin = max(fin, getattr(nodo, "end_lineno", nodo.lineno))
        elif fin:
            break

    lineas = contenido.split("\n")
    bloque = ["from pathlib import Path as _Path", f"{_ANCLA} = _Path(__file__).resolve().parent"]
    lineas[fin:fin] = bloque
    return "\n".join(lineas)


def resolver_referencias(archivos: dict[str, str]) -> dict[str, str]:
    """Corrige las referencias a símbolos que están en OTRO módulo del proyecto.

    El generador escribe un archivo por llamada, con contexto limitado, así que
    inventa referencias cruzadas plausibles pero equivocadas: llama a
    `database.get_db()` cuando `get_db` vive en `dependencies`. El resultado es

        AttributeError: module 'backend.database' has no attribute 'get_db'

    que solo aparece al ejecutar. Aquí se comprueba cada acceso `modulo.simbolo`
    contra lo que ese módulo define de verdad y, si el símbolo está en un ÚNICO
    módulo del proyecto, se reapunta la referencia. Si hay ambigüedad se deja
    como está: es preferible un fallo honesto a una corrección inventada.
    """
    exportados = {
        _modulo(path): _simbolos_publicos(contenido)
        for path, contenido in archivos.items()
        if path.endswith(".py") and _modulo(path) != "__init__"
    }
    if not exportados:
        return archivos

    resultado = dict(archivos)
    for path, contenido in archivos.items():
        if not path.endswith(".py"):
            continue
        nuevo = _reapuntar(path, contenido, exportados)
        if nuevo != contenido:
            resultado[path] = nuevo
    return resultado


def _modulo(path: str) -> str:
    """Nombre de módulo de un archivo (su nombre sin extensión)."""
    return path.rpartition("/")[2][:-3]


def _simbolos_publicos(contenido: str) -> set[str]:
    """Funciones, clases y variables que un módulo define en su nivel superior."""
    try:
        arbol = ast.parse(contenido)
    except SyntaxError:
        return set()

    simbolos: set[str] = set()
    for nodo in arbol.body:
        if isinstance(nodo, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            simbolos.add(nodo.name)
        elif isinstance(nodo, ast.Assign):
            simbolos.update(d.id for d in nodo.targets if isinstance(d, ast.Name))
        elif isinstance(nodo, ast.AnnAssign) and isinstance(nodo.target, ast.Name):
            simbolos.add(nodo.target.id)
        elif isinstance(nodo, (ast.Import, ast.ImportFrom)):
            # Lo reexportado también es accesible como atributo del módulo.
            for alias in nodo.names:
                simbolos.add(alias.asname or alias.name.split(".")[0])
    return simbolos


def _reapuntar(path: str, contenido: str, exportados: dict[str, set[str]]) -> str:
    """Reescribe los accesos `modulo.simbolo` que apuntan al módulo equivocado."""
    try:
        arbol = ast.parse(contenido)
    except SyntaxError:
        return contenido

    alias = _alias_de_modulos(arbol, exportados)
    if not alias:
        return contenido

    propio = _modulo(path)
    # (línea, col_inicio, col_fin, módulo_correcto)
    cambios: list[tuple[int, int, int, str]] = []

    for nodo in ast.walk(arbol):
        if not (isinstance(nodo, ast.Attribute) and isinstance(nodo.value, ast.Name)):
            continue
        modulo = alias.get(nodo.value.id)
        if modulo is None or nodo.attr in exportados.get(modulo, set()):
            continue  # No es un módulo del proyecto, o el símbolo sí está ahí.

        # El punto de entrada no es una librería: importar de él crearía un
        # import circular (main importa los routers, los routers importarían
        # main). Aunque defina el símbolo, nunca es el origen correcto.
        candidatos = [
            m for m, s in exportados.items()
            if nodo.attr in s and m != propio and m not in _ENTRADAS
        ]
        if len(candidatos) != 1:
            continue  # Ambiguo o inexistente: no inventamos.

        cambios.append(
            (nodo.value.lineno, nodo.value.col_offset, nodo.value.end_col_offset, candidatos[0])
        )

    if not cambios:
        return contenido

    lineas = contenido.split("\n")
    # De derecha a izquierda para que los reemplazos no desplacen las columnas.
    for linea, inicio, fin, destino in sorted(cambios, key=lambda c: (-c[0], -c[1])):
        texto = lineas[linea - 1]
        lineas[linea - 1] = texto[:inicio] + destino + texto[fin:]

    resultado = "\n".join(lineas)
    try:
        compile(resultado, path, "exec")
    except SyntaxError:
        return contenido

    destinos = sorted({c[3] for c in cambios})
    logger.info("Arreglo automático en %s: %d referencia(s) reapuntadas a %s.",
                path, len(cambios), ", ".join(destinos))
    return resultado


def _alias_de_modulos(arbol: ast.Module, exportados: dict[str, set[str]]) -> dict[str, str]:
    """Nombres locales que apuntan a un módulo del proyecto."""
    alias: dict[str, str] = {}
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            for a in nodo.names:
                raiz = a.name.split(".")[-1]
                if raiz in exportados:
                    alias[a.asname or a.name.split(".")[0]] = raiz
        elif isinstance(nodo, ast.ImportFrom):
            for a in nodo.names:
                if a.name in exportados:  # `from . import models`
                    alias[a.asname or a.name] = a.name
    return alias


# ----------------------------------------------------------------------
def anadir_imports_faltantes(path: str, content: str, modulos: set[str]) -> str:
    """Importa los módulos hermanos que el archivo usa pero no importó.

    Es el fallo más repetido del código generado: un módulo escribe
    `models.User` porque «sabe» que ese módulo existe en el proyecto, pero se
    olvida de importarlo. El resultado es un `NameError` al importar, que el
    agente reparador arregla mal una y otra vez porque reescribe el archivo
    entero en vez de añadir la línea que falta.

    Args:
        modulos: nombres de los módulos hermanos disponibles (p. ej. {"models"}).
    """
    if not path.endswith(".py") or not modulos:
        return content

    # Primero se suben los imports colocados DESPUÉS de su uso: si no, parecen
    # presentes y el archivo se daría por correcto aunque falle al importarse.
    content = _subir_imports_tardios(path, content)

    try:
        arbol = ast.parse(content)
    except SyntaxError:
        return content  # Sin árbol no hay análisis fiable.

    faltantes = sorted((_nombres_usados(arbol) & modulos) - _nombres_definidos(arbol))
    if not faltantes:
        return content

    linea = f"from . import {', '.join(faltantes)}" if _usa_relativos(arbol) \
        else f"import {', '.join(faltantes)}"
    resultado = _insertar_tras_imports(content, linea, arbol)

    try:
        compile(resultado, path, "exec")
    except SyntaxError:
        return content

    logger.info("Arreglo automático en %s: importado %s.", path, ", ".join(faltantes))
    return resultado


def _subir_imports_tardios(path: str, content: str) -> str:
    """Mueve al principio los imports escritos después de su primer uso.

    Cuando el agente reparador detecta que falta un import, tiende a añadirlo
    al FINAL del archivo. El import existe —así que parece arreglado— pero el
    módulo sigue reventando al importarse con `NameError`, porque las
    anotaciones de las firmas se evalúan al definir la función.
    """
    try:
        arbol = ast.parse(content)
    except SyntaxError:
        return content

    fin_cabecera = 0
    for nodo in arbol.body:
        if isinstance(nodo, (ast.Import, ast.ImportFrom)):
            fin_cabecera = max(fin_cabecera, getattr(nodo, "end_lineno", nodo.lineno))
        elif fin_cabecera:
            break

    primer_uso = _primer_uso_por_nombre(arbol)
    a_subir: list[tuple[int, int]] = []
    for nodo in arbol.body:
        if not isinstance(nodo, (ast.Import, ast.ImportFrom)) or nodo.lineno <= fin_cabecera:
            continue
        nombres = {
            alias.asname or (alias.name.split(".")[0] if isinstance(nodo, ast.Import) else alias.name)
            for alias in nodo.names
        }
        if any(primer_uso.get(n, 10**9) < nodo.lineno for n in nombres):
            a_subir.append((nodo.lineno, getattr(nodo, "end_lineno", nodo.lineno)))

    if not a_subir:
        return content

    lineas = content.split("\n")
    movidas: list[str] = []
    for inicio, fin in a_subir:
        movidas.extend(lineas[inicio - 1 : fin])
    for inicio, fin in reversed(a_subir):  # de atrás hacia delante, para no desplazar índices
        del lineas[inicio - 1 : fin]

    lineas[fin_cabecera:fin_cabecera] = movidas
    resultado = "\n".join(lineas)

    try:
        compile(resultado, path, "exec")
    except SyntaxError:
        return content

    logger.info("Arreglo automático en %s: %d import(s) subidos al principio.",
                path, len(a_subir))
    return resultado


def _primer_uso_por_nombre(arbol: ast.Module) -> dict[str, int]:
    """Línea del primer uso (lectura) de cada nombre."""
    primero: dict[str, int] = {}
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Name) and isinstance(nodo.ctx, ast.Load):
            primero[nodo.id] = min(primero.get(nodo.id, 10**9), nodo.lineno)
    return primero


def _nombres_definidos(arbol: ast.Module) -> set[str]:
    """Nombres que el archivo ya define o importa."""
    definidos: set[str] = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            for alias in nodo.names:
                definidos.add(alias.asname or alias.name.split(".")[0])
        elif isinstance(nodo, ast.ImportFrom):
            for alias in nodo.names:
                definidos.add(alias.asname or alias.name)
        elif isinstance(nodo, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            definidos.add(nodo.name)
        elif isinstance(nodo, ast.Name) and isinstance(nodo.ctx, ast.Store):
            definidos.add(nodo.id)
        elif isinstance(nodo, ast.arg):
            definidos.add(nodo.arg)
    return definidos


def _nombres_usados(arbol: ast.Module) -> set[str]:
    """Raíces de accesos tipo `X.algo` (que es como se usa un módulo)."""
    usados: set[str] = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Attribute):
            base = nodo
            while isinstance(base, ast.Attribute):
                base = base.value
            if isinstance(base, ast.Name):
                usados.add(base.id)
    return usados


def _usa_relativos(arbol: ast.Module) -> bool:
    """True si el archivo ya usa imports relativos (está dentro de un paquete)."""
    return any(
        isinstance(n, ast.ImportFrom) and (n.level or 0) > 0 for n in ast.walk(arbol)
    )


def _insertar_tras_imports(content: str, linea: str, arbol: ast.Module) -> str:
    """Coloca la línea justo después del último import de cabecera."""
    ultima = 0
    for nodo in arbol.body:
        if isinstance(nodo, (ast.Import, ast.ImportFrom)):
            ultima = max(ultima, getattr(nodo, "end_lineno", nodo.lineno) or nodo.lineno)
        elif ultima:
            break  # Ya salimos del bloque de imports.

    lineas = content.split("\n")
    lineas.insert(ultima, linea)
    return "\n".join(lineas)


# ----------------------------------------------------------------------
def _modernizar_template_response(source: str) -> str | None:
    """Corrige la firma obsoleta de `TemplateResponse`.

    Starlette cambió el orden de los argumentos: el `request` va PRIMERO.
    Con la forma antigua el código compila pero revienta al ejecutarse, porque
    Starlette toma el diccionario de contexto como si fuera el nombre de la
    plantilla y Jinja intenta usarlo como clave de caché:

        TypeError: unhashable type: 'dict'

    Antes:  TemplateResponse("index.html", {"request": request, "x": 1})
    Después: TemplateResponse(request, "index.html", {"x": 1})
    """
    resultado = source
    cambiado = False
    pos = 0

    while (i := resultado.find("TemplateResponse(", pos)) != -1:
        abre = i + len("TemplateResponse")
        cierra = _cierre(resultado, abre)
        if cierra is None:
            break

        args = _separar(resultado[abre + 1 : cierra])
        pos = cierra + 1
        if args is None or len(args) != 2:
            continue

        nombre, contexto = args[0].strip(), args[1].strip()
        # Solo se toca la forma inequívoca: nombre literal + dict de contexto.
        if not (nombre[:1] in "\"'" and contexto.startswith("{")):
            continue

        peticion = _extraer_request(contexto)
        if peticion is None:
            continue

        resto = _quitar_clave_request(contexto)
        nuevos = f"{peticion}, {nombre}" + (f", {resto}" if resto else "")
        resultado = resultado[: abre + 1] + nuevos + resultado[cierra:]
        cambiado = True
        pos = abre + 1 + len(nuevos) + 1

    return resultado if cambiado else None


def _extraer_request(contexto: str) -> str | None:
    """Valor asociado a la clave "request" dentro del diccionario de contexto."""
    for entrada in _separar(contexto[1:-1]) or []:
        clave, _, valor = entrada.partition(":")
        if clave.strip().strip("\"'") == "request":
            return valor.strip() or None
    return None


def _quitar_clave_request(contexto: str) -> str:
    """Diccionario de contexto sin la clave "request" (vacío si no queda nada)."""
    restantes = [
        e.strip()
        for e in (_separar(contexto[1:-1]) or [])
        if e.partition(":")[0].strip().strip("\"'") != "request"
    ]
    return "{" + ", ".join(restantes) + "}" if restantes else ""


# ----------------------------------------------------------------------
def _reordenar_parametros(source: str) -> str | None:
    """Reordena las firmas para que los parámetros sin defecto vayan primero."""
    resultado = source
    cambiado = False
    pos = 0

    while (match := _DEF.search(resultado, pos)) is not None:
        abre = match.end() - 1
        cierra = _cierre(resultado, abre)
        if cierra is None:
            break

        firma = resultado[abre + 1 : cierra]
        nueva = _reordenar_firma(firma)
        if nueva is None:
            pos = cierra + 1
            continue

        resultado = resultado[: abre + 1] + nueva + resultado[cierra:]
        cambiado = True
        pos = abre + 1 + len(nueva) + 1

    return resultado if cambiado else None


def _cierre(texto: str, abre: int) -> int | None:
    """Posición del paréntesis que cierra el que empieza en `abre`."""
    profundidad = 0
    comilla: str | None = None
    i = abre

    while i < len(texto):
        c = texto[i]
        if comilla:
            if c == "\\":
                i += 2
                continue
            if c == comilla:
                comilla = None
        elif c in "\"'":
            comilla = c
        elif c in _APERTURA:
            profundidad += 1
        elif c in ")]}":
            profundidad -= 1
            if profundidad == 0:
                return i
        i += 1
    return None


def _reordenar_firma(firma: str) -> str | None:
    """Reordena una lista de parámetros; None si no hay nada que hacer."""
    partes = _separar(firma)
    if partes is None or len(partes) < 2:
        return None

    # `*args`, `**kwargs` y el separador `*` imponen reglas de orden propias:
    # no se tocan, porque reordenarlos SÍ cambiaría el significado.
    if any(p.strip().startswith("*") for p in partes):
        return None

    sin_defecto = [p for p in partes if not _tiene_defecto(p)]
    con_defecto = [p for p in partes if _tiene_defecto(p)]
    ordenadas = sin_defecto + con_defecto

    if [p.strip() for p in ordenadas] == [p.strip() for p in partes]:
        return None  # Ya estaban bien.

    # Se respeta el estilo original: una por línea o todas seguidas.
    if "\n" in firma:
        sangria = _sangria(firma)
        cuerpo = (",\n" + sangria).join(p.strip() for p in ordenadas)
        cierre_sangria = sangria[:-4] if len(sangria) >= 4 else ""
        return "\n" + sangria + cuerpo + ",\n" + cierre_sangria
    return ", ".join(p.strip() for p in ordenadas)


def _separar(firma: str) -> list[str] | None:
    """Divide por las comas de primer nivel (no las de dentro de corchetes)."""
    partes: list[str] = []
    actual: list[str] = []
    profundidad = 0
    comilla: str | None = None
    i = 0

    while i < len(firma):
        c = firma[i]
        if comilla:
            if c == "\\":
                actual.append(firma[i : i + 2])
                i += 2
                continue
            if c == comilla:
                comilla = None
        elif c in "\"'":
            comilla = c
        elif c in _APERTURA:
            profundidad += 1
        elif c in ")]}":
            profundidad -= 1
        elif c == "," and profundidad == 0:
            partes.append("".join(actual))
            actual = []
            i += 1
            continue
        actual.append(c)
        i += 1

    if comilla or profundidad != 0:
        return None  # Firma malformada: no la tocamos.
    if resto := "".join(actual).strip():
        partes.append(resto)
    return [p for p in partes if p.strip()]


def _tiene_defecto(parametro: str) -> bool:
    """True si el parámetro trae `= valor` en su primer nivel."""
    profundidad = 0
    comilla: str | None = None
    i = 0

    while i < len(parametro):
        c = parametro[i]
        if comilla:
            if c == "\\":
                i += 2
                continue
            if c == comilla:
                comilla = None
        elif c in "\"'":
            comilla = c
        elif c in _APERTURA:
            profundidad += 1
        elif c in ")]}":
            profundidad -= 1
        elif c == "=" and profundidad == 0:
            # `==`, `<=`, `>=`, `!=` no son valores por defecto.
            anterior = parametro[i - 1] if i else ""
            siguiente = parametro[i + 1] if i + 1 < len(parametro) else ""
            if anterior not in "=!<>" and siguiente != "=":
                return True
        i += 1
    return False


def _sangria(firma: str) -> str:
    """Sangría con la que están escritos los parámetros multilínea."""
    for linea in firma.split("\n")[1:]:
        if linea.strip():
            return linea[: len(linea) - len(linea.lstrip())]
    return "    "
