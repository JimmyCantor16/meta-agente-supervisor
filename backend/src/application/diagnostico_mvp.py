"""Diagnóstico honesto del MVP entregado, antes de enseñar sobre él.

El caso que obligó a esto: se pidió un sistema que se conectara a Azure y
entregara informes. El agente dijo "terminado" y le dejó al usuario final un
JSON crudo, sin nada que ver. Un usuario que no sabe programar ante eso cierra
el navegador y se va a otra IA — y nunca pudimos evaluar de verdad si servía.

El profesor no puede empezar la Clase 1 sobre un MVP que en realidad no
funciona. Primero lo RETOMA y lo diagnostica con honestidad: mide señales
objetivas (¿hay interfaz o solo API?, ¿el navegador la ve o sale en blanco?) y
emite un veredicto claro. Si está vacío/parcial, lo dice y ofrece el siguiente
paso (relanzar/reparar) en vez de fingir éxito.
"""

from __future__ import annotations

import logging

from src.domain.entities import DiagnosticoMVP, EstadoMVP, GeneratedFile
from src.domain.ports import (
    AuditError,
    DiagnosticadorMVPPort,
    ProjectReaderPort,
)

logger = logging.getLogger(__name__)

# Archivos que significan "hay algo que un humano puede VER" en el navegador.
_MARCAS_UI = (".html", ".jsx", ".tsx", ".vue", ".svelte")
# Archivos que significan "hay lógica de servidor" (pero no necesariamente UI).
_MARCAS_API = ("server.js", "app.py", "main.py", "index.js", "api.py")


def senales_visibilidad(files: list[GeneratedFile]) -> tuple[bool, bool]:
    """(tiene_frontend, tiene_api) — hechos objetivos, sin LLM.

    Es la señal que distingue un MVP que SE VE de un JSON sin nada (caso Azure).
    Se comparte entre el diagnóstico del profesor y el gate de la generación
    para que ambos midan lo mismo.
    """
    rutas = [f.path.lower() for f in files]
    tiene_frontend = any(r.endswith(_MARCAS_UI) for r in rutas)
    tiene_api = any(any(r.endswith(m) for m in _MARCAS_API) for r in rutas)
    return tiene_frontend, tiene_api


class DiagnosticarMVPUseCase:
    """Retoma un proyecto entregado y juzga si de verdad le sirve al usuario."""

    def __init__(
        self,
        reader: ProjectReaderPort,
        diagnosticador: DiagnosticadorMVPPort,
    ) -> None:
        self._reader = reader
        self._diagnosticador = diagnosticador

    def execute(
        self,
        proyecto: str,
        url: str = "",
        language: str = "es",
    ) -> DiagnosticoMVP:
        nombre = (proyecto or "").strip()
        if not nombre:
            raise ValueError("Falta el nombre del proyecto.")

        archivos = self._reader.read(nombre)
        if not archivos:
            raise AuditError(f"El proyecto '{nombre}' no existe o está vacío.")

        senales = self._medir(archivos, url)

        # Atajo honesto y sin gastar tokens: si NO hay ninguna interfaz, es el
        # caso Azure — solo API/JSON. No hace falta preguntarle al LLM.
        if not senales["tiene_frontend"] and senales["tiene_api"]:
            return DiagnosticoMVP(
                estado=EstadoMVP.VACIO,
                puede_verse=False,
                veredicto=(
                    "Tu sistema tiene la lógica por dentro, pero NO tiene una "
                    "pantalla que un usuario pueda ver: hoy solo devuelve datos "
                    "en crudo (un JSON). Alguien que no programa abriría esto y "
                    "no vería nada usable."
                ),
                lo_que_ve_el_usuario=(
                    "Texto técnico o un JSON, sin botones ni pantallas. "
                    "Parece 'que no cargó'."
                ),
                problemas=[
                    "Falta una interfaz (una página con lo que el sistema hace).",
                    "El valor está escondido detrás de una API que el usuario no "
                    "sabe usar.",
                ],
                siguiente_paso=(
                    "Antes de la Clase 1 conviene RELANZARLO pidiendo que además "
                    "genere una pantalla que muestre esos datos. Cuando se vea, "
                    "empezamos el curso sobre algo que de verdad funciona."
                ),
                url=url,
            )

        # Página en blanco: hay UI pero el navegador no la renderiza.
        if senales["render_error"]:
            return DiagnosticoMVP(
                estado=EstadoMVP.VACIO,
                puede_verse=False,
                veredicto=(
                    "Tu sistema SÍ tiene pantalla, pero al abrirla en el navegador "
                    "se ve en blanco: el usuario final no vería nada."
                ),
                lo_que_ve_el_usuario="Una página vacía (blanca).",
                problemas=[senales["render_error"][:400]],
                siguiente_paso=(
                    "Hay que reparar el error de render y relanzar antes de "
                    "enseñar sobre el sistema."
                ),
                url=url,
            )

        # Hay UI y (si se probó) renderiza: el LLM matiza si es completa o parcial.
        try:
            diag = self._diagnosticador.diagnosticar(nombre, archivos, senales, language)
        except AuditError:
            # El veredicto del profesor puede fallar (rate-limit); no bloqueamos:
            # con las señales objetivas ya sabemos que al menos SE VE.
            logger.warning("Diagnóstico LLM falló; se emite veredicto por señales.")
            diag = DiagnosticoMVP(
                estado=EstadoMVP.FUNCIONA,
                puede_verse=True,
                veredicto="Tu sistema tiene una pantalla y carga. ¡Se puede ver y usar!",
                lo_que_ve_el_usuario="Una interfaz con contenido.",
                siguiente_paso="Podemos empezar la Clase 1 sobre tu sistema.",
                url=url,
            )
        diag.url = url or diag.url
        return diag

    # ------------------------------------------------------------------
    def _medir(self, archivos: list[GeneratedFile], url: str) -> dict:
        """Hechos objetivos del MVP — sin LLM, para no gastar cupo ni mentir."""
        tiene_frontend, tiene_api = senales_visibilidad(archivos)

        # ¿Los .html tienen cuerpo real o son cascarones?
        html_con_cuerpo = False
        for f in archivos:
            if f.path.lower().endswith(".html") and len(f.content.strip()) > 200:
                html_con_cuerpo = True
                break

        render_error = None
        if url and tiene_frontend:
            render_error = self._probar_render(url)

        return {
            "tiene_frontend": tiene_frontend,
            "tiene_api": tiene_api,
            "html_con_cuerpo": html_con_cuerpo,
            "num_archivos": len(archivos),
            "url": url,
            "render_error": render_error,
        }

    def _probar_render(self, url: str) -> str | None:
        """Reusa el gate de navegador real; si no está disponible, no bloquea."""
        try:
            from src.infrastructure.adapters.validacion_navegador import validar_render
        except Exception:  # noqa: BLE001
            return None
        try:
            return validar_render(url, timeout_s=20)
        except Exception as exc:  # noqa: BLE001 - el diagnóstico nunca debe tumbar
            logger.warning("No se pudo validar render en diagnóstico: %s", exc)
            return None
