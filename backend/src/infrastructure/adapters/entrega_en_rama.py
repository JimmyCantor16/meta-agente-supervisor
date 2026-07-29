"""Entrega el trabajo del agente en una RAMA de git, con su informe.

Por qué existe: cuando la IA gratis termina, no siempre termina bien. Antes eso
se quedaba en un log que se borraba. Ahora cada entrega queda como en cualquier
equipo de desarrollo: **una rama con un informe de qué se hizo y qué quedó
pendiente**, lista para que alguien la revise, la ajuste y la publique.

Ventajas frente a dejarlo suelto en disco:
  · se puede revisar el cambio (diff) en vez de adivinar,
  · se puede revertir si el ajuste empeora las cosas,
  · queda historia de quién hizo qué (agente / revisor).

El informe (`INFORME.md`) es lo que convierte la revisión en algo rápido: dice
dónde mirar en vez de obligar a abrir 24 archivos a ciegas.
"""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_AUTOR = ("Agente Meta", "agente@metaagente.local")


@dataclass
class InformeEntrega:
    """Lo que el agente cuenta de su propio trabajo."""

    idea: str
    proyecto: str
    archivos: int
    intentos: int = 1
    verificado: bool = False
    url: str | None = None
    atascos: list[str] = field(default_factory=list)
    pendientes: list[str] = field(default_factory=list)
    proveedores: list[str] = field(default_factory=list)

    def como_markdown(self) -> str:
        marca = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        estado = "✅ verificado y arrancado" if self.verificado and self.url else (
            "⚠️ verificado pero sin URL" if self.verificado else "❌ no superó la verificación"
        )
        lineas = [
            f"# Informe de entrega — {self.proyecto}",
            "",
            f"*Generado por el agente el {marca}.*",
            "",
            "## Qué se pidió",
            "",
            f"> {self.idea.strip()[:600]}",
            "",
            "## Qué construí",
            "",
            f"- **{self.archivos} archivos**",
            f"- Estado: **{estado}**",
            f"- Intentos de verificación: **{self.intentos}**",
        ]
        if self.url:
            lineas.append(f"- Disponible en: {self.url}")
        if self.proveedores:
            lineas.append(f"- Modelos que participaron: {', '.join(self.proveedores)}")

        lineas += ["", "## Dónde me atasqué", ""]
        if self.atascos:
            lineas += [f"- {a}" for a in self.atascos]
        else:
            lineas.append("- Nada: la construcción salió limpia.")

        lineas += ["", "## Lo que propongo mejorar", ""]
        if self.pendientes:
            lineas += [f"{i}. {p}" for i, p in enumerate(self.pendientes, 1)]
        else:
            lineas.append("1. Revisar el diseño visual: es funcional, pero genérico.")

        lineas += [
            "",
            "---",
            "",
            "**Para quien revise:** mira primero los puntos de arriba y luego el cambio",
            "completo con `git diff main..HEAD`. Si algo empeora, se vuelve atrás sin drama.",
            "",
        ]
        return "\n".join(lineas)


class EntregaEnRama:
    """Deja el proyecto generado en su propia rama de git, con informe."""

    def __init__(self, autor: tuple[str, str] = _AUTOR) -> None:
        self._nombre, self._correo = autor

    def _git(self, root: Path, *args: str) -> tuple[bool, str]:
        """Ejecuta git en el proyecto. Nunca lanza: entregar no puede tumbar la generación."""
        try:
            proc = subprocess.run(
                ["git", "-C", str(root), *args],
                capture_output=True,
                text=True,
                timeout=60,
            )
            return proc.returncode == 0, (proc.stdout or proc.stderr).strip()
        except (OSError, subprocess.SubprocessError) as exc:
            return False, str(exc)

    def entregar(self, output_path: str, informe: InformeEntrega) -> str | None:
        """Crea la rama con el trabajo y el informe. Devuelve el nombre de la rama.

        Devuelve None si no se pudo (sin git, por ejemplo): la generación sigue
        siendo válida, solo se pierde la comodidad de revisar por rama.
        """
        root = Path(output_path)
        if not root.is_dir():
            return None

        # Repositorio propio del proyecto (no toca el del Meta-Agente).
        if not (root / ".git").exists():
            ok, salida = self._git(root, "init", "-b", "main")
            if not ok:
                logger.warning("No se pudo iniciar el repositorio de '%s': %s", informe.proyecto, salida)
                return None
            self._git(root, "config", "user.name", self._nombre)
            self._git(root, "config", "user.email", self._correo)
            # Primer commit vacío: da un 'main' contra el que comparar la rama.
            self._git(root, "commit", "--allow-empty", "-m", "inicio del proyecto")

        rama = f"agente/{informe.proyecto}"
        # -B: si la rama ya existía (regeneración), se reutiliza.
        ok, salida = self._git(root, "checkout", "-B", rama)
        if not ok:
            logger.warning("No se pudo crear la rama '%s': %s", rama, salida)
            return None

        (root / "INFORME.md").write_text(informe.como_markdown(), encoding="utf-8")

        self._git(root, "add", "-A")
        ok, salida = self._git(
            root,
            "commit",
            "-m",
            f"entrega del agente: {informe.proyecto}\n\n"
            f"{informe.archivos} archivos · {informe.intentos} intento(s) de verificación.\n"
            f"Ver INFORME.md para qué quedó pendiente.",
        )
        if not ok and "nothing to commit" not in salida.lower():
            logger.warning("No se pudo commitear la entrega: %s", salida)
            return None

        logger.info("ENTREGA EN RAMA '%s' lista para revisión.", rama)
        return rama
