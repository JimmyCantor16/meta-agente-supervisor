"""Prueba del PUENTE LOCAL (la terminal del equipo atiende la IA de PROD). Offline.

QUÉ DEMUESTRA
-------------
1. Sin trabajador conectado, un encargo falla AL INSTANTE (no se queda
   esperando) y la cadena sigue con el siguiente proveedor.
2. Con trabajador, el plan Business recibe la respuesta de la terminal, y el
   plan Free ni la toca (se salta en silencio: no consume nada de la terminal).
3. Las rutas del trabajador exigen el token (401 sin él, 404 si el puente está
   apagado) y `/estado` dice si la terminal está conectada y con qué motores.
4. El experto por el puente usa la terminal si está y, si no, su respaldo.

    cd backend
    PYTHONIOENCODING=utf-8 python pruebas/puente_local.py
"""

from __future__ import annotations

import os
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["PUENTE_TOKEN"] = "token-de-prueba"

from src.application.experto import ServicioExperto  # noqa: E402
from src.application.experto_contexto import usar_experto  # noqa: E402
from src.config import LLMProvider, get_settings  # noqa: E402
from src.domain.experto import AgenteExpertoPort, AporteExperto, MomentoExperto  # noqa: E402
from src.infrastructure.adapters.experto_puente import ExpertoPuente  # noqa: E402
from src.infrastructure.adapters.multimodel_llm import MultiModelLLM  # noqa: E402
from src.infrastructure.adapters.puente_local import HUB, PuenteError, PuenteHub  # noqa: E402

FALLOS: list[str] = []


def comprobar(cond: bool, texto: str) -> None:
    print(("  OK  " if cond else "  MAL ") + texto)
    if not cond:
        FALLOS.append(texto)


class _ClienteFijo:
    """Proveedor «gratis» falso: siempre responde lo mismo."""

    def __init__(self, texto: str) -> None:
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        self._texto = texto

    def _create(self, **_):
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self._texto), finish_reason="stop")],
            usage=SimpleNamespace(total_tokens=10),
        )


class _GastoNulo:
    def gastado_este_mes(self, usuario: str) -> float:
        return 0.0

    def anotar(self, usuario: str, coste_usd: float) -> None:
        pass


class _ExpertoRespaldo(AgenteExpertoPort):
    disponible = True

    def aportar(self, momento: MomentoExperto, contexto: dict) -> AporteExperto:
        return AporteExperto(momento=momento, resumen="respaldo", modelo="respaldo")


def _servicio(plan: str) -> ServicioExperto:
    return ServicioExperto(experto=_ExpertoRespaldo(), gastos=_GastoNulo(), usuario="u", plan_id=plan)


def _llm() -> MultiModelLLM:
    puente = [p for p in get_settings().resolved_providers if p.kind == "puente_local"]
    gratis = LLMProvider(name="gratis-falso", base_url="http://x", api_key="x", model="m")
    llm = MultiModelLLM(providers=[*puente, gratis], role="code")
    llm._clients = [  # el gratis, por un cliente falso; el puente, por el de verdad
        (p, c if p.kind == "puente_local" else _ClienteFijo('{"quien": "gratis"}'))
        for p, c in llm._clients
    ]
    return llm


def _trabajador(hub: PuenteHub, respuestas: int, texto: str) -> threading.Thread:
    def correr() -> None:
        for _ in range(respuestas):
            encargo = hub.tomar(("claude", "deepseek"), "PC-prueba", espera=5)
            if encargo:
                hub.entregar(encargo.id, texto, "", 0.1)

    hilo = threading.Thread(target=correr, daemon=True)
    hilo.start()
    return hilo


def main() -> None:
    print("1) Sin trabajador: falla al instante")
    hub = PuenteHub()
    inicio = time.monotonic()
    try:
        hub.encargar("claude", "s", "u", want_json=False, espera=30)
        comprobar(False, "debía fallar sin trabajador")
    except PuenteError:
        comprobar(time.monotonic() - inicio < 1, "PuenteError inmediato sin trabajador")

    llm = _llm()
    with usar_experto(_servicio("business")):
        datos = llm.chat_json("s", "u")
    comprobar(datos == {"quien": "gratis"}, "Business sin terminal -> sigue la IA gratis")

    print("2) Con trabajador: Business usa la terminal, Free no")
    hilo = _trabajador(HUB, 1, '{"quien": "terminal"}')
    time.sleep(0.3)
    with usar_experto(_servicio("business")):
        datos = llm.chat_json("s", "u")
    comprobar(datos == {"quien": "terminal"}, "Business -> respondió la terminal")
    hilo.join(timeout=6)

    _trabajador(HUB, 1, '{"quien": "terminal"}')
    time.sleep(0.3)
    resueltos = HUB.estado()["resueltos"]
    for plan in ("free", "pro", "studio"):
        with usar_experto(_servicio(plan)):
            datos = llm.chat_json("s", "u")
        comprobar(datos == {"quien": "gratis"}, f"{plan} -> IA gratis (la terminal no se toca)")
    comprobar(HUB.estado()["resueltos"] == resueltos, "ningún encargo de plan sin terminal")

    print("3) Rutas: token y estado")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from src.infrastructure.entrypoints.puente import router_puente

    app = FastAPI()
    app.include_router(router_puente)
    cliente = TestClient(app)
    comprobar(cliente.get("/api/v1/puente/tomar").status_code == 401, "sin token -> 401")
    r = cliente.get("/api/v1/puente/tomar?motores=nada", headers={"X-Puente-Token": "token-de-prueba"})
    comprobar(r.status_code == 422, "motor desconocido -> 422")
    estado = cliente.get("/api/v1/puente/estado").json()
    comprobar(estado["activo"] is True and estado["conectado"] is True, "/estado: activo y conectado")
    comprobar(
        cliente.post("/api/v1/puente/entregar/noexiste", json={"contenido": "x"},
                     headers={"X-Puente-Token": "token-de-prueba"}).json() == {"aceptado": False},
        "entrega tardía o desconocida -> aceptado False",
    )

    print("4) Experto por el puente")
    hub2 = PuenteHub()
    experto = ExpertoPuente(respaldo=_ExpertoRespaldo(), espera=5, hub=hub2)
    aporte = experto.aportar(MomentoExperto.REPASO, {"x": 1})
    comprobar(aporte.modelo == "respaldo", "sin terminal -> experto de respaldo")
    _trabajador(hub2, 1, '{"mejoras": ["a"], "resumen": "listo"}')
    time.sleep(0.3)
    aporte = experto.aportar(MomentoExperto.REPASO, {"x": 1})
    comprobar(aporte.modelo == "Claude Code (terminal)" and aporte.resumen == "listo",
              "con terminal -> Claude Code responde el experto")

    print()
    if FALLOS:
        print(f"FALLARON {len(FALLOS)}: {FALLOS}")
        sys.exit(1)
    print("TODO OK")


if __name__ == "__main__":
    main()
