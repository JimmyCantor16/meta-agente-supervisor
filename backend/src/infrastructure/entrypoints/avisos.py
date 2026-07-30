"""Quién avisa cuando hay tres aparatos escuchando lo mismo.

El problema, en palabras del usuario: «no se ven las notificaciones en
escritorio y móvil cuando lo hace la web» y, cuando se ven, «suena tres veces».
Las dos quejas son la misma moneda: los tres aparatos oyen el mismo canal, así
que o no se enteran o se enteran todos a la vez y el ruido molesta.

La solución es un turno: para cada acontecimiento (una clave corta que lo
identifica) el PRIMER aparato que lo reclama se queda con el aviso sonoro del
sistema; los demás lo muestran dentro de la app, en silencio. Así el usuario se
entera una vez, pero puede volver a cualquiera de los tres y ver que pasó.

Vive en memoria a propósito: un turno caducado no vale nada, y si el servidor se
reinicia lo peor que ocurre es que un aviso suene dos veces.
"""

from __future__ import annotations

import threading
import time

# Cuánto dura un turno. Suficiente para cubrir el desfase entre aparatos (uno
# puede estar despertando de la suspensión) sin silenciar el evento siguiente.
_VIGENCIA_S = 120.0
# Tope de claves recordadas: sin él, una sesión larga crece sin freno.
_MAXIMO = 500

_turnos: dict[str, tuple[str, float]] = {}
_candado = threading.Lock()


def _purgar(ahora: float) -> None:
    """Quita los turnos caducados. Se llama con el candado tomado."""
    for clave in [k for k, (_, ts) in _turnos.items() if ahora - ts > _VIGENCIA_S]:
        _turnos.pop(clave, None)
    if len(_turnos) > _MAXIMO:
        # Los más viejos primero: el aviso reciente es el que importa.
        for clave, _ in sorted(_turnos.items(), key=lambda kv: kv[1][1])[: len(_turnos) - _MAXIMO]:
            _turnos.pop(clave, None)


def reclamar_aviso(clave: str, cliente: str) -> bool:
    """True si a este aparato le toca hacer sonar el aviso del sistema.

    Es idempotente por aparato: si el mismo cliente vuelve a preguntar por la
    misma clave (porque reconectó y el evento le llegó de nuevo), sigue siendo
    suyo. Lo que no puede es robárselo a otro.
    """
    clave = (clave or "").strip()[:200]
    cliente = (cliente or "").strip()[:80]
    if not clave or not cliente:
        return True  # sin datos para coordinar, mejor avisar que callar

    ahora = time.monotonic()
    with _candado:
        _purgar(ahora)
        dueno = _turnos.get(clave)
        if dueno is None:
            _turnos[clave] = (cliente, ahora)
            return True
        return dueno[0] == cliente
