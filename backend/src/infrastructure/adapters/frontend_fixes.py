"""Reparaciones DETERMINISTAS de frontend, previas al gate de render.

El navegador del gate rechaza dos patrones muy frecuentes que el LLM produce al
generar un frontend modular, y que NO necesitan otra llamada al modelo para
arreglarse (son mecánicos y seguros):

  1. JS con `import/export` (ES modules) enlazado con `<script>` PLANO
     -> "Cannot use import statement outside a module".
     Fix: añadir `type="module"` al <script> que apunta a ese .js.

  2. Un símbolo se IMPORTA de otro módulo pero el módulo destino lo DEFINE y
     olvidó EXPORTARLO -> "does not provide an export named 'X'".
     Fix: añadir `export { X };` al final del módulo que lo define.

Arreglar esto aquí convierte "MVP retenido por bug de carga" en "MVP que se ve",
sin gastar cupo de IA. Es parte del entrenamiento del agente: el fallo se corrige
de forma garantista y determinista.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# --- Detección de sintaxis de módulos ES -------------------------------------
_IMPORT_FROM = re.compile(r"^\s*import\s+.+?\s+from\s+['\"]([^'\"]+)['\"]", re.M)
_IMPORT_BARE = re.compile(r"^\s*import\s+['\"]([^'\"]+)['\"]", re.M)
_EXPORT_ANY = re.compile(r"^\s*export\s+(\{|default|const|function|class|let|var|async|\*)", re.M)

# import { a, b as c } from './x.js'
_IMPORT_NAMED = re.compile(r"^\s*import\s*\{([^}]*)\}\s*from\s*['\"]([^'\"]+)['\"]", re.M)
# export { a, b }
_EXPORT_BRACE = re.compile(r"^\s*export\s*\{([^}]*)\}", re.M)
# export const/let/var/function/class NAME  |  export default function NAME
_EXPORT_DECL = re.compile(
    r"^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)",
    re.M,
)
# definiciones top-level:  function NAME | async function NAME | const/let/var NAME | class NAME
_DEF_DECL = re.compile(
    r"^\s*(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)", re.M
)

# <script ... src="..."> (captura atributos antes/después del src)
_SCRIPT_SRC = re.compile(r"<script\b([^>]*?)\bsrc\s*=\s*['\"]([^'\"]+)['\"]([^>]*)>", re.I)


def _usa_modulos(js: str) -> bool:
    return bool(_IMPORT_FROM.search(js) or _IMPORT_BARE.search(js) or _EXPORT_ANY.search(js))


def _nombres(lista: str) -> list[str]:
    """Parsea 'a, b as c' -> nombres LOCALES relevantes para import/export."""
    out: list[str] = []
    for parte in lista.split(","):
        p = parte.strip()
        if not p:
            continue
        # 'orig as alias' -> para import el nombre importado es 'orig'
        out.append(p.split(" as ")[0].strip())
    return out


def _reparar_exports_faltantes(root: Path) -> bool:
    """Añade `export { X }` cuando X se importa de un módulo que lo define pero no lo exporta."""
    js_files = {p.name: p for p in root.rglob("*.js")}
    cambio = False

    # 1) recolecta qué símbolos pide cada módulo destino.
    pedidos: dict[str, set[str]] = {}
    for p in js_files.values():
        try:
            txt = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for m in _IMPORT_NAMED.finditer(txt):
            nombres = _nombres(m.group(1))
            destino = m.group(2).rsplit("/", 1)[-1]
            pedidos.setdefault(destino, set()).update(nombres)

    # 2) para cada módulo destino, exporta lo que define pero no exporta y le piden.
    for base, quiere in pedidos.items():
        p = js_files.get(base)
        if p is None:
            continue
        try:
            txt = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        exportados: set[str] = set()
        for m in _EXPORT_BRACE.finditer(txt):
            exportados.update(_nombres(m.group(1)))
        exportados.update(_EXPORT_DECL.findall(txt))
        definidos = set(_DEF_DECL.findall(txt))
        faltan = [n for n in sorted(quiere) if n in definidos and n not in exportados]
        if faltan:
            adicion = "\n\n// export añadido automáticamente (símbolos importados por otros módulos)\nexport { " + ", ".join(faltan) + " };\n"
            p.write_text(txt.rstrip() + adicion, encoding="utf-8")
            cambio = True
            logger.info("Frontend fix: exportando %s desde %s", faltan, base)
    return cambio


def _reparar_script_module(root: Path) -> bool:
    """Añade type=module a los <script> que cargan JS con sintaxis de módulos."""
    modulares = {
        p.name
        for p in root.rglob("*.js")
        if _usa_modulos(_safe_read(p))
    }
    if not modulares:
        return False

    cambio = False
    for html in root.rglob("*.html"):
        txt = _safe_read(html)
        if not txt:
            continue

        def _fix(m: re.Match) -> str:
            pre, src, post = m.group(1), m.group(2), m.group(3)
            base = src.rsplit("/", 1)[-1]
            if base in modulares and "type=" not in (pre + post).lower():
                return f'<script{pre} type="module" src="{src}"{post}>'
            return m.group(0)

        nuevo = _SCRIPT_SRC.sub(_fix, txt)
        if nuevo != txt:
            html.write_text(nuevo, encoding="utf-8")
            cambio = True
            logger.info("Frontend fix: type=module añadido en %s", html.name)
    return cambio


def _safe_read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def reparar_frontend(root: str | Path) -> bool:
    """Aplica los fixes deterministas. Devuelve True si cambió algo.

    El orden importa: primero se garantizan los exports (para que type=module no
    destape 'export inexistente'), luego se marcan los <script> como módulos.
    """
    root = Path(root)
    if not root.exists():
        return False
    fix_exports = _reparar_exports_faltantes(root)
    fix_scripts = _reparar_script_module(root)
    return fix_exports or fix_scripts
