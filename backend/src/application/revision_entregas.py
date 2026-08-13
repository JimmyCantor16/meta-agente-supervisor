"""Caso de uso: revisar la entrega del agente — el eslabón que faltaba.

Hoy una generación termina con «ENTREGA LISTA PARA REVISION» en una rama
``agente/<slug>`` con su ``INFORME.md``... y un ``logger.info`` que nadie
consume. Este worker es quien lo consume: lee el informe y una muestra acotada
del código directamente de la rama (sin checkout destructivo), le pide a un
agente CLI experto un veredicto de diseño y calidad —la debilidad conocida de
la IA gratis es «funciona pero genérico»—, archiva el veredicto como
``REVISION.md`` en la misma rama y, si el umbral lo permite, dispara la
publicación de la fase 1.

Regla de la casa: este worker corre en segundo plano y JAMÁS lanza hacia
arriba. Todo fallo (agente no disponible, rama inexistente, JSON inválido tras
reintentos) marca el trabajo como fallido con su detalle y devuelve un
``VeredictoRevision`` con ``aprobar=False`` y el motivo en el resumen.
"""

from __future__ import annotations

import json
import logging
import re
import tempfile
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

from pydantic import ValidationError

from src.domain.entities import VeredictoRevision
from src.domain.ports import AgenteCliError, AgenteCliPort
from src.infrastructure.adapters.git_util import correr_git

if TYPE_CHECKING:  # solo tipos: el worker no debe acoplar imports en caliente
    from src.application.publicar_proyecto import PublicarProyectoUseCase
    from src.application.trabajos import TrabajosUseCase

logger = logging.getLogger(__name__)

#: Firma con la que la Orquesta archiva sus veredictos en la rama de entrega.
_AUTOR = ("Orquesta", "orquesta@jamz.local")

# Topes de la muestra que se le enseña al revisor. El CLAUDE.md manda trocear
# toda salida/entrada larga: aquí se acota POR ARCHIVO y EN TOTAL, porque un
# proyecto generado puede traer 24 archivos y el revisor solo necesita los que
# retratan la entrega (main del backend, 1-2 rutas, la interfaz principal).
_TOPE_INFORME = 3_000
_TOPE_ARCHIVO = 4_000
_TOPE_TOTAL = 15_000

#: Dónde suele vivir el main del backend en los proyectos generados
#: (el esqueleto probado, las bases doradas y la generación libre).
_CANDIDATOS_BACKEND = (
    "backend/main.py",
    "backend/app/main.py",
    "backend/app.py",
    "backend/server.js",
    "main.py",
    "app.py",
    "app/main.py",
    "server.js",
    "server/index.js",
    "index.js",
)

#: La pantalla principal: primero el html de entrada, luego la App de React.
_CANDIDATOS_HTML = (
    "frontend/index.html",
    "index.html",
    "public/index.html",
    "static/index.html",
    "templates/index.html",
)
_CANDIDATOS_APP = (
    "frontend/src/App.tsx",
    "frontend/src/App.jsx",
    "src/App.tsx",
    "src/App.jsx",
    "src/App.js",
    "frontend/src/main.tsx",
    "src/main.jsx",
    "static/app.js",
    "app.js",
)

#: Archivos de rutas/endpoints del backend (hasta 2 entran en la muestra).
_PATRON_RUTAS = re.compile(r"(?:^|/)(?:routes?|routers?|api|endpoints)/[^/]+\.(?:py|js|ts)$")

