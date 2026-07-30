"""Contrato del DOMINIO de una aplicación generada.

Aquí está la corrección del error que hacía que todas las apps salieran iguales.

Antes: la plantilla tenía UNA entidad fija (`Item` con un campo de texto), así que
daba igual pedir catas de café, gastos o inventario — salía siempre lo mismo.

Ahora: el modelo describe el DOMINIO REAL (qué se guarda, con qué campos y de qué
tipo), y el generador construye la plomería PARA ese dominio. Se conserva lo que
funcionaba —el modelo no escribe cableado, que es donde falla— y se recupera la
variedad, que es lo que hacía falta para que una idea se sienta propia.

Es dominio puro: describe QUÉ es la aplicación, sin saber de FastAPI, de
SQLAlchemy ni de HTML.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

#: Tipos que sabemos construir de punta a punta (columna, validación y control
#: de formulario). Deliberadamente cortos: cada tipo nuevo hay que saber
#: generarlo bien en las cuatro capas, y es preferible pocos y sólidos.
TipoCampo = Literal[
    "texto",        # una línea
    "texto_largo",  # párrafo
    "entero",       # 1, 42
    "decimal",      # 3.5, precios
    "fecha",        # 2026-07-29
    "opcion",       # una de una lista cerrada
    "booleano",     # sí / no
]

#: Cálculos que el sistema sabe hacer sobre una columna numérica.
TipoCalculo = Literal["suma", "promedio", "maximo", "minimo", "conteo"]

_IDENT = re.compile(r"^[a-z][a-z0-9_]{0,29}$")


def _a_identificador(texto: str) -> str:
    """Convierte cualquier etiqueta en un nombre de columna válido."""
    base = (texto or "").strip().lower()
    reemplazos = {"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ñ": "n", "ü": "u"}
    for k, v in reemplazos.items():
        base = base.replace(k, v)
    base = re.sub(r"[^a-z0-9]+", "_", base).strip("_")
    if not base or base[0].isdigit():
        base = f"campo_{base}" if base else "campo"
    return base[:30]


class Campo(BaseModel):
    """Un dato que la aplicación guarda de cada registro."""

    nombre: str = Field(..., description="Identificador interno (columna). Se normaliza solo.")
    etiqueta: str = Field(..., description="Cómo se le llama al usuario. P. ej. 'Puntuación'.")
    tipo: TipoCampo = "texto"
    obligatorio: bool = True
    #: Solo para `opcion`: la lista cerrada de valores posibles.
    opciones: list[str] = Field(default_factory=list)
    #: Solo para números: rango permitido.
    minimo: float | None = None
    maximo: float | None = None
    #: Pista bajo el campo, para que el usuario sepa qué escribir.
    ayuda: str = ""

    @field_validator("nombre", mode="before")
    @classmethod
    def _normalizar(cls, v: object) -> str:
        return _a_identificador(str(v or ""))

    @property
    def es_numerico(self) -> bool:
        return self.tipo in ("entero", "decimal")


class Calculo(BaseModel):
    """Un número derivado que se muestra junto a la lista.

    Es lo que convierte una lista en un sistema de información: no solo guarda,
    también dice algo (el total gastado, la nota media, cuántos hay).
    """

    etiqueta: str = Field(..., description="Cómo se muestra. P. ej. 'Total gastado'.")
    operacion: TipoCalculo = "suma"
    campo: str = Field(default="", description="Sobre qué campo se calcula (vacío para 'conteo').")

    @model_validator(mode="before")
    @classmethod
    def _aceptar_tipo(cls, datos: object) -> object:
        """Acepta `tipo` como sinónimo de `operacion`.

        Los modelos dicen «tipo» con muchísima frecuencia. Sin esto, un cálculo
        que llegaba como {"tipo": "promedio"} caía al valor por omisión y salía
        una SUMA con la etiqueta «Promedio de kilos». Un número mal etiquetado es
        peor que no tenerlo: se toman decisiones con él.
        """
        if isinstance(datos, dict) and "operacion" not in datos and datos.get("tipo"):
            datos = {**datos, "operacion": datos["tipo"]}
        return datos

    @field_validator("campo", mode="before")
    @classmethod
    def _normalizar(cls, v: object) -> str:
        texto = str(v or "").strip()
        return _a_identificador(texto) if texto else ""


class DominioApp(BaseModel):
    """Lo que hay que saber para construir la aplicación de esta idea."""

    app_name: str = Field(..., description="Título visible. P. ej. 'Bitácora de Catas'.")
    entidad: str = Field(..., description="Qué se guarda, en singular. P. ej. 'Cata'.")
    entidad_plural: str = Field(..., description="En plural. P. ej. 'Catas'.")
    campos: list[Campo] = Field(default_factory=list)
    calculos: list[Calculo] = Field(default_factory=list)
    #: Sugerencia de paleta acorde al dominio (el diseño también responde a la idea).
    tono: str = Field(default="neutro", description="cálido | frío | sobrio | vivo | neutro")

    @property
    def tabla(self) -> str:
        """Nombre de la tabla, derivado del plural."""
        return _a_identificador(self.entidad_plural) or "registros"

    @property
    def clase(self) -> str:
        """Nombre de la clase del modelo, en PascalCase."""
        limpio = _a_identificador(self.entidad) or "registro"
        return "".join(parte.capitalize() for parte in limpio.split("_")) or "Registro"

    def campo_por_nombre(self, nombre: str) -> Campo | None:
        return next((c for c in self.campos if c.nombre == nombre), None)

    def sanear(self) -> DominioApp:
        """Devuelve un dominio CONSTRUIBLE, corrigiendo lo que venga mal.

        El modelo se equivoca: pide tipos que no existen, campos duplicados,
        cálculos sobre columnas de texto o listas de opciones vacías. Antes que
        fallar la generación entera, se corrige aquí y se sigue: un dominio algo
        más simple es mejor que ninguna aplicación.
        """
        vistos: set[str] = set()
        limpios: list[Campo] = []
        for campo in self.campos:
            if campo.nombre in vistos or not campo.nombre:
                continue
            # Una opción sin opciones no es una opción: pasa a texto.
            if campo.tipo == "opcion" and len(campo.opciones) < 2:
                campo = campo.model_copy(update={"tipo": "texto", "opciones": []})
            # Rango invertido: se ignora en vez de generar una validación imposible.
            if campo.minimo is not None and campo.maximo is not None and campo.minimo > campo.maximo:
                campo = campo.model_copy(update={"minimo": None, "maximo": None})
            vistos.add(campo.nombre)
            limpios.append(campo)

        # Sin campos no hay aplicación: se cae a uno mínimo pero usable.
        if not limpios:
            limpios = [Campo(nombre="descripcion", etiqueta="Descripción", tipo="texto")]

        # Un cálculo sobre algo que no es número no se puede hacer.
        numericos = {c.nombre for c in limpios if c.es_numerico}
        calculos = [
            c for c in self.calculos
            if c.operacion == "conteo" or c.campo in numericos
        ][:4]

        return self.model_copy(update={"campos": limpios[:8], "calculos": calculos})


#: Dominio de respaldo: si el modelo falla del todo, esto al menos funciona.
DOMINIO_MINIMO = DominioApp(
    app_name="Mi App",
    entidad="Registro",
    entidad_plural="Registros",
    campos=[Campo(nombre="descripcion", etiqueta="Descripción", tipo="texto")],
)
