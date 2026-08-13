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
con compare-and-swap, ``symbolic-ref``). La ÚNICA excepción deliberada es el
rechazo: descartar la entrega exige alinear índice y worktree con la principal
(``reset --hard``, que respeta lo no trackeado), porque dejarlos con el trabajo
rechazado hacía que el siguiente ``add -A`` lo re-cometiera en silencio.

Errores → ``ValueError`` con mensaje claro; el entrypoint los traduce a HTTP
(``EntregaNoEncontradaError`` → 404, ``ConflictoMergeError`` → 409, resto → 422).
"""

from __future__ import annotations

import json
import logging
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from src.domain.entities import slugify
from src.infrastructure.adapters.duenos_proyecto import dueno_de
from src.infrastructure.adapters.git_util import correr_git

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
# Parseo del veredicto: REVISION.json primero (estructurado), REVISION.md después
# ----------------------------------------------------------------------
def _parsear_revision_json(crudo: str) -> dict | None:
    """El veredicto desde el ``REVISION.json`` que archiva ``revision_entregas``
    junto al markdown (mismo commit): ``json.loads`` directo a los 4 campos,
    sin regex que se rompa si alguien retoca la redacción del markdown.

    Devuelve None si el JSON no parsea o no es un objeto: el llamador cae
    entonces al parser de markdown (entregas viejas, sin json).
    """
    try:
        data = json.loads(crudo)
        if not isinstance(data, dict):
            return None
        return {
            "aprobar": bool(data.get("aprobar")),
            "calidad": int(data.get("calidad") or 0),
            "resumen": str(data.get("resumen") or "")[:600],
            "mejoras": [str(m).strip()[:300] for m in (data.get("mejoras") or [])][:5],
        }
    except (ValueError, TypeError):
        return None


# El formato markdown lo escribe revision_entregas._revision_como_markdown;
# este parser queda SOLO para entregas anteriores a la llegada de REVISION.json.
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

        # (epoch del último commit, entrega): el epoch solo sirve para ordenar.
        entregas: list[tuple[int, dict]] = []
        for carpeta in sorted(self._repo_root.iterdir()):
            try:
                if not carpeta.is_dir() or not (carpeta / ".git").exists():
                    continue
                # La marca de dueño se lee ANTES de lanzar ningún subprocess:
                # cada repo cuesta 1-4 procesos git, y con generated/ lleno el
                # GET del móvil se cortaba por timeout enumerando repos que el
                # filtro iba a descartar igual. (La paginación de la bandeja
                # queda pendiente; esto solo quita el costo de los ajenos.)
                marca = dueno_de(carpeta)
                if not es_admin and marca and marca != dueno:
                    continue  # entrega de otra persona: ni se enumera
                rama = _PREFIJO_RAMA + carpeta.name
                ok, _ = self._git(
                    carpeta, "rev-parse", "--verify", "--quiet", f"refs/heads/{rama}"
                )
                if not ok:
                    continue  # sin rama de entrega: no hay nada que decidir
                fecha_iso, fecha_epoch = self._fecha_ultimo_commit(carpeta, rama)
                entregas.append(
                    (
                        fecha_epoch,
                        {
                            "slug": carpeta.name,
                            "rama": rama,
                            "fecha": fecha_iso,
                            "resumen_informe": self._resumen_informe(carpeta, rama),
                            "veredicto": self._leer_veredicto(carpeta, rama),
                            "dueno": marca or "",
                        },
                    )
                )
            except Exception as exc:  # noqa: BLE001 - un repo roto no tumba la bandeja
                logger.warning(
                    "La bandeja no pudo leer '%s' (se salta): %s", carpeta.name, exc
                )
        # Se ordena por el epoch, NO por la fecha ISO: %cI conserva el huso del
        # commit y compararlo como texto desordena offsets mezclados (un commit
        # de las 08:00-05:00 es MÁS nuevo que uno de las 10:00+00:00).
        entregas.sort(key=lambda par: par[0], reverse=True)
        return [entrega for _, entrega in entregas]

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

        # descartar_worktree: el rechazo alinea índice Y worktree con la
        # principal (reset --hard); sin eso el proyecto rechazado quedaba
        # staged y el siguiente add -A lo re-cometía en silencio.
        self._borrar_rama(repo, rama, slug, descartar_worktree=True)
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
        # La marca de dueño se lee con el MISMO helper que el resto de la API
        # (duenos_proyecto.dueno_de): una sola definición de propiedad.
        marca = dueno_de(repo)
        if not es_admin and marca and marca != dueno:
            raise no_esta
        return repo, rama

    # ------------------------------------------------------------------
    # Lectura de la rama SIN checkout (git show, como revision_entregas)
    # ------------------------------------------------------------------
    def _fecha_ultimo_commit(self, repo: Path, rama: str) -> tuple[str, int]:
        """(fecha ISO para mostrar, epoch para ordenar) del último commit.

        El epoch (%ct) viaja en el MISMO git log que la fecha ISO (%cI): la
        ISO conserva el huso y solo sirve para enseñarla; el orden lo decide
        el entero. Si git falla o no hay fecha, ('', 0): al final de la cola.
        """
        ok, salida = self._git(
            repo, "log", "-1", "--format=%cI|%ct", f"refs/heads/{rama}"
        )
        if not ok or "|" not in salida:
            return "", 0
        iso, _, epoch = salida.strip().partition("|")
        try:
            return iso.strip(), int(epoch.strip())
        except ValueError:
            return iso.strip(), 0

    def _resumen_informe(self, repo: Path, rama: str) -> str:
        """Las primeras líneas del INFORME.md: lo justo para decidir."""
        ok, informe = self._git(repo, "show", f"{rama}:INFORME.md")
        if not ok:
            return ""
        recorte = "\n".join(informe.splitlines()[:_LINEAS_RESUMEN])
        return recorte[:_TOPE_RESUMEN]

    def _leer_veredicto(self, repo: Path, rama: str) -> dict | None:
        """El veredicto del worker de revisión, si ya lo dejó en la rama.

        Primero ``REVISION.json`` (estructurado, lo archiva el worker junto al
        markdown desde la fase 2); solo si no existe o no parsea se cae al
        parser de ``REVISION.md`` (entregas anteriores al json).
        """
        ok, crudo = self._git(repo, "show", f"{rama}:REVISION.json")
        if ok:
            veredicto = _parsear_revision_json(crudo)
            if veredicto is not None:
                return veredicto
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
    def _borrar_rama(
        self, repo: Path, rama: str, slug: str, descartar_worktree: bool = False
    ) -> None:
        """Borra ``rama`` aunque HEAD la tenga montada, dejando estado coherente.

        git se niega a borrar la rama en la que está HEAD, así que primero se
        reapunta HEAD con ``symbolic-ref``. Pero mover el puntero SOLO dejaba
        el índice (y el worktree) con el contenido de la entrega encima de la
        principal: todo el proyecto quedaba staged, y el siguiente ``add -A``
        de una entrega nueva (o un commit del alumno) RE-COMETÍA en silencio
        el trabajo rechazado. Por eso, tras reapuntar:

          · rechazo (``descartar_worktree=True``): ``reset --hard`` — índice y
            worktree se alinean con la principal. Los archivos SIN trackear
            (.env, *.db, secretos) sobreviven: el hard solo toca lo trackeado.
          · aprobación: ``reset --mixed`` — SOLO el índice se refresca. El
            worktree ya contiene el contenido mergeado y no debe tocarse
            (puede estar sirviéndose por el runner).

        Si no hubiera rama principal a la que apuntar, se desacopla HEAD en el
        mismo commit (índice y worktree ya coinciden con él: no hay que resetear).
        """
        ok, head = self._git(repo, "symbolic-ref", "--quiet", "HEAD")
        if ok and head.strip() == f"refs/heads/{rama}":
            try:
                principal = self._rama_principal(repo)
                self._git(repo, "symbolic-ref", "HEAD", f"refs/heads/{principal}")
                modo = "--hard" if descartar_worktree else "--mixed"
                ok, salida = self._git(repo, "reset", modo)
                if not ok:
                    logger.warning(
                        "El reset %s tras retirar '%s' falló (revisa el estado "
                        "de '%s' a mano): %s", modo, rama, slug, salida[:200],
                    )
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
    # git por subprocess: delega en el helper compartido (git_util.correr_git)
    # ------------------------------------------------------------------
    def _git(
        self,
        repo: Path,
        *args: str,
        env_extra: dict[str, str] | None = None,
    ) -> tuple[bool, str]:
        """Ejecuta git en el repo (o worktree) dado. Nunca lanza: (ok, salida)."""
        return correr_git(repo, *args, env_extra=env_extra)
