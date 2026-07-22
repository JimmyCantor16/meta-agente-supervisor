"""Caso de uso: ajustar un módulo del proyecto durante una clase.

Es la contrapartida accionable del Modo Profesor. `ExplainProjectUseCase`
explica pero nunca toca el código; aquí el alumno elige cuánto hace la IA:

    EXPLICAR  el alumno escribe el código (la IA solo enseña)
    PROPONER  la IA prepara el cambio y lo muestra para que el alumno apruebe
    EJECUTAR  la IA lo aplica y lo COMPRUEBA ejecutando

La regla que sostiene todo esto: en `EJECUTAR`, si la verificación por
ejecución falla, el cambio SE REVIERTE y se informa el error real. El sistema
no declara un éxito que no comprobó, y una clase nunca deja el proyecto del
alumno peor de como estaba.
"""

from __future__ import annotations

import difflib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from src.domain.entities import (
    CambioArchivo,
    GeneratedFile,
    NivelAutonomia,
    ResultadoAjuste,
)
from src.domain.ports import (
    AjustadorModuloPort,
    AuditError,
    ProjectReaderPort,
    ProjectVerifierPort,
)

logger = logging.getLogger(__name__)


class AplicarAjusteUseCase:
    """Convierte un punto de la clase en un cambio real, verificado y reversible."""

    def __init__(
        self,
        reader: ProjectReaderPort,
        ajustador: AjustadorModuloPort,
        verifier: ProjectVerifierPort,
        generated_dir: str,
    ) -> None:
        self._reader = reader
        self._ajustador = ajustador
        self._verifier = verifier
        self._generated_dir = generated_dir

    # ------------------------------------------------------------------
    def execute(
        self,
        project_name: str,
        ajuste: str,
        nivel: NivelAutonomia = NivelAutonomia.PROPONER,
        language: str = "es",
    ) -> ResultadoAjuste:
        """Ejecuta el ajuste con el nivel de autonomía pedido."""
        nombre = (project_name or "").strip()
        peticion = (ajuste or "").strip()
        if not nombre:
            raise ValueError("El nombre del proyecto no puede estar vacío.")
        if not peticion:
            raise ValueError("Hay que indicar qué se quiere ajustar.")

        archivos = self._reader.read(nombre)
        if not archivos:
            raise AuditError(f"El proyecto '{nombre}' no existe o está vacío.")

        base = ResultadoAjuste(proyecto=nombre, ajuste=peticion, nivel=nivel)

        # Nivel 1: solo enseñar. No se pide código ni se toca nada.
        if nivel is NivelAutonomia.EXPLICAR:
            _, explicacion, concepto = self._ajustador.proponer(
                nombre, archivos, peticion, language
            )
            return base.model_copy(update={"explicacion": explicacion, "concepto": concepto})

        # Niveles 2 y 3: se pide el cambio concreto.
        logger.info("Ajuste '%s' en '%s' (nivel %s)...", peticion[:60], nombre, nivel.value)
        cambios, explicacion, concepto = self._ajustador.proponer(
            nombre, archivos, peticion, language
        )
        anteriores = {f.path: f.content for f in archivos}
        cambios = _con_diffs(cambios, anteriores)

        if not cambios:
            return base.model_copy(update={
                "explicacion": explicacion,
                "concepto": concepto,
                "detalle": "El ajuste no requirió cambios de código.",
            })

        # Nivel 2: se muestra y se detiene. El alumno decide.
        if nivel is NivelAutonomia.PROPONER:
            return base.model_copy(update={
                "explicacion": explicacion, "concepto": concepto, "cambios": cambios,
            })

        # ---------------- Nivel 3: aplicar y COMPROBAR ----------------
        raiz = Path(self._generated_dir) / nombre
        if not raiz.is_dir():
            raise AuditError(f"No se encontró la carpeta del proyecto '{nombre}'.")

        respaldo = {c.path: anteriores.get(c.path) for c in cambios}
        self._escribir(raiz, cambios)

        error = self._verifier.verify(str(raiz))
        if error is None:
            logger.info("Ajuste aplicado y verificado en '%s'.", nombre)
            self._registrar(nombre, peticion, cambios, aplicado=True, revertido=False)
            return base.model_copy(update={
                "explicacion": explicacion, "concepto": concepto, "cambios": cambios,
                "aplicado": True, "verificado": True,
            })

        # Falló: se deshace y se dice la verdad.
        self._revertir(raiz, respaldo)
        logger.warning("Ajuste en '%s' revertido: la verificación falló.", nombre)
        self._registrar(nombre, peticion, cambios, aplicado=False, revertido=True)
        return base.model_copy(update={
            "explicacion": explicacion, "concepto": concepto, "cambios": cambios,
            "aplicado": False, "verificado": False, "revertido": True,
            "detalle": (
                "El cambio se aplicó pero la verificación por ejecución falló, "
                "así que se revirtió y el proyecto quedó como estaba.\n\n" + error
            ),
        })

    # ------------------------------------------------------------------
    def _registrar(
        self,
        proyecto: str,
        ajuste: str,
        cambios: list[CambioArchivo],
        *,
        aplicado: bool,
        revertido: bool,
    ) -> None:
        """Bitácora del círculo virtuoso: cada ajuste ejecutado deja huella.

        Si un ajuste se parece a otros ya registrados (mismas palabras clave),
        se marca como CANDIDATO a arreglo determinista: lo que se pide una y
        otra vez en clases no debería depender del LLM — debería quedar
        grabado en el generador para siempre. El registro jamás rompe el
        ajuste: si no se puede escribir, solo se pierde la huella.
        """
        try:
            bitacora = Path(self._generated_dir).parent / "data" / "bitacora_ajustes.jsonl"
            bitacora.parent.mkdir(parents=True, exist_ok=True)

            palabras = _palabras_clave(ajuste)
            parecidos = 0
            if bitacora.exists():
                for linea in bitacora.read_text(encoding="utf-8").splitlines():
                    try:
                        previa = set(json.loads(linea).get("palabras", []))
                    except (json.JSONDecodeError, AttributeError):
                        continue
                    union = palabras | previa
                    if union and len(palabras & previa) / len(union) >= 0.4:
                        parecidos += 1

            candidato = parecidos >= 2
            registro = {
                "fecha": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "proyecto": proyecto,
                "ajuste": ajuste[:300],
                "palabras": sorted(palabras),
                "archivos": [c.path for c in cambios],
                "aplicado": aplicado,
                "revertido": revertido,
                "candidato_a_determinista": candidato,
            }
            with bitacora.open("a", encoding="utf-8") as f:
                f.write(json.dumps(registro, ensure_ascii=False) + "\n")

            if candidato:
                logger.warning(
                    "CÍRCULO VIRTUOSO: el ajuste '%s' ya se ha pedido %d veces en "
                    "distintas clases — es candidato a arreglo determinista del "
                    "generador (0 tokens, para siempre).", ajuste[:80], parecidos + 1)
        except OSError:
            logger.debug("No se pudo escribir la bitácora de ajustes.", exc_info=True)

    # ------------------------------------------------------------------
    @staticmethod
    def _escribir(raiz: Path, cambios: list[CambioArchivo]) -> None:
        """Escribe los archivos del ajuste dentro de la carpeta del proyecto."""
        for cambio in cambios:
            destino = _ruta_segura(raiz, cambio.path)
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(cambio.contenido_nuevo, encoding="utf-8")

    @staticmethod
    def _revertir(raiz: Path, respaldo: dict[str, str | None]) -> None:
        """Devuelve cada archivo a su contenido previo (o lo borra si era nuevo)."""
        for path, contenido in respaldo.items():
            destino = _ruta_segura(raiz, path)
            if contenido is None:
                destino.unlink(missing_ok=True)
            else:
                destino.write_text(contenido, encoding="utf-8")


