"""El helper compartido de git por subprocess: (ok, salida) y nunca lanza.

Existía copiado cuatro veces (``bandeja_entregas``, ``revision_entregas``,
``git_alumno``, ``entrega_en_rama``) con variaciones mínimas; cualquier arreglo
—encoding, timeout, entorno— había que repetirlo copia por copia. Ahora la
plomería vive aquí y los llamadores conservan, si quieren, un ``_git`` fino
que delega (así sus decenas de call-sites no cambian).
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path


def correr_git(
    repo: Path | str,
    *args: str,
    entrada: str | None = None,
    env_extra: dict[str, str] | None = None,
    timeout: int = 60,
) -> tuple[bool, str]:
    """Ejecuta git en ``repo`` con argv-lista. Nunca lanza: devuelve (ok, salida).

    La salida es stdout si lo hay y si no stderr, recortada de espacios.

    Args:
        repo: carpeta del repositorio (o worktree) sobre la que corre ``git -C``.
        args: argumentos de git tal cual (sin el ``git`` inicial).
        entrada: texto para stdin (p. ej. ``hash-object --stdin``).
        env_extra: variables que se SUPERPONEN al entorno del proceso
            (autoría, ``GIT_INDEX_FILE``…); None = entorno heredado tal cual.
        timeout: segundos antes de rendirse (el fallo se devuelve, no se lanza).
    """
    env = {**os.environ, **env_extra} if env_extra else None
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            input=entrada,
            env=env,
        )
        return proc.returncode == 0, (proc.stdout or proc.stderr).strip()
    except (OSError, subprocess.SubprocessError) as exc:
        return False, str(exc)
