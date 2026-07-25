"""Adaptador con IA que diseña el PLAN DE ESTUDIOS de un proyecto.

Analiza el código real del alumno y arma un curso de N clases: cada una con
objetivo, contenido sobre SU proyecto, un reto y un criterio de superación
VERIFICABLE (quiz sobre su código, un cambio aplicado, su repo o su URL vivos).
"""

from __future__ import annotations

import logging

from src.domain.entities import (
    Clase,
    CriterioSuperacion,
    PreguntaQuiz,
    Syllabus,
    TipoCriterio,
)
from src.domain.ports import AuditError, GeneradorSyllabusPort
from src.infrastructure.adapters.multimodel_llm import LLMError, MultiModelLLM
from src.infrastructure.adapters.skills_loader import skill

logger = logging.getLogger(__name__)

_TIPOS = {"quiz", "cambio", "repo_git", "url_publicada", "reflexion"}

# Cómo cambia la EXIGENCIA de los criterios según el nivel del alumno.
_GUIA_NIVEL = {
    "bajo": ("NUNCA ha programado. Retos muy pequeños y celebrados. Las clases "
             "avanzadas (git, publicar) deben tener criterio 'reflexion' (que "
             "explique qué haría), NO exigir repo_git ni url_publicada reales "
             "todavía: eso lo abruma y lo espanta. Cero pruebas técnicas duras."),
    "medio": ("Se defiende. Puedes exigir un poco más y mantener repo_git y "
              "url_publicada en las clases de git/publicar."),
    "alto": ("Entiende de sistemas. Puedes ser exigente: quiz técnicos, repo_git "
             "y url_publicada reales, y algún reto avanzado extra."),
}

SYSTEM_PROMPT = """\
Eres el DISEÑADOR DE CURSOS del Meta-Agente. Recibes el código real del proyecto
de un alumno (que NO sabe programar) y diseñas un curso que lo lleva de la mano,
clase a clase, de "no entiendo nada" a "tengo mi sistema en internet y sé cómo
funciona". El material del curso es SU propio proyecto — nunca ejemplos ajenos.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown):
{
  "titulo_curso": "Nombre motivador del curso, con el nombre del proyecto",
  "resumen": "1-2 frases de qué logrará el alumno al terminar",
  "clases": [
    {
      "titulo": "Título corto y claro",
      "objetivo": "Qué logras en esta clase, en una frase, en cristiano",
      "contenido": "La explicación (markdown, 2-4 párrafos). Habla de SU proyecto por su nombre, sus archivos, sus datos reales. Analogías cotidianas. Sin jerga sin traducir.",
      "reto": "El ejercicio práctico concreto de esta clase",
      "concepto_clave": "El concepto que se aprende",
      "criterio": {
        "tipo": "quiz | cambio | repo_git | url_publicada | reflexion",
        "descripcion": "Cómo se supera la clase, en cristiano",
        "quiz": [ {"pregunta":"...", "opciones":["a","b","c"], "correcta":1} ],
        "aciertos_minimos": 2,
        "pista": "Ayuda breve si se atasca"
      }
    }
  ]
}

DISEÑO OBLIGATORIO del arco de clases (adáptalo al proyecto, pero respeta el viaje):
1. "Conoce tu sistema" — qué hace, sus partes. criterio tipo "quiz" (3 preguntas sobre SU proyecto).
2. Tu primer cambio pequeño (un texto/título). criterio "cambio".
3. Los datos de tu sistema (semillas/contenido). criterio "quiz" o "cambio".
4. Correrlo en tu computador sin Docker (Node/instalar/arrancar). criterio "reflexion".
5-6. Entender y tocar el CRUD / una entidad o pantalla. criterio "quiz" o "cambio".
7. Git y GitHub: la caja fuerte de tu código. criterio tipo "repo_git".
8. Publicarlo GRATIS en internet (Netlify si es estático, Render si tiene backend). criterio "url_publicada".
9. Cambiar algo y volver a publicar (el ciclo real). criterio "reflexion" o "url_publicada".
10+. Graduación: repaso y siguientes pasos. criterio "quiz" final.
(Si te piden MÁS de 10 clases, añade avanzadas: dominio propio, base de datos persistente, analítica, seguridad — cada una con su criterio.)

REGLAS:
- EXACTAMENTE el número de clases pedido.
- Los quiz preguntan sobre EL PROYECTO DEL ALUMNO (sus archivos, sus datos), no teoría genérica. 3 opciones, una correcta.
- "tipo" SIEMPRE uno de: quiz, cambio, repo_git, url_publicada, reflexion.
- Clase 7 = repo_git; una clase de publicar = url_publicada. Sin falta.
- Tono del profesor paciente: celebra, motiva, cero jerga sin explicar.
- Todo en el idioma indicado.
"""


