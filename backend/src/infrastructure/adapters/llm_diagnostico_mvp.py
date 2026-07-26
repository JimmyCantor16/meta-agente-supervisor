"""Adaptador con IA que juzga si el MVP entregado SIRVE para un usuario final.

Recibe las señales objetivas ya medidas (hay UI, renderiza, es solo API…) y el
código, y emite un veredicto honesto en palabras que entiende alguien que no
programa. No vuelve a medir: interpreta con criterio de producto.
"""

from __future__ import annotations

import logging

from src.domain.entities import DiagnosticoMVP, EstadoMVP
from src.domain.ports import AuditError, DiagnosticadorMVPPort
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM
from src.infrastructure.adapters.skills_loader import skill

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
Eres el CONTROL DE CALIDAD del Meta-Agente. Tu única pregunta es: si un usuario
que NO sabe programar abre este sistema, ¿ve algo real y usable, o cierra el
navegador decepcionado y se va a otra IA?

Ya te damos hechos objetivos medidos (si hay interfaz, si el navegador la
renderiza, si es solo una API). NO los contradigas: interprétalos como un jefe
de producto honesto. Un JSON crudo, una página en blanco o "instala Docker" NO
es un MVP usable para esta persona, por muy bien hecho que esté el código.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown):
{
  "estado": "funciona | parcial | vacio",
  "puede_verse": true/false,
  "veredicto": "Una frase honesta del estado, en cristiano, hablándole al usuario",
  "lo_que_ve_el_usuario": "Qué encontraría al abrir la URL, en concreto",
  "problemas": ["lo que impide disfrutarlo; vacío [] si funciona bien"],
  "siguiente_paso": "Qué conviene hacer ahora (relanzar/reparar, o empezar la Clase 1)"
}

CRITERIO:
- "funciona": hay una pantalla con contenido, se ve y se puede usar. problemas [].
- "parcial": se ve algo pero está a medias (sin datos, botones que no hacen nada,
  falta lo esencial de la idea). Di QUÉ falta.
- "vacio": no hay nada usable (solo JSON/API, página en blanco). Sé honesto y
  amable: no es culpa del usuario, y proponemos relanzarlo mejor.
- Habla SIEMPRE en el idioma indicado, sin jerga sin explicar, tono de profesor
  paciente que protege al usuario de una falsa sensación de éxito.
"""


class LLMDiagnosticadorMVP(DiagnosticadorMVPPort):
    def __init__(self) -> None:
        self._llm = MultiModelLLM(role="prompt")

    def diagnosticar(self, proyecto, files, senales, language="es") -> DiagnosticoMVP:
        rutas = "\n".join(f"- {f.path}" for f in files[:40])
        claves = [f for f in files if f.path.endswith(
            ("index.html", "App.jsx", "App.tsx", "main.py", "server.js",
             "dominio.json"))][:4]
        fragmentos = "\n\n".join(f"=== {f.path} ===\n{f.content[:1200]}" for f in claves)
        idioma = "español" if language == "es" else "English"
        hechos = (
            f"- ¿tiene interfaz (pantallas)?: {senales.get('tiene_frontend')}\n"
            f"- ¿tiene lógica de servidor/API?: {senales.get('tiene_api')}\n"
            f"- ¿los HTML tienen contenido real?: {senales.get('html_con_cuerpo')}\n"
            f"- nº de archivos: {senales.get('num_archivos')}\n"
            f"- error de render en el navegador: {senales.get('render_error') or 'ninguno'}"
        )
        user = (
            f"[Responde TODO en {idioma}]\n"
            f"PROYECTO: {proyecto}\n\n"
            f"HECHOS OBJETIVOS YA MEDIDOS (no los contradigas):\n{hechos}\n\n"
            f"ARCHIVOS:\n{rutas}\n\n"
            f"CÓDIGO CLAVE:\n{fragmentos}"
        )
        try:
            data = self._llm.chat_json(
                SYSTEM_PROMPT + "\n\n" + skill("profesor_paciente.md"),
                user, temperature=0.3,
            )
        except LLMError as exc:
            raise AuditError(str(exc)) from exc

        estado_raw = str(data.get("estado", "parcial")).lower().strip()
        estado = {
            "funciona": EstadoMVP.FUNCIONA,
            "parcial": EstadoMVP.PARCIAL,
            "vacio": EstadoMVP.VACIO,
            "vacío": EstadoMVP.VACIO,
        }.get(estado_raw, EstadoMVP.PARCIAL)
        problemas = [str(p).strip() for p in (data.get("problemas") or []) if str(p).strip()][:6]
        return DiagnosticoMVP(
            estado=estado,
            puede_verse=bool(data.get("puede_verse", estado == EstadoMVP.FUNCIONA)),
            veredicto=str(data.get("veredicto") or "").strip()[:600] or "Diagnóstico completado.",
            lo_que_ve_el_usuario=str(data.get("lo_que_ve_el_usuario") or "").strip()[:400],
            problemas=problemas,
            siguiente_paso=str(data.get("siguiente_paso") or "").strip()[:500],
            url=str(senales.get("url") or ""),
        )
