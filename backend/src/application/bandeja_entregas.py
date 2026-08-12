"""Caso de uso: la bandeja de entregas — revisar, aprobar o rechazar con un toque.

El agente entrega su trabajo en una rama ``agente/<slug>`` con su ``INFORME.md``
(`EntregaEnRama`), y desde la fase 2 el worker de revisión puede haber añadido
``REVISION.md`` con un veredicto. Hasta ahora esa cola solo se veía con git en
la mano; esta bandeja la convierte en decisiones de un toque desde cualquier
aparato:

  · **listar**: qué entregas esperan decisión, con el resumen del informe y el
    veredicto del revisor ya masticados (nada de abrir ramas a ciegas);
  · **aprobar**: merge real ``--no-ff`` de la rama de entrega a la principal,
    y la rama se retira — igual que aceptar un pull request;
  · **rechazar**: la rama se borra sin merge y queda constancia en
    ``data/entregas_rechazadas.jsonl`` para no perder la traza.

Regla de la casa (la misma de ``revision_entregas``): NADA de checkout que
toque el working tree del proyecto — puede estar sirviéndose por el runner o
con cambios del alumno a medias. Se lee con ``git show``, se mergea en un
worktree temporal DESACOPLADO y las refs se mueven con plomería (``update-ref``
con compare-and-swap, ``symbolic-ref``).

Errores → ``ValueError`` con mensaje claro; el entrypoint los traduce a HTTP
(``EntregaNoEncontradaError`` → 404, ``ConflictoMergeError`` → 409, resto → 422).
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from src.domain.entities import slugify

logger = logging.getLogger(__name__)

#: Prefijo REAL de las ramas de entrega (lo fija ``EntregaEnRama.entregar``).
_PREFIJO_RAMA = "agente/"

#: Firma con la que la Orquesta hace los merges de aprobación (la misma que
#: usa el worker de revisión para archivar sus veredictos).
_AUTOR = ("Orquesta", "orquesta@jamz.local")
_ENV_AUTOR = {
    "GIT_AUTHOR_NAME": _AUTOR[0],
    "GIT_AUTHOR_EMAIL": _AUTOR[1],
    "GIT_COMMITTER_NAME": _AUTOR[0],
    "GIT_COMMITTER_EMAIL": _AUTOR[1],
}

#: La misma marca de dueño que escribe ``duenos_proyecto.marcar_dueno``. Se lee
#: aquí directamente (8 líneas) para no acoplar la aplicación al adaptador.
_MARCA_DUENO = ".dueno.json"

#: Cuánto informe se enseña en la bandeja: lo justo para decidir sin abrir nada.
_LINEAS_RESUMEN = 30
_TOPE_RESUMEN = 2_000


class EntregaNoEncontradaError(ValueError):
    """La entrega no existe o no es de quien pregunta (mismo mensaje: no se
    filtra ni la existencia, igual que en /trabajos/{id})."""


class ConflictoMergeError(ValueError):
    """El merge de aprobación conflictúa: la entrega queda pendiente tal cual."""


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ----------------------------------------------------------------------
# Parseo de REVISION.md (el formato lo escribe revision_entregas._revision_como_markdown)
# ----------------------------------------------------------------------
def _seccion(texto: str, titulo: str) -> str:
    """El cuerpo de una sección ``## titulo`` hasta la siguiente ``##`` o ``---``."""
    patron = rf"^##\s+{re.escape(titulo)}\s*$(.*?)(?=^##\s|^---\s*$|\Z)"
    m = re.search(patron, texto, re.MULTILINE | re.DOTALL)
    return m.group(1).strip() if m else ""


