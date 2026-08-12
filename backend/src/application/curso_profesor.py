"""Casos de uso del CURSO INTERACTIVO del profesor.

Tras entregar el MVP, el sistema deja de callar: genera un plan de estudios
sobre EL proyecto del alumno y lo guía clase por clase, por chat, con
superación VERIFICABLE. El alumno no avanza porque diga "entendí" — avanza
porque el sistema comprueba que aprendió.

Este es el plus contra cualquier chatbot gratis: no explica en abstracto,
enseña TU código; y no confía en tu palabra, revisa tu tarea.
"""

from __future__ import annotations

import hashlib
import ipaddress
import logging
import re
import socket
from datetime import date
from typing import TYPE_CHECKING
from urllib.parse import urlparse

from src.domain.entities import (
    Clase,
    MensajeChat,
    NivelAlumno,
    ProgresoCurso,
    ResultadoVerificacion,
    Syllabus,
    slugify,
)
from src.domain.ports import (
    AuditError,
    CursoRepositoryPort,
    GeneradorSyllabusPort,
    ProfesorChatPort,
    ProjectReaderPort,
)

if TYPE_CHECKING:  # solo para tipos: el puerto lo materializa el integrador
    from src.domain.ports import GitAlumnoPort, UserRepositoryPort

logger = logging.getLogger(__name__)

# Clases por plan (decidido con el usuario): free = 1 sistema completo a
# producción; pro = varios proyectos con clases avanzadas; business = ilimitado.
CLASES_POR_PLAN = {"free": 10, "pro": 15, "business": 18}

# ===========================================================================
# NIVEL VIVO — "escueto y retador para quien sabe, detallado y sencillo para
# quien no", de forma CONTINUA. El nivel se midió una vez al nacer el curso;
# ahora además se REAJUSTA con evidencia objetiva: quien encadena clases al
# primer intento sube un escalón; quien se estrella varias veces seguidas con
# la misma clase baja uno. Con histéresis: tras cada movimiento los contadores
# vuelven a cero, así el nivel no oscila con cada resultado suelto.
# ===========================================================================
#: Clases seguidas superadas AL PRIMER INTENTO para subir un escalón.
CLASES_PARA_SUBIR = 3
#: Fallos consecutivos EN LA MISMA CLASE para bajar un escalón.
FALLOS_PARA_BAJAR = 3

_ESCALERA = ("bajo", "medio", "alto")


def subir_nivel(nivel: str) -> str:
    """Un escalón arriba. 'desconocido' con evidencia de solvencia pasa a medio."""
    if nivel == NivelAlumno.DESCONOCIDO.value:
        return NivelAlumno.MEDIO.value
    try:
        i = _ESCALERA.index(nivel)
    except ValueError:
        return nivel
    return _ESCALERA[min(i + 1, len(_ESCALERA) - 1)]


def bajar_nivel(nivel: str) -> str:
    """Un escalón abajo. 'desconocido' con evidencia de atasco pasa a bajo."""
    if nivel == NivelAlumno.DESCONOCIDO.value:
        return NivelAlumno.BAJO.value
    try:
        i = _ESCALERA.index(nivel)
    except ValueError:
        return nivel
    return _ESCALERA[max(i - 1, 0)]


def reajustar_nivel(
    nivel: str, racha_primeras: int, fallos_seguidos: int
) -> tuple[str, int, int]:
    """La máquina del nivel vivo, PURA (así se prueba sin base de datos).

    Recibe los contadores YA actualizados con el último resultado y devuelve
    `(nivel, racha_primeras, fallos_seguidos)` tras aplicar los umbrales. Si un
    umbral se cruza, el nivel se mueve UN escalón y ambos contadores vuelven a
    cero (la histéresis: el siguiente movimiento exige evidencia nueva entera).
    """
    if racha_primeras >= CLASES_PARA_SUBIR:
        return subir_nivel(nivel), 0, 0
    if fallos_seguidos >= FALLOS_PARA_BAJAR:
        return bajar_nivel(nivel), 0, 0
    return nivel, racha_primeras, fallos_seguidos


