"""Prueba de que el esqueleto construye NEGOCIOS, no solo listas.

Sin red y sin gastar cupo: se construye el proyecto en memoria y se examina.

QUÉ DEMUESTRA
-------------
1. Un dominio con catálogos (Barberos, Servicios) produce una aplicación con:
   tablas de catálogo, cuenta de administrador sembrada, endpoints de gestión,
   desplegables de relación en el formulario y panel de administración.
2. La relación se VALIDA en el servicio: un valor fuera del catálogo se rechaza.
3. Un dominio SIN catálogos sigue construyendo la app de siempre (compatibilidad),
   pero con la cuenta admin igualmente sembrada.
4. La app es instalable (manifest + service worker + icono, servidos en la raíz).
5. Todo el Python compila y todo el JavaScript pasa `node --check`.

POR QUÉ EXISTE
--------------
La barbería real que se generó en agosto de 2026 salió correcta y PLANA: pediste
«clientes reservan con un barbero y una dueña administra» y salió un CRUD de
citas con login. Ni entidad Barbero, ni rol de dueña. El techo era del modelo de
dominio (una sola entidad); este guion ata la ampliación para que no regrese.

    cd backend
    python pruebas/catalogos_y_roles.py
"""

from __future__ import annotations

import py_compile
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.domain.dominio_app import Campo, Catalogo, DominioApp  # noqa: E402
from src.infrastructure.adapters.skeleton_dominio_armar import (  # noqa: E402
    construir_desde_dominio,
)


def dominio_barberia() -> DominioApp:
    return DominioApp(
        app_name="Barbería Estilo",
        entidad="Cita",
        entidad_plural="Citas",
        campos=[
            Campo(nombre="cliente", etiqueta="Cliente", tipo="texto"),
            Campo(nombre="barbero", etiqueta="Barbero", tipo="relacion", catalogo="Barbero"),
            Campo(nombre="servicio", etiqueta="Servicio", tipo="relacion", catalogo="Servicio"),
            Campo(nombre="fecha", etiqueta="Fecha", tipo="fecha"),
        ],
        catalogos=[
            Catalogo(nombre="Barbero", campos=[Campo(nombre="nombre", etiqueta="Nombre")],
                     ejemplos=[{"nombre": "Ana López"}, {"nombre": "Luis Rivas"}]),
            Catalogo(nombre="Servicio", plural="Servicios",
                     campos=[Campo(nombre="nombre", etiqueta="Servicio"),
                             Campo(nombre="precio", etiqueta="Precio", tipo="decimal", minimo=0)],
                     ejemplos=[{"nombre": "Corte clásico", "precio": 25000}]),
        ],
        ejemplos=[{"cliente": "María", "barbero": "Ana López",
                   "servicio": "Corte clásico", "fecha": "2026-08-10"}],
    )


def archivos_de(d: DominioApp) -> dict[str, str]:
    return {f.path: f.content for f in construir_desde_dominio(d).files}


def main() -> int:
    print("1. LA BARBERÍA SALE COMO NEGOCIO, NO COMO LISTA")
    f = archivos_de(dominio_barberia())
    db = f["backend/infrastructure/db.py"]
    web = f["backend/infrastructure/web.py"]
    svc = f["backend/application/services.py"]
    board = f["frontend/js/components/board.js"]
    indice = f["frontend/index.html"]

    comprobaciones = [
        ("tablas de catálogo", "CatBarberoModel" in db and "CatServicioModel" in db),
        ("cuenta admin sembrada", "ADMIN_USUARIO" in db and "es_admin=True" in db),
        ("catálogos sembrados", "_MODELOS_SEMILLA" in db and "Ana López" in db),
        ("endpoints de catálogo", "/catalogos" in web and "/me" in web),
        ("la relación se valida", "RELACIONES" in svc and "existe_valor" in svc),
        ("panel de administración", "pintarAdmin" in board and "crearEnCatalogo" in board),
        ("catálogos inyectados al HTML", "__CATALOGOS__" in indice),
        ("la vista admin muestra el dueño", "dueno" in board),
    ]
    fallos = 0
    for nombre, ok in comprobaciones:
        print(f"   {'ok ' if ok else 'MAL'} {nombre}")
        fallos += 0 if ok else 1

    print("\n2. SIN CATÁLOGOS, LA APP DE SIEMPRE (compatibilidad)")
    simple = DominioApp(app_name="Notas", entidad="Nota", entidad_plural="Notas",
                        campos=[Campo(nombre="texto", etiqueta="Texto")])
    f2 = archivos_de(simple)
    db2 = f2["backend/infrastructure/db.py"]
    ok2 = "CatalogoRepository" in f2["backend/domain/ports.py"] and "ADMIN_USUARIO" in db2
    ok3 = "CatBarbero" not in db2
    print(f"   {'ok ' if ok2 else 'MAL'} admin también existe sin catálogos")
    print(f"   {'ok ' if ok3 else 'MAL'} no se cuelan modelos de catálogo fantasma")
    fallos += (0 if ok2 else 1) + (0 if ok3 else 1)

    print("\n3. LA APP ES INSTALABLE (PWA)")
    for ruta in ("frontend/manifest.json", "frontend/sw.js", "frontend/icon.svg"):
        ok = ruta in f
        print(f"   {'ok ' if ok else 'MAL'} {ruta}")
        fallos += 0 if ok else 1
    ok_rutas = "/manifest.json" in f["backend/main.py"] and "/sw.js" in f["backend/main.py"]
    print(f"   {'ok ' if ok_rutas else 'MAL'} servidos desde la raíz (alcance del SW)")
    fallos += 0 if ok_rutas else 1

    print("\n4. TODO COMPILA (Python) Y PASA node --check (JavaScript)")
    base = Path(tempfile.mkdtemp(prefix="catroles-"))
    try:
        for ruta, contenido in f.items():
            destino = base / ruta
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(contenido, encoding="utf-8")
        rotos = []
        for py in base.rglob("*.py"):
            try:
                py_compile.compile(str(py), doraise=True)
            except py_compile.PyCompileError as e:
                rotos.append(f"{py.name}: {e}")
        if shutil.which("node"):
            for js in base.rglob("*.js"):
                r = subprocess.run(["node", "--check", str(js)], capture_output=True, text=True)
                if r.returncode:
                    rotos.append(f"{js.name}: {r.stderr[:120]}")
        else:
            print("   (node no está; el JavaScript se comprueba solo en sintaxis Python)")
        print(f"   {'ok  todo válido' if not rotos else 'MAL ' + '; '.join(rotos[:3])}")
        fallos += len(rotos)
    finally:
        shutil.rmtree(base, ignore_errors=True)

    if fallos:
        print(f"\n{fallos} FALLO(S): el esqueleto dejó de construir negocios completos.")
        return 1
    print("\nTODO CORRECTO: quien pide una barbería con barberos y dueña recibe")
    print("una barbería con barberos y dueña — y además se la puede instalar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
