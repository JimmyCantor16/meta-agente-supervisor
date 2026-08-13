"""Adaptador con IA que diseña el PLAN DE ESTUDIOS de un proyecto.

Analiza el código real del alumno y arma un curso de N clases: cada una con
objetivo, contenido sobre SU proyecto, un reto y un criterio de superación
VERIFICABLE (quiz sobre su código, un cambio aplicado, su repo o su URL vivos).

SE GENERA EN VARIAS LLAMADAS PEQUEÑAS, A PROPÓSITO
--------------------------------------------------
Pedir el curso entero de una vez desbordaba el límite de SALIDA de los modelos
gratuitos: 18 clases con su contenido de 2-4 párrafos y su quiz son más de 20k
tokens, y la respuesta volvía cortada. Con los planes de pago (pro=15,
business=18) fallaba aproximadamente una de cada tres veces, y al cortarse el
JSON no se salvaba nada: el alumno se quedaba sin curso.

Ahora va en dos fases:
  1. EL ÍNDICE — títulos, objetivos y tipo de criterio de las N clases. Es una
     respuesta corta, que cabe de sobra.
  2. EL DETALLE — el contenido, el reto y el quiz, en lotes de pocas clases.

Si un lote falla, esa clase se queda con lo del índice (título y objetivo) en
vez de tumbar el curso entero. Media clase es recuperable; ninguna, no.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

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


def _nivel_de(nivel: str | Callable[[], str]) -> str:
    """Resuelve el nivel VIGENTE: acepta el string de siempre o un callable.

    El caso de uso pasa un callable para que cada lote del temario se genere
    con el nivel del momento. Si el callable falla, se degrada a 'desconocido'
    — nunca puede tumbar la generación del curso.
    """
    if callable(nivel):
        try:
            nivel = nivel()
        except Exception:  # noqa: BLE001 - leer el nivel jamás rompe el temario
            return "desconocido"
    return str(nivel or "desconocido").strip().lower() or "desconocido"

# Clases por llamada de detalle. Cuatro clases con su contenido y su quiz rondan
# los 4-5k tokens de salida: entran holgadas en cualquier modelo gratuito.
_CLASES_POR_LOTE = 4


def _indice_valido(data: dict) -> None:
    """Contrato mínimo del índice, para que corra DENTRO del bucle de fallback.

    Sin esto, un proveedor que devolviera `{"curso": [...]}` en vez de `clases`
    se daba por bueno y tumbaba la petición sin llegar a probar a los demás.
    """
    clases = data.get("clases")
    if not isinstance(clases, list) or not clases:
        raise ValueError("falta la lista 'clases'")
    if not all(isinstance(c, dict) and str(c.get("titulo") or "").strip() for c in clases):
        raise ValueError("hay clases sin 'titulo'")

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

_QUIEN_ERES = """\
Eres el DISEÑADOR DE CURSOS del Meta-Agente. Recibes el código real del proyecto
de un alumno (que NO sabe programar) y diseñas un curso que lo lleva de la mano,
clase a clase, de "no entiendo nada" a "tengo mi sistema en internet y sé cómo
funciona". El material del curso es SU propio proyecto — nunca ejemplos ajenos.
"""

# --- FASE 1: el índice. Respuesta corta, cabe en cualquier modelo gratuito. ---
SYSTEM_INDICE = _QUIEN_ERES + """
Diseña SOLO EL ÍNDICE del curso: los títulos y de qué va cada clase. NO escribas
todavía el contenido ni los quiz — eso viene después, clase por clase.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown):
{
  "titulo_curso": "Nombre motivador del curso, con el nombre del proyecto",
  "resumen": "1-2 frases de qué logrará el alumno al terminar",
  "clases": [
    {
      "titulo": "Título corto y claro",
      "objetivo": "Qué logras en esta clase, en una frase, en cristiano",
      "concepto_clave": "El concepto que se aprende",
      "tipo": "quiz | cambio | repo_git | url_publicada | reflexion"
    }
  ]
}

