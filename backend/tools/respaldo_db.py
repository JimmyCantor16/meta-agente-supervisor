"""Respaldo (y restauración) del SQLite que hoy ES toda la memoria del sistema.

Mientras no haya PostgreSQL viva, en ese archivo están los usuarios, las
licencias, los cupos, los cursos, el progreso, los despliegues, los trabajos y
la actividad. Vive en el disco persistente, así que sobrevive a un deploy —
pero no sobrevive a un `DROP` accidental, a una migración a medias ni a un
disco que se recrea. Un respaldo es barato; volver a construir esa memoria, no.

Uso:

    docker compose exec backend python -m tools.respaldo_db
    docker compose exec backend python -m tools.respaldo_db --listar
    docker compose exec backend python -m tools.respaldo_db --restaurar metaagente-respaldo-20260821-1130.db

La copia se hace con la API `backup()` de sqlite3, no copiando el archivo: con
WAL activo, `cp` puede llevarse una base a medias que luego no abre.

Las copias quedan como archivos SUELTOS junto a la base, nunca en una
subcarpeta: la galería de proyectos enumera `generated/` filtrando por
`is_dir()`, así que una carpeta `respaldos/` aparecería como un proyecto más
del usuario, y un archivo es invisible para ella.
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import get_settings  # noqa: E402

logger = logging.getLogger(__name__)

#: Cuántas copias se conservan. Las más viejas se borran solas.
COPIAS = 5
_SUFIJO = "-respaldo-"


def _base() -> Path:
    return Path(get_settings().db_path).resolve()


def copias(base: Path | None = None) -> list[Path]:
    """Las copias existentes, de la más nueva a la más vieja."""
    base = base or _base()
    patron = f"{base.stem}{_SUFIJO}*.db"
    return sorted(base.parent.glob(patron), reverse=True)


def respaldar(marca: str = "", conservar: int = COPIAS) -> Path | None:
    """Hace una copia consistente y deja solo las `conservar` más nuevas."""
    base = _base()
    if not base.is_file():
        logger.warning("No hay base que respaldar en %s.", base)
        return None
    sello = marca or datetime.now().strftime("%Y%m%d-%H%M%S")
    destino = base.with_name(f"{base.stem}{_SUFIJO}{sello}.db")
    origen = sqlite3.connect(f"file:{base}?mode=ro", uri=True)
    try:
        replica = sqlite3.connect(str(destino))
        try:
            origen.backup(replica)
        finally:
            replica.close()
    finally:
        origen.close()
    for vieja in copias(base)[conservar:]:
        try:
            vieja.unlink()
        except OSError:
            logger.debug("No se pudo borrar la copia vieja %s", vieja)
    return destino


def restaurar(nombre: str) -> Path:
    """Vuelve a una copia. Antes guarda la base actual, por si acaso."""
    base = _base()
    copia = Path(nombre)
    if not copia.is_absolute():
        copia = base.parent / nombre
    if not copia.is_file():
        raise FileNotFoundError(f"No encuentro la copia {copia}")
    if base.is_file():
        respaldar(marca="antes-de-restaurar-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
    replica = sqlite3.connect(str(base))
    try:
        origen = sqlite3.connect(f"file:{copia}?mode=ro", uri=True)
        try:
            origen.backup(replica)
        finally:
            origen.close()
    finally:
        replica.close()
    return base


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
    parser = argparse.ArgumentParser(description="Respaldo del SQLite del Meta-Agente.")
    parser.add_argument("--listar", action="store_true", help="Enseña las copias que hay.")
    parser.add_argument("--restaurar", metavar="ARCHIVO", help="Vuelve a esa copia.")
    parser.add_argument("--conservar", type=int, default=COPIAS, help=f"Copias a conservar ({COPIAS}).")
    args = parser.parse_args()

    base = _base()
    if args.listar:
        print(f"Base: {base} ({base.stat().st_size / 1024:.0f} kB)" if base.is_file() else f"Base: {base} (no existe)")
        for copia in copias(base):
            print(f"  {copia.name}  {copia.stat().st_size / 1024:.0f} kB")
        return 0

    if args.restaurar:
        destino = restaurar(args.restaurar)
        print(f"Restaurada sobre {destino}. La anterior quedó guardada como copia.")
        return 0

    destino = respaldar(conservar=args.conservar)
    if not destino:
        return 1
    print(f"Copia hecha: {destino.name} ({destino.stat().st_size / 1024:.0f} kB)")
    print(f"Se conservan {len(copias(base))} copias en {base.parent}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
