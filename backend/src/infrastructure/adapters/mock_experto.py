"""Experto SIMULADO: prueba toda la mecánica sin gastar un centavo.

Sigue la convención del proyecto: cada agente de IA tiene su gemelo simulado,
para poder verificar el circuito completo (plan → decisión → intervención →
gasto → aviso en el Monitor) sin clave y sin coste.

No pretende ser inteligente. Pretende ser **verificable**: hace mejoras
deterministas que se pueden comprobar en una prueba — enriquece el dominio,
propone un arreglo, lista mejoras concretas — y cobra un coste ficticio para que
el tope de gasto se pueda probar de verdad.
"""

from __future__ import annotations

import logging

from src.domain.experto import AgenteExpertoPort, AporteExperto, MomentoExperto

logger = logging.getLogger(__name__)

#: Coste ficticio por intervención. Con estos números el tope de Studio ($4) se
#: agota en 20 intervenciones, así que la prueba del tope es corta.
_COSTE = {
    MomentoExperto.DISENO: 0.20,
    MomentoExperto.RESCATE: 0.30,
    MomentoExperto.REPASO: 0.15,
}


class MockAgenteExperto(AgenteExpertoPort):
    """Gemelo simulado del experto: mismas decisiones, cero coste real."""

    @property
    def disponible(self) -> bool:
        return True

    def aportar(self, momento: MomentoExperto, contexto: dict) -> AporteExperto:
        if momento is MomentoExperto.DISENO:
            return self._disenar(contexto)
        if momento is MomentoExperto.RESCATE:
            return self._rescatar(contexto)
        return self._repasar(contexto)

    # -- los tres momentos ---------------------------------------------------
    def _disenar(self, contexto: dict) -> AporteExperto:
        """Replantea la respuesta y mejora el dominio que propusieron los gratuitos.

        Hace dos cosas, en orden de importancia:

        Primero mira si el encargo pedía **varios subsistemas** y los modelos
        gratuitos lo aplanaron a un solo CRUD. Ese es el error caro: el cliente
        pidió tres cosas y recibió una, sin que nadie se lo dijera.

        Después, lo que hace un ingeniero al revisar un modelo pobre: añade la
        fecha (sin ella no se puede ordenar ni ver evolución) y, si hay algún
        número, el promedio — porque un total sin promedio no responde
        «¿vamos bien?».
        """
        replanteo = self._detectar_aplanamiento(contexto)
        dominio = dict(contexto.get("dominio") or {})
        campos = list(dominio.get("campos") or [])
        if not campos:
            return AporteExperto(momento=MomentoExperto.DISENO, resumen="Nada que mejorar.")

        nombres = {str(c.get("nombre") or "").lower() for c in campos}
        añadidos: list[str] = []

        if not any(str(c.get("tipo")) == "fecha" for c in campos) and len(campos) < 8:
            campos.append({
                "nombre": "fecha", "etiqueta": "Fecha", "tipo": "fecha",
                "obligatorio": True,
                "ayuda": "Sin fecha no se puede ordenar ni ver la evolución.",
            })
            añadidos.append("fecha")

        if "notas" not in nombres and len(campos) < 8:
            campos.append({
                "nombre": "notas", "etiqueta": "Notas", "tipo": "texto_largo",
                "obligatorio": False, "ayuda": "El detalle que no cabe en un campo suelto.",
            })
            añadidos.append("notas")

        numericos = [
            str(c.get("nombre")) for c in campos
            if str(c.get("tipo")) in ("entero", "decimal")
        ]
        calculos = list(dominio.get("calculos") or [])
        ya_calculado = {
            (str(c.get("campo")), str(c.get("operacion") or c.get("tipo"))) for c in calculos
        }
        for campo in numericos[:1]:
            if (campo, "promedio") not in ya_calculado:
                calculos.append({
                    "operacion": "promedio", "campo": campo,
                    "etiqueta": f"Promedio de {campo}",
                })
                añadidos.append(f"promedio de {campo}")

        if not añadidos and not replanteo:
            return AporteExperto(
                momento=MomentoExperto.DISENO,
                resumen="El modelo de datos ya estaba bien planteado.",
                modelo="experto-simulado",
            )

        dominio["campos"] = campos
        dominio["calculos"] = calculos
        datos: dict = {"dominio": dominio}
        partes: list[str] = []
        if replanteo:
            datos.update(replanteo["datos"])
            partes.append(replanteo["resumen"])
        if añadidos:
            partes.append("modelo reforzado: " + ", ".join(añadidos))

        return AporteExperto(
            momento=MomentoExperto.DISENO,
            resumen=" · ".join(partes),
            datos=datos,
            coste_usd=_COSTE[MomentoExperto.DISENO],
            modelo="experto-simulado",
        )

    #: Palabras que delatan un subsistema propio dentro de un mismo encargo.
    #: Cada grupo es un área que en la vida real se construye aparte.
    _AREAS = {
        "facturación": ("factur", "cobr", "cartera", "cuenta por cobrar"),
        "nómina": ("nómina", "nomina", "sueldo", "quincena", "empleado", "anticipo"),
        "inventario": ("inventario", "bodega", "stock", "existencia", "lote"),
        "compras": ("compra", "proveedor", "orden de compra"),
        "reportes": ("reporte", "informe", "tablero", "dashboard"),
    }

    def _detectar_aplanamiento(self, contexto: dict) -> dict | None:
        """¿El encargo pedía varios subsistemas y se respondió con uno solo?

        Es el fallo que más caro sale: el cliente pide facturación, nómina e
        inventario, y recibe un CRUD de facturas sin que nadie mencione que
        faltan dos terceras partes. La respuesta honesta es un plan por clases
        que diga qué se entrega hoy y en qué orden viene el resto.
        """
        if contexto.get("tipo_propuesto") != "crud_login":
            return None  # ya se planteó por clases o es otra cosa

        texto = str(contexto.get("prompt") or "").lower()
        areas = [
            nombre for nombre, pistas in self._AREAS.items()
            if any(p in texto for p in pistas)
        ]
        if len(areas) < 2:
            return None  # un solo asunto: el CRUD es la respuesta correcta

        dominio = contexto.get("dominio") or {}
        nombre = str(dominio.get("app_name") or "Tu sistema")
        clases = [
            {
                "numero": i,
                "titulo": area.capitalize(),
                "entregable": f"Gestionar {area} de principio a fin, funcionando por sí solo.",
                "porque": (
                    "Es lo que más duele hoy, así que va primero."
                    if i == 1
                    else f"Se apoya en lo anterior: sin eso, {area} no cuadra."
                ),
            }
            for i, area in enumerate(areas, 1)
        ]
        return {
            "resumen": (
                f"replanteado: el encargo pedía {len(areas)} subsistemas "
                f"({', '.join(areas)}) y se respondía con uno solo"
            ),
            "datos": {
                "tipo": "por_clases",
                "temario": {
                    "titulo": nombre,
                    "resumen": f"Sistema completo para {', '.join(areas)}.",
                    "motivo": (
                        "Son tres cosas distintas que en la vida real se construyen "
                        "aparte. Entregarlas todas a medias no le sirve a nadie: "
                        "mejor una funcionando de verdad y las demás con fecha."
                    ),
                    "clases": clases,
                },
            },
        }

    def _rescatar(self, contexto: dict) -> AporteExperto:
        """Saca la construcción del bucle en que los gratuitos se atascaron."""
        error = str(contexto.get("error") or "").strip()
        archivo = str(contexto.get("archivo") or "").strip()
        if not error:
            return AporteExperto(momento=MomentoExperto.RESCATE, resumen="Sin error que analizar.")
        return AporteExperto(
            momento=MomentoExperto.RESCATE,
            resumen=f"Diagnóstico del atasco en {archivo or 'el proyecto'}",
            datos={
                "diagnostico": (
                    "El bucle repetía el mismo cambio porque atacaba el síntoma. "
                    f"La causa está en: {error[:160]}"
                ),
                "archivo": archivo,
            },
            coste_usd=_COSTE[MomentoExperto.RESCATE],
            modelo="experto-simulado",
        )

    def _repasar(self, contexto: dict) -> AporteExperto:
        """Mira lo entregado y dice qué falta para que no parezca genérico."""
        rutas = [str(r) for r in (contexto.get("archivos") or [])]
        if not rutas:
            return AporteExperto(momento=MomentoExperto.REPASO, resumen="Nada que repasar.")

        mejoras: list[str] = []
        if not any(r.endswith("README.md") for r in rutas):
            mejoras.append("Falta un README que explique cómo arrancarlo.")
        if not any("test" in r.lower() for r in rutas):
            mejoras.append("No hay ninguna prueba: un cambio futuro rompería sin avisar.")
        if not any(r.endswith(".css") for r in rutas):
            mejoras.append("Los estilos van dentro del HTML: cuesta cambiar el aspecto.")
        if not mejoras:
            mejoras.append("La estructura está completa; el siguiente paso es el contenido real.")

        return AporteExperto(
            momento=MomentoExperto.REPASO,
            resumen=f"{len(mejoras)} mejora(s) concreta(s) sobre {len(rutas)} archivos",
            datos={"mejoras": mejoras},
            coste_usd=_COSTE[MomentoExperto.REPASO],
            modelo="experto-simulado",
        )
