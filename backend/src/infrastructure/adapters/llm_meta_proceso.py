"""Adaptador con IA que diseña el MAPA DE HITOS de una meta de proceso.

Convierte una meta grande y difusa ('monetizar mi canal') en un camino honesto
de pasos, cada uno marcado según de quién depende: el alumno, la plataforma, el
tiempo, o lo que construimos aquí.
"""

from __future__ import annotations

import logging

from src.domain.entities import DependeDe, Hito, MetaProceso
from src.domain.ports import AuditError, GeneradorMetaPort
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM
from src.infrastructure.adapters.skills_loader import skill

logger = logging.getLogger(__name__)

_DEPENDE = {"alumno", "plataforma", "tiempo", "sistema"}

SYSTEM_PROMPT = """\
Eres el PROFESOR trazando el camino de una meta que NO se logra de un tirón
porque es un PROCESO del mundo real (ej: monetizar YouTube, vender por internet).
No prometes magia ni cortas la ilusión: conviertes el sueño en un mapa de hitos
honesto, en orden, y dices con claridad de quién depende cada paso.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown):
{
  "resumen": "1-2 frases honestas: SÍ se puede, pero es un camino; qué depende de ti y del tiempo",
  "hitos": [
    {
      "titulo": "Paso concreto y corto",
      "descripcion": "Qué lograr en este paso, en cristiano",
      "depende_de": "alumno | plataforma | tiempo | sistema"
    }
  ]
}

REGLAS:
- Entre 4 y 8 hitos, en ORDEN real de ejecución.
- "depende_de": "sistema" = lo construimos aquí (una web, un sistema); "alumno" =
  trabajo que hace la persona; "plataforma" = requisito de un tercero (umbrales de
  YouTube, aprobación de Google, una cuenta de banco); "tiempo" = crecer audiencia,
  esperar una revisión.
- Separa SIEMPRE lo que el software entrega hoy de lo que exige el mundo real.
- Sin jerga sin explicar. Tono cálido, realista, motivador. En el idioma indicado.
"""


class LLMGeneradorMeta(GeneradorMetaPort):
    def __init__(self) -> None:
        self._llm = MultiModelLLM(role="prompt")

    def generar(self, objetivo, contexto, language="es") -> MetaProceso:
        idioma = "español" if language == "es" else "English"
        user = (
            f"[Responde TODO en {idioma}]\n"
            f"META DEL ALUMNO: {objetivo}\n"
            + (f"CONTEXTO: {contexto}\n" if contexto else "")
        )
        try:
            data = self._llm.chat_json(
                SYSTEM_PROMPT + "\n\n" + skill("metas_de_proceso.md"),
                user, temperature=0.4,
            )
        except LLMError as exc:
            raise AuditError(str(exc)) from exc

        hitos = self._sanear_hitos(data.get("hitos") or [])
        if not hitos:
            raise AuditError("No se pudo trazar el camino de la meta.")
        return MetaProceso(
            usuario_sub="",  # lo rellena el caso de uso
            objetivo=objetivo,
            resumen=str(data.get("resumen") or "").strip()[:600],
            hitos=hitos,
        )

    def _sanear_hitos(self, brutos: list) -> list[Hito]:
        hitos: list[Hito] = []
        for h in brutos[:8]:
            try:
                dep = str(h.get("depende_de", "alumno")).lower().strip()
                if dep not in _DEPENDE:
                    dep = "alumno"
                titulo = str(h.get("titulo") or "").strip()[:120]
                if not titulo:
                    continue
                hitos.append(Hito(
                    titulo=titulo,
                    descripcion=str(h.get("descripcion") or "").strip()[:400],
                    depende_de=DependeDe(dep),
                ))
            except (ValueError, TypeError, KeyError) as exc:
                logger.warning("Hito descartado por formato: %s", exc)
        return hitos
