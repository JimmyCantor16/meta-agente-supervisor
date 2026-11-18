"""Enciende PostgreSQL (Neon) en el backend de Render, de punta a punta.

Uso (desde backend/):
    python -m tools.conectar_neon                 # lee secretos\\neon.txt
    python -m tools.conectar_neon --solo-probar   # valida la cadena y no toca Render

Qué hace, en orden, y por qué cada paso:
1. Lee la cadena de `%LOCALAPPDATA%\\RenderDeploy\\secretos\\neon.txt`. Acepta
   tal cual lo que copia el panel de Neon, incluido el `psql '...'` de delante.
2. Quita `options=`: el endpoint agrupado (`-pooler`) rechaza la cadena ENTERA si
   lo lleva. El esquema viaja en nuestro parámetro `esquema=` (postgres_support).
3. Se conecta de verdad y mira en qué esquema están las tablas ya creadas, para
   que la aplicación no arranque apuntando a un esquema vacío.
4. Pone `DATABASE_URL` en el servicio por la API de Render (el servicio NO sigue
   el blueprint: editar render.yaml no cambiaría nada) y lanza un deploy.
5. Espera a `live` y comprueba en `/health` que la persistencia dice PostgreSQL.

Nunca imprime la cadena ni la clave: solo host, base y esquema.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

SECRETOS = Path(os.environ.get("LOCALAPPDATA", ".")) / "RenderDeploy" / "secretos"
SERVICIO = "srv-d9jf1o58nd3s73ba3k30"
BACKEND = "https://metaagente-backend.onrender.com"
RENDER_API = "https://api.render.com/v1"


def leer_cadena(archivo: Path) -> str:
    texto = archivo.read_text(encoding="utf-8").strip()
    # El panel de Neon ofrece `psql 'postgresql://…'`: se acepta pegado tal cual.
    hallado = re.search(r"postgres(?:ql)?://[^\s'\"]+", texto)
    if not hallado:
        raise SystemExit(f"{archivo.name} no contiene una cadena postgresql://")
    return hallado.group(0)


def limpiar(url: str, esquema: str = "") -> str:
    partes = urlsplit(url)
    params = [(k, v) for k, v in parse_qsl(partes.query) if k not in ("options", "esquema")]
    if not any(k == "sslmode" for k, _ in params):
        params.append(("sslmode", "require"))
    if esquema and esquema != "public":
        params.append(("esquema", esquema))
    return urlunsplit(partes._replace(query=urlencode(params)))


def describir(url: str) -> str:
    p = urlsplit(url)
    return f"{p.hostname} / base «{p.path.lstrip('/')}»"


def esquema_con_tablas(url: str) -> tuple[str, int]:
    import psycopg

    with psycopg.connect(limpiar(url), prepare_threshold=None, connect_timeout=20) as c:
        filas = c.execute(
            "SELECT table_schema, count(*) FROM information_schema.tables "
            "WHERE table_schema NOT IN ('pg_catalog','information_schema') "
            "AND table_type = 'BASE TABLE' GROUP BY 1 ORDER BY 2 DESC"
        ).fetchall()
    if not filas:
        return "public", 0  # base vacía: la app crea las tablas al arrancar
    return filas[0][0], filas[0][1]


def render(metodo: str, ruta: str, cuerpo: dict | None = None):
    clave = (SECRETOS / "render.txt").read_text(encoding="utf-8").strip().strip('"')
    peticion = urllib.request.Request(
        RENDER_API + ruta,
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        method=metodo,
        headers={
            "Authorization": f"Bearer {clave}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(peticion, timeout=60) as r:
        return json.loads(r.read() or b"{}")


def esperar_live(deploy_id: str, tope_s: int = 900) -> str:
    inicio = time.time()
    estado = "?"
    while time.time() - inicio < tope_s:
        estado = render("GET", f"/services/{SERVICIO}/deploys/{deploy_id}").get("status", "?")
        print(f"  deploy: {estado}", flush=True)
        if estado in ("live", "build_failed", "update_failed", "canceled", "deactivated"):
            return estado
        time.sleep(20)
    return estado


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--archivo", default=str(SECRETOS / "neon.txt"))
    ap.add_argument("--solo-probar", action="store_true")
    args = ap.parse_args()

    archivo = Path(args.archivo)
    if not archivo.exists():
        raise SystemExit(f"Falta {archivo}. Pega ahí la cadena de Neon (Connection pooling).")
    cruda = leer_cadena(archivo)
    if "-pooler" not in (urlsplit(cruda).hostname or ""):
        print("AVISO: no es el endpoint agrupado (-pooler). Funciona, pero agota conexiones antes.")

    print("1. Conectando a", describir(cruda))
    esquema, tablas = esquema_con_tablas(cruda)
    print(f"   OK · esquema «{esquema}» con {tablas} tabla(s)")
    final = limpiar(cruda, esquema)
    if args.solo_probar:
        print("Solo probar: Render no se ha tocado.")
        return

    print("2. Poniendo DATABASE_URL en Render (el valor no se muestra)")
    render("PUT", f"/services/{SERVICIO}/env-vars/DATABASE_URL", {"value": final})
    deploy = render("POST", f"/services/{SERVICIO}/deploys", {"clearCache": "do_not_clear"})
    print("3. Deploy lanzado; esperando a que quede vivo…")
    if esperar_live(deploy["id"]) != "live":
        raise SystemExit("El deploy no quedó vivo: revisa los logs de Render.")

    print("4. Comprobando /health")
    for _ in range(10):
        try:
            with urllib.request.urlopen(BACKEND + "/health", timeout=60) as r:
                salud = json.loads(r.read())
            print("   persistencia:", salud.get("persistencia"))
            if "PostgreSQL" in (salud.get("persistencia") or ""):
                print("LISTO: el backend ya guarda en Neon y los deploys no borran nada.")
                return
            break
        except (urllib.error.URLError, TimeoutError):
            time.sleep(15)
    raise SystemExit("El backend arrancó pero /health no dice PostgreSQL: revisa los logs.")


if __name__ == "__main__":
    main()
