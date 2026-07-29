"""Progreso de la generación EN VIVO por WebSocket.

La generación tarda minutos y hasta hoy el usuario miraba un spinner mudo.
Aquí cada log INFO relevante del pipeline (planificar, escribir, verificar,
arrancar, gate de render) se difunde a los navegadores conectados: el usuario
VE a su sistema construirse, paso a paso, en su idioma.

Diseño: la generación corre en un hilo trabajador (endpoint síncrono), así que
el handler de logging empuja a las colas asyncio de cada socket con
`call_soon_threadsafe` sobre el loop capturado al conectar. Si no hay nadie
escuchando, no cuesta nada.
"""

from __future__ import annotations

import asyncio
import logging
import re

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

# Solo estas fuentes hablan con el usuario (lo demás es ruido interno).
_FUENTES = (
    "src.application.generate_project",
    "src.infrastructure.adapters.iterative_project_generator",
    "src.infrastructure.adapters.instanciador_bases",
    "src.infrastructure.adapters.node_project_verifier",
    "src.infrastructure.adapters.project_verifier",
    "src.infrastructure.adapters.static_site",
    "src.infrastructure.adapters.node_project_runner",
    "src.infrastructure.adapters.validacion_navegador",
    "src.application.aplicar_ajuste",
    "src.application.mejorar_proyecto",
    "src.infrastructure.adapters.multimodel_llm",
)

# Los mensajes técnicos se traducen a pasos que un no-programador entiende.
_AMIGABLES = (
    (re.compile(r"clasificada como arquetipo '(\w+)'", re.I), "🧬 Tu idea calza en un sistema base «{0}»: construyendo sobre cimientos probados…"),
    (re.compile(r"Sin arquetipo claro", re.I), "🧠 Idea única: diseñando tu sistema desde cero…"),
    (re.compile(r"Plan: (\d+) archivo", re.I), "📐 Plano listo: {0} archivos por construir."),
    (re.compile(r"Escrito (\d+)/(\d+): (.+)", re.I), "✍️ Escribiendo {0} de {1}: {2}"),
    (re.compile(r"Instalando dependencias", re.I), "📦 Instalando las dependencias del proyecto…"),
    (re.compile(r"Compilando el frontend", re.I), "🏗️ Compilando la interfaz…"),
    (re.compile(r"Verificación superada", re.I), "✅ ¡Verificación superada! Tu sistema compila y arranca."),
    (re.compile(r"Verificación falló \(intento (\d+)", re.I), "🔧 Algo falló (intento {0}); reparando con el error real…"),
    (re.compile(r"corriendo en (http\S+)", re.I), "🚀 ¡Tu sistema está VIVO en {0}!"),
    (re.compile(r"render validado", re.I), "🛡️ El navegador confirmó que tu página SE VE perfecta."),
    (re.compile(r"URL RETENIDA", re.I), "🛡️ La página no pasó la inspección del navegador: no se entrega rota."),
    (re.compile(r"Arreglo automático en (\S+)", re.I), "🩹 Arreglo automático aplicado en {0}"),
    # Entrega en rama: el aviso que despierta a las 3 apps para revisar.
    (
        re.compile(r"ENTREGA LISTA PARA REVISION en la rama '(.+?)'", re.I),
        "📬 REVISIÓN PENDIENTE · el agente entregó su trabajo en la rama «{0}» con su informe",
    ),
    # --- Cerebro IA: qué proveedor gratis respondió / cuál falló (fallback) ---
    (re.compile(r"OK con '(.+?)' \[rol=(.+?)\]", re.I), "🤖 IA «{0}» respondió (rol {1})"),
    (re.compile(r"Proveedor '(.+?)' falló", re.I), "⚠️ IA «{0}» falló → salto a la siguiente"),
    (re.compile(r"Proveedor '(.+?)' devolvió respuesta vacía", re.I), "⚠️ IA «{0}» sin respuesta → siguiente"),
    (re.compile(r"Proveedor '(.+?)' cortó la respuesta", re.I), "⚠️ IA «{0}» respuesta cortada → siguiente"),
    (re.compile(r"Proveedor '(.+?)' devolvió JSON inválido", re.I), "⚠️ IA «{0}» formato inválido → siguiente"),
    (re.compile(r"con (\d+) proveedor", re.I), "🧠 Cerebro IA listo: {0} modelos en cadena"),
    (re.compile(r"Todos los proveedores.*fallaron", re.I), "🛑 Todos los proveedores de IA fallaron"),
)

logger = logging.getLogger(__name__)


class _Difusor(logging.Handler):
    """Handler de logging que reparte cada mensaje a los sockets suscritos."""

    def __init__(self) -> None:
        super().__init__(level=logging.INFO)
        self._suscriptores: dict[asyncio.Queue, asyncio.AbstractEventLoop] = {}

    def suscribir(self, cola: asyncio.Queue, loop: asyncio.AbstractEventLoop) -> None:
        self._suscriptores[cola] = loop

    def desuscribir(self, cola: asyncio.Queue) -> None:
        self._suscriptores.pop(cola, None)

    def emit(self, record: logging.LogRecord) -> None:
        if not self._suscriptores or not record.name.startswith(_FUENTES):
            return
        try:
            texto = _traducir(record.getMessage())
        except Exception:  # noqa: BLE001 - el progreso jamás rompe el pipeline
            return
        if not texto:
            return
        for cola, loop in list(self._suscriptores.items()):
            try:
                loop.call_soon_threadsafe(cola.put_nowait, texto)
            except RuntimeError:
                self._suscriptores.pop(cola, None)


def _traducir(mensaje: str) -> str | None:
    for patron, plantilla in _AMIGABLES:
        m = patron.search(mensaje)
        if m:
            return plantilla.format(*m.groups())
    # Sin traducción conocida: solo pasan los mensajes cortos y legibles.
    return mensaje if len(mensaje) <= 140 and "\n" not in mensaje else None


DIFUSOR = _Difusor()
logging.getLogger("src").addHandler(DIFUSOR)

router_ws = APIRouter()


@router_ws.websocket("/api/v1/ws/progreso")
async def ws_progreso(websocket: WebSocket) -> None:
    """Canal de progreso: el cliente conecta y solo escucha."""
    await websocket.accept()
    cola: asyncio.Queue = asyncio.Queue(maxsize=500)
    DIFUSOR.suscribir(cola, asyncio.get_running_loop())
    try:
        await websocket.send_text("👋 Conectado: te iré contando cada paso.")
        while True:
            mensaje = await cola.get()
            await websocket.send_text(mensaje)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 - un socket caído no es un error del sistema
        pass
    finally:
        DIFUSOR.desuscribir(cola)
