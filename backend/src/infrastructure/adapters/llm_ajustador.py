"""Adaptador del agente que traduce una lección en un cambio de código real.

A diferencia del profesor (que solo explica), este SÍ escribe código, así que
usa el rol "code" del cliente multi-modelo. Sigue siendo didáctico: además del
cambio devuelve por qué se hace y qué concepto enseña.
"""

from __future__ import annotations

import logging

from src.config import Settings
from src.domain.entities import CambioArchivo, GeneratedFile
from src.domain.ports import AjustadorModuloPort, AuditError
from src.infrastructure.adapters.skills_loader import skill
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM

logger = logging.getLogger(__name__)

# Solo se mandan al modelo los archivos relevantes: el contexto es caro y los
# proveedores gratuitos tienen límites de tokens muy justos.
_MAX_ARCHIVOS_CONTEXTO = 14
_MAX_CHARS_ARCHIVO = 4_000

SYSTEM_PROMPT = """\
Eres un desarrollador senior que además ENSEÑA. Recibes el código de un proyecto
y un ajuste que el alumno quiere hacer en un módulo. Devuelves el cambio
concreto, explicando por qué.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown):
{
  "explicacion": "Por qué hace falta este cambio y qué resuelve (2-4 frases, sencillo).",
  "concepto": "El concepto técnico que el alumno aprende con esto (una frase).",
  "cambios": [
    {"path": "ruta/exacta/del/archivo.js", "contenido_nuevo": "CONTENIDO COMPLETO del archivo ya ajustado"}
  ]
}

Reglas estrictas:
- `path` debe ser una ruta que EXISTA en los archivos dados, salvo que el ajuste
  requiera crear un archivo nuevo (entonces usa una ruta coherente con el proyecto).
- `contenido_nuevo` es el archivo ENTERO y funcional, no un fragmento ni un diff.
- Cambia SOLO lo necesario para el ajuste pedido. No reescribas ni reformatees
  archivos que el ajuste no toca.
- Toca los MENOS archivos posibles (idealmente 1-3).
- No inventes librerías que el proyecto no declare en su package.json/requirements.
- Si el ajuste no requiere tocar código, devuelve "cambios": [].
- Redacta la explicación en el idioma indicado.
"""


class LLMAjustadorModulo(AjustadorModuloPort):
    """Propone el cambio de código de una lección, con el rol de código."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._llm = MultiModelLLM(role="code")

    def proponer(
        self,
        target_name: str,
        files: list[GeneratedFile],
        ajuste: str,
        language: str = "es",
    ) -> tuple[list[CambioArchivo], str, str]:
        contexto = _contexto(files, ajuste)
        user = (
            f"[Idioma: {language}]\n\n"
            f"Proyecto: {target_name}\n\n"
            f"AJUSTE QUE PIDE EL ALUMNO:\n{ajuste}\n\n"
            f"=== ARCHIVOS DEL PROYECTO ===\n{contexto}"
        )
        try:
            payload = self._llm.chat_json(SYSTEM_PROMPT + "\n\n" + skill("profesor_paciente.md"), user, temperature=0.2)
        except LLMError as exc:
            raise AuditError(str(exc)) from exc

        rutas_validas = {f.path for f in files}
        cambios: list[CambioArchivo] = []
        for bruto in payload.get("cambios") or []:
            if not isinstance(bruto, dict):
                continue
            path = str(bruto.get("path") or "").strip().lstrip("/")
            contenido = bruto.get("contenido_nuevo")
            if not path or not isinstance(contenido, str) or not contenido.strip():
                continue
            if path not in rutas_validas:
                # Puede ser un archivo nuevo legítimo, pero también una ruta
                # inventada: se acepta y el caso de uso la valida contra la raíz.
                logger.info("Ajuste propone un archivo nuevo: %s", path)
            cambios.append(CambioArchivo(path=path, contenido_nuevo=contenido))

        explicacion = str(payload.get("explicacion") or "").strip()
        concepto = str(payload.get("concepto") or "").strip()
        return cambios, explicacion, concepto


def _contexto(files: list[GeneratedFile], ajuste: str) -> str:
    """Arma el contexto priorizando los archivos que menciona el ajuste.

    Mandar el proyecto entero agota el cupo del tier gratuito, así que se
    ordenan por relevancia (los nombrados en el ajuste primero) y se recorta.
    """
    pistas = {p.lower() for p in ajuste.replace("/", " ").replace(".", " ").split() if len(p) > 3}

    def relevancia(f: GeneratedFile) -> int:
        nombre = f.path.lower()
        return -sum(1 for pista in pistas if pista in nombre)

    ordenados = sorted(files, key=relevancia)[:_MAX_ARCHIVOS_CONTEXTO]
    partes = []
    for f in ordenados:
        cuerpo = f.content
        if len(cuerpo) > _MAX_CHARS_ARCHIVO:
            cuerpo = cuerpo[:_MAX_CHARS_ARCHIVO] + "\n... (recortado)"
        partes.append(f"--- {f.path} ---\n{cuerpo}")
    return "\n\n".join(partes)
