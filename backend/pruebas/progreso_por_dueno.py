"""Prueba de que el progreso de cada usuario es SUYO.

Sin red y sin gastar cupo: colas de mentira en lugar de WebSockets.

QUÉ DEMUESTRA
-------------
1. Los pasos de una generación llegan SOLO a quien la pidió.
2. Los eventos sin dueño (arranque, avisos generales) llegan a todos.
3. Quien escucha sin sesión no ve el trabajo de nadie.
4. Las fases se emiten con estructura (fase, índice, total, paso/de).

POR QUÉ EXISTE
--------------
El WebSocket aceptaba sin comprobar nada y difundía cada línea a todos los
conectados. Con un solo usuario no se notaba; con dos, cada uno veía los
nombres de proyecto y las ideas del otro pasar por su pantalla. Y no hacía
falta ni tener cuenta: bastaba con abrir el socket desde fuera.

    cd backend
    python pruebas/progreso_por_dueno.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.infrastructure.entrypoints.progreso import (  # noqa: E402
    DIFUSOR,
    DUENO_ACTUAL,
)


class LoopFalso:
    """Ejecuta al momento lo que el difusor programaría en el loop real."""

    @staticmethod
    def call_soon_threadsafe(fn, *args):
        fn(*args)


def suscriptor(dueno: str) -> asyncio.Queue:
    cola: asyncio.Queue = asyncio.Queue(maxsize=100)
    DIFUSOR.suscribir(cola, LoopFalso(), dueno)  # type: ignore[arg-type]
    return cola


def vaciar(cola: asyncio.Queue) -> list[str]:
    salida = []
    while not cola.empty():
        salida.append(cola.get_nowait())
    return salida


def main() -> int:
    ana = suscriptor("usuario-ana")
    beto = suscriptor("usuario-beto")
    curioso = suscriptor("")  # conectado sin sesión

    print("1. LO DE ANA ES DE ANA")
    DUENO_ACTUAL.set("usuario-ana")
    DIFUSOR.difundir("🏗️ Construyendo 'clinica-veterinaria'…", "usuario-ana")
    de_ana, de_beto, de_curioso = vaciar(ana), vaciar(beto), vaciar(curioso)
    print(f"   ana     recibe: {de_ana}")
    print(f"   beto    recibe: {de_beto}")
    print(f"   anónimo recibe: {de_curioso}")
    assert len(de_ana) == 1, "Ana debía ver su propio progreso"
    assert de_beto == [], "¡Beto vio el proyecto de Ana!"
    assert de_curioso == [], "¡Un desconocido vio el proyecto de Ana!"
    print("   ✓ nadie más lo vio")

    print("\n2. UN AVISO GENERAL (sin dueño) LLEGA A TODOS")
    DIFUSOR.difundir("🔧 El sistema se está reiniciando.", "")
    n = [len(vaciar(c)) for c in (ana, beto, curioso)]
    print(f"   recibidos por (ana, beto, anónimo): {tuple(n)}")
    assert n == [1, 1, 1], "un aviso general debe llegar a todo el mundo"
    print("   ✓ los tres lo recibieron")

    print("\n3. LAS FASES VIAJAN CON ESTRUCTURA")
    DUENO_ACTUAL.set("usuario-beto")
    DIFUSOR.fase("verificar", "Comprobando que arranca", 3, 7)
    evento = vaciar(beto)
    sobrantes = vaciar(ana) + vaciar(curioso)
    print(f"   beto recibe : {evento}")
    print(f"   los demás   : {sobrantes or 'nada'}")
    assert len(evento) == 1 and not sobrantes, "la fase se fue a quien no era"
    d = json.loads(evento[0])
    print(f"   descompuesto: fase={d['fase']} {d['indice']}/{d['total']} paso {d['paso']} de {d['de']}")
    assert d["t"] == "fase" and d["fase"] == "verificar"
    assert d["paso"] == 3 and d["de"] == 7, "sin paso/de no se puede pintar una barra"
    assert 1 <= d["indice"] <= d["total"]
    print("   ✓ el frontend puede pintar «Verificando · 3 de 7» sin adivinar")

    print("\n4. UNA FASE INVENTADA NO SE EMITE")
    DIFUSOR.fase("bailar", "no existe")
    assert vaciar(beto) == [], "se coló una fase que no está en el catálogo"
    print("   ✓ ignorada")

    print("\nTODO CORRECTO: cada quien ve lo suyo, y las fases se pueden pintar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
