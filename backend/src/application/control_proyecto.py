"""Caso de uso: ENCENDER / APAGAR / ver el estado de un proyecto generado.

Nace de un dolor concreto del usuario: 'tengo mi proyecto, pero no sé si está
encendido o apagado, ni en qué puerto, ni cómo abrirlo'. Aquí el sistema deja de
suponer que el usuario sabe de Docker o de puertos: un botón lo enciende y le
devuelve la URL; otro lo apaga; y siempre puede ver si está vivo.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from src.domain.entities import slugify
from src.domain.ports import AuditError, ProjectRunnerPort, ProjectVerifierPort

logger = logging.getLogger(__name__)

# No se deja editar/ver lo sensible ni lo que rompe el proyecto por accidente.
_NO_EDITABLE = ("secretos/", ".env", "node_modules/", ".git/")


def _ruta_segura(base: Path, rel: str) -> Path:
    """Resuelve `rel` dentro de `base`, bloqueando escapes (../) y secretos."""
    rel = (rel or "").strip().replace("\\", "/").lstrip("/")
    if not rel or any(marca in rel.lower() for marca in _NO_EDITABLE):
        raise AuditError("Ese archivo no se puede editar.")
    destino = (base / rel).resolve()
    if base.resolve() not in destino.parents and destino != base.resolve():
        raise AuditError("Ruta fuera del proyecto.")
    return destino


class ControlProyectoUseCase:
    """Enciende, apaga y consulta el estado de un proyecto en disco."""

    def __init__(
        self,
        runner: ProjectRunnerPort,
        generated_dir: str,
        verifier: ProjectVerifierPort | None = None,
        secretos=None,
    ) -> None:
        self._runner = runner
        self._generated_dir = generated_dir
        # El verificador instala las dependencias: necesario para un arranque en
        # frío (tras reiniciar, la copia con node_modules ya no existe).
        self._verifier = verifier
        # Compone las claves de la carpeta de secretos en el .env antes de arrancar.
        self._secretos = secretos

    def _dir(self, project_name: str) -> Path:
        ruta = Path(self._generated_dir) / slugify(project_name)
        if not ruta.is_dir():
            raise AuditError(f"El proyecto '{project_name}' no existe en disco.")
        return ruta

    def estado(self, project_name: str) -> dict:
        slug = slugify(project_name)
        # Confirma que existe (lanza si no).
        self._dir(project_name)
        url = self._runner.url_activa(slug)
        return _estado_dict(bool(url), url)

    def encender(self, project_name: str) -> dict:
        slug = slugify(project_name)
        ruta = self._dir(project_name)
        ya = self._runner.url_activa(slug)
        if ya:
            return _estado_dict(True, ya)
        logger.info("Encendiendo proyecto '%s' por petición del usuario.", slug)
        # Inyecta las claves de la carpeta de secretos (Azure, etc.) al .env.
        if self._secretos is not None:
            try:
                n = self._secretos.componer_env(project_name)
                if n:
                    logger.info("Cargadas %d clave(s) secreta(s) para '%s'.", n, slug)
            except Exception as exc:  # noqa: BLE001 - los secretos nunca tumban el arranque
                logger.warning("No se pudieron componer los secretos: %s", exc)
        # Camino rápido: si la copia con dependencias sigue viva, arranca ya.
        url = self._runner.start(str(ruta), slug)
        if not url and self._verifier is not None:
            # Arranque EN FRÍO: reinstala dependencias (verify) y reintenta. Es
            # lento (~1-2 min en Node) pero es lo que hace falta tras un reinicio.
            logger.info("Arranque en frío de '%s': preparando dependencias…", slug)
            try:
                self._verifier.verify(str(ruta))
            except Exception as exc:  # noqa: BLE001 - verify es best-effort aquí
                logger.warning("Verify durante encender falló: %s", exc)
            url = self._runner.start(str(ruta), slug)
        if not url:
            raise AuditError(
                "No pude arrancarlo automáticamente. Puede que necesite reinstalar "
                "sus dependencias; el profesor te guía para correrlo en tu computador."
            )
        return _estado_dict(True, url)

    def apagar(self, project_name: str) -> dict:
        slug = slugify(project_name)
        self._runner.stop(slug)
        return _estado_dict(False, None)

    def compilar(
        self, project_name: str, path: str, contenido: str, autor: str = "Alumno"
    ) -> dict:
        """Guarda el archivo editado y REINICIA el proyecto para verlo en vivo.

        Escribe en la fuente (generated/<slug>) y también en la copia que sirve el
        runner (/tmp/exec-<slug>), para que el reinicio sea rápido (conserva las
        dependencias ya instaladas) y el cambio se vea al instante.

        Si arranca, el cambio queda como un commit a nombre del alumno. Si no
        arranca, se guarda en disco pero NO se commitea: la historia solo
        contiene puntos que funcionaban, y por eso volver atrás es seguro.
        """
        slug = slugify(project_name)
        ruta = self._dir(project_name)

        # 1) Persistir en la fuente.
        destino = _ruta_segura(ruta, path)
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(contenido, encoding="utf-8")

        # 2) Reflejar en la copia servida, si existe (así no hace falta reinstalar).
        espejo = Path(tempfile.gettempdir()) / f"exec-{slug}"
        if espejo.exists():
            try:
                _ruta_segura(espejo, path).write_text(contenido, encoding="utf-8")
            except (AuditError, OSError) as exc:
                logger.warning("No se pudo reflejar el cambio en la copia servida: %s", exc)

        # 3) Reiniciar para que el cambio esté vivo.
        logger.info("Compilando '%s': reiniciando con el cambio en '%s'.", slug, path)
        self._runner.stop(slug)
        url = self._runner.start(str(ruta), slug)
        if not url and self._verifier is not None:
            try:
                self._verifier.verify(str(ruta))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Verify durante compilar falló: %s", exc)
            url = self._runner.start(str(ruta), slug)
        if not url:
            # Nada roto entra en la historia: el archivo queda guardado en disco
            # para que el alumno lo siga corrigiendo, pero SIN commit. Así
            # «volver atrás» siempre lleva a un punto que funcionaba.
            raise AuditError(
                "Guardé tu cambio, pero no pude volver a arrancarlo. Revisa que el "
                "código no tenga un error y reintenta."
            )

        # Arrancó: el cambio del alumno merece quedar en la historia, con su
        # nombre. Es lo que convierte «toqué un archivo» en «hice un cambio».
        sha = self._registrar(str(ruta), f"cambio en {path}", autor)
        estado = _estado_dict(True, url)
        estado["commit"] = sha
        return estado

    def revertir(self, project_name: str) -> dict:
        """Deshace el último cambio del alumno y vuelve a arrancar.

        Equivocarse es parte de aprender; quedarse encerrado con un proyecto
        roto, no. Solo deshace cambios del alumno: la entrega del agente es el
        suelo del que parte y borrarla lo dejaría sin proyecto.
        """
        from src.infrastructure.adapters.entrega_en_rama import revertir_ultimo_del_alumno

        slug = slugify(project_name)
        ruta = self._dir(project_name)

        descripcion, archivos = revertir_ultimo_del_alumno(str(ruta))
        if descripcion is None:
            raise AuditError(
                "No hay ningún cambio tuyo que deshacer: lo último que hay es la "
                "entrega original del proyecto."
            )

        # Reflejar la vuelta atrás en la copia que se sirve, o el navegador
        # seguiría mostrando el código viejo aunque en disco ya no esté.
        espejo = Path(tempfile.gettempdir()) / f"exec-{slug}"
        if espejo.exists():
            for rel in archivos:
                try:
                    origen = _ruta_segura(ruta, rel)
                    copia = _ruta_segura(espejo, rel)
                except AuditError:
                    continue
                try:
                    if origen.is_file():
                        copia.parent.mkdir(parents=True, exist_ok=True)
                        copia.write_text(origen.read_text(encoding="utf-8"), encoding="utf-8")
                    elif copia.is_file():
                        copia.unlink()  # el archivo lo había creado el cambio deshecho
                except OSError as exc:
                    logger.warning("No se pudo reflejar la vuelta atrás en '%s': %s", rel, exc)

        logger.info("Deshecho en '%s': %s", slug, descripcion[:80])
        self._runner.stop(slug)
        url = self._runner.start(str(ruta), slug)
        if not url and self._verifier is not None:
            try:
                self._verifier.verify(str(ruta))
            except Exception as exc:  # noqa: BLE001 - verify es best-effort aquí
                logger.warning("Verify durante revertir falló: %s", exc)
            url = self._runner.start(str(ruta), slug)

        estado = _estado_dict(bool(url), url)
        estado["deshecho"] = descripcion
        estado["archivos"] = archivos
        return estado

    @staticmethod
    def _registrar(raiz: str, descripcion: str, autor: str) -> str | None:
        """Guarda el cambio en git. Nunca rompe el guardado si git no está."""
        try:
            from src.infrastructure.adapters.entrega_en_rama import commit_del_alumno

            return commit_del_alumno(raiz, descripcion, autor=autor or "Alumno")
        except Exception as exc:  # noqa: BLE001 - sin git, el cambio sigue guardado
            logger.warning("No se pudo registrar el cambio en git: %s", exc)
            return None


def _estado_dict(corriendo: bool, url: str | None) -> dict:
    puerto = None
    if url:
        try:
            puerto = urlparse(url).port
        except ValueError:
            puerto = None
    return {"corriendo": corriendo, "url": url, "puerto": puerto}
