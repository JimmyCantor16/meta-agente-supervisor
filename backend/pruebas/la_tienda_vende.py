"""Prueba de que quien pide un carrito de compras recibe una TIENDA.

Construye la tienda con el esqueleto, la ARRANCA de verdad y compra por HTTP.
Sin red hacia fuera y sin gastar cupo de IA: el catálogo se le da hecho, que es
lo único que en producción pone el modelo.

QUÉ DEMUESTRA
-------------
1. El escaparate se ve SIN cuenta, con precios reales y filtros que funcionan.
2. Se compra con carrito de VARIAS líneas, y el pedido queda.
3. **El total lo calcula el servidor.** Si el cliente cuela su propio precio, se
   ignora y se cobra el del catálogo.
4. El stock manda: no se puede comprar más de lo que hay, y baja al comprar.
5. Cada cual ve lo suyo; el panel del dueño es solo del dueño.
6. La tienda abre CON datos dentro (catálogo sembrado y pedidos de ejemplo).

POR QUÉ EXISTE
--------------
El 15-ago-2026 se pidió en producción «un carrito de compras» y llegó un CRUD de
«Pedidos» donde se elegía UN producto de un desplegable y **el total se escribía
a mano**. Aquello no era una tienda: era el formulario con el que un empleado
apunta pedidos ajenos. Esta prueba existe para que «carrito de compras» no pueda
volver a significar eso.

    cd backend
    python pruebas/la_tienda_vende.py
"""

from __future__ import annotations

import json
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.domain.dominio_tienda import DominioTienda  # noqa: E402
from src.infrastructure.adapters.skeleton_tienda_armar import (  # noqa: E402
    construir_desde_tienda,
)

CATALOGO = {
    "app_name": "Ropa Aurora",
    "rubro": "ropa",
    "tono": "vivo",
    "moneda": "$",
    "envio": 8000,
    "categorias": ["Camisas", "Pantalones", "Calzado"],
    "productos": [
        {"nombre": "Camisa de lino", "precio": 89000, "categoria": "Camisas",
         "descripcion": "Lino lavado.", "stock": 14},
        {"nombre": "Camisa oxford", "precio": 105000, "categoria": "Camisas",
         "descripcion": "Algodón grueso.", "stock": 3},
        {"nombre": "Pantalón chino", "precio": 120000, "categoria": "Pantalones",
         "descripcion": "Algodón elástico.", "stock": 9},
        {"nombre": "Vaquero recto", "precio": 145000, "categoria": "Pantalones",
         "descripcion": "Denim de 12 onzas.", "stock": 7},
        {"nombre": "Botín de cuero", "precio": 260000, "categoria": "Calzado",
         "descripcion": "Cuero vacuno.", "stock": 4},
        {"nombre": "Zapatilla blanca", "precio": 180000, "categoria": "Calzado",
         "descripcion": "Piel lisa.", "stock": 12},
    ],
}

fallos: list[str] = []


def revisar(titulo: str, condicion: bool, detalle: str = "") -> None:
    print(f"  {'OK' if condicion else 'XX'}  {titulo}" + (f"   {detalle}" if not condicion else ""))
    if not condicion:
        fallos.append(titulo)


def _puerto_libre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Tienda:
    """Levanta la tienda generada y habla con ella por HTTP."""

    def __init__(self, raiz: Path, puerto: int) -> None:
        self.base = f"http://127.0.0.1:{puerto}"
        self._proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "backend.main:app",
             "--port", str(puerto), "--host", "127.0.0.1"],
            cwd=str(raiz),
            env={**__import__("os").environ, "PYTHONPATH": str(raiz),
                 "PYTHONIOENCODING": "utf-8"},
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
        )

    def esperar(self, segundos: int = 45) -> bool:
        limite = time.time() + segundos
        while time.time() < limite:
            if self._proc.poll() is not None:
                return False
            try:
                with urllib.request.urlopen(self.base + "/api/productos", timeout=2):
                    return True
            except Exception:  # noqa: BLE001 - todavía no ha arrancado
                time.sleep(0.4)
        return False

    def pedir(self, metodo, ruta, cuerpo=None, token=None, forma=False):
        datos, cabeceras = None, {}
        if cuerpo is not None:
            if forma:
                datos = urllib.parse.urlencode(cuerpo).encode()
                cabeceras["Content-Type"] = "application/x-www-form-urlencoded"
            else:
                # UTF-8 explícito: con acentos mal codificados la API da 400.
                datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
                cabeceras["Content-Type"] = "application/json; charset=utf-8"
        if token:
            cabeceras["Authorization"] = "Bearer " + token
        req = urllib.request.Request(self.base + ruta, data=datos, headers=cabeceras,
                                     method=metodo)
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                texto = r.read().decode("utf-8")
                return r.status, (json.loads(texto) if texto else None)
        except urllib.error.HTTPError as e:
            texto = e.read().decode("utf-8")
            try:
                return e.code, json.loads(texto)
            except json.JSONDecodeError:
                return e.code, texto

    def apagar(self) -> str:
        self._proc.terminate()
        try:
            return self._proc.communicate(timeout=10)[0] or ""
        except subprocess.TimeoutExpired:
            self._proc.kill()
            return ""