def _nivel_como_texto(progreso: ProgresoCurso | None) -> str:
    if progreso is None:
        return NivelAlumno.DESCONOCIDO.value
    nivel = progreso.nivel
    return nivel.value if hasattr(nivel, "value") else (nivel or "desconocido")


def _nivel_vigente(usuarios, progreso: ProgresoCurso | None) -> str:
    """El nivel que gobierna AHORA: el del usuario si se conoce, si no el del curso.

    El del usuario se actualiza con cada medición y cada reajuste (venga del
    curso que venga), así que es el más fresco; el del curso queda de respaldo
    para instalaciones sin repositorio de usuarios (mocks, pruebas).
    """
    if usuarios is not None and progreso is not None:
        try:
            nivel = usuarios.get_nivel(progreso.usuario_sub)
            if nivel and nivel != NivelAlumno.DESCONOCIDO.value:
                return nivel
        except Exception as exc:  # noqa: BLE001 - sin nivel de usuario, se usa el del curso
            logger.warning("No se pudo leer el nivel del usuario: %s", exc)
    return _nivel_como_texto(progreso)


def _curso_id(usuario_sub: str, proyecto: str) -> str:
    return hashlib.sha256(f"{usuario_sub}::{proyecto}".encode()).hexdigest()[:20]


class GenerarCursoUseCase:
    """Crea (o recupera) el curso de un alumno para un proyecto suyo."""

    def __init__(
        self,
        reader: ProjectReaderPort,
        generador: GeneradorSyllabusPort,
        repo: CursoRepositoryPort,
        usuarios: UserRepositoryPort | None = None,
    ) -> None:
        self._reader = reader
        self._generador = generador
        self._repo = repo
        # Opcional a propósito: sin él, todo funciona como antes (mocks,
        # pruebas). Con él, el nivel vive en el usuario y un curso nuevo no
        # vuelve a preguntar lo que el sistema ya sabe.
        self._usuarios = usuarios

    def execute(
        self,
        usuario_sub: str,
        proyecto: str,
        plan: str = "free",
        arquetipo: str = "",
        language: str = "es",
        nivel: str = "desconocido",
        tema: str = "",
    ) -> tuple[Syllabus, ProgresoCurso]:
        """Crea el curso de un PROYECTO del alumno o, si viene `tema`, de un tema.

        Es el mismo circuito para los dos: mismas clases, mismos quizzes, misma
        superación verificable y mismo progreso. Lo único que cambia es de dónde
        sale el material — del código del alumno o de lo que se sabe del tema.
        """
        tema = (tema or "").strip()
        nombre = (proyecto or "").strip() or tema
        if not nombre:
            raise ValueError("Falta el nombre del proyecto o el tema del curso.")
        cid = _curso_id(usuario_sub, nombre)

        # ¿Ya tiene curso para esto? Se reutiliza (no se regenera).
        existente = self._repo.cargar_syllabus(cid)
        if existente is not None:
            progreso = self._repo.cargar_progreso(cid) or ProgresoCurso(
                curso_id=cid, usuario_sub=usuario_sub, proyecto=nombre,
                total_clases=len(existente.clases),
            )
            return existente, progreso

        # Un curso de tema no tiene proyecto en disco: pedirle archivos sería
        # exigirle al alumno que ya tenga hecho lo que viene a aprender.
        archivos = []
        if not tema:
            archivos = self._reader.read(nombre)
            if not archivos:
                raise AuditError(f"El proyecto '{nombre}' no existe o está vacío.")

        # El nivel vive en el USUARIO: si ya se conoce, se usa directo (y el
        # frontend puede dejar de preguntar). Si en cambio llega uno medido
        # ahora, se guarda también en el usuario para la próxima vez.
        nivel = (nivel or "desconocido").strip().lower()
        if self._usuarios is not None:
            try:
                if nivel == NivelAlumno.DESCONOCIDO.value:
                    conocido = self._usuarios.get_nivel(usuario_sub)
                    if conocido and conocido != NivelAlumno.DESCONOCIDO.value:
                        nivel = conocido
                else:
                    self._usuarios.set_nivel(usuario_sub, nivel)
            except Exception as exc:  # noqa: BLE001 - el nivel nunca tumba el curso
                logger.warning("No se pudo consultar/guardar el nivel del usuario: %s", exc)

        nivel_inicial = nivel

        def nivel_actual() -> str:
            """El nivel VIGENTE, leído en el momento de cada lote del temario.

            El detalle del curso se escribe en varias llamadas; si el nivel se
            reajusta entre lote y lote (o lo acaba de medir el profesor), las
            clases que faltan por escribir salen ya calibradas al nivel nuevo,
            no al de cuando se pulsó el botón.
            """
            if self._usuarios is not None:
                try:
                    n = self._usuarios.get_nivel(usuario_sub)
                    if n and n != NivelAlumno.DESCONOCIDO.value:
                        return n
                except Exception:  # noqa: BLE001
                    pass
            return nivel_inicial

        num = CLASES_POR_PLAN.get(plan, 10)
        # El temario se genera ADAPTADO al nivel: a un principiante no se le
        # exigen pruebas técnicas duras (git/URL) de golpe. Se pasa un callable
        # para que cada LOTE lea el nivel vigente, no una foto inicial.
        syllabus = self._generador.generar(
            nombre, arquetipo, archivos, num, language, nivel_actual, tema
        )
        # Se renumeran las clases por si el modelo se desordenó.
        for i, c in enumerate(syllabus.clases, start=1):
            c.numero = i

        self._repo.guardar_curso(cid, usuario_sub, syllabus)
        try:
            nivel_val = NivelAlumno(nivel)
        except ValueError:
            nivel_val = NivelAlumno.DESCONOCIDO
        progreso = ProgresoCurso(
            curso_id=cid, usuario_sub=usuario_sub, proyecto=nombre,
            clase_actual=1, completadas=[], total_clases=len(syllabus.clases),
            nivel=nivel_val,
        )
        self._repo.guardar_progreso(progreso)
        logger.info(
            "Curso creado sobre %s '%s' (%d clases, plan %s).",
            "el tema" if tema else "el proyecto", nombre, len(syllabus.clases), plan,
        )
        return syllabus, progreso


