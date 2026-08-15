"""Prueba de que un detalle accesorio no tumba el dominio ENTERO.

Sin red y sin gastar cupo: todo es validación de dominio puro.

QUÉ DEMUESTRA
-------------
1. El payload EXACTO que falló en producción el 15-ago-2026 ahora construye.
2. Un tipo de campo desconocido degrada a texto (y los sinónimos se traducen).
3. Un motor que no sabemos levantar (mongodb) cae a SQLite.
4. Un motor pedido de verdad (MySQL, PostgreSQL) se RESPETA: degradar no puede
   convertirse en ignorar lo que el encargo pidió.
5. Una operación de cálculo desconocida descarta ESE cálculo, no el dominio, y
   no se convierte en una suma silenciosa con la etiqueta de otra cosa.
6. Lo que sí es la sustancia (app_name, entidad) sigue siendo obligatorio: si
   falta, es mejor que el contrato lo rechace y lo intente otro proveedor.

POR QUÉ EXISTE
--------------
Los logs de producción del 15-ago-2026, 05:28:56 UTC:

    El dominio propuesto no era válido (2 validation errors for DominioApp
      campos.1.tipo  -> Input should be 'texto'... [input_value='lista']
      motor          -> Input should be 'sqlite'... [input_value='mongodb'])
    Esqueleto: sin dominio válido; se usa la plantilla básica.
    Proyecto 'Mi App' generado con 24 archivo(s).

Un carrito de compras entero se perdió por dos palabras accesorias. El dominio
que venía detrás estaba bien pensado; se tiró completo por el envoltorio.

    cd backend
    python pruebas/dominio_aguanta_lo_raro.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError  # noqa: E402

from src.domain.dominio_app import DominioApp  # noqa: E402

fallos: list[str] = []


def revisar(titulo: str, condicion: bool, detalle: str = "") -> None:
    print(f"  {'OK' if condicion else 'XX'}  {titulo}" + (f"   {detalle}" if not condicion else ""))
    if not condicion:
        fallos.append(titulo)


#: Reconstrucción del dominio que mistral-small devolvió aquel día: bien
#: pensado, con dos palabras que el esquema no admitía.
COMO_EN_PRODUCCION = {
    "app_name": "Carrito de Compras",
    "entidad": "Pedido",
    "entidad_plural": "Pedidos",
    "tono": "vivo",
    "motor": "mongodb",           # <- tumbaba el dominio entero
    "campos": [
        {"nombre": "cliente", "etiqueta": "Cliente", "tipo": "texto", "obligatorio": True},
        {"nombre": "articulos", "etiqueta": "Artículos", "tipo": "lista"},  # <- y esto
        {"nombre": "total", "etiqueta": "Total", "tipo": "decimal", "minimo": 0},
        {"nombre": "fecha", "etiqueta": "Fecha", "tipo": "fecha"},
    ],
    "calculos": [
        {"etiqueta": "Pedidos", "operacion": "conteo"},
        {"etiqueta": "Vendido", "operacion": "suma", "campo": "total"},
    ],
    "ejemplos": [
        {"cliente": "María Restrepo", "articulos": "Camisa blanca", "total": 45000,
         "fecha": "2026-08-14"},
        {"cliente": "Jorge Uribe", "articulos": "Pantalón negro", "total": 20000,
         "fecha": "2026-08-13"},
    ],
}


def main() -> int:
    print("1. EL PAYLOAD QUE FALLÓ EN PRODUCCIÓN")
    try:
        d = DominioApp.model_validate(COMO_EN_PRODUCCION).sanear()
        revisar("el dominio de aquel día ahora construye", True)
        revisar("y conserva su nombre, no 'Mi App'", d.app_name == "Carrito de Compras",
                f"quedó {d.app_name!r}")
        revisar("mongodb degradó a sqlite", d.motor == "sqlite", f"quedó {d.motor!r}")
        campo = d.campo_por_nombre("articulos")
        revisar("el campo 'lista' quedó utilizable",
                campo is not None and campo.tipo in ("texto", "opcion"),
                f"quedó {campo.tipo if campo else None!r}")
        revisar("no se perdió ningún campo", len(d.campos) == 4, f"quedaron {len(d.campos)}")
        revisar("los ejemplos sobreviven", len(d.ejemplos) == 2, f"quedaron {len(d.ejemplos)}")
    except ValidationError as exc:
        revisar("el dominio de aquel día ahora construye", False, str(exc)[:200])

    print("\n2. TIPOS QUE EL MODELO INVENTA")
    base = dict(COMO_EN_PRODUCCION, motor="sqlite")
    for crudo, esperado in (
        ("string", "texto"), ("integer", "entero"), ("float", "decimal"),
        ("date", "fecha"), ("boolean", "booleano"), ("textarea", "texto_largo"),
        ("select", "opcion"), ("cosa_rarisima", "texto"),
    ):
        datos = dict(base, campos=[{"nombre": "x", "etiqueta": "X", "tipo": crudo}])
        try:
            d = DominioApp.model_validate(datos)
            real = d.campos[0].tipo
            revisar(f"'{crudo}' -> '{esperado}'", real == esperado, f"dio {real!r}")
        except ValidationError as exc:
            revisar(f"'{crudo}' -> '{esperado}'", False, str(exc)[:120])

    print("\n3. EL MOTOR QUE SÍ SE PIDIÓ SE RESPETA")
    for crudo, esperado in (
        ("mysql", "mysql"), ("postgres", "postgres"), ("postgresql", "postgres"),
        ("mariadb", "mysql"), ("mongodb", "sqlite"), ("redis", "sqlite"),
    ):
        d = DominioApp.model_validate(dict(base, motor=crudo))
        revisar(f"motor '{crudo}' -> '{esperado}'", d.motor == esperado, f"dio {d.motor!r}")

    print("\n4. UN CÁLCULO RARO SE DESCARTA, NO SE ADIVINA")
    datos = dict(base, calculos=[
        {"etiqueta": "Vendido", "operacion": "suma", "campo": "total"},
        {"etiqueta": "Mediana", "operacion": "mediana", "campo": "total"},
        {"etiqueta": "Media", "operacion": "average", "campo": "total"},
    ])
    d = DominioApp.model_validate(datos).sanear()
    ops = [c.operacion for c in d.calculos]
    revisar("la mediana (que no sabemos hacer) se descarta", "no_soportada" not in ops
            and len(d.calculos) == 2, f"quedaron {ops}")
    revisar("y NO se convierte en una suma con etiqueta ajena",
            not any(c.etiqueta == "Mediana" for c in d.calculos))
    revisar("'average' se traduce a promedio", "promedio" in ops, f"quedaron {ops}")

    print("\n5. LA SUSTANCIA SIGUE SIENDO OBLIGATORIA")
    # Si falta la identidad de la app, es mejor que el contrato lo rechace: con
    # `validar` en el bucle, eso hace que lo intente el siguiente proveedor, que
    # es MUCHO mejor que construir algo llamado "Mi App".
    for falta in ("app_name", "entidad", "entidad_plural"):
        datos = {k: v for k, v in base.items() if k != falta}
        try:
            DominioApp.model_validate(datos)
            revisar(f"sin '{falta}' se rechaza", False, "lo aceptó")
        except ValidationError:
            revisar(f"sin '{falta}' se rechaza", True)

    print("\n" + "=" * 62)
    if fallos:
        print(f"{len(fallos)} FALLO(S): " + " | ".join(fallos))
        return 1
    print("TODO CORRECTO: un envoltorio raro degrada; el dominio se salva.")
    print("Lo accesorio se corrige, lo sustancial se rechaza.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
