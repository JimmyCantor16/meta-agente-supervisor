"""El contrato de DIXEL, comprobado por máquina.

`vendor/dixel/CONTRACT.md` no es una guía de estilo: es la razón de que 200
componentes se sientan uno solo y de que ninguno baje los FPS. Buena parte de
sus reglas son OBJETIVAS —animar solo `transform` y `opacity`, un único reloj,
cero `console.log`, colores por token— y por tanto se pueden corregir sin
preguntarle a un modelo, sin gastar cupo y sin margen de opinión.

Eso es justo lo que hace falta para ENSEÑAR con la librería: el alumno escribe
su componente, y el veredicto es una regla citada, no un juicio. Un modelo
puede explicar por qué la regla existe; para decidir si se cumple, este módulo
es mejor: es determinista.

Es dominio puro: entra texto, sale una lista de infracciones. No lee el disco,
no ejecuta nada, no importa infraestructura.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: Propiedades cuya animación tira los FPS: obligan a recalcular layout o pintar.
#: Las del contrato, ni una más: la lista la manda CONTRACT.md, no el gusto de
#: quien corrige. `background-color` NO está — es solo pintado y la librería lo
#: usa a propósito en hover.
PROPIEDADES_PROHIBIDAS = (
    "filter",
    "box-shadow",
    "width",
    "height",
    "top",
    "left",
    "right",
    "bottom",
    "letter-spacing",
    "background-position",
)

_RE_DEFINE = re.compile(r"Dixel\.define\(\s*['\"]([A-Za-z0-9_]+)['\"]")
_RE_COMENTARIO_LINEA = re.compile(r"(^|[^:'\"])//(?!\s*$)")
_RE_COMENTARIO_BLOQUE = re.compile(r"/\*")
_RE_CONSOLE = re.compile(r"\bconsole\s*\.\s*(log|debug|info|warn|error)\s*\(")
_RE_MODULO = re.compile(r"^\s*(import|export)\s")
_RE_RAF = re.compile(r"\b(requestAnimationFrame|setInterval)\s*\(")
_RE_DEFAULTS = re.compile(r"static\s+defaults\s*=")
_RE_CLASE = re.compile(r"class\s+([A-Za-z0-9_]+)\s+extends")
_RE_TRANSICION = re.compile(r"transition\s*:\s*([^;{}]+)[;}]")
_RE_HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
_RE_RGB = re.compile(r"\brgba?\(\s*[0-9]")
_RE_CLASE_CSS = re.compile(r"\.([a-zA-Z][a-zA-Z0-9_-]*)")
_RE_MEDICION = re.compile(r"\b(getBoundingClientRect|clientWidth|clientHeight|offsetWidth|offsetHeight)\b")
_RE_INNERHTML = re.compile(r"innerHTML\s*[+]?=\s*(.+)$")
_RE_INTERPOLA_OPCION = re.compile(r"(this\.options\.[A-Za-z0-9_]+|settings\.[A-Za-z0-9_]+)")
#: Métodos que corren por frame: medir el layout ahí cuesta un reflow por cuadro.
METODOS_POR_FRAME = ("update", "frame", "draw", "render", "tick", "onDraw")
#: Blancos y negros puros: son alfas de brillo/sombra, no color de marca.
NEUTROS = ("#fff", "#ffffff", "#000", "#000000")
#: Opciones que SON markup del desarrollador por diseño (ver CONTRACT.md).
OPCIONES_HTML = ("panes", "before", "after", "slides", "html", "content", "icon", "body")
#: Fuentes de markup interno que no son datos de nadie: el catálogo de iconos.
MARKUP_INTERNO = ("Icon.svg(", "IconSet", "closeIcon", "arrowIcon")


@dataclass(frozen=True)
class Infraccion:
    """Una regla incumplida, con dónde y por qué importa."""

    regla: str
    archivo: str
    linea: int
    detalle: str

    def como_texto(self) -> str:
        donde = f"{self.archivo}:{self.linea}" if self.linea else self.archivo
        return f"[{self.regla}] {donde} — {self.detalle}"


def es_componente(ruta: str) -> bool:
    """True si el archivo debería cumplir el contrato (un componente JS)."""
    ruta = ruta.replace("\\", "/")
    if not ruta.endswith(".js"):
        return False
    return any(
        ruta.startswith(carpeta) or f"/{carpeta}" in ruta
        for carpeta in ("components/", "effects/", "shaders/", "scrollbars/", "icons/")
    )


def _revisar_js(ruta: str, texto: str) -> list[Infraccion]:
    faltas: list[Infraccion] = []
    lineas = texto.split("\n")
    en_bloque_de_frame = ""

    for numero, linea in enumerate(lineas, 1):
        desnuda = linea.strip()
        if not desnuda:
            continue
        if "http://www.w3.org" not in linea and (
            _RE_COMENTARIO_LINEA.search(linea) or _RE_COMENTARIO_BLOQUE.search(linea)
        ):
            faltas.append(Infraccion(
                "sin-comentarios", ruta, numero,
                "El contrato pide CERO comentarios: el nombre de la función y de "
                "la variable tienen que contarlo.",
            ))
        if _RE_CONSOLE.search(linea):
            faltas.append(Infraccion(
                "sin-console", ruta, numero,
                "Ningún console.* en la librería: lo que se publica no habla por consola.",
            ))
        if _RE_MODULO.match(linea):
            faltas.append(Infraccion(
                "sin-modulos", ruta, numero,
                "Sin import/export: el único registro es Dixel.define(nombre, deps, factory).",
            ))
        if _RE_RAF.search(linea):
            faltas.append(Infraccion(
                "un-solo-reloj", ruta, numero,
                "Un solo reloj: this.onFrame(cb) o Ticker. Un rAF propio suma un "
                "bucle que nadie pausa al salir de pantalla.",
            ))
        cabecera = re.match(r"\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(", linea)
        if cabecera:
            en_bloque_de_frame = cabecera.group(1) if cabecera.group(1) in METODOS_POR_FRAME else ""

        # Solo cuenta como ANIMACIÓN lo que se toca cuadro a cuadro: escribir un
        # ancho una vez al montar es colocar, no animar.
        estilo = re.search(r"\.style\.([A-Za-z]+)\s*=", linea)
        if estilo and en_bloque_de_frame:
            propiedad = re.sub(r"([A-Z])", r"-\1", estilo.group(1)).lower()
            if propiedad in PROPIEDADES_PROHIBIDAS:
                faltas.append(Infraccion(
                    "solo-transform-opacity", ruta, numero,
                    f"Se anima `{propiedad}` dentro de `{en_bloque_de_frame}()`. Solo "
                    "transform y opacity: lo demás obliga a recalcular layout en cada cuadro.",
                ))

        if en_bloque_de_frame and _RE_MEDICION.search(linea):
            faltas.append(Infraccion(
                "sin-medir-en-frame", ruta, numero,
                f"Se mide el layout dentro de `{en_bloque_de_frame}()`. Se mide en "
                "ready()/resize y se cachea.",
            ))

        interpolado = _RE_INNERHTML.search(linea)
        opcion = _RE_INTERPOLA_OPCION.search(interpolado.group(1)) if interpolado else None
        if opcion and opcion.group(1).rsplit(".", 1)[-1] not in OPCIONES_HTML:
            interno = any(marca in linea for marca in MARKUP_INTERNO)
            if not interno and "Utils.escape" not in linea and "settings.html" not in linea:
                faltas.append(Infraccion(
                    "texto-escapado", ruta, numero,
                    "Texto de opciones interpolado en innerHTML sin Utils.escape: "
                    "por ahí entra HTML de terceros.",
                ))

    definidos = _RE_DEFINE.findall(texto)
    if not definidos:
        faltas.append(Infraccion(
            "usa-define", ruta, 0,
            "Un componente se registra con Dixel.define(nombre, dependencias, factory).",
        ))
    else:
        esperado = ruta.replace("\\", "/").rsplit("/", 1)[-1][:-3]
        if len(definidos) > 1:
            faltas.append(Infraccion(
                "uno-por-archivo", ruta, 0,
                "Un componente por archivo: aquí se registran " + ", ".join(definidos) + ".",
            ))
        elif definidos[0] != esperado:
            faltas.append(Infraccion(
                "uno-por-archivo", ruta, 0,
                f"El archivo se llama {esperado}.js pero registra «{definidos[0]}».",
            ))
    if _RE_CLASE.search(texto) and not _RE_DEFAULTS.search(texto):
        faltas.append(Infraccion(
            "static-defaults", ruta, 0,
            "Falta `static defaults`: las opciones se declaran, no se adivinan con ||.",
        ))
    return faltas


def _revisar_css(ruta: str, texto: str) -> list[Infraccion]:
    faltas: list[Infraccion] = []
    for numero, linea in enumerate(texto.split("\n"), 1):
        # Un SVG embebido como data: URI trae dentro urls y puntos que no son
        # ni selectores ni colores de la hoja.
        if "data:image" in linea or "w3.org" in linea:
            continue
        # Una rueda de tono (el selector de color) es un arcoíris por
        # definición: esos no son colores de marca que puedan salir de un token.
        if linea.count("#") >= 4 and "gradient(" in linea:
            continue
        transicion = _RE_TRANSICION.search(linea)
        if transicion:
            for propiedad in PROPIEDADES_PROHIBIDAS:
                if re.search(r"\b" + re.escape(propiedad) + r"\b", transicion.group(1)):
                    faltas.append(Infraccion(
                        "solo-transform-opacity", ruta, numero,
                        f"`transition` sobre `{propiedad}`. Solo transform y opacity; "
                        "las sombras y los glows van estáticos.",
                    ))
                    break
        colores = [c for c in _RE_HEX.findall(linea) if c.lower() not in NEUTROS]
        rgbs = [c for c in re.findall(r"rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})", linea)
                if set(c) - {"0", "255"}]
        if colores or rgbs:
            faltas.append(Infraccion(
                "color-por-token", ruta, numero,
                "Color escrito a mano. Todo color sale de los tokens "
                "(var(--dx-…) o rgb(var(--dx-…-rgb) / alfa)), o la librería deja "
                "de poder retintarse.",
            ))
        selector = linea.split("{")[0]
        clases = _RE_CLASE_CSS.findall(selector)
        if clases and not any(c.startswith("dx-") for c in clases):
            faltas.append(Infraccion(
                "prefijo-dx", ruta, numero,
                f"El selector `.{clases[0]}` no toca ninguna clase dx-: se pisaría "
                "con el CSS de quien use la librería.",
            ))
    return faltas


def revisar(archivos: dict[str, str]) -> list[Infraccion]:
    """Revisa {ruta: contenido} contra el contrato. Lista vacía = cumple."""
    faltas: list[Infraccion] = []
    for ruta, texto in sorted(archivos.items()):
        limpia = ruta.replace("\\", "/")
        if limpia.endswith(".css"):
            faltas.extend(_revisar_css(ruta, texto))
        elif es_componente(limpia):
            faltas.extend(_revisar_js(ruta, texto))
    return faltas


def resumen(faltas: list[Infraccion], maximo: int = 6) -> str:
    """Las infracciones, escritas para que el alumno sepa qué tocar."""
    if not faltas:
        return ""
    lineas = [f.como_texto() for f in faltas[:maximo]]
    if len(faltas) > maximo:
        lineas.append(f"…y {len(faltas) - maximo} más.")
    return "\n".join(lineas)
