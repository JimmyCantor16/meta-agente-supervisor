"""Catálogo de cursos ESCRITOS (estilo Platzi): curso → módulos → lecciones.

Es la otra cara del Modo Profesor. Allí la IA escribe un temario a medida del
proyecto del alumno (`Syllabus`/`Clase`); aquí el curso ya viene redactado,
revisado y publicado, igual para todos, y la IA hace de TUTOR: explica lo que
el alumno pregunta y revisa sus retos de código. Las dos cosas conviven; no se
mezclan sus entidades porque no tienen el mismo ciclo de vida.

Equivalencias con la nomenclatura en inglés del encargo:
`CursoCatalogo`=Course, `ModuloCurso`=Module, `Leccion`=Lesson,
`Evaluacion`=Evaluation/Quiz, `ProgresoCatalogo`=UserProgress.

Dominio puro: nada de HTTP, SQL ni LLM. Las reglas que deciden (puntaje,
aprobado, qué ve el alumno, cuándo hay certificado) viven aquí para poder
probarlas sin levantar nada.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from enum import Enum
from typing import Iterator

from pydantic import BaseModel, Field, model_validator


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


class NivelCatalogo(str, Enum):
    BASICO = "basico"
    INTERMEDIO = "intermedio"
    AVANZADO = "avanzado"


class PasoExplicado(BaseModel):
    """Un paso de la explicación guiada, opcionalmente con su trozo de código."""

    titulo: str = Field(..., min_length=1)
    explicacion: str = Field(..., min_length=1, description="Markdown.")
    codigo: str = ""
    lenguaje: str = ""


class SnippetCodigo(BaseModel):
    """Un fragmento de código de la lección, con su explicación."""

    id: str = Field(..., min_length=1)
    titulo: str = Field(..., min_length=1)
    lenguaje: str = Field(..., min_length=1, description="java, ts, vue, sql, yaml…")
    archivo: str = Field(default="", description="Dónde viviría en el proyecto.")
    codigo: str = Field(..., min_length=1)
    explicacion: str = ""


class PreguntaOpcion(BaseModel):
    """Pregunta de opción múltiple. `correcta` y `explicacion` NO salen al
    navegador antes de responder (ver `curso_sin_respuestas`)."""

    id: str = Field(..., min_length=1)
    enunciado: str = Field(..., min_length=1)
    opciones: list[str] = Field(..., min_length=2)
    correcta: int = Field(..., ge=0)
    explicacion: str = Field(default="", description="Por qué la correcta lo es.")

    @model_validator(mode="after")
    def _correcta_existe(self) -> "PreguntaOpcion":
        if self.correcta >= len(self.opciones):
            raise ValueError(f"Pregunta {self.id}: 'correcta' fuera de rango.")
        return self


class RetoCodigo(BaseModel):
    """Reto práctico: el alumno escribe código y el tutor IA lo revisa
    contra `criterios`. Es práctica guiada: no bloquea el certificado (que la
    IA esté caída no puede dejar a nadie sin graduarse)."""

    id: str = Field(..., min_length=1)
    enunciado: str = Field(..., min_length=1, description="Markdown.")
    lenguaje: str = Field(..., min_length=1)
    codigo_inicial: str = ""
    criterios: list[str] = Field(..., min_length=1)
    pista: str = ""
    solucion_referencia: str = Field(default="", description="Solo la ve el revisor.")


class Evaluacion(BaseModel):
    """Quiz (y retos opcionales) al final de una lección o de un módulo."""

    id: str = Field(..., min_length=1)
    titulo: str = Field(..., min_length=1)
    preguntas: list[PreguntaOpcion] = Field(default_factory=list)
    retos: list[RetoCodigo] = Field(default_factory=list)
    #: Porcentaje mínimo de aciertos para aprobar (0-100).
    aprobacion_minima: int = Field(default=70, ge=0, le=100)


class Leccion(BaseModel):
    id: str = Field(..., min_length=1)
    orden: int = Field(..., ge=1)
    titulo: str = Field(..., min_length=1)
    resumen: str = ""
    duracion_min: int = Field(default=10, ge=1)
    contenido: str = Field(..., min_length=1, description="Markdown.")
    pasos: list[PasoExplicado] = Field(default_factory=list)
    snippets: list[SnippetCodigo] = Field(default_factory=list)
    evaluacion: Evaluacion | None = None


class ModuloCurso(BaseModel):
    id: str = Field(..., min_length=1)
    orden: int = Field(..., ge=1)
    titulo: str = Field(..., min_length=1)
    descripcion: str = ""
    lecciones: list[Leccion] = Field(default_factory=list)
    #: Evaluación de cierre del módulo (además de las de cada lección).
    evaluacion: Evaluacion | None = None


class CursoCatalogo(BaseModel):
    id: str = Field(..., min_length=1, pattern=r"^[a-z0-9][a-z0-9-]*$")
    #: Sube cuando cambia el contenido sembrado: la semilla reemplaza la
    #: versión guardada solo si la suya es MAYOR (y no pisa nada más nuevo).
    version: int = Field(default=1, ge=1)
    titulo: str = Field(..., min_length=1)
    descripcion: str = ""
    nivel: NivelCatalogo = NivelCatalogo.INTERMEDIO
    tecnologias: list[str] = Field(default_factory=list)
    miniatura: str = Field(default="", description="URL o ruta de la imagen de portada.")
    publicado: bool = False
    modulos: list[ModuloCurso] = Field(default_factory=list)

    @model_validator(mode="after")
    def _ids_unicos(self) -> "CursoCatalogo":
        """Lecciones, evaluaciones, preguntas y retos se piden por id: un id
        repetido haría que el progreso de una lección marcara otra."""
        vistos: set[str] = set()
        for clase, ident in self._todos_los_ids():
            clave = f"{clase}:{ident}"
            if clave in vistos:
                raise ValueError(f"Id repetido en el curso {self.id}: {clase} '{ident}'.")
            vistos.add(clave)
        return self

    def _todos_los_ids(self) -> Iterator[tuple[str, str]]:
        for m in self.modulos:
            yield "modulo", m.id
            for leccion in m.lecciones:
                yield "leccion", leccion.id
        for ev in self.evaluaciones():
            yield "evaluacion", ev.id
            for p in ev.preguntas:
                yield "pregunta", p.id
            for r in ev.retos:
                yield "reto", r.id

    # ---- recorridos ----
    def lecciones(self) -> list[Leccion]:
        return [leccion for m in sorted(self.modulos, key=lambda m: m.orden)
                for leccion in sorted(m.lecciones, key=lambda x: x.orden)]

    def evaluaciones(self) -> list[Evaluacion]:
        evs: list[Evaluacion] = []
        for m in sorted(self.modulos, key=lambda m: m.orden):
            evs.extend(x.evaluacion for x in sorted(m.lecciones, key=lambda x: x.orden) if x.evaluacion)
            if m.evaluacion:
                evs.append(m.evaluacion)
        return evs

    def leccion(self, leccion_id: str) -> Leccion | None:
        return next((x for x in self.lecciones() if x.id == leccion_id), None)

    def evaluacion(self, evaluacion_id: str) -> Evaluacion | None:
        return next((e for e in self.evaluaciones() if e.id == evaluacion_id), None)

    def reto(self, reto_id: str) -> tuple[RetoCodigo, Evaluacion] | None:
        for ev in self.evaluaciones():
            for r in ev.retos:
                if r.id == reto_id:
                    return r, ev
        return None

    def leccion_de_evaluacion(self, evaluacion_id: str) -> Leccion | None:
        return next((x for x in self.lecciones() if x.evaluacion and x.evaluacion.id == evaluacion_id), None)


class CertificadoCatalogo(BaseModel):
    folio: str
    curso_id: str
    titulo_curso: str
    nombre: str = ""
    emitido: str = Field(default_factory=_ahora)


class ProgresoCatalogo(BaseModel):
    usuario: str = Field(..., min_length=1)
    curso_id: str = Field(..., min_length=1)
    lecciones_completadas: list[str] = Field(default_factory=list)
    #: Mejor porcentaje obtenido en cada evaluación (id → 0-100).
    puntajes: dict[str, int] = Field(default_factory=dict)
    retos_superados: list[str] = Field(default_factory=list)
    ultima_leccion: str = ""
    certificado: CertificadoCatalogo | None = None
    actualizado: str = Field(default_factory=_ahora)


class ResultadoPregunta(BaseModel):
    pregunta_id: str
    elegida: int | None
    acierto: bool
    correcta: int
    explicacion: str = ""


class ResultadoEvaluacion(BaseModel):
    evaluacion_id: str
    puntaje: int = Field(..., ge=0, le=100)
    aprobado: bool
    mejor_puntaje: int = Field(..., ge=0, le=100)
    aprobacion_minima: int
    resultados: list[ResultadoPregunta] = Field(default_factory=list)


class VeredictoReto(BaseModel):
    """El juicio del tutor IA sobre el código de un reto."""

    aprobado: bool
    puntaje: int = Field(..., ge=0, le=100)
    retroalimentacion: str = Field(..., min_length=1, description="Markdown.")
    criterios_cumplidos: list[str] = Field(default_factory=list)
    sugerencias: list[str] = Field(default_factory=list)

    model_config = {"extra": "ignore"}


class RespuestaTutor(BaseModel):
    """La respuesta del tutor IA a una duda dentro de una lección."""

    respuesta: str = Field(..., min_length=1, description="Markdown.")
    codigo: str = ""
    lenguaje: str = ""
    siguiente_paso: str = ""

    model_config = {"extra": "ignore"}


# ---------------------------------------------------------------------------
# Reglas
# ---------------------------------------------------------------------------
_OCULTO_PREGUNTA = {"correcta", "explicacion"}
_OCULTO_RETO = {"solucion_referencia"}
_OCULTO_EVALUACION = {
    "preguntas": {"__all__": _OCULTO_PREGUNTA},
    "retos": {"__all__": _OCULTO_RETO},
}


def curso_sin_respuestas(curso: CursoCatalogo) -> dict:
    """El curso tal como lo ve el alumno: sin respuestas ni soluciones.

    Mandar `correcta` al navegador convertiría el quiz en un trámite (basta
    abrir las herramientas de desarrollo), igual que un carrito que aceptara
    el precio del cliente. Se corrige SIEMPRE en el servidor.
    """
    return curso.model_dump(
        mode="json",
        exclude={
            "modulos": {
                "__all__": {
                    "evaluacion": _OCULTO_EVALUACION,
                    "lecciones": {"__all__": {"evaluacion": _OCULTO_EVALUACION}},
                }
            }
        },
    )


def corregir(evaluacion: Evaluacion, respuestas: dict[str, int]) -> tuple[int, list[ResultadoPregunta]]:
    """Corrige un quiz. Una pregunta sin responder cuenta como fallo."""
    resultados = [
        ResultadoPregunta(
            pregunta_id=p.id,
            elegida=respuestas.get(p.id),
            acierto=respuestas.get(p.id) == p.correcta,
            correcta=p.correcta,
            explicacion=p.explicacion,
        )
        for p in evaluacion.preguntas
    ]
    if not resultados:
        return 100, []
    aciertos = sum(1 for r in resultados if r.acierto)
    return round(100 * aciertos / len(resultados)), resultados


def evaluacion_aprobada(evaluacion: Evaluacion, progreso: ProgresoCatalogo) -> bool:
    if not evaluacion.preguntas:
        return True
    return progreso.puntajes.get(evaluacion.id, -1) >= evaluacion.aprobacion_minima


def porcentaje_avance(curso: CursoCatalogo, progreso: ProgresoCatalogo | None) -> int:
    total = len(curso.lecciones())
    if not total or progreso is None:
        return 0
    hechas = len(set(progreso.lecciones_completadas) & {x.id for x in curso.lecciones()})
    return round(100 * hechas / total)


def puede_certificarse(curso: CursoCatalogo, progreso: ProgresoCatalogo) -> bool:
    """Todas las lecciones completadas y todas las evaluaciones aprobadas."""
    hechas = set(progreso.lecciones_completadas)
    return (
        bool(curso.lecciones())
        and all(x.id in hechas for x in curso.lecciones())
        and all(evaluacion_aprobada(ev, progreso) for ev in curso.evaluaciones())
    )


def folio_certificado(usuario: str, curso_id: str, emitido: str) -> str:
    """Folio estable y no adivinable a partir de los datos públicos."""
    huella = hashlib.sha256(f"{usuario}|{curso_id}|{emitido}".encode()).hexdigest()
    return f"MA-{curso_id[:12].upper()}-{huella[:10].upper()}"
