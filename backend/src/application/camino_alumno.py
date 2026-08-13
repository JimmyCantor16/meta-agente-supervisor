"""Caso de uso del CAMINO del alumno: racha, cursos, certificados y próximo paso.

La señal de hábito se calcula EN EL SERVIDOR a partir de lo que ya se
registra — nada de contadores en el cliente que se pierden al cambiar de
dispositivo o al borrar el navegador. Todo sale de fuentes reales:

  · `ActividadRepositoryPort` — un día por fila; lo alimenta el circuito del
    profesor cada vez que el alumno hace algo verificable.
  · `CursoRepositoryPort` — progreso real de cada curso (clases completadas,
    graduado) y su syllabus (título, tema, título de la clase actual).
  · `MetaRepositoryPort` (opcional) — las metas de proceso, si se inyectan.

Zona horaria — decisión documentada: se usa la FECHA LOCAL DEL SERVIDOR
(`date.today()`), la misma que debe usar quien registra la actividad. Ser
consistentes entre escribir y leer importa más que acertar la zona del
usuario: mezclar UTC al leer con hora local al escribir partiría rachas
reales alrededor de la medianoche.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from src.domain.ports import (
    ActividadRepositoryPort,
    CursoRepositoryPort,
    MetaRepositoryPort,
)

logger = logging.getLogger(__name__)


class CaminoAlumnoUseCase:
    """Resume el camino de un alumno: hábito (racha), cursos y certificados."""

    def __init__(
        self,
        actividad: ActividadRepositoryPort,
        cursos: CursoRepositoryPort,
        metas: MetaRepositoryPort | None = None,
    ) -> None:
        self._actividad = actividad
        self._cursos = cursos
        self._metas = metas

    def resumen(self, usuario: str) -> dict:
        """El camino completo de un usuario, listo para pintar en el frontend.

        Devuelve: racha_dias, actividad_semana (7 bools, de hace 6 días a hoy),
        cursos (progreso real de cada uno), certificados (los graduados),
        proximo_paso (el primer curso no graduado con su clase actual) y metas
        (vacío si no se inyectó el repositorio de metas).
        """
        hoy = date.today()  # fecha local del servidor (ver docstring del módulo)
        dias = self._dias_con_actividad(usuario)

        cursos_dto: list[dict] = []
        certificados: list[dict] = []
        proximo_paso: dict | None = None
        for progreso in self._cursos.cursos_de(usuario):
            syllabus = self._cursos.cargar_syllabus(progreso.curso_id)
            # Un syllabus corrupto no debe tumbar el camino: se degrada al
            # nombre del proyecto, que siempre existe en el progreso.
            titulo = syllabus.titulo_curso if syllabus else progreso.proyecto
            tema = syllabus.tema if syllabus else ""
            cursos_dto.append({
                "curso_id": progreso.curso_id,
                "proyecto": progreso.proyecto,
                "titulo": titulo,
                "tema": tema,
                "total_clases": progreso.total_clases,
                "completadas": len(progreso.completadas),
                "clase_actual": progreso.clase_actual,
                "graduado": progreso.graduado,
            })
            if progreso.graduado:
                # La graduación aún no persiste su fecha (curso_progreso no la
                # guarda): se deja vacía antes que inventar una. Cuando se
                # persista, este es el único sitio que hay que tocar.
                certificados.append({
                    "curso": titulo,
                    "curso_id": progreso.curso_id,
                    "fecha": "",
                })
            elif proximo_paso is None:
                clase_titulo = ""
                if syllabus:
                    clase_titulo = next(
                        (c.titulo for c in syllabus.clases
                         if c.numero == progreso.clase_actual),
                        "",
                    )
                proximo_paso = {
                    "curso_id": progreso.curso_id,
                    "titulo": titulo,
                    "clase_actual": progreso.clase_actual,
                    "clase_titulo": clase_titulo,
                    "total_clases": progreso.total_clases,
                }

        metas_dto: list[dict] = []
        if self._metas is not None:
            for meta in self._metas.de_usuario(usuario):
                hechos, total = meta.progreso
                metas_dto.append({
                    "id": meta.id,
                    "objetivo": meta.objetivo,
                    "hitos_hechos": hechos,
                    "hitos_total": total,
                })

        return {
            "racha_dias": self._racha(dias, hoy),
            # De hace 6 días (índice 0) a hoy (índice 6): cronológico, para
            # pintarse de izquierda a derecha sin reordenar en el cliente.
            "actividad_semana": [
                (hoy - timedelta(days=6 - i)) in dias for i in range(7)
            ],
            "cursos": cursos_dto,
            "certificados": certificados,
            "proximo_paso": proximo_paso,
            "metas": metas_dto,
        }

    # ------------------------------------------------------------------
    def _dias_con_actividad(self, usuario: str) -> set[date]:
        """Los días con actividad, como fechas; una entrada ilegible se salta."""
        dias: set[date] = set()
        for f in self._actividad.fechas_de(usuario):
            try:
                dias.add(date.fromisoformat(str(f)[:10]))
            except ValueError:
                logger.warning("Fecha de actividad ilegible en camino: %r", f)
        return dias

    @staticmethod
    def _racha(dias: set[date], hoy: date) -> int:
        """Días consecutivos de actividad terminando hoy (o ayer).

        La racha NO se rompe hasta medianoche: si hoy aún no hay actividad se
        ancla en ayer — el alumno que estudió 3 días seguidos y abre la app a
        las 9 am del cuarto debe ver «3», no «0». Un hueco de un día completo
        sí la corta.
        """
        ancla = hoy if hoy in dias else hoy - timedelta(days=1)
        if ancla not in dias:
            return 0
        racha = 0
        dia = ancla
        while dia in dias:
            racha += 1
            dia -= timedelta(days=1)
        return racha
