"""Prueba: la memoria del sistema ni se pierde en silencio ni se queda sin copia.

Mientras no haya PostgreSQL viva, un solo archivo SQLite guarda usuarios,
licencias, cupos, cursos, progreso, despliegues, trabajos y actividad. Ya pasó
lo peor que podía pasar con él: estaba fuera del disco persistente y se borraba
en CADA deploy, sin un solo aviso, hasta que un usuario volvía y no tenía
cuenta.

Este guion demuestra las dos defensas que se pusieron: que esa situación se
detecta y se grita al arrancar, y que existe una copia que de verdad restaura.

    cd backend
    PYTHONIOENCODING=utf-8 python pruebas/persistencia_no_se_borra.py

Offline: no toca la red ni gasta cupo de ningún modelo.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import get_settings  # noqa: E402
from src.infrastructure.entrypoints.api import _estado_persistencia  # noqa: E402

fallos: list[str] = []


def comprobar(condicion: bool, mensaje: str) -> None:
    print(("  OK   " if condicion else "  FALLA") + " " + mensaje)
    if not condicion:
        fallos.append(mensaje)


def main() -> int:
    base_settings = get_settings()

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as carpeta:
        disco = Path(carpeta) / "generated"
        disco.mkdir()

        fuera = base_settings.model_copy(update={
            "generated_dir": str(disco),
            "db_path": str(Path(carpeta) / "evaluations.db"),
            "database_url": "",
        })
        dentro = base_settings.model_copy(update={
            "generated_dir": str(disco),
            "db_path": str(disco / "metaagente.db"),
            "database_url": "",
        })

        print("\n1. En local no se avisa de nada (no hay disco efímero)")
        os.environ.pop("RENDER", None)
        os.environ.pop("RENDER_SERVICE_ID", None)
        comprobar(not _estado_persistencia(fuera)["riesgo"], "Sin PaaS, sin alarma")

        print("\n2. En el PaaS, una base FUERA del disco se grita")
        os.environ["RENDER"] = "true"
        estado = _estado_persistencia(fuera)
        comprobar(estado["riesgo"], "Detecta la base fuera del disco persistente")
        comprobar("DB_PATH" in estado["resumen"], "Y dice qué hay que cambiar (DB_PATH)")

        print("\n3. Dentro del disco, tranquilidad")
        comprobar(not _estado_persistencia(dentro)["riesgo"], "Base dentro del disco: sin alarma")

        print("\n4. Con PostgreSQL, la pregunta ni se plantea")
        con_pg = fuera.model_copy(update={"database_url": "postgresql://x/y"})
        comprobar(not _estado_persistencia(con_pg)["riesgo"], "PostgreSQL manda y no hay archivo que perder")
        os.environ.pop("RENDER", None)

        print("\n5. La copia restaura de verdad")
        db = disco / "metaagente.db"
        conn = sqlite3.connect(str(db))
        conn.execute("CREATE TABLE cuentas (sub TEXT, plan TEXT)")
        conn.execute("INSERT INTO cuentas VALUES ('ana', 'pro')")
        conn.commit()
        conn.close()

        import src.config as config  # noqa: PLC0415
        original = config.get_settings
        config.get_settings = lambda: dentro  # type: ignore[assignment]
        try:
            from tools import respaldo_db  # noqa: PLC0415

            copia = respaldo_db.respaldar()
            comprobar(copia is not None and copia.is_file(), "Se crea la copia")

            perdida = sqlite3.connect(str(db))
            perdida.execute("DELETE FROM cuentas")
            perdida.commit()
            perdida.close()

            respaldo_db.restaurar(copia.name)
            recuperada = sqlite3.connect(str(db))
            filas = recuperada.execute("SELECT sub, plan FROM cuentas").fetchall()
            recuperada.close()
            comprobar(filas == [("ana", "pro")], "Restaurar devuelve la cuenta borrada")

            for _ in range(7):
                respaldo_db.respaldar(marca=f"prueba-{_}", conservar=3)
            comprobar(len(respaldo_db.copias()) <= 3, "La rotación no deja crecer las copias sin fin")
        finally:
            config.get_settings = original  # type: ignore[assignment]

    print("\n" + ("=== FIN OK ===" if not fallos else "=== FALLOS: %d ===" % len(fallos)))
    for fallo in fallos:
        print(" - " + fallo)
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
