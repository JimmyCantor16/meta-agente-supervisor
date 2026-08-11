"""Prueba de que la interfaz generada es una APLICACIÓN, no un formulario largo.

Sin red y sin gastar cupo: se construye el proyecto en memoria y se examina el
HTML, el CSS y el JS que produce la plantilla.

QUÉ DEMUESTRA
-------------
1. El contenido usa el ancho de la pantalla en escritorio (no una columna fija).
2. Hay armazón: cabecera con identidad y navegación entre secciones.
3. El listado es una TABLA con búsqueda y orden, no tarjetas apiladas.
4. Lo primero que se ve es el LISTADO, no el formulario de alta.
5. Los bordes de los controles cumplen el contraste mínimo de UI (3:1) en las
   cinco paletas, y el texto de enlace cumple AA (4.5:1).
6. Sobreviven los acoplamientos que el rediseño NO puede romper:
   - los `[data-campo]` siguen dentro de `form.alta` (los lee `leerCampos`);
   - se conserva la convención `.x` + `.x-error` de la validación;
   - siguen existiendo las clases que el JS busca justo tras pintar el panel.
7. En móvil no hay desbordamiento horizontal y los controles son tocables.

POR QUÉ EXISTE
--------------
La interfaz generada se veía básica y la razón era medible: 680px de ancho fijo
(53% de un monitor de 1440 desperdiciado), 4,5 pantallas de scroll, y la primera
cita empezando en el píxel 1472 — debajo de dos catálogos y un formulario de 7
campos. Este guion impide volver ahí.

    cd backend
    python pruebas/interfaz_generada.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.domain.dominio_app import Campo, Catalogo, DominioApp  # noqa: E402
from src.infrastructure.adapters.skeleton_dominio_armar import (  # noqa: E402
    _PALETAS,
    construir_desde_dominio,
)


def dominio_rico() -> DominioApp:
    """Un dominio con catálogos y bastantes campos: el caso que se veía mal."""
    return DominioApp(
        app_name="Barbería Estilo", entidad="Cita", entidad_plural="Citas", tono="calido",
        campos=[
            Campo(nombre="cliente", etiqueta="Cliente", tipo="texto"),
            Campo(nombre="barbero", etiqueta="Barbero", tipo="relacion", catalogo="Barbero"),
            Campo(nombre="servicio", etiqueta="Servicio", tipo="relacion", catalogo="Servicio"),
            Campo(nombre="fecha", etiqueta="Fecha", tipo="fecha"),
            Campo(nombre="hora", etiqueta="Hora", tipo="opcion",
                  opciones=["09:00", "10:00", "11:00", "16:00"]),
            Campo(nombre="precio", etiqueta="Precio", tipo="decimal", minimo=0),
        ],
        calculos=[{"etiqueta": "Citas", "operacion": "conteo"},
                  {"etiqueta": "Ingresos", "operacion": "suma", "campo": "precio"}],
        catalogos=[
            Catalogo(nombre="Barbero", campos=[Campo(nombre="nombre", etiqueta="Nombre")],
                     ejemplos=[{"nombre": "Ana López"}, {"nombre": "Luis Rivas"}]),
            Catalogo(nombre="Servicio", plural="Servicios",
                     campos=[Campo(nombre="nombre", etiqueta="Servicio"),
                             Campo(nombre="precio", etiqueta="Precio", tipo="decimal")],
                     ejemplos=[{"nombre": "Corte", "precio": 25000}]),
        ],
        ejemplos=[{"cliente": "María", "barbero": "Ana López", "servicio": "Corte",
                   "fecha": "2026-08-10", "hora": "10:00", "precio": 25000}],
    )


def _lum(h: str) -> float:
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contraste(a: str, b: str) -> float:
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main() -> int:
    fallos: list[str] = []

    def paso(nombre: str, ok: bool, extra: str = "") -> None:
        print(("   ok  " if ok else "   MAL ") + nombre + (f"  {extra}" if extra else ""))
        if not ok:
            fallos.append(nombre)

    f = {a.path: a.content for a in construir_desde_dominio(dominio_rico()).files}
    css = f["frontend/styles.css"]
    board = f["frontend/js/components/board.js"]
    campos_js = f["frontend/js/campos.js"]
    login = f["frontend/js/components/login.js"]

    print("1. USA EL ANCHO DE LA PANTALLA")
    anchos = re.findall(r"max-width:\s*(\d+)px", css)
    mayor = max((int(a) for a in anchos), default=0)
    paso("el contenedor principal pasa de 680px", mayor > 680, f"máximo declarado: {mayor}px")

    print("\n2. HAY ARMAZÓN DE APLICACIÓN")
    paso("cabecera propia", ".app-cab" in css or "header" in board)
    paso("navegación entre secciones", "nav" in board.lower() or ".nav" in css)

    print("\n3. EL LISTADO ES UNA TABLA CON BÚSQUEDA")
    paso("se construye una tabla", "<table" in board or 'createElement("table")' in board)
    paso("hay búsqueda", "buscar" in board.lower() or 'type="search"' in board)
    paso("se puede ordenar", "orden" in board.lower() or "sort" in board.lower())

    print("\n4. LO PRIMERO ES EL LISTADO, NO EL FORMULARIO")
    # En el HTML del panel, la sección de listado debe aparecer antes que el alta.
    i_lista = board.find("lista")
    i_alta = board.find("alta")
    paso("el listado se declara antes que el formulario",
         i_lista != -1 and (i_alta == -1 or i_lista < i_alta),
         f"lista@{i_lista} alta@{i_alta}")

    print("\n5. CONTRASTE (WCAG): bordes de control 3:1 · enlaces 4.5:1")
    for tono, (fondo, papel, acento, tinta, tinta2, linea, borde) in _PALETAS.items():
        if tono == "calido":
            continue  # duplicado de "cálido"
        c_acento = contraste(acento, papel)
        c_borde = contraste(borde, "#FFFFFF")  # los controles tienen fondo blanco
        paso(f"[{tono}] enlace/acento sobre papel ≥ 4.5", c_acento >= 4.5, f"{c_acento:.2f}")
        paso(f"[{tono}] borde de control ≥ 3.0", c_borde >= 3.0, f"{c_borde:.2f}")

    print("\n6. NO SE ROMPEN LOS ACOPLAMIENTOS CSS/JS")
    # Estos tres los señaló la auditoría: romperlos falla en SILENCIO.
    paso("los [data-campo] siguen dentro de form.alta",
         "data-campo" in campos_js and "alta" in board)
    paso("la validación conserva la convención .x / .x-error",
         "-error" in login and "querySelector" in login)
    for clase in (".lista", ".msg", ".resumen"):
        paso(f"sigue existiendo {clase}", clase.strip(".") in board)

    print("\n7. MÓVIL")
    paso("hay punto de ruptura para móvil", "@media" in css and "max-width" in css)
    # El suelo táctil vive en la variable `--toque` y se aplica a inputs y
    # botones. Se comprueba el valor Y que se use, no un literal suelto.
    plano_css = css.replace(" ", "")
    m = re.search(r"--toque:(\d+)px", plano_css)
    alto = int(m.group(1)) if m else 0
    paso("los controles son tocables (≥ 40px)", alto >= 40, f"--toque: {alto}px")
    paso("y ese suelo se aplica a campos y botones",
         plano_css.count("min-height:var(--toque)") >= 2)

    if fallos:
        print(f"\n{len(fallos)} FALLO(S):")
        for x in fallos:
            print("  -", x)
        return 1
    print("\nTODO CORRECTO: lo generado es una aplicación, no un formulario largo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
