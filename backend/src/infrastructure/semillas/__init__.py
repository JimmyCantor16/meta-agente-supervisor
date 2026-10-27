"""Cursos que se siembran en el catálogo al arrancar.

Para añadir un curso: un módulo nuevo aquí con una función que devuelva su
`CursoCatalogo`, y sumarlo a `cursos_semilla()`. Para corregir uno ya
publicado, se edita y se SUBE su `version`: la siembra solo reemplaza lo
guardado si la versión de la semilla es mayor.
"""

from __future__ import annotations

from src.domain.catalogo import CursoCatalogo


def cursos_semilla() -> list[CursoCatalogo]:
    from src.infrastructure.semillas.fullstack import curso_fullstack_hexagonal

    return [curso_fullstack_hexagonal()]
