"""Mock del diagnosticador de MVP: veredicto determinista por las señales.

Con USE_MOCK_LLM=true todo el flujo del diagnóstico funciona sin gastar cupo.
No inventa: lee las mismas señales objetivas y responde coherente con ellas.
"""

from __future__ import annotations

from src.domain.entities import DiagnosticoMVP, EstadoMVP
from src.domain.ports import DiagnosticadorMVPPort


class MockDiagnosticadorMVP(DiagnosticadorMVPPort):
    def diagnosticar(self, proyecto, files, senales, language="es") -> DiagnosticoMVP:
        # Los casos "vacío" (solo API / render roto) ya los resuelve el caso de
        # uso sin llegar aquí. Si llegamos, hay UI y renderiza: funciona o parcial.
        if senales.get("html_con_cuerpo") or senales.get("tiene_frontend"):
            return DiagnosticoMVP(
                estado=EstadoMVP.FUNCIONA,
                puede_verse=True,
                veredicto=(
                    f"Tu sistema «{proyecto}» tiene una pantalla con contenido y "
                    "carga bien: un usuario lo abriría y vería algo real que usar."
                ),
                lo_que_ve_el_usuario="Una interfaz con títulos, secciones y datos.",
                problemas=[],
                siguiente_paso="¡Todo listo para empezar la Clase 1 sobre tu sistema!",
                url=str(senales.get("url") or ""),
            )
        return DiagnosticoMVP(
            estado=EstadoMVP.PARCIAL,
            puede_verse=False,
            veredicto="Tu sistema arranca pero le falta pantalla para disfrutarlo.",
            lo_que_ve_el_usuario="Poco contenido visible.",
            problemas=["Falta una interfaz con lo que el sistema hace."],
            siguiente_paso="Conviene relanzarlo pidiendo una pantalla antes del curso.",
            url=str(senales.get("url") or ""),
        )
