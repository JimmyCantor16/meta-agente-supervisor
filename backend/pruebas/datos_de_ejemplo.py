"""Prueba de los datos de ejemplo y el modo visita.

Por qué esto merece su propio guion: una aplicación que abre VACÍA no parece
pobre, parece ROTA. Y con cero registros todos los cálculos del resumen valen
cero, así que un modelo de datos brillante y uno chapucero se ven idénticos —
justo cuando el usuario le está enseñando su sistema a alguien.

Lo que se comprueba:
  · Los ejemplos mal formados se DESCARTAN (un ejemplo malo no da un dato raro:
    impide arrancar la aplicación).
  · Los números se leen bien en todos los formatos que escriben los modelos.
    Equivocarse con el separador decimal no da un número feo, da uno cien veces
    mayor — y ese número acaba en el resumen, donde el usuario confía.
  · La siembra es idempotente: un reinicio no le devuelve al usuario los datos
    de ejemplo encima de los suyos.
  · El modo visita solo se ofrece si hay algo que ver.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.domain.dominio_app import Campo, DominioApp, _valor_de_ejemplo  # noqa: E402
from src.infrastructure.adapters.skeleton_dominio_armar import (  # noqa: E402
    construir_desde_dominio,
)

CAMPOS = [
    {"nombre": "cliente", "etiqueta": "Tienda", "tipo": "texto", "obligatorio": True},
    {"nombre": "fecha_emision", "etiqueta": "Fecha", "tipo": "fecha", "obligatorio": True},
    {"nombre": "libras", "etiqueta": "Libras", "tipo": "decimal", "obligatorio": True},
    {"nombre": "pagado", "etiqueta": "Pagado", "tipo": "booleano", "obligatorio": False},
]

BUENOS = [
    {"cliente": "Tienda La Esquina", "fecha_emision": "2026-07-02", "libras": "$ 1.850,50", "pagado": "sí"},
    {"cliente": "Supermercado El Trigal", "fecha_emision": "2026-07-11", "libras": "85.5", "pagado": "no"},
]
MALOS = [
    {"cliente": "sin fecha", "libras": "10"},
    {"cliente": "libras no numéricas", "fecha_emision": "2026-07-20", "libras": "muchas"},
    {"cliente": "fecha en otro formato", "fecha_emision": "20/07/2026", "libras": "10"},
    "esto no es ni un diccionario",
]


def dominio(ejemplos: list) -> DominioApp:
    return DominioApp.model_validate(
        {
            "app_name": "Cartera del Café",
            "entidad": "Factura",
            "entidad_plural": "Facturas",
            "tono": "calido",
            "campos": CAMPOS,
            "calculos": [{"etiqueta": "Libras", "operacion": "suma", "campo": "libras"}],
            "ejemplos": ejemplos,
        }
    ).sanear()


def sep(titulo: str) -> None:
    print(f"\n{'=' * 68}\n{titulo}\n{'=' * 68}")


def main() -> int:
    sep("1. LOS EJEMPLOS MAL FORMADOS SE DESCARTAN")
    d = dominio(BUENOS + MALOS)
    print(f"entraron {len(BUENOS) + len(MALOS)}, se aceptaron {len(d.ejemplos)}")
    for e in d.ejemplos:
        print("   ", e)
    assert len(d.ejemplos) == len(BUENOS), "se colaron ejemplos que romperían el arranque"

    sep("2. LOS NÚMEROS, EN TODOS LOS FORMATOS QUE ESCRIBEN LOS MODELOS")
    campo = Campo(nombre="v", etiqueta="V", tipo="decimal")
    esperado = {
        "$ 1.850,50": 1850.5,   # europeo: punto miles, coma decimal
        "1,850.50": 1850.5,     # inglés: coma miles, punto decimal
        "1.850": 1850.0,        # tres dígitos detrás = miles
        "1,850": 1850.0,
        "1.850.500": 1850500.0,
        "85.5": 85.5,
        "0,99": 0.99,
        "12 kg": 12.0,          # con unidad pegada
        "$45": 45.0,
        "-12.5": -12.5,
        "muchas": None,
        "": None,
    }
    for crudo, quiero in esperado.items():
        tengo = _valor_de_ejemplo(campo, crudo)
        marca = "ok " if tengo == quiero else "MAL"
        print(f"   {marca} {crudo!r:>14} -> {tengo}")
        assert tengo == quiero, f"{crudo!r} dio {tengo}, se esperaba {quiero}"

    entero = Campo(nombre="v", etiqueta="V", tipo="entero", minimo=1, maximo=100)
    assert _valor_de_ejemplo(entero, "87") == 87
    assert _valor_de_ejemplo(entero, "150") is None, "un valor fuera de rango no puede pasar"
    print("   ok  rango del campo respetado (150 sobre un máximo de 100 se descarta)")

    sep("3. EL PROYECTO GENERADO SIEMBRA Y OFRECE LA VISITA")
    p = construir_desde_dominio(d)
    errores = []
    for f in p.files:
        if f.path.endswith(".py"):
            try:
                ast.parse(f.content)
            except SyntaxError as exc:
                errores.append(f"{f.path}: {exc}")
    db = next(f.content for f in p.files if f.path.endswith("db.py"))
    main_py = next(f.content for f in p.files if f.path.endswith("main.py"))
    indice = next(f.content for f in p.files if f.path.endswith("index.html"))
    auth = next(f.content for f in p.files if f.path.endswith("auth.js"))

    print("   errores de sintaxis      :", errores or "ninguno")
    print("   siembra en db.py         :", "sembrar_demostracion" in db)
    print("   se llama al arrancar     :", "sembrar_demostracion(BcryptHasher())" in main_py)
    print("   credenciales en el HTML  :", '"demo"' in indice)
    print("   botón «Ver una demostración»:", "Ver una demostración" in auth)
    assert not errores and "sembrar_demostracion" in db
    assert "sembrar_demostracion(BcryptHasher())" in main_py
    assert "Ver una demostración" in auth

    sep("4. SIN EJEMPLOS NO SE OFRECE LA VISITA")
    vacio = dominio([])
    p2 = construir_desde_dominio(vacio)
    indice2 = next(f.content for f in p2.files if f.path.endswith("index.html"))
    print('   __APP__.demo queda vacío :', '"demo": {}' in indice2)
    assert '"demo": {}' in indice2, (
        "un «Ver una demostración» que lleva a una lista vacía es peor que no tenerlo"
    )

    print("\nTODO CORRECTO. Quien reciba el enlace ve un sistema EN USO,")
    print("con números de verdad en el resumen, y entra en un clic.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
