"""Profesor SIMULADO (sin IA): guía didáctica determinista para probar sin coste."""

from __future__ import annotations

import logging

from src.domain.entities import GeneratedFile, TeachingGuide
from src.domain.ports import CodeTeacherPort

logger = logging.getLogger(__name__)


class MockCodeTeacher(CodeTeacherPort):
    """Devuelve una guía fija y razonable basada en los archivos leídos."""

    def teach(
        self,
        target_name: str,
        files: list[GeneratedFile],
        language: str = "es",
    ) -> TeachingGuide:
        logger.info("[MOCK] Explicando '%s' sin IA (%d archivos).", target_name, len(files))
        entry = next((f.path for f in files if f.path.endswith("main.py")), files[0].path if files else "")

        return TeachingGuide(
            target=target_name,
            summary=(
                f"[GUÍA SIMULADA] '{target_name}' es un proyecto que puedes leer de a poco. "
                f"Empieza por el archivo principal y sigue de ahí hacia los módulos que usa."
            ),
            steps=[
                f"Abre el archivo de entrada ({entry}) y lee de arriba hacia abajo.",
                "Identifica los imports: te dicen qué otras partes usa.",
                "Sigue cada función y pregúntate qué recibe y qué devuelve.",
                "Ejecuta el proyecto y prueba cambiar un valor para ver qué pasa.",
            ],
            concepts=[
                "Estructura de un proyecto en módulos",
                "Cómo se conectan los archivos mediante imports",
                "Flujo de una petición de principio a fin",
            ],
            next_steps=[
                "Agrega un endpoint o función nueva tú mismo.",
                "Escribe un pequeño test para una función existente.",
                "Cambia un mensaje o valor y confirma el efecto ejecutando el proyecto.",
            ],
        )
