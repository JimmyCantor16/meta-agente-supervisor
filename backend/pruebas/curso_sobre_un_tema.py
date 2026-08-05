"""Prueba de que el profesor puede enseñar un TEMA, no solo tu propio proyecto.

Sin red y sin gastar cupo: repositorio en memoria y generador de mentira.

QUÉ DEMUESTRA
-------------
1. Un curso sobre un tema (n8n) se crea SIN proyecto en disco: no se llama al
   lector de archivos ni una sola vez.
2. Un curso sobre un proyecto sigue exigiendo su código, como siempre.
3. El profesor recibe el TEMA como contexto, no «no se pudo leer el proyecto».
4. Ningún criterio de un curso de tema exige tocar un archivo: sería mandar al
   alumno a editar un proyecto que no tiene.
5. Los cursos de dos alumnos, o de un alumno sobre dos temas, no se pisan.

POR QUÉ EXISTE
--------------
Alguien pidió «un sistema que me enseñe a programar n8n» y recibió un CRUD con
login: una lista de lecciones vacía donde escribir sus propias lecciones. La
plataforma YA sabía enseñar —temario, clases, quizzes, superación verificable—
pero solo sobre un proyecto generado aquí. Este guion ata la apertura.

    cd backend
    python pruebas/curso_sobre_un_tema.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.application.curso_profesor import (  # noqa: E402
    ChatProfesorUseCase,
    GenerarCursoUseCase,
)
from src.domain.entities import (  # noqa: E402
    Clase,
    CriterioSuperacion,
    GeneratedFile,
    MensajeChat,
    Syllabus,
    TipoCriterio,
)
from src.domain.ports import AuditError  # noqa: E402


class LectorEspia:
    """Lector de proyectos que apunta a quién le preguntaron."""

    def __init__(self, archivos=None):
        self.archivos = archivos or []
        self.llamadas: list[str] = []

    def read(self, nombre):
        self.llamadas.append(nombre)
        if not self.archivos:
            raise AuditError(f"El proyecto '{nombre}' no existe o está vacío.")
        return self.archivos


class GeneradorFalso:
    """Devuelve un temario fijo y guarda con qué lo llamaron."""

    def __init__(self):
        self.ultima_llamada: dict = {}

    def generar(self, proyecto, arquetipo, files, num_clases, language="es",
                nivel="desconocido", tema=""):
        self.ultima_llamada = {
            "proyecto": proyecto, "archivos": len(files), "tema": tema, "num": num_clases,
        }
        clases = [
            Clase(
                numero=1, titulo="Qué es y para qué sirve", objetivo="Entenderlo",
                contenido="…", reto="Ábrelo y mira", concepto_clave="base",
                criterio=CriterioSuperacion(
                    # A propósito pide tocar un archivo: el saneador debe
                    # impedirlo cuando no hay proyecto.
                    tipo=TipoCriterio("cambio"), descripcion="Cambia algo",
                    archivo="src/app.py",
                ),
            ),
        ]
        return Syllabus(
            proyecto=proyecto, arquetipo=arquetipo, tema=tema,
            titulo_curso=f"Aprende {tema or proyecto}", resumen="…", clases=clases,
        )


class ChatEspia:
    """Guarda el contexto que le llega, que es lo que se quiere comprobar."""

    def __init__(self):
        self.contexto = ""

    def responder(self, clase, historial, texto, contexto, language, nivel):
        self.contexto = contexto
        return "respuesta del profesor"

    def estimar_nivel(self, respuesta, language="es"):
        return "medio", "ok"


class RepoMemoria:
    def __init__(self):
        self.syllabus: dict = {}
        self.progresos: dict = {}
        self.mensajes: dict = {}

    def cargar_syllabus(self, cid):
        return self.syllabus.get(cid)

    def guardar_curso(self, cid, sub, syllabus):
        self.syllabus[cid] = syllabus

    def cargar_progreso(self, cid):
        return self.progresos.get(cid)

    def guardar_progreso(self, progreso):
        self.progresos[progreso.curso_id] = progreso

    def guardar_mensaje(self, cid, clase, msg):
        self.mensajes.setdefault((cid, clase), []).append(msg)

    def historial(self, cid, clase):
        return self.mensajes.get((cid, clase), [])


def main() -> int:
    fallos = []

    def paso(nombre, ok, extra=""):
        print(("   ok  " if ok else "   MAL ") + nombre + (f"  {extra}" if extra else ""))
        if not ok:
            fallos.append(nombre)

    print("1. UN CURSO DE TEMA NO NECESITA PROYECTO")
    lector, gen, repo = LectorEspia(), GeneradorFalso(), RepoMemoria()
    caso = GenerarCursoUseCase(lector, gen, repo)
    syl, prog = caso.execute("ana", proyecto="", tema="n8n", plan="free")
    paso("se creó el curso", bool(syl.clases))
    paso("NO se tocó el disco", lector.llamadas == [], f"llamadas={lector.llamadas}")
    paso("el generador recibió el tema", gen.ultima_llamada.get("tema") == "n8n")
    paso("y cero archivos", gen.ultima_llamada.get("archivos") == 0)
    paso("el temario se marca como 'de tema'", syl.sobre_un_tema)
    paso("el progreso arranca en la clase 1", prog.clase_actual == 1)

    print("\n2. UN CURSO DE PROYECTO SIGUE EXIGIENDO SU CÓDIGO")
    vacio = LectorEspia()
    caso2 = GenerarCursoUseCase(vacio, GeneradorFalso(), RepoMemoria())
    try:
        caso2.execute("ana", proyecto="mi-tienda")
        paso("un proyecto inexistente debe fallar", False)
    except AuditError:
        paso("un proyecto inexistente falla, como siempre", True)

    con_codigo = LectorEspia([GeneratedFile(path="main.py", content="print(1)")])
    gen3 = GeneradorFalso()
    syl3, _ = GenerarCursoUseCase(con_codigo, gen3, RepoMemoria()).execute("ana", "mi-tienda")
    paso("con código, se lee el proyecto", con_codigo.llamadas == ["mi-tienda"])
    paso("y el temario NO es de tema", not syl3.sobre_un_tema)

    print("\n3. EL PROFESOR RECIBE EL TEMA, NO UNA DISCULPA")
    chat_espia = ChatEspia()
    chat = ChatProfesorUseCase(lector, chat_espia, repo)
    cid = prog.curso_id
    chat.execute(cid, 1, "¿qué es un nodo?")
    paso("el contexto nombra el tema", "n8n" in chat_espia.contexto, repr(chat_espia.contexto[:60]))
    paso("no dice que no pudo leer el proyecto",
         "no se pudo leer" not in chat_espia.contexto.lower())
    paso("y el disco sigue sin tocarse", lector.llamadas == [])

    print("\n4. NINGÚN CRITERIO DE TEMA PIDE TOCAR UN ARCHIVO")
    # El generador falso pidió 'cambio' con archivo: el saneador REAL debe
    # degradarlo. Se comprueba con el generador de verdad, sin llamar al modelo.
    from src.infrastructure.adapters.llm_generador_syllabus import LLMGeneradorSyllabus

    bruto = [{
        "titulo": "Tu primer flujo", "objetivo": "Hacerlo", "concepto_clave": "nodos",
        "contenido": "…", "reto": "…",
        "criterio": {"tipo": "cambio", "descripcion": "Edita el archivo",
                     "archivo": "src/app.py", "quiz": []},
    }]
    saneadas = LLMGeneradorSyllabus._sanear_clases(
        LLMGeneradorSyllabus.__new__(LLMGeneradorSyllabus), bruto, 1, rutas_reales=[]
    )
    tipo = saneadas[0].criterio.tipo
    tipo = tipo.value if hasattr(tipo, "value") else tipo
    paso("'cambio' sin archivos se degrada a reflexión", tipo == "reflexion", f"tipo={tipo}")
    paso("y no queda un archivo fantasma", saneadas[0].criterio.archivo == "")

    print("\n5. EL PROMPT DE TEMA EXIGE COMPROBAR, NO SOLO REFLEXIONAR")
    # Un curso donde TODAS las clases se superan escribiendo un texto libre no
    # comprueba nada: es leer un tutorial con pasos. La primera generación real
    # de n8n salió con 17 clases de 17 en 'reflexion', y por eso esto se exige
    # explícitamente en el prompt.
    from src.infrastructure.adapters.llm_generador_syllabus import SYSTEM_INDICE_TEMA

    paso("el prompt prohíbe el tipo 'cambio'", '"cambio"' in SYSTEM_INDICE_TEMA)
    paso("y exige quizzes en al menos la mitad",
         "MITAD DE LAS CLASES" in SYSTEM_INDICE_TEMA.upper())

    print("\n6. LOS CURSOS NO SE PISAN ENTRE SÍ")
    repo5 = RepoMemoria()
    c5 = GenerarCursoUseCase(LectorEspia(), GeneradorFalso(), repo5)
    a, _ = c5.execute("ana", proyecto="", tema="n8n")
    b, _ = c5.execute("beto", proyecto="", tema="n8n")
    c, _ = c5.execute("ana", proyecto="", tema="SQL")
    ids = {s.proyecto for s in (a, b, c)}
    paso("dos alumnos, dos cursos distintos", len(repo5.syllabus) == 3, f"guardados={len(repo5.syllabus)}")
    paso("y cada tema con su clave", ids == {"n8n", "SQL"})

    if fallos:
        print(f"\n{len(fallos)} FALLO(S): {fallos}")
        return 1
    print("\nTODO CORRECTO: el profesor ya enseña lo que le pidan, no solo lo que")
    print("el alumno haya generado aquí.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
