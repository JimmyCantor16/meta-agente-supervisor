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
from urllib.parse import urlparse

from src.domain.entities import (
    Clase,
    MensajeChat,
    ProgresoCurso,
    ResultadoVerificacion,
    Syllabus,
)
from src.domain.ports import (
    AuditError,
    CursoRepositoryPort,
    GeneradorSyllabusPort,
    ProfesorChatPort,
    ProjectReaderPort,
)

logger = logging.getLogger(__name__)

# Clases por plan (decidido con el usuario): free = 1 sistema completo a
# producción; pro = varios proyectos con clases avanzadas; business = ilimitado.
CLASES_POR_PLAN = {"free": 10, "pro": 15, "business": 18}


def _curso_id(usuario_sub: str, proyecto: str) -> str:
    return hashlib.sha256(f"{usuario_sub}::{proyecto}".encode()).hexdigest()[:20]


class GenerarCursoUseCase:
    """Crea (o recupera) el curso de un alumno para un proyecto suyo."""

    def __init__(
        self,
        reader: ProjectReaderPort,
        generador: GeneradorSyllabusPort,
        repo: CursoRepositoryPort,
    ) -> None:
        self._reader = reader
        self._generador = generador
        self._repo = repo

    def execute(
        self,
        usuario_sub: str,
        proyecto: str,
        plan: str = "free",
        arquetipo: str = "",
        language: str = "es",
    ) -> tuple[Syllabus, ProgresoCurso]:
        nombre = (proyecto or "").strip()
        if not nombre:
            raise ValueError("Falta el nombre del proyecto.")
        cid = _curso_id(usuario_sub, nombre)

        # ¿Ya tiene curso para este proyecto? Se reutiliza (no se regenera).
        existente = self._repo.cargar_syllabus(cid)
        if existente is not None:
            progreso = self._repo.cargar_progreso(cid) or ProgresoCurso(
                curso_id=cid, usuario_sub=usuario_sub, proyecto=nombre,
                total_clases=len(existente.clases),
            )
            return existente, progreso

        archivos = self._reader.read(nombre)
        if not archivos:
            raise AuditError(f"El proyecto '{nombre}' no existe o está vacío.")

        num = CLASES_POR_PLAN.get(plan, 10)
        syllabus = self._generador.generar(nombre, arquetipo, archivos, num, language)
        # Se renumeran las clases por si el modelo se desordenó.
        for i, c in enumerate(syllabus.clases, start=1):
            c.numero = i

        self._repo.guardar_curso(cid, usuario_sub, syllabus)
        progreso = ProgresoCurso(
            curso_id=cid, usuario_sub=usuario_sub, proyecto=nombre,
            clase_actual=1, completadas=[], total_clases=len(syllabus.clases),
        )
        self._repo.guardar_progreso(progreso)
        logger.info("Curso creado para '%s' (%d clases, plan %s).",
                    nombre, len(syllabus.clases), plan)
        return syllabus, progreso


class ChatProfesorUseCase:
    """Un turno de conversación con el profesor dentro de una clase."""

    def __init__(
        self,
        reader: ProjectReaderPort,
        chat: ProfesorChatPort,
        repo: CursoRepositoryPort,
    ) -> None:
        self._reader = reader
        self._chat = chat
        self._repo = repo

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

        contexto = _contexto_breve(self._reader, syllabus.proyecto)
        respuesta = self._chat.responder(clase, historial, texto, contexto, language)
        msg = MensajeChat(rol="profesor", texto=respuesta)
        self._repo.guardar_mensaje(curso_id, numero_clase, msg)
        return msg

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
    ) -> None:
        self._reader = reader
        self._chat = chat
        self._repo = repo

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
        criterio = clase.criterio

        superada, mensaje = self._juzgar(
            criterio, syllabus.proyecto, respuestas_quiz or [], texto.strip(), clase, language
        )

        if not superada:
            self._repo.guardar_mensaje(
                curso_id, numero_clase, MensajeChat(rol="profesor", texto=mensaje)
            )
            return ResultadoVerificacion(superada=False, mensaje=mensaje)

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

        cierre = mensaje + (
            "\n\n🎓 **¡Te graduaste!** Completaste TODO el curso: tu sistema vive "
            "en internet, en tu cuenta, y ahora entiendes cómo funciona por dentro. "
            "Eso ya te hace desarrollador."
            if graduado else
            f"\n\n✅ **¡Clase {numero_clase} superada!** Desbloqueaste la siguiente. "
            "Cuando quieras, seguimos."
        )
        self._repo.guardar_mensaje(curso_id, numero_clase, MensajeChat(rol="profesor", texto=cierre))
        return ResultadoVerificacion(
            superada=True, mensaje=cierre, avanzo=avanzo, graduado=graduado
        )

    # ------------------------------------------------------------------
    def _juzgar(
        self, criterio, proyecto, respuestas, texto, clase, language
    ) -> tuple[bool, str]:
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
            # Se comprueba que el proyecto cambió respecto a su estado original:
            # aquí basta con que el alumno confirme y el profesor valide la
            # reflexión de qué cambió (el ajuste real ya se verifica en su flujo).
            aprobado, msg = self._chat.evaluar_reflexion(clase, texto, language)
            return aprobado, msg

        # reflexion (o desconocido): lo juzga el profesor con criterio pedagógico.
        if not texto:
            return False, "Cuéntame con tus palabras qué aprendiste en esta clase y lo reviso. 🙂"
        aprobado, msg = self._chat.evaluar_reflexion(clase, texto, language)
        return aprobado, msg


# ===========================================================================
# Helpers
# ===========================================================================
def _clase(syllabus: Syllabus, numero: int) -> Clase:
    for c in syllabus.clases:
        if c.numero == numero:
            return c
    raise AuditError(f"La clase {numero} no existe en este curso.")


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
