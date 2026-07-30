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


def commit_del_alumno(
    output_path: str, descripcion: str, autor: str = "Alumno"
) -> str | None:
    """Registra en git un cambio hecho por el alumno, YA VERIFICADO.

    Por qué importa: los ajustes se escribían en disco y se verificaban, pero no
    quedaban en la historia. El alumno no podía ver qué había cambiado, ni volver
    atrás dos pasos, ni enseñar su progreso. Ahora cada cambio suyo es un commit
    con su nombre, igual que en cualquier equipo.

    Se llama SOLO cuando la verificación pasó: nada roto entra en la historia.
    Devuelve el identificador corto del commit, o None si no se pudo registrar.
    """
    root = Path(output_path)
    if not root.is_dir():
        return None

    entrega = EntregaEnRama()
    if not (root / ".git").exists():
        ok, _ = entrega._git(root, "init", "-b", "main")  # noqa: SLF001
        if not ok:
            return None
        entrega._git(root, "commit", "--allow-empty", "-m", "inicio del proyecto")  # noqa: SLF001

    # El trabajo del alumno vive en su propia rama: así se puede comparar con lo
    # que entregó el agente y revertir sin tocar la base.
    entrega._git(root, "checkout", "-B", "alumno")  # noqa: SLF001
    entrega._git(root, "add", "-A")  # noqa: SLF001
    ok, salida = entrega._git(  # noqa: SLF001
        root,
        "-c", f"user.name={autor}",
        "-c", f"user.email={CORREO_ALUMNO}",
        "commit", "-m", f"{descripcion.strip()[:120]}\n\nCambio del alumno, verificado antes de guardar.",
    )
    if not ok:
        if "nothing to commit" in salida.lower():
            return None
        logger.warning("No se pudo registrar el cambio del alumno: %s", salida[:200])
        return None

    ok, sha = entrega._git(root, "rev-parse", "--short", "HEAD")  # noqa: SLF001
    corto = sha.strip() if ok else None
    logger.info("COMMIT DEL ALUMNO %s en '%s': %s", corto, root.name, descripcion[:80])
    return corto


#: Firma con la que se guardan los cambios del alumno. Se usa para decidir qué
#: se puede deshacer: lo que hizo él sí, lo que entregó el agente no.
CORREO_ALUMNO = "alumno@metaagente.local"


def revertir_ultimo_del_alumno(output_path: str) -> tuple[str | None, list[str]]:
    """Deshace el último cambio del alumno. Devuelve (qué se deshizo, archivos).

    Por qué existe: equivocarse es parte de aprender, y sin una salida clara el
    alumno se queda con un proyecto que dejó de funcionar y sin saber cómo
    volver. Con esto, retroceder es un botón.

    Solo deshace commits SUYOS: la entrega del agente es el suelo del que se
    parte, y borrarla dejaría al alumno sin proyecto. Si el último commit no es
    suyo, devuelve (None, []) y quien llama lo explica.
    """
    root = Path(output_path)
    if not (root / ".git").exists():
        return None, []

    entrega = EntregaEnRama()
    ok, autor = entrega._git(root, "log", "-1", "--format=%ae")  # noqa: SLF001
    if not ok or autor.strip() != CORREO_ALUMNO:
        return None, []

    ok, descripcion = entrega._git(root, "log", "-1", "--format=%s")  # noqa: SLF001
    if not ok:
        return None, []

    # Qué archivos toca el commit: hay que reflejarlos en la copia que se sirve,
    # o el navegador seguiría mostrando el código viejo.
    ok, listado = entrega._git(root, "show", "--name-only", "--format=", "HEAD")  # noqa: SLF001
    archivos = [linea.strip() for linea in listado.splitlines() if linea.strip()] if ok else []

    ok, salida = entrega._git(root, "reset", "--hard", "HEAD~1")  # noqa: SLF001
    if not ok:
        logger.warning("No se pudo deshacer el cambio del alumno: %s", salida[:200])
        return None, []

    logger.info("DESHECHO el cambio del alumno en '%s': %s", root.name, descripcion.strip()[:80])
    return descripcion.strip(), archivos


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
        self._respaldar_en_github(root, informe.proyecto, rama)
        return rama

    def _respaldar_en_github(self, root: Path, proyecto: str, rama: str) -> None:
        """Empuja la entrega a GitHub para que SOBREVIVA al reinicio del servidor.

        En la nube el disco es efímero: cuando el servicio duerme o se
        redespliega, las ramas locales desaparecen y la cola de revisión se
        pierde. GitHub sí es permanente, así que el trabajo de la noche sigue
        ahí por la mañana — y además se puede mirar desde el móvil.

        Es opcional: si no hay credencial configurada, no se hace nada y la
        entrega local sigue siendo válida.
        """
        import os

        token = os.environ.get("GITHUB_TOKEN", "").strip()
        cuenta = os.environ.get("GITHUB_OWNER", "").strip()
        if not token or not cuenta:
            logger.debug("Sin credencial de GitHub: la entrega se queda solo en local.")
            return

        remoto = f"https://{token}@github.com/{cuenta}/{proyecto}.git"
        # El remoto se reescribe cada vez: así un token rotado no deja el
        # repositorio apuntando a una credencial muerta.
        self._git(root, "remote", "remove", "origin")
        ok, salida = self._git(root, "remote", "add", "origin", remoto)
        if not ok:
            logger.warning("No se pudo configurar el remoto de '%s': %s", proyecto, salida)
            return

        ok, salida = self._git(root, "push", "-u", "--force", "origin", rama)
        if ok:
            logger.info(
                "ENTREGA RESPALDADA en GitHub: %s/%s (rama %s).", cuenta, proyecto, rama
            )
        else:
            # El repositorio puede no existir todavía: se avisa sin alarmar,
            # porque la entrega local sigue sirviendo.
            logger.warning(
                "No se pudo respaldar '%s' en GitHub (¿existe el repositorio?): %s",
                proyecto, salida[:200],
            )
