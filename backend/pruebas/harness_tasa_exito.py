"""Arnés de TASA DE ÉXITO: mide qué porcentaje de pedidos sale FUNCIONANDO.

Hasta ahora la "tasa de éxito" del agente era una anécdota: dos corridas
manuales y la memoria de quien las miró. Este guion la convierte en un número
reproducible: lanza los mismos ~9 pedidos canónicos (uno por cada arquetipo de
`instanciador_bases.py` + 2 ideas libres que NO calzan en ninguno) contra
`POST /api/v1/agent/generate`, comprueba desde fuera que la URL entregada está
viva, y deja el detalle en `data/tasa_exito.json` para comparar corridas cuando
se toque un prompt o una base.

QUÉ CUENTA COMO QUÉ
-------------------
- FUNCIONA: el backend respondió 200, entregó URL y la URL sirve una portada
  de más de 200 bytes. Es la misma vara del e2e: sin URL viva no hay entrega.
- PARCIAL: generó (200) pero la URL vino vacía o no responde.
- FALLO: HTTP distinto de 200, timeout o excepción de red.

El veredicto se calcula AQUÍ, desde fuera, a propósito: si usáramos el
`estado_entrega` que declara el backend estaríamos midiendo su autoestima, no
su entrega. Ese campo (y la `ruta`: esqueleto|base_dorada|libre|degradado_a_*)
se capturan como columnas informativas; contra un backend viejo que aún no los
devuelve, quedan en "desconocido" y el arnés sigue — se degrada con gracia.

USO
---
    cd backend
    python pruebas/harness_tasa_exito.py                     # los 9 pedidos
    python pruebas/harness_tasa_exito.py --solo 3            # sondeo corto
    python pruebas/harness_tasa_exito.py --api https://mi-backend --token <ID token>

Cada generación tarda 1-3 minutos: la corrida completa puede pasar de 20.
`--solo N` corre solo los primeros N pedidos (el orden ya alterna arquetipos
con sistema, estáticos y libres, para que un sondeo corto sea representativo).
Si un pedido revienta, se anota y se sigue con el siguiente: una corrida de
tasa de éxito que se cae en el caso 3 no mide nada.

Requisitos: backend en marcha y `AUTH_DEV_BYPASS=1` en local (el token
`dev-local` solo abre la puerta en local; contra producción pasa una sesión
real con `--token`). Sale con código 0 si al menos un pedido FUNCIONA; con 1
si ninguno funcionó (backend caído o generador roto: hay que mirar).
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]

FUNCIONA, PARCIAL, FALLO = "FUNCIONA", "PARCIAL", "FALLO"

# Umbral de "portada viva": por debajo de esto es una página en blanco o un
# JSON de error, no un sistema. Mismo espíritu que `servir()` en el e2e.
BYTES_MINIMOS_PORTADA = 200

# ---------------------------------------------------------------------------
# Los 9 pedidos canónicos. Uno por arquetipo real de `instanciador_bases.py`
# (gestion, catalogo, reservas, educativo, contenido, landing, dashboard) más
# dos ideas libres que NO deberían calzar en ninguno. El orden alterna tipos
# para que `--solo 3` pruebe base con sistema, estático y libre, no tres
# variantes de lo mismo.
PEDIDOS: list[dict[str, str]] = [
    {
        "nombre": "catalogo-pasteleria",
        "arquetipo_esperado": "catalogo",
        "prompt": (
            "Una tienda en línea para la pastelería artesanal 'Dulce Horno': "
            "catálogo público de tortas y postres con precio y stock, carrito "
            "de compras, y pedidos que la dueña gestiona desde su panel."
        ),
    },
    {
        "nombre": "landing-cafe",
        "arquetipo_esperado": "landing",
        "prompt": (
            "Una página de presentación para 'Café La Montaña', una marca de "
            "café de origen colombiano: quiénes somos, qué ofrecemos y datos "
            "de contacto con WhatsApp. Sin sistema detrás, solo la página."
        ),
    },
    {
        "nombre": "libre-simulador-fisica",
        "arquetipo_esperado": "libre",
        "prompt": (
            "Un simulador de tiro parabólico en el navegador: el usuario ajusta "
            "ángulo y velocidad inicial con controles deslizantes, lanza el "
            "proyectil y ve la trayectoria dibujada en un lienzo con la "
            "distancia y altura máxima alcanzadas."
        ),
    },
    {
        "nombre": "gestion-ferreteria",
        "arquetipo_esperado": "gestion",
        "prompt": (
            "Un panel administrativo para la ferretería 'El Tornillo Feliz': "
            "inventario de productos con precio y stock, registro de "
            "proveedores, y poder buscar, editar y borrar cada registro."
        ),
    },
    {
        "nombre": "reservas-barberia",
        "arquetipo_esperado": "reservas",
        "prompt": (
            "Una agenda de citas para la barbería 'Navaja y Estilo' con tres "
            "barberos: el cliente elige día, barbero y hora disponibles, "
            "reserva, y puede ver y cancelar sus citas. El dueño ve la agenda "
            "completa del día."
        ),
    },
    {
        "nombre": "dashboard-servidores",
        "arquetipo_esperado": "dashboard",
        "prompt": (
            "Un tablero de indicadores para monitorear la infraestructura de "
            "una empresa: KPIs de servidores activos y costo mensual, gráfica "
            "de evolución de costos, gráfica de uso por proyecto y una tabla "
            "de recursos con su estado (operativo, alerta, caído)."
        ),
    },
    {
        "nombre": "educativo-quiz-colombia",
        "arquetipo_esperado": "educativo",
        "prompt": (
            "Un juego de preguntas sobre la historia de Colombia: preguntas de "
            "opción múltiple con puntaje, y que guarde el progreso de cada "
            "partida para ver si voy mejorando."
        ),
    },
    {
        "nombre": "contenido-blog-recetas",
        "arquetipo_esperado": "contenido",
        "prompt": (
            "Un blog de recetas de cocina colombiana: cualquiera lee las "
            "recetas sin registrarse, y la dueña entra con su usuario para "
            "publicar, editar y borrar publicaciones."
        ),
    },
    {
        "nombre": "libre-conversor-morse",
        "arquetipo_esperado": "libre",
        "prompt": (
            "Una herramienta web que convierte texto a código morse y de "
            "vuelta, reproduce el morse como sonido con pausas reales, y "
            "guarda un historial de las últimas conversiones."
        ),
    },
]


@dataclass
class Resultado:
    """Lo que quedó de UN pedido: lo observado desde fuera + lo declarado."""

    nombre: str
    arquetipo_esperado: str
    prompt: str
    http: int = 0
    url: str = ""
    # Declarados por el backend nuevo; "desconocido" si el backend es viejo.
    estado_entrega: str = "desconocido"
    ruta: str = "desconocido"
    url_viva: bool = False
    bytes_portada: int = 0
    veredicto: str = FALLO
    segundos: float = 0.0
    detalle: str = ""


# ------------------------------------------------------------------ HTTP ---
def _post_generar(api: str, token: str, cuerpo: dict, timeout: float) -> tuple[int, object]:
    """POST al backend con el cuerpo en UTF-8 explícito.

    Sin el encoding explícito, una idea con acentos o eñe llega mal codificada
    y el backend responde 400 "error parsing the body" — parece fallo del
    modelo y es del cliente.
    """
    datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(f"{api}/api/v1/agent/generate", data=datos, method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            crudo = r.read().decode("utf-8", "replace")
            try:
                return r.status, json.loads(crudo)
            except json.JSONDecodeError:
                return r.status, crudo
    except urllib.error.HTTPError as exc:
        crudo = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(crudo)
        except json.JSONDecodeError:
            return exc.code, crudo
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return 0, str(exc)


def _get_publico(url: str, timeout: float = 45.0) -> tuple[int, int]:
    """GET sin token a la URL entregada. Devuelve (status, bytes de portada).

    Sin Authorization a propósito: la URL entregada es de un tercero (el MVP
    del usuario) y mandarle nuestra sesión sería regalar el token.
    """
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, len(r.read())
    except urllib.error.HTTPError as exc:
        return exc.code, len(exc.read())
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return 0, 0


def _backend_vivo(api: str, token: str) -> bool:
    req = urllib.request.Request(f"{api}/health", method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status == 200
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        return False


# ------------------------------------------------------------- un pedido ---
def correr_pedido(
    api: str, token: str, idioma: str, pedido: dict[str, str], timeout: float
) -> Resultado:
    r = Resultado(
        nombre=pedido["nombre"],
        arquetipo_esperado=pedido["arquetipo_esperado"],
        prompt=pedido["prompt"],
    )
    t0 = time.monotonic()
    codigo, cuerpo = _post_generar(
        api, token, {"prompt": pedido["prompt"], "language": idioma}, timeout
    )
    r.segundos = time.monotonic() - t0
    r.http = codigo

    if codigo != 200 or not isinstance(cuerpo, dict):
        r.veredicto = FALLO
        r.detalle = f"HTTP {codigo}: {str(cuerpo)[:200]}"
        return r

    r.url = str(cuerpo.get("url") or "")
    # Campos nuevos del contrato de esta fase. Un backend viejo no los trae:
    # se marcan "desconocido" y la medición sigue valiendo.
    r.estado_entrega = str(cuerpo.get("estado_entrega") or "desconocido")
    r.ruta = str(cuerpo.get("ruta") or "desconocido")

    if not r.url:
        r.veredicto = PARCIAL
        r.detalle = f"{len(cuerpo.get('files') or [])} archivos pero URL vacía"
        return r

    estado_portada, tamano = _get_publico(r.url)
    r.bytes_portada = tamano
    r.url_viva = estado_portada == 200 and tamano > BYTES_MINIMOS_PORTADA
    if r.url_viva:
        r.veredicto = FUNCIONA
        r.detalle = f"portada de {tamano} bytes"
    else:
        r.veredicto = PARCIAL
        r.detalle = f"URL entregada pero portada HTTP {estado_portada} / {tamano} bytes"
    return r


# ----------------------------------------------------------------- salida ---
def _porcentaje(parte: int, total: int) -> str:
    return f"{(100.0 * parte / total):.0f}%" if total else "—"


def imprimir_tabla(resultados: list[Resultado], api: str) -> None:
    ancho_nombre = max(len(r.nombre) for r in resultados) + 2
    ancho_ruta = max(len(r.ruta) for r in resultados) + 2
    print("\n" + "=" * 100)
    print(f"TASA DE ÉXITO — {len(resultados)} pedido(s) contra {api}")
    print("=" * 100)
    for r in resultados:
        print(
            f"  {r.veredicto:<9} {r.nombre:<{ancho_nombre}} "
            f"ruta={r.ruta:<{ancho_ruta}} {r.segundos:6.0f}s  "
            f"{r.url or '(sin URL)'}"
        )
        if r.veredicto != FUNCIONA:
            print(f"            └─ {r.detalle}")

    total = len(resultados)
    ok = sum(1 for r in resultados if r.veredicto == FUNCIONA)
    print("-" * 100)
    print(f"  GLOBAL: {ok}/{total} FUNCIONA ({_porcentaje(ok, total)})")

    print("  Por ruta:")
    rutas: dict[str, list[int]] = {}
    for r in resultados:
        acumulado = rutas.setdefault(r.ruta, [0, 0])
        acumulado[0] += 1
        if r.veredicto == FUNCIONA:
            acumulado[1] += 1
    for ruta, (n, n_ok) in sorted(rutas.items()):
        print(f"    {ruta:<24} {n_ok}/{n} ({_porcentaje(n_ok, n)})")


def escribir_informe(resultados: list[Resultado], api: str, destino: Path) -> None:
    total = len(resultados)
    ok = sum(1 for r in resultados if r.veredicto == FUNCIONA)
    rutas: dict[str, dict[str, int]] = {}
    for r in resultados:
        acumulado = rutas.setdefault(r.ruta, {"total": 0, "funciona": 0})
        acumulado["total"] += 1
        if r.veredicto == FUNCIONA:
            acumulado["funciona"] += 1

    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(
        json.dumps(
            {
                "fecha": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "api": api,
                "total": total,
                "funciona": ok,
                "porcentaje_funciona": round(100.0 * ok / total, 1) if total else 0.0,
                "por_ruta": rutas,
                "pedidos": [asdict(r) for r in resultados],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"  informe: {destino}")


# ------------------------------------------------------------------- main ---
def main() -> int:
    ap = argparse.ArgumentParser(
        description="Mide la tasa de éxito del agente con los pedidos canónicos."
    )
    ap.add_argument("--api", default="http://localhost:8000", help="URL del backend.")
    ap.add_argument(
        "--token",
        default=os.environ.get("E2E_TOKEN", "dev-local"),
        help="Sesión real (ID token de Google). Obligatorio contra producción.",
    )
    ap.add_argument("--idioma", default="es", choices=["es", "en"])
    ap.add_argument(
        "--solo",
        type=int,
        default=0,
        metavar="N",
        help="Corre solo los primeros N pedidos (sondeo; la corrida completa tarda >20 min).",
    )
    ap.add_argument(
        "--timeout",
        type=float,
        default=600.0,
        help="Segundos máximos por generación (10 min por defecto).",
    )
    args = ap.parse_args()

    api = args.api.rstrip("/")
    pedidos = PEDIDOS[: args.solo] if args.solo > 0 else PEDIDOS

    print(f"Backend : {api}")
    print(f"Pedidos : {len(pedidos)} de {len(PEDIDOS)}")

    if not _backend_vivo(api, args.token):
        print(f"\nFALLO: {api}/health no responde. Nada que medir.")
        return 1

    resultados: list[Resultado] = []
    for i, pedido in enumerate(pedidos, 1):
        print(
            f"\n[{i}/{len(pedidos)}] {pedido['nombre']} "
            f"(esperado: {pedido['arquetipo_esperado']}) …",
            flush=True,
        )
        # Si un pedido revienta (timeout, red, backend), se anota y se sigue:
        # el arnés existe para medir, no para caerse en el caso 3.
        try:
            r = correr_pedido(api, args.token, args.idioma, pedido, args.timeout)
        except Exception as exc:  # noqa: BLE001 - jamás abortar la corrida entera
            r = Resultado(
                nombre=pedido["nombre"],
                arquetipo_esperado=pedido["arquetipo_esperado"],
                prompt=pedido["prompt"],
                detalle=f"excepción inesperada: {exc}",
            )
        resultados.append(r)
        print(f"    {r.veredicto} · {r.detalle or r.url} ({r.segundos:.0f}s)")

    imprimir_tabla(resultados, api)
    escribir_informe(resultados, api, RAIZ / "data" / "tasa_exito.json")

    # 0 si algo funcionó (hay medición útil); 1 si NADA funcionó, porque eso
    # casi siempre significa backend roto o cuota agotada, no "tasa del 0%".
    return 0 if any(r.veredicto == FUNCIONA for r in resultados) else 1


if __name__ == "__main__":
    raise SystemExit(main())