def _parsear_revision(texto: str) -> dict | None:
    """Extrae el veredicto {aprobar, calidad, resumen, mejoras} del markdown.

    El worker escribe campos fijos («**¿Se aprueba?** Sí/No», «**Calidad:**
    N/10», secciones Resumen y Mejoras propuestas). Si el texto no trae ni el
    aprobado ni la calidad, no hay veredicto que mostrar: se devuelve None en
    vez de inventar campos.
    """
    m_aprobar = re.search(r"\*\*¿Se aprueba\?\*\*\s*(Sí|Si|No)", texto, re.IGNORECASE)
    m_calidad = re.search(r"\*\*Calidad:\*\*\s*(\d+)\s*/\s*10", texto)
    if m_aprobar is None and m_calidad is None:
        return None

    mejoras = re.findall(
        r"^\s*\d+\.\s+(.+?)\s*$", _seccion(texto, "Mejoras propuestas"), re.MULTILINE
    )
    return {
        "aprobar": bool(m_aprobar and m_aprobar.group(1).lower() != "no"),
        "calidad": int(m_calidad.group(1)) if m_calidad else 0,
        "resumen": _seccion(texto, "Resumen")[:600],
        "mejoras": [m.strip()[:300] for m in mejoras][:5],
    }


class BandejaEntregasUseCase:
    """Lista y resuelve (aprobar/rechazar) las entregas pendientes del agente."""

    def __init__(self, repo_root: Path) -> None:
        """Args:
        repo_root: carpeta de proyectos generados (``settings.generated_dir``):
            cada proyecto tiene su PROPIO repo git en ``repo_root/<slug>``.
        """
        self._repo_root = Path(repo_root)

    # ------------------------------------------------------------------
    # 1) Listar: la cola de decisiones, ya masticada
    # ------------------------------------------------------------------
    def listar(self, dueno: str, es_admin: bool = False) -> list[dict]:
        """Las entregas pendientes visibles para ``dueno``, la más nueva primero.

        Cada entrega es un dict con: slug, rama, fecha (ISO del último commit),
        resumen_informe (las primeras líneas del INFORME.md), veredicto (dict
        {aprobar, calidad, resumen, mejoras} o None si aún no hay revisión) y
        dueno ('' si el proyecto no tiene marca: visible para todos, el mismo
        criterio de ``es_suyo``).
        """
        if not self._repo_root.is_dir():
            return []

        entregas: list[dict] = []
        for carpeta in sorted(self._repo_root.iterdir()):
            try:
                if not carpeta.is_dir() or not (carpeta / ".git").exists():
                    continue
                rama = _PREFIJO_RAMA + carpeta.name
                ok, _ = self._git(
                    carpeta, "rev-parse", "--verify", "--quiet", f"refs/heads/{rama}"
                )
                if not ok:
                    continue  # sin rama de entrega: no hay nada que decidir
                marca = self._dueno_de(carpeta)
                if not es_admin and marca and marca != dueno:
                    continue  # entrega de otra persona: ni se enumera
                entregas.append(
                    {
                        "slug": carpeta.name,
                        "rama": rama,
                        "fecha": self._fecha_ultimo_commit(carpeta, rama),
                        "resumen_informe": self._resumen_informe(carpeta, rama),
                        "veredicto": self._leer_veredicto(carpeta, rama),
                        "dueno": marca or "",
                    }
                )
            except Exception as exc:  # noqa: BLE001 - un repo roto no tumba la bandeja
                logger.warning(
                    "La bandeja no pudo leer '%s' (se salta): %s", carpeta.name, exc
                )
        entregas.sort(key=lambda e: e["fecha"], reverse=True)
        return entregas

    # ------------------------------------------------------------------
    # 2) Aprobar: merge --no-ff a la rama principal y retirar la de entrega
    # ------------------------------------------------------------------
    def aprobar(self, slug: str, dueno: str, es_admin: bool = False) -> dict:
        """Integra ``agente/<slug>`` a la rama principal y borra la de entrega.

        El merge es real (``--no-ff``, autor Orquesta) pero ocurre en un
        worktree temporal DESACOPLADO: el working tree del proyecto no se toca.
        Si conflictúa, se aborta y la entrega queda pendiente tal cual
        (``ConflictoMergeError``).
        """
        slug = self._sanear_slug(slug)
        repo, rama = self._entrega_visible(slug, dueno, es_admin)

        principal = self._rama_principal(repo)
        ok, punta_principal = self._git(
            repo, "rev-parse", "--verify", f"refs/heads/{principal}"
        )
        if not ok:
            raise ValueError(
                f"No se pudo leer la rama principal '{principal}' de '{slug}': "
                f"{punta_principal[:200]}"
            )

        commit_merge = self._merge_sin_checkout(repo, rama, principal, slug)

        # Compare-and-swap: si algo movió la principal entre medias, NO se pisa.
        ok, salida = self._git(
            repo,
            "update-ref",
            f"refs/heads/{principal}",
            commit_merge,
            punta_principal.strip(),
        )
        if not ok:
            raise ValueError(
                f"La rama principal de '{slug}' cambió durante la aprobación; "
                f"reintenta. Detalle: {salida[:200]}"
            )

        self._borrar_rama(repo, rama, slug)
        logger.info(
            "ENTREGA APROBADA: '%s' integrada a '%s' (merge %s).",
            rama, principal, commit_merge[:8],
        )
        return {"estado": "aprobada", "slug": slug, "rama_principal": principal}

    # ------------------------------------------------------------------
    # 3) Rechazar: borrar sin merge, dejando constancia
    # ------------------------------------------------------------------
    def rechazar(
        self, slug: str, dueno: str, motivo: str = "", es_admin: bool = False
    ) -> dict:
        """Borra la rama de entrega SIN merge y anota el rechazo en el jsonl.

        La constancia (``data/entregas_rechazadas.jsonl``) es lo que permite
        mirar atrás y ver qué se descartó y por qué; si no se pudiera escribir,
        el motivo queda al menos en el log — el rechazo no se frustra por eso.
        """
        slug = self._sanear_slug(slug)
        repo, rama = self._entrega_visible(slug, dueno, es_admin)

        self._borrar_rama(repo, rama, slug)
        self._anotar_rechazo(slug, dueno, motivo)
        logger.info("ENTREGA RECHAZADA: '%s' retirada sin merge.", rama)
        return {"estado": "rechazada", "slug": slug}

    # ------------------------------------------------------------------
    # Localizar la entrega y decidir quién puede verla
    # ------------------------------------------------------------------
    def _sanear_slug(self, slug: str) -> str:
        """Normaliza el slug igual que el resto de la API (y corta traversal)."""
        limpio = slugify(slug or "")
        if not limpio or limpio != Path(limpio).name:
            raise ValueError(f"Slug de proyecto inválido: '{slug}'.")
        return limpio

    def _entrega_visible(
        self, slug: str, dueno: str, es_admin: bool
    ) -> tuple[Path, str]:
        """(repo, rama) de la entrega, o EntregaNoEncontradaError.

        Mismo error para «no existe» y «es de otro»: no se filtra ni la
        existencia (el patrón de /trabajos/{id}).
        """
        repo = self._repo_root / slug
        rama = _PREFIJO_RAMA + slug
        no_esta = EntregaNoEncontradaError(f"No hay una entrega pendiente de '{slug}'.")
        if not (repo / ".git").exists():
            raise no_esta
        ok, _ = self._git(repo, "rev-parse", "--verify", "--quiet", f"refs/heads/{rama}")
        if not ok:
            raise no_esta
        marca = self._dueno_de(repo)
        if not es_admin and marca and marca != dueno:
            raise no_esta
        return repo, rama

    def _dueno_de(self, repo: Path) -> str | None:
        """El `sub` del dueño según la marca ``.dueno.json``, o None si no hay."""
        try:
            datos = json.loads((repo / _MARCA_DUENO).read_text(encoding="utf-8"))
            sub = datos.get("sub")
            return sub if isinstance(sub, str) and sub else None
        except Exception:  # noqa: BLE001 - sin marca (o rota), sin dueño conocido
            return None

    # ------------------------------------------------------------------
    # Lectura de la rama SIN checkout (git show, como revision_entregas)
    # ------------------------------------------------------------------
    def _fecha_ultimo_commit(self, repo: Path, rama: str) -> str:
        ok, fecha = self._git(
            repo, "log", "-1", "--format=%cI", f"refs/heads/{rama}"
        )
        return fecha.strip() if ok else ""

    def _resumen_informe(self, repo: Path, rama: str) -> str:
        """Las primeras líneas del INFORME.md: lo justo para decidir."""
        ok, informe = self._git(repo, "show", f"{rama}:INFORME.md")
        if not ok:
            return ""
        recorte = "\n".join(informe.splitlines()[:_LINEAS_RESUMEN])
        return recorte[:_TOPE_RESUMEN]

    def _leer_veredicto(self, repo: Path, rama: str) -> dict | None:
        """El veredicto del worker de revisión, si ya dejó su REVISION.md."""
        ok, texto = self._git(repo, "show", f"{rama}:REVISION.md")
        return _parsear_revision(texto) if ok else None

    # ------------------------------------------------------------------
    # El merge sin tocar el working tree: worktree temporal DESACOPLADO
    # ------------------------------------------------------------------
    def _rama_principal(self, repo: Path) -> str:
        """El nombre real de la rama principal del repo del proyecto.

        Si HEAD ya apunta a una rama que no es de trabajo (ni ``agente/*`` ni
        ``alumno``), esa es la principal; si no, se prueba main y master, que
        es como ``EntregaEnRama`` inicializa estos repos (``init -b main``).
        """
        ok, head = self._git(repo, "symbolic-ref", "--quiet", "--short", "HEAD")
        head = head.strip() if ok else ""
        if head and not head.startswith(_PREFIJO_RAMA) and head != "alumno":
            return head
        for candidata in ("main", "master"):
            ok, _ = self._git(
                repo, "rev-parse", "--verify", "--quiet", f"refs/heads/{candidata}"
            )
            if ok:
                return candidata
        raise ValueError(
            "El repo del proyecto no tiene rama principal (ni main ni master): "
            "no hay dónde integrar la entrega."
        )

    def _merge_sin_checkout(
        self, repo: Path, rama: str, principal: str, slug: str
    ) -> str:
        """Merge ``--no-ff`` de la rama de entrega SOBRE la principal, en un
        worktree temporal desacoplado (``--detach``). Devuelve el sha del merge.

        Por qué así y no un ``git merge`` normal: HEAD del proyecto suele estar
        EN la rama de entrega (así la deja ``EntregaEnRama``) y un merge normal
        integra hacia HEAD y reescribe el working tree — justo lo prohibido. El
        worktree desacoplado nunca choca con ramas ya montadas y se descarta al
        final; el único efecto en el repo real es el commit de merge, que la
        ref principal adopta con compare-and-swap en ``aprobar``.
        """
        mensaje = (
            f"Entrega aprobada: {slug}\n\n"
            f"Integra '{rama}' a '{principal}' desde la bandeja de entregas."
        )
        with tempfile.TemporaryDirectory(prefix="bandeja-merge-") as tmp:
            wt = Path(tmp) / "wt"
            ok, salida = self._git(
                repo, "worktree", "add", "--detach", str(wt), principal
            )
            if not ok:
                raise ValueError(
                    f"No se pudo preparar el merge de '{slug}': {salida[:200]}"
                )
            try:
                ok, salida = self._git(
                    wt, "merge", "--no-ff", "-m", mensaje, rama, env_extra=_ENV_AUTOR
                )
                if not ok:
                    # El merge quedó a medias en el worktree temporal: se aborta
                    # ahí (el repo real nunca entró en estado de merge).
                    self._git(wt, "merge", "--abort")
                    raise ConflictoMergeError(
                        f"La entrega '{slug}' tiene conflictos con '{principal}' "
                        f"y queda pendiente. Resuélvelos a mano o rechaza la "
                        f"entrega. Detalle: {salida[:300]}"
                    )
                ok, sha = self._git(wt, "rev-parse", "HEAD")
                if not ok:
                    raise ValueError(
                        f"El merge de '{slug}' no dejó commit legible: {sha[:200]}"
                    )
                return sha.strip()
            finally:
                # El worktree temporal se retira SIEMPRE; si Windows retiene
                # algún archivo, prune limpia el registro que quede colgado.
                self._git(repo, "worktree", "remove", "--force", str(wt))
                self._git(repo, "worktree", "prune")

    # ------------------------------------------------------------------
    # Borrar la rama de entrega (que suele estar checked out) sin checkout
    # ------------------------------------------------------------------
    def _borrar_rama(self, repo: Path, rama: str, slug: str) -> None:
        """Borra ``rama`` aunque HEAD la tenga montada, sin tocar archivos.

        git se niega a borrar la rama en la que está HEAD, así que primero se
        reapunta HEAD con ``symbolic-ref`` (plomería: cambia el puntero, NO el
        working tree; los archivos servidos siguen intactos). Si no hubiera
        rama principal a la que apuntar, se desacopla HEAD en el mismo commit.
        """
        ok, head = self._git(repo, "symbolic-ref", "--quiet", "HEAD")
        if ok and head.strip() == f"refs/heads/{rama}":
            try:
                principal = self._rama_principal(repo)
                self._git(repo, "symbolic-ref", "HEAD", f"refs/heads/{principal}")
            except ValueError:
                ok, sha = self._git(repo, "rev-parse", f"refs/heads/{rama}")
                if ok:
                    self._git(repo, "update-ref", "--no-deref", "HEAD", sha.strip())

        ok, salida = self._git(repo, "branch", "-D", rama)
        if not ok:
            raise ValueError(
                f"No se pudo retirar la rama de entrega de '{slug}': {salida[:200]}"
            )

    # ------------------------------------------------------------------
    # Constancia de los rechazos
    # ------------------------------------------------------------------
    def _anotar_rechazo(self, slug: str, dueno: str, motivo: str) -> None:
        """Append en ``data/entregas_rechazadas.jsonl`` (junto a generated/).

        Best-effort: si el disco no deja, el motivo queda al menos en el log;
        no tendría sentido frustrar el rechazo por no poder anotarlo.
        """
        registro = {
            "slug": slug,
            "fecha": _ahora(),
            "motivo": motivo.strip()[:500],
            "dueno": dueno,
        }
        try:
            ruta = self._repo_root.parent / "data" / "entregas_rechazadas.jsonl"
            ruta.parent.mkdir(parents=True, exist_ok=True)
            with ruta.open("a", encoding="utf-8") as f:
                f.write(json.dumps(registro, ensure_ascii=False) + "\n")
        except Exception as exc:  # noqa: BLE001 - anotar nunca frustra el rechazo
            logger.warning(
                "No se pudo anotar el rechazo de '%s' (motivo: %s): %s",
                slug, motivo[:120], exc,
            )

    # ------------------------------------------------------------------
    # git por subprocess con argv-lista (mismo estilo que revision_entregas)
    # ------------------------------------------------------------------
    def _git(
        self,
        repo: Path,
        *args: str,
        env_extra: dict[str, str] | None = None,
    ) -> tuple[bool, str]:
        """Ejecuta git en el repo (o worktree) dado. Nunca lanza: (ok, salida)."""
        env = {**os.environ, **env_extra} if env_extra else None
        try:
            proc = subprocess.run(
                ["git", "-C", str(repo), *args],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=60,
                env=env,
            )
            return proc.returncode == 0, (proc.stdout or proc.stderr).strip()
        except (OSError, subprocess.SubprocessError) as exc:
            return False, str(exc)
