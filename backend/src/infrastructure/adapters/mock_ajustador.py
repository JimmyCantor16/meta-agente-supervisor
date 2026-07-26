"""Ajustador simulado: permite probar la mecánica sin gastar cupo de IA.

Con `USE_MOCK_LLM=true` se puede recorrer el flujo completo (proponer, aplicar,
verificar, revertir) de forma determinista. Hace un cambio real pero inocuo:
añade un comentario al archivo más relevante.
"""

from __future__ import annotations

from src.domain.entities import CambioArchivo, GeneratedFile
from src.domain.ports import AjustadorModuloPort


class MockAjustadorModulo(AjustadorModuloPort):
    """Devuelve un cambio predecible sobre el primer archivo de código."""

    def proponer(
        self,
        target_name: str,
        files: list[GeneratedFile],
        ajuste: str,
        language: str = "es",
    ) -> tuple[list[CambioArchivo], str, str]:
        objetivo = next(
            (f for f in files if f.path.endswith((".js", ".jsx", ".py", ".ts", ".tsx"))),
            files[0] if files else None,
        )
        if objetivo is None:
            return [], "No hay archivos sobre los que trabajar.", ""

        comentario = f"// [simulado] Ajuste pedido: {ajuste}\n"
        if objetivo.path.endswith(".py"):
            comentario = f"# [simulado] Ajuste pedido: {ajuste}\n"

        cambio = CambioArchivo(
            path=objetivo.path,
            contenido_nuevo=comentario + objetivo.content,
        )
        return (
            [cambio],
            f"Para lograr '{ajuste}' se modifica {objetivo.path}. "
            "Este es un cambio simulado para practicar la mecánica sin gastar cupo.",
            "Cómo un cambio pequeño y localizado se verifica ejecutando antes de darlo por bueno.",
        )