class LLMGeneradorSyllabus(GeneradorSyllabusPort):
    def __init__(self) -> None:
        # Rol "prompt": es diseño y redacción, no escribir código.
        self._llm = MultiModelLLM(role="prompt")

    def generar(self, proyecto, arquetipo, files, num_clases, language="es",
                nivel="desconocido") -> Syllabus:
        # Contexto: rutas + fragmentos de los archivos que dan identidad.
        rutas = "\n".join(f"- {f.path}" for f in files[:40])
        claves = [f for f in files if f.path.endswith(
            ("dominio.json", "server.js", "main.py", "App.jsx", "index.html",
             "package.json"))][:5]
        fragmentos = "\n\n".join(f"=== {f.path} ===\n{f.content[:1500]}" for f in claves)
        idioma = "español" if language == "es" else "English"
        guia_nivel = _GUIA_NIVEL.get(nivel, "")
        user = (
            f"[Redacta TODO en {idioma}]\n"
            + (f"NIVEL DEL ALUMNO: {guia_nivel}\n" if guia_nivel else "")
            + f"PROYECTO: {proyecto} (arquetipo: {arquetipo or 'desconocido'})\n"
            f"NÚMERO EXACTO DE CLASES: {num_clases}\n\n"
            f"ARCHIVOS DEL PROYECTO:\n{rutas}\n\n"
            f"CÓDIGO CLAVE:\n{fragmentos}"
        )
        try:
            data = self._llm.chat_json(
                SYSTEM_PROMPT + "\n\n" + skill("profesor_paciente.md"),
                user, temperature=0.4,
            )
        except LLMError as exc:
            raise AuditError(str(exc)) from exc

        clases = self._sanear_clases(data.get("clases") or [], num_clases)
        if not clases:
            raise AuditError("El diseñador de cursos no devolvió clases válidas.")
        return Syllabus(
            proyecto=proyecto,
            arquetipo=arquetipo,
            titulo_curso=str(data.get("titulo_curso") or f"Aprende con {proyecto}"),
            resumen=str(data.get("resumen") or ""),
            clases=clases,
        )

    def _sanear_clases(self, brutas: list, num: int) -> list[Clase]:
        clases: list[Clase] = []
        for i, c in enumerate(brutas[:num], start=1):
            try:
                crit = c.get("criterio") or {}
                tipo = str(crit.get("tipo", "reflexion")).lower()
                if tipo not in _TIPOS:
                    tipo = "reflexion"
                quiz = []
                for q in (crit.get("quiz") or [])[:5]:
                    ops = [str(o) for o in (q.get("opciones") or []) if str(o).strip()]
                    if len(ops) >= 2:
                        correcta = int(q.get("correcta", 0))
                        correcta = correcta if 0 <= correcta < len(ops) else 0
                        quiz.append(PreguntaQuiz(
                            pregunta=str(q.get("pregunta", "")).strip() or "¿?",
                            opciones=ops, correcta=correcta))
                if tipo == "quiz" and not quiz:
                    tipo = "reflexion"  # sin preguntas no puede ser quiz
                clases.append(Clase(
                    numero=i,
                    titulo=str(c.get("titulo") or f"Clase {i}").strip()[:120],
                    objetivo=str(c.get("objetivo") or "").strip()[:400] or "Aprender un paso más.",
                    contenido=str(c.get("contenido") or "").strip()[:4000] or "…",
                    reto=str(c.get("reto") or "").strip()[:600] or "Explora tu proyecto.",
                    concepto_clave=str(c.get("concepto_clave") or "").strip()[:200],
                    criterio=CriterioSuperacion(
                        tipo=TipoCriterio(tipo),
                        descripcion=str(crit.get("descripcion") or "Demuestra lo aprendido.").strip()[:400],
                        quiz=quiz,
                        aciertos_minimos=max(1, min(int(crit.get("aciertos_minimos", 2) or 2), len(quiz) or 1)),
                        pista=str(crit.get("pista") or "").strip()[:300],
                    ),
                ))
            except (ValueError, TypeError, KeyError) as exc:
                logger.warning("Clase %d descartada por formato: %s", i, exc)
        return clases
