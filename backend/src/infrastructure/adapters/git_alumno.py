"""Adaptador que mira la historia REAL de git del proyecto del alumno.

Existe para que "tu primer cambio" sea imposible de superar contándolo: el
profesor ya no se cree el texto, va al repositorio del proyecto generado y
comprueba que hay un commit del ALUMNO (los guarda `compilar()` con su firma
cuando el sistema arranca con el cambio puesto). Sin commit, no hay clase.

Nunca lanza: si git falla o el repositorio no existe devuelve una lista vacía,
y quien juzga decide qué decirle al alumno. Un fallo de infraestructura no
puede convertirse en un 500 en plena clase.
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from src.domain.ports import GitAlumnoPort
from src.infrastructure.adapters.entrega_en_rama import CORREO_ALUMNO

logger = logging.getLogger(__name__)

# Separadores de registro/campo para parsear `git log` sin ambigüedad
# (un mensaje de commit puede llevar comas, saltos… pero no estos bytes).
_SEP_REGISTRO = "\x1e"
_SEP_CAMPO = "\x1f"


class GitAlumnoAdapter(GitAlumnoPort):
    """Lee los commits del alumno en el repo del proyecto generado en disco."""

    def __init__(self, generated_dir: str) -> None:
        # La misma raíz donde escribe el generador y commitea `compilar()`:
        # <generated_dir>/<slug> es un repositorio git propio del proyecto.
        self._generated_dir = generated_dir

    def commits_del_alumno(
        self,
        slug: str,
        autor: str,
        desde_iso: str,
        archivo: str | None = None,
    ) -> list[dict]:
        """Commits del alumno (más reciente primero), como dicts.

        Args:
            slug: Carpeta del proyecto dentro de `generated_dir`.
            autor: Con qué firma buscar. Vacío = la firma estándar del alumno
                (`alumno@metaagente.local`, la que pone `commit_del_alumno`).
            desde_iso: Solo commits posteriores a esta fecha ISO. Vacío = todos.
            archivo: Si viene, solo commits que TOCAN ese archivo (ruta
                relativa con /, tal como la guarda el criterio de la clase).

        Returns:
            Lista de dicts {hash, mensaje, fecha, archivos}. Vacía si no hay
            commits que cumplan o si git no se pudo consultar.
        """
        raiz = Path(self._generated_dir) / (slug or "").strip()
        if not (raiz / ".git").exists():
            logger.info("Sin repositorio git en '%s': no hay commits que mirar.", raiz)
            return []

        # --all: los commits del alumno viven en su rama 'alumno'; tras una
        # re-entrega del agente HEAD puede estar en otra parte.
        args = [
            "git", "-C", str(raiz), "log", "--all",
            f"--author={(autor or '').strip() or CORREO_ALUMNO}",
            f"--format={_SEP_REGISTRO}%H{_SEP_CAMPO}%s{_SEP_CAMPO}%aI",
            "--name-only",
        ]
        if (desde_iso or "").strip():
            args.append(f"--since={desde_iso.strip()}")
        if (archivo or "").strip():
            args += ["--", archivo.strip()]

        try:
            proc = subprocess.run(
                args,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            logger.warning("No se pudo consultar git en '%s': %s", raiz, exc)
            return []
        if proc.returncode != 0:
            logger.warning(
                "git log falló en '%s': %s", raiz, (proc.stderr or "").strip()[:200]
            )
            return []

        return self._parsear(proc.stdout or "")

    @staticmethod
    def _parsear(salida: str) -> list[dict]:
        """Convierte la salida de `git log --format=... --name-only` en dicts."""
        commits: list[dict] = []
        for bloque in salida.split(_SEP_REGISTRO):
            bloque = bloque.strip()
            if not bloque:
                continue
            partes = bloque.split(_SEP_CAMPO)
            if len(partes) < 3:
                continue
            resto = partes[2].splitlines()
            fecha = resto[0].strip() if resto else ""
            archivos = [linea.strip() for linea in resto[1:] if linea.strip()]
            commits.append({
                "hash": partes[0].strip(),
                "mensaje": partes[1].strip(),
                "fecha": fecha,
                "archivos": archivos,
            })
        return commits