_SYSTEM_REVISOR = (
    "Eres un revisor senior de calidad de código y diseño de producto. Revisas "
    "la entrega de un agente de IA gratuito cuya debilidad conocida es entregar "
    "cosas que FUNCIONAN pero son GENÉRICAS: interfaz de plantilla, textos de "
    "relleno, cero personalidad de producto. Tu trabajo es juzgar la muestra "
    "con ojo de diseño y de calidad, no volver a verificar que arranca.\n\n"
    "Responde SOLO con un objeto JSON, sin markdown ni texto alrededor, con "
    "EXACTAMENTE esta forma:\n"
    "{\n"
    '  "aprobar": true o false,\n'
    '  "calidad": entero de 1 a 10,\n'
    '  "resumen": "máximo 3 frases, en español",\n'
    '  "mejoras": ["máximo 5 mejoras CONCRETAS y aplicables tal cual"]\n'
    "}\n\n"
    "Criterio: aprobar=true solo si un usuario final usaría esto tal cual está. "
    "Cada mejora debe poder ejecutarse sin pedir más contexto: di QUÉ archivo o "
    "pantalla y QUÉ cambio exacto. Nada de consejos vagos."
)


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _veredicto_desde(slug: str, data: Any) -> VeredictoRevision:
    """Normaliza el JSON del revisor y lo convierte en ``VeredictoRevision``.

    Se usa en DOS momentos, y es a propósito:

      1. como ``validar`` dentro del bucle de reintentos del agente, donde solo
         importa que NO lance (una forma equivocada cuenta como fallo del
         modelo y se pide otra muestra);
      2. sobre lo que el puerto devuelve al terminar, donde sí importa el valor.

    El contrato de ``AgenteCliPort.ejecutar`` dice que el retorno de ``validar``
    se DESCARTA —es un chequeo, igual que en ``MultiModelLLM``— y ambos
    adaptadores devuelven el dict crudo. Suponer lo contrario dejaba muerta la
    revisión entera: el ``isinstance`` de después fallaba SIEMPRE, también con
    el CLI real. Por eso la entidad la construye este caso de uso, aquí.

    Campos que NO decide el modelo: ``slug`` (lo pone quien encarga la
    revisión), ``publicado`` (lo decide el worker al publicar) y ``fecha``.

    Raises:
        ValueError: si no es un objeto JSON o le falta el resumen.
        ValidationError: si los campos no cumplen el contrato del dominio.
    """
    if not isinstance(data, dict):
        raise ValueError(f"El veredicto debe ser un objeto JSON, no {type(data).__name__}.")
    resumen = str(data.get("resumen") or "").strip()
    if not resumen:
        raise ValueError("El veredicto necesita un resumen no vacío.")
    limpio = {
        "slug": slug,
        "aprobar": data.get("aprobar"),
        "calidad": data.get("calidad"),
        "resumen": resumen[:600],
        # Máximo 5 mejoras, cada una acotada: el contrato manda.
        "mejoras": [str(m).strip()[:300] for m in (data.get("mejoras") or [])][:5],
        # El modelo NO decide si se publicó: eso lo decide este worker.
        "publicado": False,
        "fecha": _ahora(),
    }
    return VeredictoRevision.model_validate(limpio)


def _revision_como_markdown(veredicto: VeredictoRevision) -> str:
    """El veredicto en el mismo tono que ``INFORME.md``: corto y accionable."""
    marca = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lineas = [
        f"# Revisión de la entrega — {veredicto.slug}",
        "",
        f"*Revisado por la Orquesta el {marca}.*",
        "",
        "## Veredicto",
        "",
        f"- **¿Se aprueba?** {'Sí' if veredicto.aprobar else 'No'}",
        f"- **Calidad:** {veredicto.calidad}/10",
        "",
        "## Resumen",
        "",
        veredicto.resumen.strip(),
        "",
        "## Mejoras propuestas",
        "",
    ]
    if veredicto.mejoras:
        lineas += [f"{i}. {m}" for i, m in enumerate(veredicto.mejoras, 1)]
    else:
        lineas.append("Sin mejoras concretas: la entrega está a la altura.")
    lineas += [
        "",
        "---",
        "",
        "**Para quien retome el proyecto:** el detalle de qué se construyó está en",
        "`INFORME.md`; este veredicto decide si se publica tal cual o se mejora antes.",
        "",
    ]
    return "\n".join(lineas)


def _resumen_para_ws(veredicto: VeredictoRevision) -> str:
    estado = "aprobada ✅" if veredicto.aprobar else "rechazada ❌"
    extra = " · publicada automáticamente 🌍" if veredicto.publicado else ""
    return (
        f"📋 Revisión de '{veredicto.slug}': {estado} · calidad "
        f"{veredicto.calidad}/10{extra} — {veredicto.resumen[:160]}"
    )


