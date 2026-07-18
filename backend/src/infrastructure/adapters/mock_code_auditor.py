"""Auditor SIMULADO (sin IA): informe determinista para probar sin coste."""

from __future__ import annotations

import logging

from src.domain.entities import AuditReport, GeneratedFile, ImprovementSuggestion
from src.domain.ports import CodeAuditorPort

logger = logging.getLogger(__name__)


class MockCodeAuditor(CodeAuditorPort):
    """Devuelve sugerencias fijas y razonables basadas en los archivos leídos."""

    def audit(
        self,
        target_name: str,
        files: list[GeneratedFile],
        language: str = "es",
    ) -> AuditReport:
        logger.info("[MOCK] Auditando '%s' sin IA (%d archivos).", target_name, len(files))
        paths = {f.path for f in files}

        suggestions = [
            ImprovementSuggestion(
                title="Añadir pruebas automatizadas",
                category="tests",
                priority="alta",
                rationale="No se detectan tests; sin ellos, cualquier cambio puede romper algo sin aviso.",
                suggestion="Agregar pruebas con pytest para los endpoints/funciones principales.",
            ),
            ImprovementSuggestion(
                title="Validar y sanear entradas del usuario",
                category="seguridad",
                priority="alta",
                rationale="Las entradas sin validar son la principal fuente de vulnerabilidades.",
                suggestion="Validar tipos y rangos, y devolver errores claros ante datos inválidos.",
            ),
            ImprovementSuggestion(
                title="Agregar manejo de errores y logging",
                category="mantenibilidad",
                priority="media",
                rationale="Facilita diagnosticar fallos en producción.",
                suggestion="Usar el módulo logging y try/except en las operaciones críticas.",
            ),
        ]

        # Sugerencia contextual simple según lo que se encontró.
        if not any(p.lower() == "readme.md" for p in paths):
            suggestions.append(
                ImprovementSuggestion(
                    title="Falta README",
                    category="documentacion",
                    priority="baja",
                    rationale="Sin README, es difícil instalar y usar el proyecto.",
                    suggestion="Añadir un README con instrucciones de instalación y uso.",
                )
            )

        return AuditReport(
            target=target_name,
            summary=(
                f"[INFORME SIMULADO] El proyecto '{target_name}' es funcional pero le "
                f"faltan tests, validación de entradas y manejo de errores para ser de producción."
            ),
            suggestions=suggestions,
        )
