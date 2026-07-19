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
import logging
import re

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
