"""Experto DELEGADO: el juicio lo escribe un humano (o un asistente) en un archivo.

Por qué existe. El agente experto de pago cuesta dinero y hace falta una clave.
Pero la pregunta que decide el negocio —«¿se NOTA la diferencia entre planes?»—
no se puede responder sin experto. Este adaptador rompe el bloqueo: sirve un
juicio escrito de antemano en un JSON, con la misma forma que devolvería Claude.

Sirve para tres cosas, y las tres son reales:

  · **Probar la Fase 7 hoy**, sin clave, con un juicio de verdad en vez de un
    mock que solo añade campos por regla fija.
  · **Revisar a mano** una construcción concreta que se atascó, sin pagar por
    una llamada cuando ya sabes qué hay que arreglar.
  · **Fijar un juicio** para que una comparación sea reproducible: dos corridas
    con el mismo archivo dan el mismo resultado, y eso es lo que permite
    demostrar la diferencia entre planes sin que la suerte del modelo se meta.

El formato del archivo es el mismo que devuelve el adaptador real, así que pasar
de aquí a Claude es cambiar una variable de entorno, no reescribir nada.

    {
      "diseno":  {"resumen": "…", "datos": {"dominio": {…}}},
      "rescate": {"resumen": "…", "datos": {"diagnostico": "…", "archivo": "…"}},
      "repaso":  {"resumen": "…", "datos": {"mejoras": ["…"]}}
    }

Un momento que no esté en el archivo simplemente no interviene: el sistema sigue
con los modelos gratuitos, como si no hubiera experto.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from src.domain.experto import AgenteExpertoPort, AporteExperto, MomentoExperto

logger = logging.getLogger(__name__)


class ExpertoDeArchivo(AgenteExpertoPort):
    """Sirve el juicio del experto desde un JSON escrito a mano."""

    def __init__(self, ruta: str, etiqueta: str = "experto-delegado") -> None:
        self._ruta = Path(ruta)
        self._etiqueta = etiqueta

    @property
    def disponible(self) -> bool:
        """Disponible solo si el archivo existe: sin juicio escrito no hay experto."""
        return self._ruta.is_file()

    def _leer(self) -> dict:
        try:
            datos = json.loads(self._ruta.read_text(encoding="utf-8"))
            return datos if isinstance(datos, dict) else {}
        except (OSError, ValueError) as exc:
            logger.warning("No pude leer el juicio del experto en %s: %s", self._ruta, exc)
            return {}

    def aportar(self, momento: MomentoExperto, contexto: dict) -> AporteExperto:
        entrada = self._leer().get(momento.value)
        if not isinstance(entrada, dict) or not entrada.get("datos"):
            logger.info(
                "El juicio delegado no cubre el momento '%s': sigue la cadena gratuita.",
                momento.value,
            )
            return AporteExperto(momento=momento, resumen="Sin juicio escrito para este momento.")

        # El coste es cero porque no hubo llamada de pago. Se deja explícito para
        # que el registro de gasto no mienta: una revisión humana no cuesta API.
        return AporteExperto(
            momento=momento,
            resumen=str(entrada.get("resumen") or "Juicio del experto delegado."),
            datos=entrada["datos"],
            coste_usd=0.0,
            modelo=str(entrada.get("modelo") or self._etiqueta),
        )
