"""Mock del diseñador de spec+plan: contrato determinista, sin gastar cupo."""

from __future__ import annotations

from src.domain.entities import SpecPlan
from src.domain.ports import SpecPlanPort


class MockSpecPlan(SpecPlanPort):
    def disenar(self, idea: str, contexto: str = "", language: str = "es") -> SpecPlan:
        t = (idea or "").lower()
        if any(p in t for p in ("azure", "tablero", "dashboard", "recurso", "informe")):
            return SpecPlan(
                resumen="Un tablero para ver el estado de tus proyectos de un vistazo.",
                pantallas=["Resumen (KPIs)", "Recursos", "Costos"],
                entidades=["Proyecto", "Recurso", "Costo"],
                endpoints=[
                    "GET /api/summary", "GET /api/resources", "GET /api/costs",
                    "GET /api/projects",
                ],
                criterios_visibles=[
                    "Tarjetas con números (KPIs) arriba",
                    "Gráficas de líneas y barras",
                    "Una tabla de recursos con su estado (verde/amarillo/rojo)",
                    "Datos de ejemplo realistas visibles desde el primer arranque",
                ],
                stack_sugerido="Frontend React + backend Express con SQLite y datos semilla.",
            )
        return SpecPlan(
            resumen="Una aplicación web con una pantalla principal usable.",
            pantallas=["Inicio", "Listado", "Detalle"],
            entidades=["Elemento"],
            endpoints=["GET /api/items", "POST /api/items"],
            criterios_visibles=[
                "Una pantalla con contenido visible",
                "Datos de ejemplo desde el primer arranque",
            ],
            stack_sugerido="Frontend + backend con datos semilla.",
        )