def main() -> int:
    tienda = DominioTienda.model_validate(CATALOGO).sanear()
    if not tienda.construible:
        print("XX  el catálogo de prueba debería ser construible")
        return 1
    proyecto = construir_desde_tienda(tienda)

    with tempfile.TemporaryDirectory() as tmp:
        raiz = Path(tmp)
        for f in proyecto.files:
            destino = raiz / f.path
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(f.content, encoding="utf-8")

        t = Tienda(raiz, _puerto_libre())
        try:
            if not t.esperar():
                print("XX  la tienda generada NO ARRANCA. Salida del servidor:")
                print(t.apagar()[-2500:])
                return 1
            print("  OK  la tienda generada arranca")

            print("\n1. EL ESCAPARATE SE VE SIN CUENTA")
            codigo, catalogo = t.pedir("GET", "/api/productos")
            revisar("catálogo público (200)", codigo == 200, f"fue {codigo}")
            revisar("con los 6 productos", isinstance(catalogo, list) and len(catalogo) == 6)
            revisar("y precios de verdad", all(p["precio"] > 0 for p in catalogo))
            _, calzado = t.pedir("GET", "/api/productos?categoria=Calzado")
            revisar("el filtro por categoría funciona",
                    bool(calzado) and all(p["categoria"] == "Calzado" for p in calzado))
            _, buscado = t.pedir("GET", "/api/productos?q=lino")
            revisar("la búsqueda funciona", len(buscado) == 1)

            print("\n2. COMPRAR EXIGE CUENTA")
            codigo, _ = t.pedir("POST", "/api/pedidos",
                                {"lineas": [{"producto_id": 1, "cantidad": 1}]})
            revisar("sin cuenta, comprar da 401", codigo == 401, f"fue {codigo}")

            print("\n3. UN CLIENTE COMPRA DE VERDAD")
            t.pedir("POST", "/api/register",
                    {"username": "ana.compra", "password": "clave1234"})
            codigo, tok = t.pedir("POST", "/api/login",
                                  {"username": "ana.compra", "password": "clave1234"},
                                  forma=True)
            revisar("entra con su cuenta", codigo == 200 and isinstance(tok, dict))
            token = (tok or {}).get("access_token", "") if isinstance(tok, dict) else ""

            camisa = next(p for p in catalogo if p["nombre"] == "Camisa de lino")
            chino = next(p for p in catalogo if p["nombre"] == "Pantalón chino")
            esperado = camisa["precio"] * 2 + chino["precio"] + 8000

            codigo, pedido = t.pedir("POST", "/api/pedidos", {"lineas": [
                {"producto_id": camisa["id"], "cantidad": 2},
                {"producto_id": chino["id"], "cantidad": 1},
            ]}, token=token)
            revisar("la compra se confirma (201)", codigo == 201, f"fue {codigo}: {pedido}")
            if codigo == 201:
                revisar("el carrito lleva VARIAS líneas", len(pedido["lineas"]) == 2)
                revisar(f"el TOTAL lo calcula el servidor ({esperado:.0f})",
                        abs(pedido["total"] - esperado) < 0.01, f"dio {pedido['total']}")
                revisar("y cuenta bien los artículos", pedido["articulos"] == 3)

            print("\n4. EL PRECIO NO LO PONE EL CLIENTE")
            codigo, colado = t.pedir("POST", "/api/pedidos", {"lineas": [
                {"producto_id": camisa["id"], "cantidad": 1,
                 "precio_unitario": 1, "precio": 1, "subtotal": 1},
            ]}, token=token)
            revisar("la compra pasa, ignorando lo colado", codigo == 201, f"fue {codigo}")
            if codigo == 201:
                revisar("se cobra el precio del CATÁLOGO, no el enviado",
                        colado["lineas"][0]["precio_unitario"] == camisa["precio"],
                        f"cobró {colado['lineas'][0]['precio_unitario']}")
                revisar("y el total sale de ese precio",
                        abs(colado["total"] - (camisa["precio"] + 8000)) < 0.01)

            print("\n5. EL STOCK MANDA")
            _, catalogo2 = t.pedir("GET", "/api/productos")
            camisa2 = next(p for p in catalogo2 if p["id"] == camisa["id"])
            revisar("el stock baja al comprar",
                    camisa2["stock"] == camisa["stock"] - 3,
                    f"{camisa['stock']} -> {camisa2['stock']}")
            oxford = next(p for p in catalogo2 if p["nombre"] == "Camisa oxford")
            codigo, err = t.pedir("POST", "/api/pedidos", {"lineas": [
                {"producto_id": oxford["id"], "cantidad": oxford["stock"] + 5}]}, token=token)
            revisar("pedir más de lo que hay se rechaza (422)", codigo == 422, f"fue {codigo}")
            revisar("y se explica con palabras",
                    isinstance(err, dict) and "quedan" in str(err.get("detail", "")).lower(),
                    f"dijo {err}")
            # Partir la cantidad en dos líneas no debe burlar el tope de stock.
            codigo, _ = t.pedir("POST", "/api/pedidos", {"lineas": [
                {"producto_id": oxford["id"], "cantidad": oxford["stock"]},
                {"producto_id": oxford["id"], "cantidad": 2},
            ]}, token=token)
            revisar("partir la cantidad en dos líneas tampoco burla el stock",
                    codigo == 422, f"fue {codigo}")
            codigo, _ = t.pedir("POST", "/api/pedidos", {"lineas": []}, token=token)
            revisar("un carrito vacío se rechaza", codigo in (400, 422), f"fue {codigo}")

            print("\n6. CADA CUAL VE LO SUYO")
            codigo, mios = t.pedir("GET", "/api/pedidos", token=token)
            revisar("el cliente ve su historial", codigo == 200 and len(mios) == 2)
            codigo, _ = t.pedir("GET", "/api/admin/pedidos", token=token)
            revisar("un cliente NO ve todas las ventas (403)", codigo == 403, f"fue {codigo}")
            codigo, _ = t.pedir("POST", "/api/admin/productos",
                                {"nombre": "Colado", "precio": 1, "stock": 1}, token=token)
            revisar("un cliente NO toca el catálogo (403)", codigo == 403, f"fue {codigo}")

            print("\n7. EL DUEÑO GESTIONA SU NEGOCIO")
            codigo, tokA = t.pedir("POST", "/api/login",
                                   {"username": "admin", "password": "admin1234"}, forma=True)
            revisar("el dueño entra", codigo == 200)
            admin = (tokA or {}).get("access_token", "") if isinstance(tokA, dict) else ""
            codigo, ventas = t.pedir("GET", "/api/admin/pedidos", token=admin)
            revisar("ve TODAS las ventas", codigo == 200 and len(ventas) >= 4)
            codigo, res = t.pedir("GET", "/api/resumen", token=admin)
            revisar("y el resumen cuadra con ellas",
                    codigo == 200 and abs(res["total"] - sum(v["total"] for v in ventas)) < 0.01,
                    f"resumen={res}")
            codigo, nuevo = t.pedir("POST", "/api/admin/productos",
                                    {"nombre": "Bufanda", "precio": 45000, "stock": 6,
                                     "categoria": "Camisas"}, token=admin)
            revisar("añade un producto", codigo == 201, f"fue {codigo}")
            if codigo == 201:
                codigo, _ = t.pedir("PUT", f"/api/admin/productos/{nuevo['id']}",
                                    {"nombre": "Bufanda de lana", "precio": 52000, "stock": 4},
                                    token=admin)
                revisar("lo edita", codigo == 200, f"fue {codigo}")
                codigo, _ = t.pedir("DELETE", f"/api/admin/productos/{nuevo['id']}", token=admin)
                revisar("lo retira", codigo == 204, f"fue {codigo}")
            codigo, _ = t.pedir("POST", "/api/admin/productos",
                                {"nombre": "Gratis", "precio": 0, "stock": 5}, token=admin)
            revisar("un precio de cero se rechaza", codigo == 422, f"fue {codigo}")

            print("\n8. LA TIENDA ABRE CON ALGO DENTRO")
            codigo, tokD = t.pedir("POST", "/api/login",
                                   {"username": "cliente", "password": "cliente1234"},
                                   forma=True)
            revisar("la cuenta de demostración entra", codigo == 200)
            codigo, suyos = t.pedir("GET", "/api/pedidos",
                                    token=(tokD or {}).get("access_token", ""))
            revisar("y ya trae pedidos hechos", codigo == 200 and len(suyos) >= 2)
            revisar("con importes mayores que cero", all(p["total"] > 0 for p in suyos))
        finally:
            t.apagar()

    print("\n" + "=" * 62)
    if fallos:
        print(f"{len(fallos)} FALLO(S): " + " | ".join(fallos))
        return 1
    print("TODO CORRECTO: quien pide un carrito de compras recibe una TIENDA.")
    print("Se mira sin cuenta, se compra con carrito, y el total lo calcula el")
    print("servidor con SUS precios — nunca el navegador.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