_VACIAS = {
    "que", "quiero", "para", "con", "una", "del", "los", "las", "por", "the",
    "and", "want", "make", "please", "porfa", "favor", "como", "esta", "este",
    "más", "mas", "muy", "sea", "ser", "hacer", "poner", "añade", "añadir",
    "agrega", "agregar", "cambia", "cambiar", "arregla", "arreglar",
}


def _palabras_clave(texto: str) -> set[str]:
    """Palabras significativas de la petición, para comparar ajustes entre sí."""
    return {
        p for p in "".join(c.lower() if c.isalnum() else " " for c in texto).split()
        if len(p) >= 4 and p not in _VACIAS
    }


def _ruta_segura(raiz: Path, relativa: str) -> Path:
    """Resuelve la ruta impidiendo escapar de la carpeta del proyecto.

    El contenido viene de un LLM: un `../../` en la ruta escribiría fuera del
    proyecto. Se comprueba explícitamente en vez de confiar.
    """
    destino = (raiz / relativa).resolve()
    if not destino.is_relative_to(raiz.resolve()):
        raise AuditError(f"Ruta fuera del proyecto: {relativa}")
    return destino


def _con_diffs(
    cambios: list[CambioArchivo], anteriores: dict[str, str]
) -> list[CambioArchivo]:
    """Calcula el diff de cada cambio y descarta los que no cambian nada."""
    utiles: list[CambioArchivo] = []
    for cambio in cambios:
        previo = anteriores.get(cambio.path)
        if previo is not None and previo == cambio.contenido_nuevo:
            continue  # el modelo devolvió el archivo idéntico: no es un cambio
        diff = "".join(difflib.unified_diff(
            (previo or "").splitlines(keepends=True),
            cambio.contenido_nuevo.splitlines(keepends=True),
            fromfile=f"a/{cambio.path}",
            tofile=f"b/{cambio.path}",
        ))
        utiles.append(cambio.model_copy(update={"diff": diff, "es_nuevo": previo is None}))
    return utiles
