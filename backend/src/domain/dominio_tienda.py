"""Contrato del DOMINIO de una TIENDA generada.

Por qué existe, además de `dominio_app.py`
------------------------------------------
`DominioApp` describe una app de **una entidad**: se guardan registros y se
listan. Sirve para catas, gastos, citas o inventario, y es la forma correcta
para la mayoría de los encargos.

Una tienda NO cabe ahí, y forzarla fue un error real: quien pidió «un carrito
de compras» recibió un CRUD de «Pedidos» donde el usuario elegía UN producto de
un desplegable y **escribía el total a mano**. Eso no es una tienda; es el
formulario con el que un empleado apunta pedidos ajenos.

Una tienda tiene tres cosas que la entidad única no puede expresar:

1. **Un catálogo que se mira antes de comprar**, con precio a la vista y sin
   pedir cuenta. Una tienda que exige registrarse para ver qué vende no vende.
2. **Un pedido con VARIAS líneas** (producto × cantidad). Es una relación
   uno-a-muchos, y `DominioApp` solo sabe de campos planos.
3. **Un total que se CALCULA**, nunca se teclea. Es la diferencia entre un
   sistema de información y un formulario: si el usuario escribe el total,
   el software no está haciendo la única cuenta que importa.

Es dominio puro: describe QUÉ vende la tienda, sin saber de FastAPI, de
SQLAlchemy ni de HTML.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

#: Cuántos productos se aceptan. Menos de cuatro no llena una rejilla y la
#: tienda parece a medio montar; más de veinte y el modelo empieza a repetirse.
MINIMO_PRODUCTOS = 4
MAXIMO_PRODUCTOS = 20

#: Categorías visibles como filtro. Con una sola no hay nada que filtrar, y
#: pasadas seis el filtro estorba más de lo que ayuda.
MAXIMO_CATEGORIAS = 6

_ACENTOS = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")


def _sin_acentos(texto: str) -> str:
    """Para comparar textos que el modelo escribe con o sin tilde."""
    return (texto or "").translate(_ACENTOS).strip().lower()


def _a_identificador(texto: str) -> str:
    """Convierte cualquier etiqueta en un nombre técnico válido."""
    base = _sin_acentos(texto)
    base = re.sub(r"[^a-z0-9]+", "_", base).strip("_")
    if not base or base[0].isdigit():
        base = f"c_{base}" if base else "general"
    return base[:30]


def _numero(bruto: object) -> float | None:
    """Rescata un número de lo que escriba el modelo. None si no hay ninguno.

    Los modelos escriben «$ 1.250,50», «1,250.50» o «12 kg». Acertar con el
    separador decimal no es cosmético: equivocarse no da un precio feo, da uno
    CIEN VECES MAYOR, y ese precio va a la etiqueta y al total que paga alguien.
    """
    if bruto is None:
        return None
    texto = str(bruto).strip()
    if not texto:
        return None
    limpio = re.sub(r"[^\d,.\-]", "", texto)
    if not limpio:
        return None
    corte = max(limpio.rfind(","), limpio.rfind("."))
    if corte == -1:
        numerico = limpio
    else:
        decimales = limpio[corte + 1 :]
        # Tres dígitos tras el último separador = miles (1.850 / 1,850). Es la
        # convención en dinero; con uno o dos, es la parte decimal.
        if len(decimales) == 3 and decimales.isdigit():
            numerico = re.sub(r"[,.]", "", limpio)
        else:
            numerico = re.sub(r"[,.]", "", limpio[:corte]) + "." + decimales
    try:
        return float(numerico)
    except ValueError:
        return None


class Producto(BaseModel):
    """Algo que la tienda vende."""

    nombre: str = Field(..., description="Cómo se llama. P. ej. 'Camisa de lino'.")
    precio: float = Field(default=0.0, description="Precio unitario, solo la cifra.")
    descripcion: str = Field(default="", description="Una línea que ayude a decidir.")
    categoria: str = Field(default="", description="A qué sección pertenece.")
    #: Unidades disponibles. Es lo que permite que el carrito diga «quedan 3» en
    #: vez de aceptar una compra que la tienda no puede cumplir.
    stock: int = Field(default=12, ge=0)

    @field_validator("precio", mode="before")
    @classmethod
    def _precio_numerico(cls, v: object) -> float:
        return _numero(v) or 0.0

    @field_validator("stock", mode="before")
    @classmethod
    def _stock_entero(cls, v: object) -> int:
        numero = _numero(v)
        return max(0, int(numero)) if numero is not None else 12

    @field_validator("nombre", "descripcion", "categoria", mode="before")
    @classmethod
    def _texto(cls, v: object) -> str:
        return str(v or "").strip()[:200]


class DominioTienda(BaseModel):
    """Lo que hay que saber para construir la tienda de esta idea."""

    app_name: str = Field(..., description="Título visible. P. ej. 'Ropa Aurora'.")
    #: Qué vende, en plural y en lenguaje de la calle ('camisas', 'café').
    #: Se usa en los textos: «Aún no has comprado camisas».
    rubro: str = Field(default="productos")
    tono: str = Field(default="vivo", description="cálido | frío | sobrio | vivo | neutro")
    motor: Literal["sqlite", "mysql", "postgres"] = "sqlite"
    #: Símbolo que acompaña a los precios. Solo presentación: los importes se
    #: guardan como número, nunca como texto con símbolo dentro.
    moneda: str = Field(default="$", max_length=4)
    #: Coste de envío que se suma al total. 0 = envío gratis, y se dice así.
    envio: float = Field(default=0.0, ge=0)
    categorias: list[str] = Field(default_factory=list)
    productos: list[Producto] = Field(default_factory=list)

    @field_validator("envio", mode="before")
    @classmethod
    def _envio_numerico(cls, v: object) -> float:
        return _numero(v) or 0.0

    @property
    def tabla(self) -> str:
        """Base de datos del proyecto, derivada del nombre."""
        return _a_identificador(self.app_name) or "tienda"

    def sanear(self) -> DominioTienda:
        """Devuelve una tienda CONSTRUIBLE, corrigiendo lo que venga mal.

        El modelo se equivoca: repite productos, deja precios en cero, inventa
        categorías que no declaró. Antes que fallar la generación entera se
        corrige aquí — pero con un límite: una tienda **sin productos** no se
        arregla rellenando de humo, así que esa sí se rechaza (devuelve una
        tienda vacía y el llamador decide). Un catálogo con «Producto 1» dentro
        es peor que no entregar la tienda.
        """
        vistos: set[str] = set()
        limpios: list[Producto] = []
        for p in self.productos:
            clave = _sin_acentos(p.nombre)
            if not clave or clave in vistos:
                continue
            vistos.add(clave)
            limpios.append(p)
            if len(limpios) >= MAXIMO_PRODUCTOS:
                break

        # Las categorías salen de lo declarado MÁS lo que usan los productos:
        # el modelo suele etiquetar un producto con una sección que se le olvidó
        # declarar, y perder el filtro por eso sería absurdo.
        declaradas = [c.strip() for c in self.categorias if (c or "").strip()]
        for p in limpios:
            if p.categoria and not any(_sin_acentos(c) == _sin_acentos(p.categoria) for c in declaradas):
                declaradas.append(p.categoria)
        categorias: list[str] = []
        for c in declaradas:
            if not any(_sin_acentos(c) == _sin_acentos(x) for x in categorias):
                categorias.append(c[:60])
            if len(categorias) >= MAXIMO_CATEGORIAS:
                break

        # Un producto sin categoría válida cae en la primera: mejor una sección
        # de más que un hueco en el filtro.
        respaldo = categorias[0] if categorias else "General"
        finales: list[Producto] = []
        for p in limpios:
            real = next(
                (c for c in categorias if _sin_acentos(c) == _sin_acentos(p.categoria)),
                respaldo,
            )
            # Un precio de cero convierte la tienda en un catálogo de regalos y
            # deja el total siempre en 0. Se le pone un precio de continuidad
            # antes que entregar una tienda que no cobra.
            precio = round(p.precio, 2) if p.precio > 0 else 1000.0
            finales.append(
                p.model_copy(update={"categoria": real, "precio": precio})
            )
        if not categorias and finales:
            categorias = [respaldo]

        return self.model_copy(
            update={
                "productos": finales,
                "categorias": categorias,
                "envio": round(self.envio, 2),
                "moneda": (self.moneda or "$").strip()[:4] or "$",
                "rubro": (self.rubro or "productos").strip()[:40] or "productos",
            }
        )

    @property
    def construible(self) -> bool:
        """Si hay tienda de verdad que construir.

        El mínimo no es uno: una «tienda» con dos artículos se ve como un error
        del generador, no como un negocio, y es justo la impresión que este
        esqueleto existe para evitar.
        """
        return len(self.productos) >= MINIMO_PRODUCTOS
