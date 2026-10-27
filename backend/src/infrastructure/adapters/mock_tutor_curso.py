"""Tutor del catálogo SIMULADO (`USE_MOCK_LLM=true`): prueba la mecánica sin
gastar cupo. Determinista, para que las pruebas puedan afirmar el resultado:
un reto se aprueba si el código menciona cada criterio por alguna de sus
palabras largas, o si contiene la marca `// ok`.
"""

from __future__ import annotations

import re

from src.domain.catalogo import CursoCatalogo, Leccion, RespuestaTutor, RetoCodigo, VeredictoReto
from src.domain.ports import TutorCursoPort


class MockTutorCurso(TutorCursoPort):
    def explicar(self, curso: CursoCatalogo, leccion: Leccion, pregunta: str, codigo: str = "") -> RespuestaTutor:
        return RespuestaTutor(
            respuesta=(
                f"**(Tutor simulado)** Sobre «{leccion.titulo}»: tu pregunta fue "
                f"*{pregunta[:120]}*. Repasa el primer paso de la lección y vuelve a "
                "leer el fragmento de código con esa idea en mente."
            ),
            siguiente_paso="Intenta explicar con tus palabras qué hace el primer snippet.",
        )

    def revisar_reto(self, curso: CursoCatalogo, reto: RetoCodigo, codigo: str) -> VeredictoReto:
        bajo = codigo.lower()
        cumplidos = [c for c in reto.criterios if "// ok" in bajo or _menciona(c, bajo)]
        aprobado = len(cumplidos) == len(reto.criterios)
        return VeredictoReto(
            aprobado=aprobado,
            puntaje=round(100 * len(cumplidos) / len(reto.criterios)),
            retroalimentacion=(
                "**(Revisor simulado)** Cumples todos los criterios." if aprobado
                else "**(Revisor simulado)** Aún faltan criterios por cubrir."
            ),
            criterios_cumplidos=cumplidos,
            sugerencias=[] if aprobado else ["Revisa los criterios que no aparecen como cumplidos."],
        )


def _menciona(criterio: str, codigo: str) -> bool:
    palabras = [p for p in re.findall(r"[a-záéíóúñ]+", criterio.lower()) if len(p) >= 6]
    return any(p in codigo for p in palabras)
