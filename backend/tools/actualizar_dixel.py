"""Refresca los assets de DIXEL que se entregan dentro de cada proyecto generado.

La librería vive en `vendor/dixel` (fuente, con su build), pero la imagen del
backend solo copia `backend/`, así que lo que viaja a los proyectos tiene que
estar bajo `backend/bases/dixel/`. Este guion los deja al día.

No se compila la librería entera: se compila un PERFIL por forma de proyecto.
Una landing no necesita 16 campos de formulario ni una tabla de datos, y una app
de gestión no necesita fondos animados; cargar de más se paga en cada visita.

Uso (desde la raíz del repo, con node instalado):

    python backend/tools/actualizar_dixel.py

Si `esbuild` no está en `vendor/dixel/node_modules`, el guion presta el del
frontend por NODE_PATH; si tampoco está, avisa y usa el dist sin minificar.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DIXEL = RAIZ / "vendor" / "dixel"
DESTINO = RAIZ / "backend" / "bases" / "dixel"

PERFILES = {
    # Aplicaciones con sesión y datos: gestión, tienda, reservas, educativo, panel.
    "app": [
        "icons",
        "components/feedback",
        "components/buttons",
        "components/inputs",
        "components/cards",
        "components/layout",
        "components/data",
        "components/typography",
        "effects/scroll",
    ],
    # Sitios que se leen: landing, contenido, portafolios.
    "sitio": [
        "icons",
        "components/buttons",
        "components/cards",
        "components/layout",
        "components/typography",
        "components/media",
        "effects/scroll",
        "effects/hover",
        "effects/background",
        "effects/micro",
    ],
}


def _construir(perfil: str, categorias: list[str], entorno: dict) -> dict:
    """Compila un perfil, lo copia a bases/dixel/<perfil>/ y devuelve su catálogo."""
    salida = f"dist/perfil-{perfil}"
    orden = ["node", "build.mjs", "--only=" + ",".join(categorias), "--out=" + salida]
    print("$", " ".join(orden))
    resultado = subprocess.run(
        orden, cwd=str(DIXEL), env=entorno, text=True, encoding="utf-8", capture_output=True,
    )
    for linea in (resultado.stdout or "").strip().splitlines():
        print("  " + linea)
    if resultado.returncode != 0:
        raise RuntimeError((resultado.stderr or "").strip() or "el build falló")

    construido = DIXEL / salida
    destino = DESTINO / perfil
    destino.mkdir(parents=True, exist_ok=True)
    for nombre, alternativa in (("dixel.min.js", "dixel.js"), ("dixel.min.css", "dixel.css")):
        origen = construido / nombre
        if not origen.is_file():
            origen = construido / alternativa
            print(f"  (sin minificar: se copia {alternativa})")
        shutil.copyfile(origen, destino / nombre.replace(".min", ""))

    crudo = (construido / "catalog.js").read_text(encoding="utf-8")
    catalogo = json.loads(crudo.split("=", 1)[1].strip().rstrip(";\n"))
    (destino / "catalogo.json").write_text(
        json.dumps(catalogo, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    clases = sum(len(items) for items in catalogo.values())
    peso = (destino / "dixel.js").stat().st_size / 1024
    print(f"  -> bases/dixel/{perfil}: {clases} clases, {peso:.0f} kB de JS")
    shutil.rmtree(construido, ignore_errors=True)
    return catalogo


def _actualizar_skill(catalogos: dict[str, dict]) -> None:
    """Deja la skill nombrando EXACTAMENTE lo que se entrega en cada perfil.

    Si la skill promete un componente que no viajó, el modelo lo usará y la
    página saldrá con un hueco vacío que nadie ve hasta que un usuario lo mira.
    """
    skill = RAIZ / "backend" / "skills" / "dixel_catalogo.md"
    if not skill.is_file():
        return
    lineas: list[str] = []
    for perfil, catalogo in sorted(catalogos.items()):
        total = sum(len(items) for items in catalogo.values())
        lineas.append("")
        lineas.append(f"**Perfil `{perfil}`** ({total} clases):")
        lineas.append("")
        lineas += [
            f"- **{categoria.split('/')[-1]}**: " + ", ".join(i["class"] for i in items)
            for categoria, items in sorted(catalogo.items())
        ]
    texto = skill.read_text(encoding="utf-8")
    inicio, fin = "<!-- CATALOGO:INICIO -->", "<!-- CATALOGO:FIN -->"
    if inicio not in texto or fin not in texto:
        return
    cabeza, resto = texto.split(inicio, 1)
    _, cola = resto.split(fin, 1)
    cuerpo = "\n".join(lineas)
    skill.write_text(f"{cabeza}{inicio}\n{cuerpo}\n{fin}{cola}", encoding="utf-8")
    print(f"  skills/dixel_catalogo.md -> {len(catalogos)} perfiles al día")


def main() -> int:
    if not DIXEL.is_dir():
        print(f"No encuentro la librería en {DIXEL}", file=sys.stderr)
        return 1

    entorno = dict(os.environ)
    esbuild_prestado = RAIZ / "frontend" / "node_modules"
    if esbuild_prestado.is_dir():
        entorno["NODE_PATH"] = str(esbuild_prestado)

    catalogos: dict[str, dict] = {}
    for perfil, categorias in PERFILES.items():
        try:
            catalogos[perfil] = _construir(perfil, categorias, entorno)
        except RuntimeError as exc:
            print(f"Perfil '{perfil}': {exc}", file=sys.stderr)
            return 1
    _actualizar_skill(catalogos)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
