"""Reparaciones DETERMINISTAS de backend, previas a la verificación.

Dos errores que el LLM comete de forma recurrente al generar un backend FastAPI
y que se arreglan mecánicamente (sin otra llamada al modelo), descubiertos en una
generación real de "to-do con login":

  1. CABLEADO DE ROUTERS: main incluye dos veces el mismo router y OLVIDA otro
     -> las rutas de ese módulo (p. ej. login/register) no existen -> 404.
     Señal inequívoca: `include_router(X.router, ..., tags=["Y"])` donde Y es
     OTRO módulo de router IMPORTADO y disponible, y Y.router no se incluye en
     ningún lado. Fix: cambiar X.router -> Y.router en esa línea.

  2. PINES INCOMPATIBLES: `passlib` + `bcrypt>=4.1` rompe el hasheo de claves
     (ValueError: password cannot be longer than 72 bytes en la init del backend)
     -> register/login dan 500. Fix: fijar bcrypt a la última versión compatible.

Esto convierte "MVP que abre pero no deja entrar" en "MVP usable", garantista y
sin gastar cupo de IA.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

_BCRYPT_COMPAT = "bcrypt==4.0.1"

_INCLUDE_RE = re.compile(
    r"include_router\(\s*([A-Za-z_][\w]*)\.router\b([^)]*)\)", re.S
)
_TAGS_RE = re.compile(r"tags\s*=\s*\[\s*['\"]([A-Za-z_][\w]*)['\"]")


def _es_main_fastapi(txt: str) -> bool:
    return "FastAPI(" in txt and "include_router" in txt


def _reparar_routers(root: Path) -> bool:
    cambio = False
    # Módulos de router disponibles: los .py bajo un paquete 'routers' que definen
    # `router = APIRouter(`.
    modulos_router: set[str] = set()
    for p in root.rglob("*.py"):
        if "router" in p.parts or p.parent.name == "routers":
            try:
                if re.search(r"^\s*router\s*=\s*APIRouter\(", p.read_text(encoding="utf-8", errors="ignore"), re.M):
                    modulos_router.add(p.stem)
            except Exception:
                continue
    if not modulos_router:
        return False

    for main in root.rglob("*.py"):
        try:
            txt = main.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if not _es_main_fastapi(txt):
            continue

        incluidos = [m.group(1) for m in _INCLUDE_RE.finditer(txt)]
        contados: dict[str, int] = {}
        for m in incluidos:
            contados[m] = contados.get(m, 0) + 1

        def _fix(match: re.Match) -> str:
            mod, resto = match.group(1), match.group(2)
            tags = _TAGS_RE.search(resto)
            if not tags:
                return match.group(0)
            objetivo = tags.group(1)
            # El tag nombra OTRO módulo de router disponible que NO se incluyó,
            # y este módulo (mod) aparece más de una vez -> copy-paste roto.
            if (
                objetivo != mod
                and objetivo in modulos_router
                and objetivo not in incluidos
                and contados.get(mod, 0) >= 2
            ):
                nonlocal cambio
                cambio = True
                logger.info("Backend fix: include_router %s.router -> %s.router (tag=%s)", mod, objetivo, objetivo)
                return match.group(0).replace(f"{mod}.router", f"{objetivo}.router", 1)
            return match.group(0)

        nuevo = _INCLUDE_RE.sub(_fix, txt)
        if nuevo != txt:
            main.write_text(nuevo, encoding="utf-8")
    return cambio


def _reparar_requirements(root: Path) -> bool:
    cambio = False
    for req in root.rglob("requirements*.txt"):
        try:
            txt = req.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "passlib" not in txt.lower() or "bcrypt" not in txt.lower():
            continue
        lineas = txt.splitlines()
        out = []
        toco = False
        for ln in lineas:
            base = ln.strip().lower()
            if base.startswith("bcrypt") and "4.0.1" not in base:
                # Solo pisamos si está sin pin exacto o pide >=4.1 (el rango roto).
                if re.search(r"bcrypt\s*(==\s*4\.1|>=|>|~=|$|\s)", base) and "==4.0" not in base:
                    out.append(_BCRYPT_COMPAT)
                    toco = True
                    continue
            out.append(ln)
        if toco:
            req.write_text("\n".join(out) + "\n", encoding="utf-8")
            cambio = True
            logger.info("Backend fix: bcrypt fijado a versión compatible con passlib en %s", req.name)
    return cambio


def reparar_backend(root: str | Path) -> bool:
    """Aplica los fixes deterministas de backend. True si cambió algo."""
    root = Path(root)
    if not root.exists():
        return False
    fix_r = _reparar_routers(root)
    fix_q = _reparar_requirements(root)
    return fix_r or fix_q


# ---------------------------------------------------------------------------
# Resolvedor de IMPORTS dirigido por el ERROR real de la verificación.
#
# El generador escribe archivo por archivo y el error más común es un símbolo
# usado sin importar (get_db, un modelo, un schema): NameError al importar el
# módulo. El bucle de reparación del LLM resultó POCO FIABLE hasta para esto
# (devolvía el mismo código). Este resolvedor lo arregla de forma garantista:
# lee el NameError + el traceback, encuentra en QUÉ módulo del proyecto está
# definido ese símbolo, y añade el `from <mod> import <symbol>` en el archivo
# que falló. Reutiliza el error REAL, no adivina con análisis estático.
# ---------------------------------------------------------------------------

_NAMEERROR = re.compile(r"NameError: name '([A-Za-z_]\w*)' is not defined")
_FILE_IN_TB = re.compile(r'File "([^"]+\.py)", line \d+')
_IMPORTERROR = re.compile(r"cannot import name '([A-Za-z_]\w*)' from '([A-Za-z_][\w.]*)'")


def _dotted(p: Path, root: Path) -> str:
    """backend/routers/users.py (root=proyecto) -> 'backend.routers.users'."""
    rel = p.relative_to(root).with_suffix("")
    return ".".join(rel.parts)


def _mapa_simbolos(root: Path) -> dict[str, str]:
    """símbolo top-level -> módulo punteado donde se define (para importarlo)."""
    mapa: dict[str, str] = {}
    for p in root.rglob("*.py"):
        try:
            txt = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        mod = _dotted(p, root)
        for m in re.finditer(r"^\s*(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)", txt, re.M):
            mapa.setdefault(m.group(1), mod)
        for m in re.finditer(r"^([A-Za-z_]\w*)\s*=\s*\S", txt, re.M):  # asignación módulo-nivel
            mapa.setdefault(m.group(1), mod)
    return mapa


def _ya_importado(txt: str, nombre: str) -> bool:
    return bool(
        re.search(rf"^\s*from\s+\S+\s+import\s+[^\n]*\b{re.escape(nombre)}\b", txt, re.M)
        or re.search(rf"^\s*import\s+[^\n]*\b{re.escape(nombre)}\b", txt, re.M)
    )


def _definido_local(txt: str, nombre: str) -> bool:
    return bool(re.search(rf"^\s*(?:async\s+)?(?:def|class)\s+{re.escape(nombre)}\b", txt, re.M))


def _insertar_import(txt: str, linea: str) -> str:
    lineas = txt.splitlines(keepends=True)
    idx = 0
    for i, ln in enumerate(lineas):
        if re.match(r"^\s*(import|from)\s+\S", ln):
            idx = i + 1
    lineas.insert(idx, linea if linea.endswith("\n") else linea + "\n")
    return "".join(lineas)


def _archivo_del_traceback(error_text: str, root: Path) -> Path | None:
    for f in reversed(_FILE_IN_TB.findall(error_text)):
        p = Path(f)
        try:
            if p.exists() and root in p.parents or (p.exists() and str(root) in str(p)):
                return p
        except Exception:
            continue
    return None


def reparar_por_error(root: str | Path, error_text: str) -> bool:
    """Arregla el error de verificación de forma determinista. True si cambió algo.

    Cubre: NameError (símbolo usado sin importar) e ImportError (import desde el
    módulo equivocado). Se llama en cada vuelta del bucle ANTES del LLM.
    """
    root = Path(root)
    if not root.exists() or not error_text:
        return False
    mapa = _mapa_simbolos(root)

    # Caso 1: NameError: name 'X' is not defined
    m = _NAMEERROR.search(error_text)
    if m:
        nombre = m.group(1)
        archivo = _archivo_del_traceback(error_text, root)
        mod = mapa.get(nombre)
        if archivo and mod:
            origen = _dotted(archivo, root)
            txt = archivo.read_text(encoding="utf-8", errors="ignore")
            if mod != origen and not _ya_importado(txt, nombre) and not _definido_local(txt, nombre):
                nuevo = _insertar_import(txt, f"from {mod} import {nombre}")
                archivo.write_text(nuevo, encoding="utf-8")
                logger.info("Import fix: 'from %s import %s' añadido en %s", mod, nombre, archivo.name)
                return True

    # Caso 3: COLISIÓN modelo/schema — el ORM `db.query(X)` recibió el schema
    # Pydantic porque `from ...schemas import X` tapó a `from ...models import X`.
    # Fix: aliasear el import de schemas (X -> XOut) y apuntar response_model a él.
    m3 = re.search(r"got <class '([\w.]*schemas)\.(\w+)'>", error_text)
    if m3:
        mod_schema, nombre = m3.group(1), m3.group(2)
        archivo = _archivo_del_traceback(error_text, root)
        if archivo is not None:
            txt = archivo.read_text(encoding="utf-8", errors="ignore")
            alias = f"{nombre}Out"

            def _alias_import(mm: re.Match) -> str:
                return re.sub(rf"\b{re.escape(nombre)}\b(?!\s+as)", f"{nombre} as {alias}", mm.group(0), count=1)

            nuevo = re.sub(rf"from\s+{re.escape(mod_schema)}\s+import\s+[^\n]*", _alias_import, txt, count=1)
            nuevo = re.sub(rf"response_model\s*=\s*{re.escape(nombre)}\b", f"response_model={alias}", nuevo)
            if nuevo != txt:
                archivo.write_text(nuevo, encoding="utf-8")
                logger.info("Colisión modelo/schema: schemas.%s aliaseado a %s en %s", nombre, alias, archivo.name)
                return True

    # Caso 2: ImportError: cannot import name 'X' from 'M' -> corrige el origen.
    m2 = _IMPORTERROR.search(error_text)
    if m2:
        nombre, mod_malo = m2.group(1), m2.group(2)
        mod_bueno = mapa.get(nombre)
        if mod_bueno and mod_bueno != mod_malo:
            for p in root.rglob("*.py"):
                txt = p.read_text(encoding="utf-8", errors="ignore")
                patron = rf"from\s+{re.escape(mod_malo)}\s+import\s+([^\n]*\b{re.escape(nombre)}\b[^\n]*)"
                if re.search(patron, txt):
                    # quita el símbolo del import malo y añade uno correcto.
                    txt2 = re.sub(patron, lambda mm: "from %s import %s" % (mod_malo, mm.group(1).replace(nombre, "").strip().strip(",")), txt)
                    txt2 = _insertar_import(txt2, f"from {mod_bueno} import {nombre}")
                    p.write_text(txt2, encoding="utf-8")
                    logger.info("Import fix: '%s' movido de %s a %s en %s", nombre, mod_malo, mod_bueno, p.name)
                    return True
    return False
