"""Refresca los assets de DIXEL que se entregan dentro de cada app generada.

La librería vive en `vendor/dixel` (fuente, con su build), pero la imagen del
backend solo copia `backend/`, así que el dist que viaja a las apps generadas
tiene que estar bajo `backend/bases/dixel/`. Este guion los deja al día.

No se compila el dist completo: una app de gestión no necesita los 38 shaders.
Se compila el PERFIL de abajo, que son ~78 kB gzip de JS.

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
PERFIL = [
    "icons",
    "components/feedback",
    "components/buttons",
    "components/inputs",
    "components/cards",
    "components/layout",
    "components/data",
    "components/typography",
    "effects/scroll",
]
SALIDA = "dist/perfil-app"


def main() -> int:
    if not DIXEL.is_dir():
        print(f"No encuentro la librería en {DIXEL}", file=sys.stderr)
        return 1

    entorno = dict(os.environ)
    esbuild_prestado = RAIZ / "frontend" / "node_modules"
    if esbuild_prestado.is_dir():
        entorno["NODE_PATH"] = str(esbuild_prestado)

    orden = ["node", "build.mjs", "--only=" + ",".join(PERFIL), "--out=" + SALIDA]
    print("$", " ".join(orden))
    resultado = subprocess.run(
        orden, cwd=str(DIXEL), env=entorno, text=True, encoding="utf-8",
        capture_output=True,
    )
    print(resultado.stdout.strip())
    if resultado.returncode != 0:
        print(resultado.stderr.strip(), file=sys.stderr)
        return resultado.returncode

    construido = DIXEL / SALIDA
    DESTINO.mkdir(parents=True, exist_ok=True)
    for nombre, alternativa in (("dixel.min.js", "dixel.js"), ("dixel.min.css", "dixel.css")):
        origen = construido / nombre
        if not origen.is_file():
            origen = construido / alternativa
            print(f"  (sin minificar: se copia {alternativa})")
        shutil.copyfile(origen, DESTINO / nombre.replace(".min", ""))
        print(f"  {origen.name} -> {(DESTINO / nombre.replace('.min', '')).relative_to(RAIZ)}")

    crudo = (construido / "catalog.js").read_text(encoding="utf-8")
    catalogo = json.loads(crudo.split("=", 1)[1].strip().rstrip(";\n"))
    clases = {
        item["class"]: item.get("description", "")
        for categoria in catalogo.values()
        for item in categoria
    }
    (DESTINO / "catalogo.json").write_text(
        json.dumps(catalogo, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  catalogo.json -> {len(clases)} clases en {len(catalogo)} categorías")

    # La skill que lee el generador libre tiene que nombrar EXACTAMENTE lo que
    # se entrega: si promete un componente que no viajó, el modelo lo usará.
    skill = RAIZ / "backend" / "skills" / "dixel_catalogo.md"
    if skill.is_file():
        lineas = [
            f"- **{categoria.split('/')[-1]}**: " + ", ".join(i["class"] for i in items)
            for categoria, items in sorted(catalogo.items())
        ]
        texto = skill.read_text(encoding="utf-8")
        inicio, fin = "<!-- CATALOGO:INICIO -->", "<!-- CATALOGO:FIN -->"
        if inicio in texto and fin in texto:
            cabeza, resto = texto.split(inicio, 1)
            _, cola = resto.split(fin, 1)
            cuerpo = "\n".join(lineas)
            skill.write_text(
                f"{cabeza}{inicio}\n{cuerpo}\n{fin}{cola}",
                encoding="utf-8",
            )
            print(f"  skills/dixel_catalogo.md -> {len(lineas)} categorías al día")

    shutil.rmtree(construido, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