DISEÑO OBLIGATORIO del arco de clases (adáptalo al proyecto, pero respeta el viaje):
1. "Conoce tu sistema" — qué hace, sus partes. tipo "quiz".
2. Tu primer cambio pequeño (un texto/título). tipo "cambio".
3. Los datos de tu sistema (semillas/contenido). tipo "quiz" o "cambio".
4. Correrlo en tu computador sin Docker (instalar/arrancar). tipo "reflexion".
5-6. Entender y tocar el CRUD / una entidad o pantalla. tipo "quiz" o "cambio".
7. Git y GitHub: la caja fuerte de tu código. tipo "repo_git".
8. Publicarlo GRATIS en internet (Netlify si es estático, Render si tiene backend). tipo "url_publicada".
9. Cambiar algo y volver a publicar (el ciclo real). tipo "reflexion" o "url_publicada".
10+. Graduación: repaso y siguientes pasos. tipo "quiz" final.
(Si te piden MÁS de 10 clases, añade avanzadas: dominio propio, base de datos persistente, analítica, seguridad.)

REGLAS:
- EXACTAMENTE el número de clases pedido, ni una más ni una menos.
- Clase 7 = repo_git; una clase de publicar = url_publicada. Sin falta.
- "tipo" SIEMPRE uno de: quiz, cambio, repo_git, url_publicada, reflexion.
- Tono del profesor paciente: celebra, motiva, cero jerga sin explicar.
- Todo en el idioma indicado.
"""

# --- FASE 1 bis: el índice cuando el curso es sobre un TEMA, no un proyecto. ---
SYSTEM_INDICE_TEMA = _QUIEN_ERES + """
Diseña SOLO EL ÍNDICE de un curso sobre el TEMA que se te indica. NO escribas
todavía el contenido ni los quiz — eso viene después, clase por clase.

Aquí NO hay proyecto ni archivos del alumno: el material es el tema en sí.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown):
{
  "titulo_curso": "Nombre motivador del curso sobre el tema",
  "resumen": "1-2 frases de qué sabrá hacer el alumno al terminar",
  "clases": [
    {
      "titulo": "Título corto y claro",
      "objetivo": "Qué logras en esta clase, en una frase, en cristiano",
      "concepto_clave": "El concepto que se aprende",
      "tipo": "quiz | reflexion | repo_git | url_publicada"
    }
  ]
}

DISEÑO DEL ARCO (adáptalo al tema, pero respeta el viaje):
1. Qué es y para qué sirve de verdad. Con un ejemplo que se entienda.
2. Instalarlo / entrar por primera vez y ver algo funcionando.
3-4. Los dos o tres conceptos que sostienen todo lo demás.
5-7. Construir algo pequeño de punta a punta, por partes.
8-9. Los errores típicos y cómo salir de ellos.
10+. Llevarlo a lo real (compartirlo, publicarlo, automatizarlo) y repaso final.

REGLAS:
- EXACTAMENTE el número de clases pedido, ni una más ni una menos.
- **NUNCA uses el tipo "cambio"**: ese exige tocar un archivo de un proyecto, y
  aquí no hay proyecto. Usa "quiz" o "reflexion"; usa "repo_git" o
  "url_publicada" SOLO si el tema lleva de forma natural a publicar algo.
- **AL MENOS LA MITAD DE LAS CLASES DEBEN SER "quiz"**, y la primera SIEMPRE.
  Es lo que separa este curso de leer un tutorial: con "reflexion" el alumno
  escribe lo que sea y sigue; con "quiz" hay que haber entendido de verdad.
  Un quiz sobre el TEMA no es duro ni para un principiante — lo duro es pedir
  un repositorio o una URL publicada, y eso sí se reserva para quien va bien.
- Alterna: no pongas todas las de quiz al principio y todas las de reflexión al
  final. La comprobación tiene que estar repartida por todo el curso.
- CONCRETO SIEMPRE: nombra las herramientas, pantallas y piezas REALES del
  tema. Un índice que serviría para cualquier tema no sirve para ninguno.
- Cada clase deja algo HECHO, no solo leído.
- Tono del profesor paciente: celebra, motiva, cero jerga sin explicar.
- Todo en el idioma indicado.
"""


# --- FASE 2: el detalle, en lotes de pocas clases. ---
SYSTEM_DETALLE = _QUIEN_ERES + """
Ya existe el índice del curso. Ahora ESCRIBE EL CONTENIDO COMPLETO de las pocas
clases que se te indican, respetando su título, objetivo y tipo de criterio.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown):
{
  "clases": [
    {
      "numero": 3,
      "contenido": "La explicación (markdown, 2-4 párrafos). Habla de SU proyecto por su nombre, sus archivos, sus datos reales. Analogías cotidianas. Sin jerga sin traducir.",
      "reto": "El ejercicio práctico concreto de esta clase",
      "reto_avanzado": "SOLO si el nivel del alumno es medio o alto: un desafío EXTRA opcional que va más allá del reto (más técnico, sin pasos masticados). Si el nivel es bajo o no se indica, deja cadena vacía.",
      "criterio": {
        "descripcion": "Cómo se supera la clase, en cristiano",
        "quiz": [ {"pregunta":"...", "opciones":["a","b","c"], "correcta":1} ],
        "aciertos_minimos": 2,
        "pista": "Ayuda breve si se atasca",
        "archivo": "SOLO si el tipo es 'cambio': la ruta EXACTA del archivo a modificar, copiada de la lista de archivos",
        "resultado_esperado": "SOLO si el tipo es 'cambio': qué debe verse diferente en la pantalla al lograrlo"
      }
    }
  ]
}

