"""El agente experto: la IA de pago que entra donde la gratis se atasca.

Por qué existe: los modelos gratuitos hacen bien la plomería —escribir un CRUD,
montar un login— pero flojean en lo que da valor: **decidir**. Diseñar un
dominio con criterio, salir de un bucle de reparación que no avanza, mirar el
resultado y decir «esto está genérico, así se arregla».

Ahí entra el experto. No sustituye a la cadena gratuita: entra en tres momentos
concretos, y solo si el plan del usuario lo incluye. Es lo que hace honesto
cobrar por Studio y Business: se paga por juicio, no por más texto.

Este módulo es dominio puro: define QUÉ es una intervención del experto y
CUÁNDO cabe, sin saber nada de Anthropic ni de FastAPI.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum

from pydantic import BaseModel, Field


class MomentoExperto(str, Enum):
    """Los tres puntos donde el juicio de un experto cambia el resultado."""

    #: Antes de construir: diseñar el dominio con criterio (qué campos, qué
    #: cálculos, qué tono) en vez de aceptar lo primero que salga.
    DISENO = "diseno"
    #: A mitad: el bucle de reparación lleva varios intentos devolviendo lo
    #: mismo. Sin rescate, esa generación acaba en una URL retenida.
    RESCATE = "rescate"
    #: Al final: mirar lo entregado y decir qué falta para que no parezca
    #: genérico. Es el paso que separa «funciona» de «se luce».
    REPASO = "repaso"


class AporteExperto(BaseModel):
    """Lo que el experto devuelve cuando interviene."""

    momento: MomentoExperto
    #: Qué hizo, en una frase, para contárselo al usuario en el Monitor.
    resumen: str = Field(default="")
    #: Cambios concretos propuestos. Para DISENO es el dominio mejorado; para
    #: RESCATE, el archivo corregido; para REPASO, la lista de mejoras.
    datos: dict = Field(default_factory=dict)
    #: Coste estimado en dólares de esta intervención. Se acumula contra el tope
    #: del usuario: un cliente intensivo no puede comerse el margen del plan.
    coste_usd: float = Field(default=0.0, ge=0.0)
    #: Qué modelo respondió. Se enseña: el usuario que paga quiere ver por qué.
    modelo: str = Field(default="")


class TopeGastoExcedido(Exception):
    """El usuario agotó su presupuesto de experto para este mes.

    No es un error del sistema: es el tope funcionando. Se traduce a un aviso
    claro y la construcción sigue con los modelos gratuitos.
    """


class AgenteExpertoPort(ABC):
    """Puerto del agente de pago. Implementado por el adaptador real y por el simulado."""

    @abstractmethod
    def aportar(self, momento: MomentoExperto, contexto: dict) -> AporteExperto:
        """Interviene en `momento` con el `contexto` que se le da.

        Nunca debe lanzar por causas normales (sin cupo, respuesta rara): quien
        llama tiene que poder seguir con los modelos gratuitos.
        """

    @property
    @abstractmethod
    def disponible(self) -> bool:
        """False si no está configurado (sin clave, por ejemplo)."""


class RegistroGastoPort(ABC):
    """Puerto para llevar la cuenta de lo que gasta cada usuario al mes."""

    @abstractmethod
    def gastado_este_mes(self, usuario: str) -> float:
        """Dólares ya consumidos por el usuario en el mes en curso."""

    @abstractmethod
    def anotar(self, usuario: str, coste_usd: float) -> None:
        """Suma un gasto al mes en curso."""
