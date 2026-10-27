"""Casos de uso del catálogo de cursos escritos (estilo Platzi).

Depende solo de puertos: el repositorio del catálogo, el tutor IA y, opcional,
el registro de actividad (cada lección completada alimenta la racha de «Mi
camino», igual que una clase del Modo Profesor).

Lo que decide si algo cuenta —un quiz aprobado, una lección completada, un
certificado— se calcula AQUÍ, en el servidor, con las reglas de
`domain/catalogo.py`. El navegador solo envía qué eligió el alumno.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from src.domain.catalogo import (
    CertificadoCatalogo,
    CursoCatalogo,
    ProgresoCatalogo,
    RespuestaTutor,
    ResultadoEvaluacion,
    VeredictoReto,
    corregir,
    curso_sin_respuestas,
    evaluacion_aprobada,
    folio_certificado,
    porcentaje_avance,
    puede_certificarse,
)
from src.domain.ports import (
    ActividadRepositoryPort,
    CatalogoCursosRepositoryPort,
    CatalogoError,
    LeccionBloqueadaError,
    TutorCursoPort,
)

logger = logging.getLogger(__name__)

#: Topes de lo que el alumno puede mandarle al tutor: la cadena gratuita
#: tiene ventanas pequeñas y un pegado gigante solo gastaría cupo.
MAX_PREGUNTA = 2_000
MAX_CODIGO = 8_000


class CatalogoCursosUseCase:
    def __init__(
        self,
        repo: CatalogoCursosRepositoryPort,
        tutor: TutorCursoPort,
        actividad: ActividadRepositoryPort | None = None,
    ) -> None:
        self._repo = repo
        self._tutor = tutor
        self._actividad = actividad

    # ---- lectura ----
    def listar(self, usuario: str = "") -> list[dict]:
        """Cursos publicados, cada uno con el avance del usuario (si hay)."""
        progresos = {p.curso_id: p for p in self._repo.progresos_de(usuario)} if usuario else {}
        salida = []
        for curso in self._repo.listar():
            if not curso.publicado:
                continue
            progreso = progresos.get(curso.id)
            salida.append({
                "id": curso.id,
                "titulo": curso.titulo,
                "descripcion": curso.descripcion,
                "nivel": curso.nivel.value,
                "tecnologias": curso.tecnologias,
                "miniatura": curso.miniatura,
                "modulos": len(curso.modulos),
                "lecciones": len(curso.lecciones()),
                "duracion_min": sum(x.duracion_min for x in curso.lecciones()),
                "avance": porcentaje_avance(curso, progreso),
                "certificado": progreso.certificado is not None if progreso else False,
            })
        return salida

    def detalle(self, curso_id: str, usuario: str = "") -> dict:
        """El curso SIN respuestas, más el progreso del usuario."""
        curso = self._curso(curso_id)
        return {
            "curso": curso_sin_respuestas(curso),
            "progreso": self._vista_progreso(curso, self._progreso(usuario, curso)) if usuario else None,
        }

    # ---- avance ----
    def completar_leccion(self, usuario: str, curso_id: str, leccion_id: str, nombre: str = "") -> dict:
        curso = self._curso(curso_id)
        leccion = curso.leccion(leccion_id)
        if leccion is None:
            raise CatalogoError(f"La lección '{leccion_id}' no existe en este curso.")
        progreso = self._progreso(usuario, curso)
        if leccion.evaluacion and not evaluacion_aprobada(leccion.evaluacion, progreso):
            raise LeccionBloqueadaError(
                f"Aprueba el quiz «{leccion.evaluacion.titulo}» para completar esta lección."
            )
        self._marcar(progreso, leccion_id)
        self._cerrar(curso, progreso, nombre)
        return self._vista_progreso(curso, progreso)

    def evaluar(
        self, usuario: str, curso_id: str, evaluacion_id: str, respuestas: dict[str, int], nombre: str = ""
    ) -> dict:
        curso = self._curso(curso_id)
        evaluacion = curso.evaluacion(evaluacion_id)
        if evaluacion is None:
            raise CatalogoError(f"La evaluación '{evaluacion_id}' no existe en este curso.")
        puntaje, resultados = corregir(evaluacion, respuestas)
        progreso = self._progreso(usuario, curso)
        mejor = max(puntaje, progreso.puntajes.get(evaluacion_id, 0))
        progreso.puntajes[evaluacion_id] = mejor
        aprobado = puntaje >= evaluacion.aprobacion_minima
        # Aprobar el quiz de una lección la completa: es su prueba de lectura.
        leccion = curso.leccion_de_evaluacion(evaluacion_id)
        if aprobado and leccion:
            self._marcar(progreso, leccion.id)
        else:
            self._guardar(progreso)
        self._cerrar(curso, progreso, nombre)
        resultado = ResultadoEvaluacion(
            evaluacion_id=evaluacion_id,
            puntaje=puntaje,
            aprobado=aprobado,
            mejor_puntaje=mejor,
            aprobacion_minima=evaluacion.aprobacion_minima,
            resultados=resultados,
        )
        return {"resultado": resultado.model_dump(), "progreso": self._vista_progreso(curso, progreso)}

    # ---- tutor IA ----
    def revisar_reto(self, usuario: str, curso_id: str, reto_id: str, codigo: str) -> dict:
        curso = self._curso(curso_id)
        hallado = curso.reto(reto_id)
        if hallado is None:
            raise CatalogoError(f"El reto '{reto_id}' no existe en este curso.")
        codigo = (codigo or "").strip()
        if not codigo:
            raise ValueError("Escribe tu solución antes de enviarla.")
        if len(codigo) > MAX_CODIGO:
            raise ValueError(f"El código supera {MAX_CODIGO} caracteres: envía solo la parte del reto.")
        reto, _ = hallado
        veredicto: VeredictoReto = self._tutor.revisar_reto(curso, reto, codigo)
        progreso = self._progreso(usuario, curso)
        if veredicto.aprobado and reto_id not in progreso.retos_superados:
            progreso.retos_superados.append(reto_id)
        self._guardar(progreso)
        self._registrar_actividad(usuario)
        return {"veredicto": veredicto.model_dump(), "progreso": self._vista_progreso(curso, progreso)}

    def preguntar_tutor(self, curso_id: str, leccion_id: str, pregunta: str, codigo: str = "") -> RespuestaTutor:
        curso = self._curso(curso_id)
        leccion = curso.leccion(leccion_id)
        if leccion is None:
            raise CatalogoError(f"La lección '{leccion_id}' no existe en este curso.")
        pregunta = (pregunta or "").strip()
        if not pregunta:
            raise ValueError("Escribe tu pregunta.")
        if len(pregunta) > MAX_PREGUNTA or len(codigo or "") > MAX_CODIGO:
            raise ValueError("La pregunta es demasiado larga: resúmela o envía solo el fragmento que te interesa.")
        return self._tutor.explicar(curso, leccion, pregunta, (codigo or "").strip())

    def certificado(self, usuario: str, curso_id: str) -> CertificadoCatalogo | None:
        curso = self._curso(curso_id)
        progreso = self._repo.obtener_progreso(usuario, curso.id)
        return progreso.certificado if progreso else None

    # ---- siembra ----
    def sembrar(self, cursos: list[CursoCatalogo]) -> list[str]:
        """Guarda cada curso si falta o si la semilla trae una versión MAYOR.

        Idempotente: se llama en cada arranque. Devuelve los ids escritos.
        """
        escritos = []
        for curso in cursos:
            actual = self._repo.obtener(curso.id)
            if actual is None or curso.version > actual.version:
                self._repo.guardar(curso)
                escritos.append(curso.id)
        return escritos

    # ------------------------------------------------------------------
    def _curso(self, curso_id: str) -> CursoCatalogo:
        curso = self._repo.obtener(curso_id)
        if curso is None or not curso.publicado:
            raise CatalogoError(f"El curso '{curso_id}' no existe.")
        return curso

    def _progreso(self, usuario: str, curso: CursoCatalogo) -> ProgresoCatalogo:
        return self._repo.obtener_progreso(usuario, curso.id) or ProgresoCatalogo(
            usuario=usuario, curso_id=curso.id
        )

    def _marcar(self, progreso: ProgresoCatalogo, leccion_id: str) -> None:
        if leccion_id not in progreso.lecciones_completadas:
            progreso.lecciones_completadas.append(leccion_id)
        progreso.ultima_leccion = leccion_id
        self._guardar(progreso)
        self._registrar_actividad(progreso.usuario)

    def _cerrar(self, curso: CursoCatalogo, progreso: ProgresoCatalogo, nombre: str) -> None:
        """Emite el certificado la primera vez que el curso queda completo."""
        if progreso.certificado is None and puede_certificarse(curso, progreso):
            emitido = datetime.now(timezone.utc).isoformat()
            progreso.certificado = CertificadoCatalogo(
                folio=folio_certificado(progreso.usuario, curso.id, emitido),
                curso_id=curso.id,
                titulo_curso=curso.titulo,
                nombre=nombre,
                emitido=emitido,
            )
            self._guardar(progreso)
            logger.info("Certificado emitido: curso=%s folio=%s", curso.id, progreso.certificado.folio)

    def _guardar(self, progreso: ProgresoCatalogo) -> None:
        progreso.actualizado = datetime.now(timezone.utc).isoformat()
        self._repo.guardar_progreso(progreso)

    def _registrar_actividad(self, usuario: str) -> None:
        if self._actividad is None:
            return
        try:
            # Fecha LOCAL del servidor, como el resto del camino: mezclar UTC
            # partiría rachas reales de noche.
            self._actividad.registrar(usuario, date.today().isoformat())
        except Exception:  # noqa: BLE001 - la racha es secundaria, nunca tumba el flujo
            logger.warning("No se pudo registrar la actividad de %s.", usuario, exc_info=True)

    @staticmethod
    def _vista_progreso(curso: CursoCatalogo, progreso: ProgresoCatalogo) -> dict:
        return {
            "lecciones_completadas": progreso.lecciones_completadas,
            "puntajes": progreso.puntajes,
            "retos_superados": progreso.retos_superados,
            "ultima_leccion": progreso.ultima_leccion,
            "avance": porcentaje_avance(curso, progreso),
            "evaluaciones_aprobadas": [ev.id for ev in curso.evaluaciones() if evaluacion_aprobada(ev, progreso)],
            "certificado": progreso.certificado.model_dump() if progreso.certificado else None,
        }