class ChatProfesorUseCase:
    """Un turno de conversación con el profesor dentro de una clase."""

    def __init__(
        self,
        reader: ProjectReaderPort,
        chat: ProfesorChatPort,
        repo: CursoRepositoryPort,
        usuarios: UserRepositoryPort | None = None,
    ) -> None:
        self._reader = reader
        self._chat = chat
        self._repo = repo
        # Opcional: con él, el profesor responde con el nivel VIGENTE del
        # usuario (que se reajusta clase a clase), no con la foto del curso.
        self._usuarios = usuarios

    def execute(
        self, curso_id: str, numero_clase: int, mensaje: str, language: str = "es"
    ) -> MensajeChat:
        syllabus = self._repo.cargar_syllabus(curso_id)
        if syllabus is None:
            raise AuditError("Ese curso no existe.")
        clase = _clase(syllabus, numero_clase)

        texto = (mensaje or "").strip()
        if not texto:
            raise ValueError("El mensaje no puede estar vacío.")

        self._repo.guardar_mensaje(curso_id, numero_clase, MensajeChat(rol="alumno", texto=texto))
        historial = self._repo.historial(curso_id, numero_clase)

        # El profesor responde adaptado al nivel VIGENTE del alumno: el del
        # usuario si se conoce (se reajusta con la evidencia de cada clase),
        # con el del curso como respaldo.
        progreso = self._repo.cargar_progreso(curso_id)
        nivel = _nivel_vigente(self._usuarios, progreso)

        contexto = _contexto_del_curso(self._reader, syllabus)
        respuesta = self._chat.responder(clase, historial, texto, contexto, language, nivel)
        msg = MensajeChat(rol="profesor", texto=respuesta)
        self._repo.guardar_mensaje(curso_id, numero_clase, msg)
        return msg

    def estimar_nivel(
        self,
        curso_id: str,
        respuesta: str,
        language: str = "es",
        usuario_sub: str = "",
    ) -> tuple[str, str]:
        """El profesor mide el nivel del alumno.

        Si `curso_id` viene vacío, solo clasifica (aún no hay curso: se usa para
        adaptar el temario ANTES de generarlo). Si hay curso, además lo guarda.
        En ambos casos, si se sabe QUIÉN es el alumno (`usuario_sub` o el dueño
        del curso), el nivel se persiste TAMBIÉN en el usuario: la próxima vez
        el sistema ya lo conoce y no vuelve a preguntar.
        """
        nivel, mensaje = self._chat.estimar_nivel(respuesta or "", language)
        sub = (usuario_sub or "").strip()
        if curso_id:
            progreso = self._repo.cargar_progreso(curso_id)
            if progreso is None:
                raise AuditError("Ese curso no existe.")
            progreso.nivel = NivelAlumno(nivel)
            self._repo.guardar_progreso(progreso)
            sub = sub or progreso.usuario_sub
        if sub and self._usuarios is not None:
            try:
                self._usuarios.set_nivel(sub, nivel)
            except Exception as exc:  # noqa: BLE001 - medir nunca tumba la petición
                logger.warning("No se pudo guardar el nivel en el usuario: %s", exc)
        return nivel, mensaje

    def abrir_clase(self, curso_id: str, numero_clase: int) -> list[MensajeChat]:
        """Devuelve el historial; si la clase está vacía, el profesor la inaugura."""
        syllabus = self._repo.cargar_syllabus(curso_id)
        if syllabus is None:
            raise AuditError("Ese curso no existe.")
        historial = self._repo.historial(curso_id, numero_clase)
        if historial:
            return historial
        clase = _clase(syllabus, numero_clase)
        bienvenida = _bienvenida(clase, syllabus)
        msg = MensajeChat(rol="profesor", texto=bienvenida)
        self._repo.guardar_mensaje(curso_id, numero_clase, msg)
        return [msg]


