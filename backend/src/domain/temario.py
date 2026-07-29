"""Temario: cuando la idea es más grande que una entrega.

Hay ideas —un SaaS de trading con velas, arbitraje y backtesting; un ERP con
facturación, nómina e inventario— que no caben en una sola construcción. Antes,
el sistema lo intentaba igual y entregaba un amasijo a medio hacer.

Un ingeniero de verdad no responde así. Responde: «esto son ocho clases;
empecemos por el motor de precios en vivo». Eso es lo que describe este módulo:
el temario que convierte una idea inabarcable en un camino con entregas reales.

Y hay una regla que lo sostiene: **cada clase deja algo que funciona por sí
solo**. Nada de andamios a medias esperando la clase siguiente.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Clase(BaseModel):
    """Un paso del camino, con algo utilizable al final."""

    numero: int = Field(..., ge=1)
    titulo: str = Field(..., description="Qué se construye. P. ej. 'Motor de precios en vivo'.")
    entregable: str = Field(
        ...,
        description="Qué podrá hacer el usuario al terminarla, en una frase.",
    )
    porque: str = Field(
        default="",
        description="Por qué va en este punto y no antes o después.",
    )


class Temario(BaseModel):
    """El plan completo para una idea que no cabe en una sola entrega."""

    titulo: str = Field(..., description="Nombre del sistema completo.")
    resumen: str = Field(..., description="Qué será cuando esté terminado.")
    #: Por qué no se entrega de una vez. Se le dice al usuario tal cual.
    motivo: str = Field(
        default="",
        description="Explicación honesta de por qué se hace por partes.",
    )
    clases: list[Clase] = Field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.clases)

    def sanear(self) -> Temario:
        """Renumera y acota. Un temario de 30 clases desanima; uno de 1 no es plan."""
        clases = [c for c in self.clases if c.titulo.strip()][:12]
        renumeradas = [
            c.model_copy(update={"numero": i}) for i, c in enumerate(clases, 1)
        ]
        return self.model_copy(update={"clases": renumeradas})

    def como_markdown(self) -> str:
        """El plan, escrito para que lo lea alguien sin experiencia."""
        lineas = [
            f"# {self.titulo} — plan de construcción",
            "",
            self.resumen.strip(),
            "",
        ]
        if self.motivo:
            lineas += ["## Por qué por partes", "", self.motivo.strip(), ""]
        lineas += [
            f"## El camino: {self.total} clases",
            "",
            "Cada clase deja algo que **funciona por sí solo**. No hay que esperar",
            "al final para tener algo utilizable.",
            "",
        ]
        for c in self.clases:
            estado = "**← empezamos aquí**" if c.numero == 1 else ""
            lineas.append(f"### Clase {c.numero} · {c.titulo} {estado}".rstrip())
            lineas.append("")
            lineas.append(f"Al terminarla podrás: {c.entregable}")
            if c.porque:
                lineas.append("")
                lineas.append(f"*{c.porque}*")
            lineas.append("")
        lineas += [
            "---",
            "",
            "Pide la siguiente clase cuando quieras: se construye sobre lo que ya",
            "tienes, sin empezar de cero.",
            "",
        ]
        return "\n".join(lineas)
