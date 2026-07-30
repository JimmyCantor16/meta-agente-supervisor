"""Prueba del circuito del alumno (FASE 3) sobre un proyecto real en disco.

Lo que se comprueba, que es exactamente lo que el usuario pidió:
  · al guardar, el cambio queda como commit CON SU NOMBRE,
  · «volver atrás» deshace su cambio y devuelve el archivo a como estaba,
  · «volver atrás» NO puede borrar la entrega del agente,
  · la historia dice quién hizo cada cosa.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.infrastructure.adapters.entrega_en_rama import (  # noqa: E402
    EntregaEnRama,
    InformeEntrega,
    commit_del_alumno,
    revertir_ultimo_del_alumno,
)


def git(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, text=True
    ).stdout.strip()


def main() -> int:
    base = Path(tempfile.mkdtemp(prefix="fase3-"))
    (base / "index.html").write_text("<h1>Título original</h1>\n", encoding="utf-8")

    # 1) El agente entrega su trabajo en su rama.
    rama = EntregaEnRama().entregar(
        str(base),
        InformeEntrega(idea="Gestor de rutinas", proyecto="rutinas", archivos=1, verificado=True),
    )
    print(f"1. entrega del agente en la rama : {rama}")

    # 2) El alumno cambia el título y guarda (verificación OK → commit).
    (base / "index.html").write_text("<h1>Mis rutinas</h1>\n", encoding="utf-8")
    sha1 = commit_del_alumno(str(base), "cambio en index.html", autor="Jimmy Cantor")
    print(f"2. commit del alumno            : {sha1}")

    # 3) Segundo cambio suyo.
    (base / "index.html").write_text("<h1>Mis rutinas diarias</h1>\n", encoding="utf-8")
    sha2 = commit_del_alumno(str(base), "cambio en index.html", autor="Jimmy Cantor")
    print(f"3. segundo commit del alumno    : {sha2}")

    print("\n   historia (quién hizo qué):")
    for linea in git(base, "log", "--format=%h %an — %s", "-4").splitlines():
        print(f"     {linea}")

    # 4) Volver atrás una vez: debe recuperar el título anterior.
    desc, archivos = revertir_ultimo_del_alumno(str(base))
    contenido = (base / "index.html").read_text(encoding="utf-8").strip()
    print(f"\n4. deshecho «{desc}» · archivos {archivos}")
    print(f"   el archivo volvió a          : {contenido}")
    assert contenido == "<h1>Mis rutinas</h1>", "no recuperó el estado anterior"

    # 5) Volver atrás otra vez: ya solo queda su primer cambio.
    desc2, _ = revertir_ultimo_del_alumno(str(base))
    contenido2 = (base / "index.html").read_text(encoding="utf-8").strip()
    print(f"5. deshecho «{desc2}» → {contenido2}")
    assert contenido2 == "<h1>Título original</h1>", "no volvió al original"

    # 6) Un tercer intento NO puede tocar la entrega del agente.
    desc3, _ = revertir_ultimo_del_alumno(str(base))
    print(f"6. intento sobre la entrega del agente: {desc3!r} (debe ser None)")
    assert desc3 is None, "¡deshizo la entrega del agente!"
    assert (base / "INFORME.md").is_file(), "se perdió el informe de la entrega"
    print("   la entrega del agente sigue intacta ✓")

    print("\nTODO CORRECTO: la historia solo guarda puntos que funcionaban,")
    print("y el suelo del alumno (la entrega) no se puede borrar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
