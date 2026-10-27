"""Curso «Desarrollo Fullstack Profesional: Spring Boot con Arquitectura
Hexagonal y Vue 3 con TypeScript». Un archivo por módulo para que cada uno se
pueda revisar (y corregir) sin abrir el curso entero."""

from __future__ import annotations

import random

from src.domain.catalogo import CursoCatalogo, NivelCatalogo
from src.infrastructure.semillas.fullstack.m1_hexagonal import modulo_1
from src.infrastructure.semillas.fullstack.m2_spring import modulo_2
from src.infrastructure.semillas.fullstack.m3_auxiliares import modulo_3
from src.infrastructure.semillas.fullstack.m4_vue import modulo_4
from src.infrastructure.semillas.fullstack.m5_final import modulo_5

CURSO_ID = "fullstack-spring-hexagonal-vue"


def curso_fullstack_hexagonal() -> CursoCatalogo:
    return _barajar(CursoCatalogo(
        id=CURSO_ID,
        # Súbela al corregir contenido: la siembra solo reemplaza si es mayor.
        version=1,
        titulo="Desarrollo Fullstack Profesional: Spring Boot con Arquitectura Hexagonal y Vue 3 con TypeScript",
        descripcion=(
            "Construye un backend Java que no depende de su framework y un frontend Vue 3 tipado "
            "de punta a punta: dominio rico, puertos y adaptadores, Spring Boot 3 con PostgreSQL, "
            "almacenamiento local/S3, emails, Axios y Pinia. Explicaciones paso a paso, código real, "
            "quizzes en cada lección, retos revisados por el tutor IA y certificado al aprobar."
        ),
        nivel=NivelCatalogo.INTERMEDIO,
        tecnologias=["Java 21", "Spring Boot 3", "PostgreSQL", "Vue 3", "TypeScript", "Pinia", "Axios"],
        miniatura="/cursos/fullstack-hexagonal.svg",
        publicado=True,
        modulos=[modulo_1(), modulo_2(), modulo_3(), modulo_4(), modulo_5()],
    ))


def _barajar(curso: CursoCatalogo) -> CursoCatalogo:
    """Reordena las opciones de cada pregunta, de forma estable por su id.

    Al redactar, la correcta tiende a caer en la misma posición (aquí, la B en
    seis de cada diez): «marca siempre la B» aprobaba. Se escribe cómodo y se
    baraja aquí; la semilla por id hace que el orden no cambie entre arranques.
    """
    for evaluacion in curso.evaluaciones():
        for pregunta in evaluacion.preguntas:
            correcta = pregunta.opciones[pregunta.correcta]
            random.Random(pregunta.id).shuffle(pregunta.opciones)
            pregunta.correcta = pregunta.opciones.index(correcta)
    return curso
