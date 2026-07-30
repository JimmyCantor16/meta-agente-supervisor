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
        """Mejora el dominio que propusieron los modelos gratuitos.

        Lo que hace es lo que un ingeniero hace de verdad al revisar un modelo de
        datos pobre: añade la fecha (sin ella no se puede ordenar ni filtrar
        nada) y, si hay algún número, añade el promedio — porque un total sin
        promedio no responde «¿vamos bien?».
        """
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

        if not añadidos:
            return AporteExperto(
                momento=MomentoExperto.DISENO,
                resumen="El modelo de datos ya estaba bien planteado.",
                modelo="experto-simulado",
            )

        dominio["campos"] = campos
        dominio["calculos"] = calculos
        return AporteExperto(
            momento=MomentoExperto.DISENO,
            resumen="Modelo de datos reforzado: " + ", ".join(añadidos),
            datos={"dominio": dominio},
            coste_usd=_COSTE[MomentoExperto.DISENO],
            modelo="experto-simulado",
        )

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
