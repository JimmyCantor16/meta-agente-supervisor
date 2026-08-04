"""Prueba de que la URL que se entrega al usuario SIRVE desde fuera.

Sin red y sin gastar cupo: el runner real con arrancadores de mentira.

QUÉ DEMUESTRA
-------------
1. En la nube (con `PUBLIC_BASE_URL`), todo lo que ve el usuario apunta al
   proxy público — tanto al arrancar como al preguntar por el estado.
2. En local (sin `PUBLIC_BASE_URL`), se entrega la dirección local, que ahí sí
   es la buena.
3. El proxy de vista previa sigue recibiendo la dirección INTERNA, que es con
   la que tiene que hablar.
4. Al apagar, no queda una URL fantasma.

POR QUÉ EXISTE
--------------
`start()` devolvía la URL pública y `url_activa()` la local. El fallo parecía
intermitente y por eso sobrevivió: al generar el proyecto la URL servía, pero al
recargar el aula —que pregunta por el estado— aparecía un `http://localhost:8100`
que fuera del servidor no lleva a ningún sitio. El aula lo metía tal cual en el
`src` del iframe y el alumno veía un marco en blanco.

    cd backend
    python pruebas/url_que_se_entrega.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.infrastructure.adapters.multistack import MultiStackProjectRunner  # noqa: E402

PUBLICA = "https://metaagente-backend.onrender.com"
LOCAL = "http://localhost:8100"


class ArrancadorFalso:
    """Imita a un runner real: arranca y devuelve su puerto local."""

    def __init__(self) -> None:
        self.vivos: set[str] = set()

    def start(self, _dir: str, nombre: str) -> str | None:
        self.vivos.add(nombre)
        return LOCAL

    def stop(self, nombre: str) -> None:
        self.vivos.discard(nombre)


def montar(base_publica: str) -> MultiStackProjectRunner:
    r = MultiStackProjectRunner(public_host="localhost", public_base_url=base_publica)
    falso = ArrancadorFalso()
    # Se sustituyen los tres arrancadores: la prueba es del REPARTO de URLs,
    # no de si Python o Node levantan de verdad.
    r._python = falso  # noqa: SLF001
    r._node = falso  # noqa: SLF001
    r._static = falso  # noqa: SLF001
    return r


def main() -> int:
    print("1. EN LA NUBE: todo lo que ve el usuario pasa por el proxy público")
    nube = montar(PUBLICA)
    # `_es_python` mira el disco; se fuerza el camino con un directorio real.
    entregada = nube.start(str(Path(__file__).parent), "mi-tienda")
    esperada = f"{PUBLICA}/preview/mi-tienda/"
    estado = nube.url_activa("mi-tienda")
    interna = nube.url_local("mi-tienda")

    print(f"   al arrancar (start)      : {entregada}")
    print(f"   al consultar (url_activa): {estado}")
    print(f"   para el proxy (url_local): {interna}")
    assert entregada == esperada, f"start entregó {entregada}"
    assert estado == esperada, (
        f"url_activa entregó {estado}: el aula pondría esto en el iframe y "
        "el alumno vería un marco en blanco"
    )
    assert entregada == estado, "start y url_activa DEBEN coincidir"
    assert interna == LOCAL, f"el proxy necesita la dirección interna, recibió {interna}"
    assert "localhost" not in (estado or ""), "se filtró localhost a lo que ve el usuario"
    print("   ✓ arrancar y consultar dicen lo mismo, y no es localhost")

    print("\n2. EN LOCAL: se entrega la dirección local, que ahí sí sirve")
    local = montar("")
    entregada_l = local.start(str(Path(__file__).parent), "mi-tienda")
    estado_l = local.url_activa("mi-tienda")
    print(f"   al arrancar : {entregada_l}")
    print(f"   al consultar: {estado_l}")
    assert entregada_l == LOCAL and estado_l == LOCAL, "en local debe darse la URL local"
    print("   ✓ sin URL pública configurada, manda la local")

    print("\n3. AL APAGAR no queda una URL fantasma")
    nube.stop("mi-tienda")
    print(f"   url_activa tras apagar: {nube.url_activa('mi-tienda')}")
    print(f"   url_local  tras apagar: {nube.url_local('mi-tienda')}")
    assert nube.url_activa("mi-tienda") is None
    assert nube.url_local("mi-tienda") is None
    print("   ✓ apagado limpio")

    print("\n4. UN PROYECTO QUE NUNCA ARRANCÓ no inventa URL")
    assert nube.url_activa("no-existe") is None
    print("   ✓ devuelve None")

    print("\nTODO CORRECTO: lo que se le enseña al usuario se puede abrir desde")
    print("fuera, y el proxy sigue hablando con el puerto interno.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
