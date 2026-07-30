"""Cuánto lleva gastado cada usuario en el agente experto este mes.

Por qué hace falta: el experto cuesta dinero real por llamada. Sin un tope, un
solo cliente intensivo se come el margen de su plan — y peor: nadie se enteraría
hasta ver la factura. Aquí se lleva la cuenta y se corta a tiempo.

Se guarda en un JSON por mes, no en la base de datos, por una razón concreta: el
gasto del mes pasado no se consulta nunca, y un archivo por mes se puede borrar
o auditar a mano sin migraciones. Si el archivo se corrompe, se empieza el mes
de nuevo: perder la cuenta es menos grave que dejar a alguien sin servicio.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

from src.domain.experto import RegistroGastoPort

logger = logging.getLogger(__name__)


class RegistroGastoArchivo(RegistroGastoPort):
    """Registro de gasto en un archivo JSON, uno por mes."""

    def __init__(self, carpeta: str = "data/gasto-experto") -> None:
        self._carpeta = Path(carpeta)
        self._candado = threading.Lock()

    @staticmethod
    def _mes_actual() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m")

    def _archivo(self) -> Path:
        return self._carpeta / f"{self._mes_actual()}.json"

    def _leer(self) -> dict[str, float]:
        try:
            crudo = self._archivo().read_text(encoding="utf-8")
            datos = json.loads(crudo)
            return {str(k): float(v) for k, v in datos.items()} if isinstance(datos, dict) else {}
        except (OSError, ValueError, TypeError):
            return {}

    def gastado_este_mes(self, usuario: str) -> float:
        with self._candado:
            return self._leer().get(usuario or "anonimo", 0.0)

    def anotar(self, usuario: str, coste_usd: float) -> None:
        if coste_usd <= 0:
            return
        clave = usuario or "anonimo"
        with self._candado:
            datos = self._leer()
            datos[clave] = round(datos.get(clave, 0.0) + float(coste_usd), 6)
            try:
                self._carpeta.mkdir(parents=True, exist_ok=True)
                # Escritura en dos pasos: si el proceso muere a mitad, el archivo
                # bueno sigue ahí en vez de quedar truncado.
                temporal = self._archivo().with_suffix(".json.tmp")
                temporal.write_text(json.dumps(datos, indent=2), encoding="utf-8")
                temporal.replace(self._archivo())
            except OSError as exc:
                logger.warning("No se pudo anotar el gasto del experto: %s", exc)


class RegistroGastoMemoria(RegistroGastoPort):
    """Registro en memoria, para pruebas y para cuando no hay disco escribible."""

    def __init__(self) -> None:
        self._datos: dict[str, float] = {}

    def gastado_este_mes(self, usuario: str) -> float:
        return self._datos.get(usuario or "anonimo", 0.0)

    def anotar(self, usuario: str, coste_usd: float) -> None:
        clave = usuario or "anonimo"
        self._datos[clave] = self._datos.get(clave, 0.0) + max(0.0, float(coste_usd))