class VerificarClaseUseCase:
    """El profesor revisa la tarea y decide si el alumno superó la clase."""

    def __init__(
        self,
        reader: ProjectReaderPort,
        chat: ProfesorChatPort,
        repo: CursoRepositoryPort,
        usuarios: UserRepositoryPort | None = None,
        git_alumno: GitAlumnoPort | None = None,
        actividad=None,
    ) -> None:
        self._reader = reader
        self._chat = chat
        self._repo = repo
        # Los tres son opcionales A PROPÓSITO: con None todo se comporta como
        # antes (mocks y pruebas no necesitan git ni usuarios ni racha).
        #: Persiste el nivel reajustado en el usuario (además del curso).
        self._usuarios = usuarios
        #: Mira la historia REAL de git: sin commit no hay clase de "cambio".
        self._git_alumno = git_alumno
        #: Puerto de racha: registrar(usuario, fecha_iso) cada clase superada.
        self._actividad = actividad

    def execute(
        self,
        curso_id: str,
        numero_clase: int,
        respuestas_quiz: list[int] | None = None,
        texto: str = "",
        language: str = "es",
    ) -> ResultadoVerificacion:
        syllabus = self._repo.cargar_syllabus(curso_id)
        progreso = self._repo.cargar_progreso(curso_id)
        if syllabus is None or progreso is None:
            raise AuditError("Ese curso no existe.")
        clase = _clase(syllabus, numero_clase)

        superada, mensaje = self._juzgar(
            syllabus, clase, respuestas_quiz or [], texto.strip(), language, curso_id
        )

        # Repetir una clase ya superada no mueve el nivel: la evidencia solo
        # cuenta la primera vez que se juega.
        es_repeticion = numero_clase in progreso.completadas

        if not superada:
            if not es_repeticion:
                nota_nivel = self._tras_fallo(progreso, numero_clase)
                if nota_nivel:
                    mensaje += nota_nivel
            self._repo.guardar_mensaje(
                curso_id, numero_clase, MensajeChat(rol="profesor", texto=mensaje)
            )
            return ResultadoVerificacion(superada=False, mensaje=mensaje)

        # Nivel vivo por éxito — ANTES de marcarla, para saber si fue al
        # primer intento (los contadores de fallo aún hablan de esta clase).
        if not es_repeticion:
            nota_nivel = self._tras_exito(progreso, numero_clase)
            if nota_nivel:
                mensaje += nota_nivel

        # Superada: se marca y se abre la siguiente.
        if numero_clase not in progreso.completadas:
            progreso.completadas.append(numero_clase)
        graduado = len(progreso.completadas) >= progreso.total_clases
        avanzo = False
        if graduado:
            progreso.graduado = True
        elif numero_clase >= progreso.clase_actual:
            progreso.clase_actual = numero_clase + 1
            avanzo = True
        self._repo.guardar_progreso(progreso)

        # Racha: cada clase superada deja huella de actividad del día. El
        # puerto lo aporta el integrador; sin él no pasa nada, y un fallo del
        # registro jamás le quita al alumno su clase superada.
        if self._actividad is not None and not es_repeticion:
            try:
                # FECHA LOCAL del servidor, la misma que lee CaminoAlumnoUseCase:
                # mezclar UTC al escribir con hora local al leer partiría rachas
                # reales alrededor de la medianoche (decisión documentada allí).
                self._actividad.registrar(
                    progreso.usuario_sub, date.today().isoformat()
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("No se pudo registrar la actividad de racha: %s", exc)

        cierre = mensaje + (
            (
                "\n\n🎓 **¡Te graduaste!** Completaste TODO el curso sobre "
                f"{syllabus.tema}. Ya no es teoría: lo has hecho tú."
                if syllabus.sobre_un_tema else
                "\n\n🎓 **¡Te graduaste!** Completaste TODO el curso: tu sistema vive "
                "en internet, en tu cuenta, y ahora entiendes cómo funciona por dentro. "
                "Eso ya te hace desarrollador."
            )
            if graduado else
            f"\n\n✅ **¡Clase {numero_clase} superada!** Desbloqueaste la siguiente. "
            "Cuando quieras, seguimos."
        )
        self._repo.guardar_mensaje(curso_id, numero_clase, MensajeChat(rol="profesor", texto=cierre))
        return ResultadoVerificacion(
            superada=True, mensaje=cierre, avanzo=avanzo, graduado=graduado
        )

    # ------------------------------------------------ nivel vivo
    def _tras_exito(self, progreso: ProgresoCurso, numero_clase: int) -> str:
        """Actualiza los contadores tras superar una clase. Devuelve nota o ''."""
        primer_intento = not (
            progreso.clase_fallando == numero_clase and progreso.fallos_seguidos > 0
        )
        progreso.fallos_seguidos = 0
        progreso.clase_fallando = 0
        progreso.racha_primeras = progreso.racha_primeras + 1 if primer_intento else 0

        nivel = _nivel_vigente(self._usuarios, progreso)
        nuevo, progreso.racha_primeras, progreso.fallos_seguidos = reajustar_nivel(
            nivel, progreso.racha_primeras, progreso.fallos_seguidos
        )
        if nuevo == nivel:
            return ""
        self._aplicar_nivel(progreso, nuevo)
        return (
            "\n\n📈 Llevas varias clases superándolo a la primera: subo un poco "
            "el nivel — iré más al grano y con retos más jugosos."
        )

    def _tras_fallo(self, progreso: ProgresoCurso, numero_clase: int) -> str:
        """Actualiza los contadores tras un fallo y PERSISTE. Devuelve nota o ''.

        Persiste aquí porque la rama de fallo del `execute` retorna antes del
        `guardar_progreso` general.
        """
        if progreso.clase_fallando != numero_clase:
            progreso.clase_fallando = numero_clase
            progreso.fallos_seguidos = 0
        progreso.fallos_seguidos += 1
        progreso.racha_primeras = 0  # un tropiezo corta la racha de primeras

        nota = ""
        nivel = _nivel_vigente(self._usuarios, progreso)
        nuevo, progreso.racha_primeras, progreso.fallos_seguidos = reajustar_nivel(
            nivel, progreso.racha_primeras, progreso.fallos_seguidos
        )
        if nuevo != nivel:
            self._aplicar_nivel(progreso, nuevo)
            nota = (
                "\n\n🧭 Veo que esta parte se está resistiendo — no pasa nada. "
                "A partir de ahora voy más despacio y con más detalle."
            )
        self._repo.guardar_progreso(progreso)
        return nota

    def _aplicar_nivel(self, progreso: ProgresoCurso, nivel: str) -> None:
        """El nivel nuevo se guarda en el CURSO y en el USUARIO (si se puede)."""
        try:
            progreso.nivel = NivelAlumno(nivel)
        except ValueError:
            return
        logger.info(
            "Nivel vivo: el alumno %s pasa a '%s' por evidencia de sus clases.",
            progreso.usuario_sub, nivel,
        )
        if self._usuarios is not None:
            try:
                self._usuarios.set_nivel(progreso.usuario_sub, nivel)
            except Exception as exc:  # noqa: BLE001 - el nivel nunca tumba la clase
                logger.warning("No se pudo persistir el nivel en el usuario: %s", exc)

    # ------------------------------------------------------------------
    def _juzgar(
        self,
        syllabus: Syllabus,
        clase: Clase,
        respuestas: list[int],
        texto: str,
        language: str,
        curso_id: str,
    ) -> tuple[bool, str]:
        criterio = clase.criterio
        tipo = criterio.tipo.value if hasattr(criterio.tipo, "value") else criterio.tipo

        if tipo == "quiz":
            if not criterio.quiz:
                return True, "¡Listo! No había preguntas que revisar en esta clase."
            aciertos = sum(
                1 for i, p in enumerate(criterio.quiz)
                if i < len(respuestas) and respuestas[i] == p.correcta
            )
            minimo = max(1, criterio.aciertos_minimos)
            if aciertos >= minimo:
                return True, (
                    f"¡Muy bien! Acertaste {aciertos} de {len(criterio.quiz)}. "
                    "Se nota que entendiste esta parte de tu sistema. 💪"
                )
            return False, (
                f"Acertaste {aciertos} de {len(criterio.quiz)}, y necesitas {minimo}. "
                "No pasa nada — vuelve a leer la clase arriba y reinténtalo. "
                + (f"Pista: {criterio.pista}" if criterio.pista else "")
            )

        if tipo == "url_publicada":
            viva, detalle = _url_viva(texto)
            if viva:
                return True, f"🏆 ¡Tu página está VIVA en internet! {detalle}"
            return False, detalle

        if tipo == "repo_git":
            existe, detalle = _repo_existe(texto)
            if existe:
                return True, f"🏆 ¡Tu repositorio existe en GitHub! {detalle}"
            return False, detalle

        if tipo == "cambio":
            # Con el puerto de git, la clase se supera con un COMMIT REAL del
            # alumno — contarlo bonito ya no basta. Sin el puerto (mocks,
            # cursos de tema), se conserva el juicio por reflexión de siempre.
            if self._git_alumno is not None and not syllabus.sobre_un_tema:
                return self._juzgar_cambio_con_git(
                    syllabus, clase, texto, language, curso_id
                )
            aprobado, msg = self._chat.evaluar_reflexion(clase, texto, language)
            return aprobado, msg

        # reflexion (o desconocido): lo juzga el profesor con criterio pedagógico.
        if not texto:
            return False, "Cuéntame con tus palabras qué aprendiste en esta clase y lo reviso. 🙂"
        aprobado, msg = self._chat.evaluar_reflexion(clase, texto, language)
        return aprobado, msg

    def _juzgar_cambio_con_git(
        self,
        syllabus: Syllabus,
        clase: Clase,
        texto: str,
        language: str,
        curso_id: str,
    ) -> tuple[bool, str]:
        """La clase de "cambio" exige un commit REAL del alumno.

        El circuito honesto: el alumno toca el archivo en el aula, pulsa
        Compilar, y si el sistema arranca queda un commit con su firma. Aquí
        se comprueba que ese commit EXISTE (posterior al inicio de la clase y
        tocando el archivo del criterio, si lo hay). La reflexión se sigue
        pidiendo — explicar lo que hiciste es parte de aprender — pero como
        complemento: sola, ya no supera la clase.
        """
        slug = slugify(syllabus.proyecto)
        criterio = clase.criterio
        archivo = (criterio.archivo or "").strip() or None

        # Desde cuándo cuentan los commits: la apertura de la clase. Si nunca
        # se abrió por chat, no se acota (mejor generoso que injusto).
        desde = ""
        try:
            desde = self._repo.inicio_clase(curso_id, clase.numero) or ""
        except Exception:  # noqa: BLE001 - repos antiguos/mocks sin este método
            desde = ""

        try:
            commits = self._git_alumno.commits_del_alumno(slug, "", desde, archivo)
        except Exception as exc:  # noqa: BLE001 - un fallo de git no puede dar 500
            logger.warning("No se pudo mirar el git del alumno en '%s': %s", slug, exc)
            commits = []

        if not commits:
            # ¿Tocó el proyecto pero no el archivo que pide la clase? Afinar el
            # mensaje: decir EXACTAMENTE qué falta es lo que enseña.
            otros = []
            if archivo:
                try:
                    otros = self._git_alumno.commits_del_alumno(slug, "", desde, None)
                except Exception:  # noqa: BLE001
                    otros = []
            if archivo and otros:
                return False, (
                    "Veo cambios tuyos en el proyecto — ¡bien! — pero esta clase "
                    f"pide tocar **{archivo}**, y ahí no hay ningún cambio tuyo "
                    "todavía. Ve al aula, abre ese archivo, haz tu ajuste y dale "
                    "a **Compilar**. Cuando arranque, vuelve y te reviso. 💪"
                )
            pasos = (
                "Esta clase se supera con un cambio REAL en tu proyecto, no "
                "contándomelo. Te falta esto:\n"
                "1. Abre el **aula** de tu proyecto.\n"
                + (f"2. Abre el archivo **{archivo}** y haz ahí tu cambio.\n"
                   if archivo else "2. Abre el archivo de la clase y haz tu cambio.\n")
                + "3. Dale a **Compilar**: si tu sistema arranca, el cambio queda "
                "guardado como un commit con tu nombre.\n"
                "Cuando lo hagas, vuelve aquí y lo compruebo en tu historia de git. 🙂"
            )
            if criterio.pista:
                pasos += f"\nPista: {criterio.pista}"
            return False, pasos

        # Hay commit real. La reflexión complementa: se pide, pero no basta.
        if not texto:
            ultimo = commits[0]
            return False, (
                f"¡Veo tu commit! («{ultimo.get('mensaje', '')}») Eso ya es lo "
                "difícil. 💪 Ahora la última parte: cuéntame con tus palabras "
                "QUÉ cambiaste y qué esperabas ver distinto, y te doy la clase."
            )
        aprobado, msg = self._chat.evaluar_reflexion(clase, texto, language)
        if aprobado:
            ultimo = commits[0]
            msg += (
                f"\n\n🧾 Y no es solo palabra: está en tu historia de git — "
                f"«{ultimo.get('mensaje', '')}». Así trabaja un dev de verdad."
            )
        return aprobado, msg


# ===========================================================================
# Helpers
# ===========================================================================
def _clase(syllabus: Syllabus, numero: int) -> Clase:
    for c in syllabus.clases:
        if c.numero == numero:
            return c
    raise AuditError(f"La clase {numero} no existe en este curso.")


def _contexto_del_curso(reader: ProjectReaderPort, syllabus: Syllabus) -> str:
    """Lo que sitúa al profesor: el código del alumno, o el tema del curso.

    En un curso de tema no hay disco al que ir; ir de todas formas devolvía
    «(no se pudo leer el proyecto)» y el profesor respondía disculpándose por
    un proyecto que nunca existió.
    """
    if syllabus.sobre_un_tema:
        return (
            f"CURSO SOBRE EL TEMA: {syllabus.tema}\n"
            "El alumno NO tiene un proyecto propio: enseña el tema en sí, con "
            "ejemplos concretos y reales. No le pidas que abra archivos suyos."
        )
    return _contexto_breve(reader, syllabus.proyecto)


def _contexto_breve(reader: ProjectReaderPort, proyecto: str) -> str:
    """Un resumen del proyecto (rutas + fragmentos) para situar al profesor."""
    try:
        archivos = reader.read(proyecto)
    except AuditError:
        return "(no se pudo leer el proyecto)"
    lineas = [f"Proyecto '{proyecto}' — {len(archivos)} archivos:"]
    for f in archivos[:20]:
        lineas.append(f"- {f.path}")
    # Un par de archivos clave enteros (acotados) para dar sustancia.
    claves = [f for f in archivos if f.path.endswith(
        ("dominio.json", "server.js", "main.py", "App.jsx", "index.html"))][:3]
    for f in claves:
        lineas.append(f"\n=== {f.path} ===\n{f.content[:1200]}")
    return "\n".join(lineas)[:4000]


def _bienvenida(clase: Clase, syllabus: Syllabus) -> str:
    return (
        f"👋 ¡Bienvenido a la **Clase {clase.numero}: {clase.titulo}**!\n\n"
        f"🎯 **Lo que vas a lograr:** {clase.objetivo}\n\n"
        f"{clase.contenido}\n\n"
        f"📝 **Tu reto:** {clase.reto}\n\n"
        "Pregúntame lo que quieras — estoy aquí para ayudarte a lograrlo. "
        "Cuando te sientas listo, dale a **«Ya lo hice, revísame»** y compruebo tu avance."
    )


def _url_viva(url: str) -> tuple[bool, str]:
    """Comprueba que una URL pública responde (con guardas anti-SSRF)."""
    import httpx

    url = (url or "").strip()
    if not url:
        return False, "Pégame la URL donde publicaste (ej: https://tu-pagina.netlify.app)."
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    partes = urlparse(url)
    if not partes.hostname:
        return False, "Esa URL no parece válida. Revísala."
    try:
        for info in socket.getaddrinfo(partes.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False, (
                    "Esa dirección es local (solo funciona en tu computador). "
                    "Publícala primero en internet con Netlify o Render y pásame ESA URL."
                )
    except socket.gaierror:
        return False, "Ese dominio no existe todavía. Revisa la URL exacta de tu hosting."
    try:
        with httpx.Client(follow_redirects=True, timeout=15) as c:
            r = c.get(url, headers={"User-Agent": "MetaAgente-Profesor/1.0"})
    except httpx.HTTPError:
        return False, ("No pude cargar tu página. Si es Render gratis, puede estar "
                       "despertando (~1 min): espera y reintenta.")
    if r.status_code == 200 and len(r.text) > 200:
        m = re.search(r"<title>([^<]{1,120})</title>", r.text, re.I)
        titulo = m.group(1).strip() if m else "sin título"
        return True, f"Título: «{titulo}». ¡Compártela con el mundo!"
    return False, (f"La URL responde {r.status_code} pero no se ve bien. "
                   "Revisa que subiste la carpeta completa (con index.html).")


def _repo_existe(url: str) -> tuple[bool, str]:
    """Comprueba que un repositorio de GitHub existe (API pública)."""
    import httpx

    url = (url or "").strip()
    m = re.search(r"github\.com/([\w.-]+)/([\w.-]+)", url)
    if not m:
        return False, ("Pégame el enlace de tu repositorio, algo como "
                       "https://github.com/tu-usuario/tu-proyecto")
    usuario, repo = m.group(1), m.group(2).removesuffix(".git")
    try:
        with httpx.Client(timeout=15) as c:
            r = c.get(f"https://api.github.com/repos/{usuario}/{repo}",
                      headers={"User-Agent": "MetaAgente-Profesor/1.0"})
    except httpx.HTTPError:
        return False, "No pude verificar GitHub ahora. Intenta de nuevo en un momento."
    if r.status_code == 200:
        return True, f"github.com/{usuario}/{repo} está publicado. ¡Tu código ya tiene su caja fuerte!"
    if r.status_code == 404:
        return False, ("No encuentro ese repositorio. ¿Está Público y bien escrito el nombre? "
                       "(Recuerda hacer git push.)")
    return False, f"GitHub respondió {r.status_code}. Revisa el enlace y reintenta."