class RevisionEntregasUseCase:
    """Consume «ENTREGA LISTA PARA REVISION»: lee la rama, juzga y archiva."""

    def __init__(
        self,
        agente_cli: AgenteCliPort,
        trabajos: TrabajosUseCase,
        publicar: PublicarProyectoUseCase | None,
        repo_root: Path,
        al_avisar: Callable[[str], None] | None = None,
        publicar_si_calidad: int = 0,
    ) -> None:
        """Inyecta el revisor (agente CLI), el registro de trabajos en fondo,
        el publicador de la fase 1 (opcional) y la raíz de proyectos generados.

        Args:
            agente_cli: puerto del agente CLI que emite el veredicto.
            trabajos: caso de uso de trabajos en fondo (iniciar/progresar/
                completar/fallar); da visibilidad al usuario de lo que corre.
            publicar: caso de uso de publicación (fase 1) o None si no aplica.
            repo_root: carpeta de proyectos generados (settings.generated_dir):
                cada proyecto tiene su PROPIO repo git en ``repo_root/<slug>``.
            al_avisar: callback hacia el WebSocket; nunca puede romper el flujo.
            publicar_si_calidad: umbral para publicar automáticamente si el
                veredicto aprueba (0 = nunca publicar automáticamente).
        """
        self._agente = agente_cli
        self._trabajos = trabajos
        self._publicar = publicar
        self._repo_root = Path(repo_root)
        self._al_avisar = al_avisar
        self._publicar_si_calidad = publicar_si_calidad

    # ------------------------------------------------------------------
    # Entrada única del worker
    # ------------------------------------------------------------------
    def revisar(self, slug: str, dueno: str = "") -> VeredictoRevision:
        """Revisa la entrega de ``agente/<slug>``. JAMÁS lanza hacia arriba.

        Devuelve siempre un ``VeredictoRevision``: el real si la revisión
        llegó a término, o uno con ``aprobar=False`` y el motivo en el resumen
        si algo falló (y el trabajo en fondo queda marcado como fallido).
        """
        trabajo_id = self._iniciar_trabajo(dueno, slug)
        try:
            veredicto = self._revisar(slug, trabajo_id)
        except Exception as exc:  # noqa: BLE001 - el worker nunca revienta al llamador
            motivo = (
                str(exc)
                if isinstance(exc, (AgenteCliError, ValueError))
                else f"{type(exc).__name__}: {exc}"
            )
            logger.warning("Revisión de '%s' FALLIDA: %s", slug, motivo[:300])
            veredicto = VeredictoRevision(
                slug=slug,
                aprobar=False,
                calidad=1,
                resumen=f"La revisión no se pudo completar: {motivo[:300]}",
                mejoras=[],
                publicado=False,
                fecha=_ahora(),
            )
            self._fallar_trabajo(trabajo_id, motivo)
            self._avisar(f"⚠️ La revisión de '{slug}' falló: {motivo[:160]}")
            return veredicto

        self._completar_trabajo(trabajo_id, veredicto)
        self._avisar(_resumen_para_ws(veredicto))
        return veredicto

    # ------------------------------------------------------------------
    # El flujo real (aquí SÍ se lanza; `revisar` lo convierte en veredicto)
    # ------------------------------------------------------------------
    def _revisar(self, slug: str, trabajo_id: str | None) -> VeredictoRevision:
        if not self._agente.disponible():
            raise AgenteCliError("El agente CLI revisor no está disponible en este entorno.")

        repo = self._repo_root / slug
        rama = f"agente/{slug}"
        if not (repo / ".git").exists():
            raise ValueError(f"No hay repositorio git para el proyecto '{slug}'.")
        ok, salida = self._git(repo, "rev-parse", "--verify", f"refs/heads/{rama}")
        if not ok:
            raise ValueError(f"No existe la rama de entrega '{rama}': {salida[:200]}")

        self._progresar(trabajo_id, "Leyendo el informe y la muestra de código de la rama…")
        informe, muestra = self._leer_muestra(repo, rama)

        self._progresar(trabajo_id, "El revisor está examinando la entrega…")
        veredicto = self._pedir_veredicto(slug, informe, muestra)

        self._progresar(trabajo_id, "Archivando el veredicto como REVISION.md en la rama…")
        self._archivar_revision(repo, rama, veredicto)

        return self._publicar_si_corresponde(slug, veredicto)

    # ------------------------------------------------------------------
    # Lectura de la rama SIN checkout: `git show rama:archivo`
    # ------------------------------------------------------------------
    def _leer_muestra(self, repo: Path, rama: str) -> tuple[str, str]:
        """Devuelve (INFORME.md, muestra de código) leyendo objetos de git.

        Nada de ``checkout``: el proyecto puede estar sirviéndose por el runner
        o con cambios del alumno a medias, y leerlo no puede perturbarlo.
        """
        ok, listado = self._git(repo, "ls-tree", "-r", "--name-only", rama)
        if not ok:
            raise ValueError(f"No se pudo listar la rama '{rama}': {listado[:200]}")
        archivos = [linea.strip() for linea in listado.splitlines() if linea.strip()]

        ok, informe = self._git(repo, "show", f"{rama}:INFORME.md")
        if not ok:
            informe = "(la rama no trae INFORME.md)"
        informe = informe[:_TOPE_INFORME]

        partes: list[str] = []
        usados = 0
        for ruta in self._elegir_archivos(archivos):
            ok, contenido = self._git(repo, "show", f"{rama}:{ruta}")
            if not ok:
                continue
            recorte = contenido[:_TOPE_ARCHIVO]
            if usados + len(recorte) > _TOPE_TOTAL:
                recorte = recorte[: max(0, _TOPE_TOTAL - usados)]
            if not recorte:
                break
            partes.append(f"=== {ruta} ===\n{recorte}")
            usados += len(recorte)

        if not partes:
            raise ValueError(f"La rama '{rama}' no tiene archivos de código que muestrear.")
        return informe, "\n\n".join(partes)

    def _elegir_archivos(self, archivos: list[str]) -> list[str]:
        """Los archivos que mejor retratan la entrega, en orden de lectura:
        main del backend, hasta 2 archivos de rutas y la interfaz principal."""
        utiles = [
            a for a in archivos if "node_modules" not in a and not a.startswith(".")
        ]
        elegidos: list[str] = []

        def anotar(ruta: str | None) -> None:
            if ruta and ruta not in elegidos:
                elegidos.append(ruta)

        anotar(next((c for c in _CANDIDATOS_BACKEND if c in utiles), None))
        for ruta_api in [a for a in utiles if _PATRON_RUTAS.search(a)][:2]:
            anotar(ruta_api)
        anotar(next((c for c in _CANDIDATOS_HTML if c in utiles), None))
        anotar(next((c for c in _CANDIDATOS_APP if c in utiles), None))

        if not elegidos:
            # Layout inesperado: se toman los primeros archivos de código para
            # que el revisor nunca se quede sin muestra.
            codigo = [
                a for a in utiles
                if a.lower().endswith((".py", ".js", ".ts", ".tsx", ".jsx", ".html"))
            ]
            elegidos = codigo[:3]
        return elegidos

    # ------------------------------------------------------------------
    # El veredicto: encargo CERRADO con el contrato DENTRO del fallback
    # ------------------------------------------------------------------
    def _pedir_veredicto(self, slug: str, informe: str, muestra: str) -> VeredictoRevision:
        """Pide el veredicto al agente CLI exigiendo la forma exacta.

        El validador corre DENTRO de ``ejecutar`` (regla de oro del proyecto):
        si el agente devuelve JSON parseable pero con la forma equivocada,
        cuenta como fallo suyo y el puerto reintenta/salta de proveedor.

        Y el veredicto se construye AQUÍ, con lo que el puerto devuelve: su
        contrato manda descartar el retorno de ``validar``, así que confiar en
        él dejaba la revisión muerta al 100% (ver ``_veredicto_desde``).
        """

        def validar(data: Any) -> None:
            # Solo chequeo: el puerto tira el retorno. Si no cumple, lanza y el
            # agente reintenta con otra muestra.
            _veredicto_desde(slug, data)

        user = (
            f"PROYECTO: {slug}\n\n"
            f"=== INFORME.md (lo que el constructor cuenta de su entrega) ===\n"
            f"{informe}\n\n"
            f"=== MUESTRA DEL CÓDIGO (acotada; juzga con lo que hay) ===\n"
            f"{muestra}\n\n"
            "Emite tu veredicto AHORA como un único objeto JSON."
        )
        resultado = self._agente.ejecutar(_SYSTEM_REVISOR, user, validar=validar)
        # Lo normal es un dict (ambos adaptadores devuelven el JSON crudo); se
        # admite también la entidad ya construida por si algún adaptador futuro
        # la devuelve. Cualquier otra cosa —texto plano incluido— no es veredicto.
        if isinstance(resultado, VeredictoRevision):
            return resultado
        try:
            return _veredicto_desde(slug, resultado)
        except (ValidationError, ValueError) as exc:
            raise AgenteCliError(
                "El agente no devolvió un veredicto JSON con la forma pedida: "
                f"{str(exc)[:200]}"
            ) from exc

    # ------------------------------------------------------------------
    # Archivado: REVISION.md como commit nuevo en la rama, por PLOMERÍA
    # ------------------------------------------------------------------
    def _archivar_revision(self, repo: Path, rama: str, veredicto: VeredictoRevision) -> None:
        """Escribe ``REVISION.md`` + ``REVISION.json`` en un commit NUEVO de la rama.

        El markdown es para ojos humanos; el json (``model_dump()`` tal cual)
        es el que consume la bandeja: leerlo estructurado evita re-parsear la
        redacción con regex, que se rompía en silencio con cualquier retoque
        del texto. Van SIEMPRE juntos, en el mismo commit.

        Se usa plomería de git (``hash-object`` + índice temporal +
        ``commit-tree`` + ``update-ref``) y NO un worktree temporal, porque es
        lo más robusto en este repo concreto:

          · ``EntregaEnRama.entregar`` deja la rama ``agente/<slug>`` CHECKED
            OUT en el propio proyecto, y ``git worktree add`` se niega a montar
            una rama ya montada en otro sitio;
          · no toca el working tree ni el índice reales: el proyecto puede
            estar sirviéndose (runner) o con cambios del alumno a medias, y
            nada se pisa ni se bloquea (importante en Windows);
          · no deja carpetas temporales colgadas si el proceso muere a mitad.

        Único efecto lateral, cosmético: si HEAD apunta a la rama, ``git
        status`` mostrará ``REVISION.md`` y ``REVISION.json`` como «borrados»
        (el working tree va un commit por detrás) hasta el siguiente checkout.
        Aceptable.

        Es best-effort: el veredicto vale aunque no se pueda archivar.
        """
        try:
            ok, padre = self._git(repo, "rev-parse", "--verify", f"refs/heads/{rama}")
            if not ok:
                raise RuntimeError(f"rev-parse: {padre}")

            # Los dos formatos del mismo veredicto: markdown para humanos,
            # json estructurado para la bandeja.
            contenidos = (
                ("REVISION.md", _revision_como_markdown(veredicto)),
                (
                    "REVISION.json",
                    json.dumps(veredicto.model_dump(), ensure_ascii=False, indent=2),
                ),
            )
            blobs: list[tuple[str, str]] = []
            for ruta, contenido in contenidos:
                ok, blob = self._git(repo, "hash-object", "-w", "--stdin", entrada=contenido)
                if not ok:
                    raise RuntimeError(f"hash-object {ruta}: {blob}")
                blobs.append((ruta, blob.strip()))

            # Índice TEMPORAL (GIT_INDEX_FILE): el índice real del proyecto no
            # se toca, así una revisión concurrente con el alumno no choca.
            with tempfile.TemporaryDirectory(prefix="revision-idx-") as tmp:
                env_idx = {"GIT_INDEX_FILE": str(Path(tmp) / "indice")}
                ok, salida = self._git(repo, "read-tree", padre, env_extra=env_idx)
                if not ok:
                    raise RuntimeError(f"read-tree: {salida}")
                for ruta, blob in blobs:
                    ok, salida = self._git(
                        repo,
                        "update-index", "--add", "--cacheinfo",
                        f"100644,{blob},{ruta}",
                        env_extra=env_idx,
                    )
                    if not ok:
                        raise RuntimeError(f"update-index {ruta}: {salida}")
                ok, arbol = self._git(repo, "write-tree", env_extra=env_idx)
                if not ok:
                    raise RuntimeError(f"write-tree: {arbol}")

            env_autor = {
                "GIT_AUTHOR_NAME": _AUTOR[0],
                "GIT_AUTHOR_EMAIL": _AUTOR[1],
                "GIT_COMMITTER_NAME": _AUTOR[0],
                "GIT_COMMITTER_EMAIL": _AUTOR[1],
            }
            mensaje = (
                f"revisión de la orquesta: "
                f"{'aprobada' if veredicto.aprobar else 'rechazada'} · "
                f"calidad {veredicto.calidad}/10\n\n"
                "Ver REVISION.md para el resumen y las mejoras propuestas."
            )
            ok, commit = self._git(
                repo, "commit-tree", arbol, "-p", padre, "-m", mensaje,
                env_extra=env_autor,
            )
            if not ok:
                raise RuntimeError(f"commit-tree: {commit}")

            # Compare-and-swap: si otra cosa movió la rama entre medias
            # (regeneración concurrente), NO se pisa su trabajo: falla aquí.
            ok, salida = self._git(
                repo, "update-ref", f"refs/heads/{rama}", commit.strip(), padre,
            )
            if not ok:
                raise RuntimeError(f"update-ref: {salida}")

            logger.info(
                "REVISION.md + REVISION.json archivados en '%s' (commit %s).",
                rama, commit.strip()[:8],
            )
        except Exception as exc:  # noqa: BLE001 - archivar es best-effort
            logger.warning(
                "No se pudo archivar la revisión en '%s' (el veredicto sigue valiendo): %s",
                rama, str(exc)[:300],
            )

    # ------------------------------------------------------------------
    # Publicación automática (fase 1), solo si el umbral lo permite
    # ------------------------------------------------------------------
    def _publicar_si_corresponde(
        self, slug: str, veredicto: VeredictoRevision
    ) -> VeredictoRevision:
        """Publica SOLO si hay publicador, umbral > 0 y el veredicto lo supera.

        Un fallo al publicar no invalida la revisión: se avisa y se sigue.
        """
        if self._publicar is None or self._publicar_si_calidad <= 0:
            return veredicto
        if not veredicto.aprobar or veredicto.calidad < self._publicar_si_calidad:
            return veredicto
        try:
            info = self._publicar.execute(slug, al_avanzar=self._al_avisar)
            logger.info(
                "Revisión de '%s': aprobada con %d/10 (umbral %d); publicado en %s.",
                slug, veredicto.calidad, self._publicar_si_calidad, info.url,
            )
            return veredicto.model_copy(update={"publicado": True})
        except Exception as exc:  # noqa: BLE001 - publicar no tumba la revisión
            logger.warning(
                "La publicación automática de '%s' falló (la revisión sigue valiendo): %s",
                slug, str(exc)[:200],
            )
            self._avisar(
                f"⚠️ '{slug}' aprobó la revisión pero la publicación automática falló."
            )
            return veredicto

    # ------------------------------------------------------------------
    # Trabajos en fondo y avisos: contar lo que pasa nunca impide que pase
    # ------------------------------------------------------------------
    def _iniciar_trabajo(self, dueno: str, slug: str) -> str | None:
        try:
            trabajo = self._trabajos.iniciar("revision_entrega", dueno)
            self._progresar(trabajo.id, f"Revisando la entrega de '{slug}'…")
            return trabajo.id
        except Exception as exc:  # noqa: BLE001
            logger.warning("No se pudo registrar el trabajo de revisión: %s", exc)
            return None

    def _progresar(self, trabajo_id: str | None, texto: str) -> None:
        if trabajo_id is None:
            return
        try:
            self._trabajos.avanzar(trabajo_id, texto)
        except Exception:  # noqa: BLE001
            pass

    def _completar_trabajo(self, trabajo_id: str | None, veredicto: VeredictoRevision) -> None:
        if trabajo_id is None:
            return
        try:
            # `completar` serializa él mismo a JSON: se le pasa el dict, no el
            # json ya serializado (evita el doble encodeado en `resultado`).
            self._trabajos.completar(trabajo_id, veredicto.model_dump())
        except Exception as exc:  # noqa: BLE001
            logger.warning("No se pudo completar el trabajo de revisión: %s", exc)

    def _fallar_trabajo(self, trabajo_id: str | None, detalle: str) -> None:
        if trabajo_id is None:
            return
        try:
            self._trabajos.fallar(trabajo_id, detalle[:400])
        except Exception as exc:  # noqa: BLE001
            logger.warning("No se pudo marcar fallido el trabajo de revisión: %s", exc)

    def _avisar(self, mensaje: str) -> None:
        if self._al_avisar is None:
            return
        try:
            self._al_avisar(mensaje)
        except Exception:  # noqa: BLE001 - el aviso jamás rompe el flujo
            pass

    # ------------------------------------------------------------------
    # git por subprocess: delega en el helper compartido (git_util.correr_git)
    # ------------------------------------------------------------------
    def _git(
        self,
        repo: Path,
        *args: str,
        entrada: str | None = None,
        env_extra: dict[str, str] | None = None,
    ) -> tuple[bool, str]:
        """Ejecuta git en el repo del proyecto. Nunca lanza: devuelve (ok, salida)."""
        return correr_git(repo, *args, entrada=entrada, env_extra=env_extra)