REGLAS:
- Una entrada por cada clase pedida, con su "numero" EXACTO del índice.
- Si el tipo de la clase es "quiz": 3 preguntas SOBRE EL PROYECTO DEL ALUMNO (sus
  archivos, sus datos), no teoría genérica. 3 opciones cada una, una correcta.
- Si el tipo NO es "quiz", deja "quiz" como lista vacía.
- Si el tipo es "cambio": "archivo" debe ser una ruta EXACTA de la lista de
  archivos de arriba (no la inventes) y "resultado_esperado" debe describir un
  cambio VISIBLE en pantalla. El aula le abre ese archivo al alumno; si la ruta
  no existe, se queda mirando 23 archivos sin saber cuál tocar.
- "reto_avanzado" SOLO se rellena para alumnos de nivel medio/alto (mira el
  NIVEL DEL ALUMNO del contexto): es el plus retador para quien va sobrado,
  concreto y sobre SU proyecto/tema. Para nivel bajo o desconocido: "".
- Tono del profesor paciente: celebra, motiva, cero jerga sin explicar.
- Todo en el idioma indicado.
"""


class LLMGeneradorSyllabus(GeneradorSyllabusPort):
    def __init__(self) -> None:
        # Rol "prompt": es diseño y redacción, no escribir código.
        self._llm = MultiModelLLM(role="prompt")

    def generar(self, proyecto, arquetipo, files, num_clases, language="es",
                nivel="desconocido", tema="") -> Syllabus:
        """Diseña el temario. `nivel` puede ser un string o un CALLABLE.

        Cuando es un callable (lo pasa el caso de uso), cada LOTE de detalle se
        genera leyendo el nivel VIGENTE en ese momento — no la foto de cuando
        se pidió el curso. Es la pieza que hace continuo el "retador para quien
        sabe, sencillo para quien no".
        """
        tema = (tema or "").strip()

        def contexto_con(nivel_txt: str) -> str:
            if tema:
                return self._contexto_tema(tema, language, nivel_txt)
            return self._contexto(proyecto, arquetipo, files, language, nivel_txt)

        rutas_reales: list[str] = [] if tema else [f.path for f in files]
        nivel_indice = _nivel_de(nivel)

        indice = self._pedir_indice(contexto_con(nivel_indice), num_clases, tema)
        cabeceras = (indice.get("clases") or [])[:num_clases]
        if not cabeceras:
            raise AuditError("El diseñador de cursos no devolvió clases válidas.")

        # El detalle se pide en lotes pequeños. Cada lote es independiente: si
        # uno falla, sus clases quedan con lo del índice y el curso sigue en pie.
        # Y cada lote lee el nivel VIGENTE: si cambió a mitad, el resto del
        # curso ya sale calibrado al nivel nuevo.
        detalles: dict[int, dict] = {}
        for inicio in range(0, len(cabeceras), _CLASES_POR_LOTE):
            lote = cabeceras[inicio : inicio + _CLASES_POR_LOTE]
            nivel_lote = _nivel_de(nivel)
            detalles.update(
                self._pedir_detalle(contexto_con(nivel_lote), lote, inicio + 1, nivel_lote)
            )

        brutas = [
            self._fusionar(cab, detalles.get(inicio + 1, {}))
            for inicio, cab in enumerate(cabeceras)
        ]
        clases = self._sanear_clases(brutas, num_clases, rutas_reales=rutas_reales)
        if not clases:
            raise AuditError("El diseñador de cursos no devolvió clases válidas.")

        completas = sum(1 for c in clases if len(c.contenido) > 40)
        logger.info(
            "Temario de '%s': %d clase(s), %d con contenido completo (%d lote(s)).",
            proyecto, len(clases), completas,
            (len(cabeceras) + _CLASES_POR_LOTE - 1) // _CLASES_POR_LOTE,
        )
        return Syllabus(
            proyecto=proyecto,
            arquetipo=arquetipo,
            titulo_curso=str(
                indice.get("titulo_curso")
                or (f"Aprende {tema}" if tema else f"Aprende con {proyecto}")
            ),
            resumen=str(indice.get("resumen") or ""),
            clases=clases,
            tema=tema,
        )

    # ------------------------------------------------------------------ fases
    @staticmethod
    def _contexto(proyecto, arquetipo, files, language, nivel) -> str:
        """El bloque de contexto que comparten las dos fases."""
        rutas = "\n".join(f"- {f.path}" for f in files[:40])
        claves = [f for f in files if f.path.endswith(
            ("dominio.json", "server.js", "main.py", "App.jsx", "index.html",
             "package.json"))][:5]
        fragmentos = "\n\n".join(f"=== {f.path} ===\n{f.content[:1500]}" for f in claves)
        idioma = "español" if language == "es" else "English"
        guia_nivel = _GUIA_NIVEL.get(nivel, "")
        return (
            f"[Redacta TODO en {idioma}]\n"
            + (f"NIVEL DEL ALUMNO: {guia_nivel}\n" if guia_nivel else "")
            + f"PROYECTO: {proyecto} (arquetipo: {arquetipo or 'desconocido'})\n\n"
            f"ARCHIVOS DEL PROYECTO:\n{rutas}\n\n"
            f"CÓDIGO CLAVE:\n{fragmentos}"
        )

    @staticmethod
    def _contexto_tema(tema: str, language: str, nivel: str) -> str:
        """Contexto de un curso sobre un TEMA, sin proyecto que leer.

        Aquí el material no está en disco: está en lo que el modelo sabe del
        tema. Por eso se le pide explícitamente que aterrice en ejemplos y
        herramientas REALES — un curso de n8n que no nombra un nodo de n8n es
        justo el resultado genérico que hay que evitar.
        """
        idioma = "español" if language == "es" else "English"
        guia_nivel = _GUIA_NIVEL.get(nivel, "")
        return (
            f"[Redacta TODO en {idioma}]\n"
            + (f"NIVEL DEL ALUMNO: {guia_nivel}\n" if guia_nivel else "")
            + f"TEMA DEL CURSO: {tema}\n\n"
            "NO hay proyecto ni archivos: el curso enseña este tema desde cero.\n"
            "OJO con el nivel: aunque el alumno sea principiante, los QUIZ siguen "
            "siendo obligatorios (son preguntas sobre el tema, no pruebas técnicas). "
            "Lo que se suaviza para un principiante es pedirle un repositorio o "
            "publicar algo, no comprobar que entendió.\n"
            "Aterriza SIEMPRE en lo concreto y real del tema (sus herramientas, "
            "sus nombres propios, sus pantallas, sus errores típicos). Un curso "
            "que podría valer para cualquier otro tema no sirve para ninguno.\n"
            "Cada clase debe dejar algo HECHO, no solo leído."
        )

    def _pedir_indice(self, contexto: str, num_clases: int, tema: str = "") -> dict:
        """Fase 1: títulos y tipo de criterio. Sin esto no hay curso."""
        sistema = SYSTEM_INDICE_TEMA if tema else SYSTEM_INDICE
        try:
            return self._llm.chat_json(
                sistema + "\n\n" + skill("profesor_paciente.md"),
                f"{contexto}\n\nNÚMERO EXACTO DE CLASES: {num_clases}",
                temperature=0.4,
                validar=_indice_valido,
            )
        except LLMError as exc:
            raise AuditError(str(exc)) from exc

    def _pedir_detalle(
        self, contexto: str, lote: list[dict], primero: int,
        nivel: str = "desconocido",
    ) -> dict[int, dict]:
        """Fase 2: contenido y quiz de un lote. Si falla, se degrada, no se cae."""
        pedido = "\n".join(
            f"- Clase {primero + i}: «{c.get('titulo')}» · objetivo: {c.get('objetivo')} "
            f"· tipo de criterio: {c.get('tipo') or 'reflexion'}"
            for i, c in enumerate(lote)
        )
        try:
            data = self._llm.chat_json(
                SYSTEM_DETALLE + "\n\n" + skill("profesor_paciente.md"),
                f"{contexto}\n\nESCRIBE EL CONTENIDO DE ESTAS CLASES:\n{pedido}",
                temperature=0.4,
            )
        except LLMError as exc:
            # Degradar es correcto aquí: estas clases se quedan con su título y
            # objetivo del índice. Perder el lote no debe costar el curso entero.
            logger.warning(
                "Lote de clases %d-%d sin detalle (%s); se quedan con el índice.",
                primero, primero + len(lote) - 1, exc,
            )
            return {}

        salida: dict[int, dict] = {}
        for c in data.get("clases") or []:
            if not isinstance(c, dict):
                continue
            # El reto avanzado es EXCLUSIVO de medio/alto: si el modelo lo
            # rellenó igual para un principiante, se descarta aquí, en código.
            if nivel not in ("medio", "alto"):
                c.pop("reto_avanzado", None)
            try:
                salida[int(c.get("numero"))] = c
            except (TypeError, ValueError):
                continue
        return salida

    @staticmethod
    def _fusionar(cabecera: dict, detalle: dict) -> dict:
        """Une índice y detalle en la forma que espera `_sanear_clases`."""
        criterio = dict(detalle.get("criterio") or {})
        # El TIPO manda desde el índice: es quien diseñó el arco del curso.
        criterio["tipo"] = cabecera.get("tipo") or criterio.get("tipo") or "reflexion"
        return {
            "titulo": cabecera.get("titulo"),
            "objetivo": cabecera.get("objetivo"),
            "concepto_clave": cabecera.get("concepto_clave"),
            "contenido": detalle.get("contenido"),
            "reto": detalle.get("reto"),
            "reto_avanzado": detalle.get("reto_avanzado"),
            "criterio": criterio,
        }

    @staticmethod
    def _archivo_real(propuesto: str, rutas_reales: list[str]) -> str:
        """Comprueba que el archivo que pide la clase EXISTA de verdad.

        El modelo se inventa rutas con facilidad («src/App.jsx» en un proyecto
        que no tiene src). Si el aula abriera una ruta inventada, el alumno vería
        un error justo en el momento en que se le pide tocar código. Mejor sin
        archivo — el aula abre el principal — que con uno falso.
        """
        limpio = (propuesto or "").strip().replace("\\", "/").lstrip("./")
        if not limpio:
            return ""
        if limpio in rutas_reales:
            return limpio
        # A veces acierta el nombre y falla la carpeta: se acepta si es único.
        hoja = limpio.rsplit("/", 1)[-1]
        coincidencias = [r for r in rutas_reales if r.rsplit("/", 1)[-1] == hoja]
        return coincidencias[0] if len(coincidencias) == 1 else ""

    def _sanear_clases(
        self, brutas: list, num: int, rutas_reales: list[str] | None = None
    ) -> list[Clase]:
        rutas_reales = rutas_reales or []
        clases: list[Clase] = []
        for i, c in enumerate(brutas[:num], start=1):
            try:
                crit = c.get("criterio") or {}
                tipo = str(crit.get("tipo", "reflexion")).lower()
                if tipo not in _TIPOS:
                    tipo = "reflexion"
                # Sin archivos no hay archivo que tocar. Un criterio "cambio" en
                # un curso de tema mandaría al alumno al aula a editar un
                # proyecto que no existe: se convierte en reflexión, que es la
                # misma tarea contada con palabras.
                if tipo == "cambio" and not rutas_reales:
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
                    reto_avanzado=str(c.get("reto_avanzado") or "").strip()[:600],
                    concepto_clave=str(c.get("concepto_clave") or "").strip()[:200],
                    criterio=CriterioSuperacion(
                        tipo=TipoCriterio(tipo),
                        descripcion=str(crit.get("descripcion") or "Demuestra lo aprendido.").strip()[:400],
                        quiz=quiz,
                        aciertos_minimos=max(1, min(int(crit.get("aciertos_minimos", 2) or 2), len(quiz) or 1)),
                        pista=str(crit.get("pista") or "").strip()[:300],
                        archivo=self._archivo_real(str(crit.get("archivo") or ""), rutas_reales),
                        resultado_esperado=str(crit.get("resultado_esperado") or "").strip()[:300],
                    ),
                ))
            except (ValueError, TypeError, KeyError) as exc:
                logger.warning("Clase %d descartada por formato: %s", i, exc)
        return clases
