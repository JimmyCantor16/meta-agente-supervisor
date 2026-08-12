"""Puertos del dominio: contratos abstractos (interfaces).

Los puertos permiten que la capa de aplicación dependa de ABSTRACCIONES y no de
implementaciones concretas (DeepSeek, SQLite, un mock de test...). Esta es la
esencia de la inversión de dependencias en la arquitectura hexagonal.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable
from pathlib import Path
from typing import Any

from src.domain.entities import (
    AgentEvaluation,
    AuditReport,
    CambioArchivo,
    CasoGeneracion,
    Clase,
    DeveloperPrompt,
    DiagnosticoMVP,
    EvaluationRecord,
    InfoDespliegue,
    MetaProceso,
    SpecPlan,
    FewShotExample,
    GeneratedFile,
    GeneratedProject,
    MensajeChat,
    ProgresoCurso,
    Syllabus,
    TeachingGuide,
    TrabajoFondo,
    UserAccount,
)


class PromptEvaluationError(Exception):
    """Error de dominio para cualquier fallo durante la evaluación del prompt.

    Los adaptadores traducen sus excepciones técnicas (timeouts, JSON inválido,
    errores de API) a esta excepción, de modo que la aplicación no se acople al
    detalle de la infraestructura.
    """


class ProjectGenerationError(Exception):
    """Error de dominio para cualquier fallo durante la generación de un proyecto."""


class AuditError(Exception):
    """Error de dominio para cualquier fallo durante la auditoría de un proyecto."""


class DespliegueError(Exception):
    """Error de dominio para cualquier fallo al PUBLICAR un proyecto en internet.

    Los adaptadores traducen sus fallos técnicos (git, GitHub, la API de Render,
    timeouts) a esta excepción; el entrypoint la convierte en HTTP 502.
    """


class LicenseRequiredError(Exception):
    """Se agotaron las generaciones gratuitas y no hay licencia activa."""


class PaymentRequiredError(Exception):
    """El usuario agotó su cupo gratis y requiere pago aprobado por super-admin."""


class AuthRequiredError(Exception):
    """La acción requiere que el usuario haya iniciado sesión."""


class AgenteCliError(Exception):
    """Error de dominio del AGENTE CLI local (Claude Code u otro).

    Los adaptadores traducen sus fallos técnicos (binario ausente, timeout,
    salida sin la forma pedida tras reintentos) a esta excepción; los workers
    la convierten en un trabajo fallido con su detalle, nunca en un 500.
    """


class UserRepositoryPort(ABC):
    """Contrato de persistencia de cuentas de usuario."""

    @abstractmethod
    def get(self, sub: str) -> UserAccount | None:
        raise NotImplementedError

    @abstractmethod
    def upsert_profile(self, sub: str, email: str, name: str) -> UserAccount:
        """Crea el usuario si no existe (o actualiza nombre/email) y lo devuelve."""
        raise NotImplementedError

    @abstractmethod
    def increment_generation(self, sub: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def increment_lesson(self, sub: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def set_pending(self, sub: str, requested_plan: str) -> None:
        """Marca al usuario como pendiente de pago del plan solicitado."""
        raise NotImplementedError

    @abstractmethod
    def approve(self, sub: str, plan: str, admin_email: str) -> bool:
        """Marca el pago como aprobado. Devuelve False si el usuario no existe."""
        raise NotImplementedError

    @abstractmethod
    def list_pending(self) -> list[UserAccount]:
        raise NotImplementedError

    # --- Nivel del alumno (vive en el USUARIO, no solo en cada curso) ---
    # No son abstractos A PROPÓSITO: los repositorios que aún no lo persisten
    # (Postgres, mocks antiguos) heredan este respaldo y siguen instanciándose;
    # el circuito del profesor trata 'desconocido' como "todavía no se midió".
    def get_nivel(self, sub: str) -> str:
        """Nivel vigente del usuario ('desconocido' si nunca se midió)."""
        return "desconocido"

    def set_nivel(self, sub: str, nivel: str) -> None:
        """Persiste el nivel medido/reajustado. Por defecto no hace nada."""
        return None


class UsageRepositoryPort(ABC):
    """Contrato para el conteo de uso y el estado de licencia (persistente)."""

    @abstractmethod
    def generations_used(self) -> int:
        """Número de proyectos generados hasta ahora."""
        raise NotImplementedError

    @abstractmethod
    def record_generation(self) -> None:
        """Incrementa el contador de generaciones."""
        raise NotImplementedError

    @abstractmethod
    def active_license(self) -> str | None:
        """Clave de licencia activa, o None si no hay."""
        raise NotImplementedError

    @abstractmethod
    def set_license(self, key: str) -> None:
        """Guarda la licencia activada."""
        raise NotImplementedError


class PromptEvaluatorPort(ABC):
    """Contrato que debe cumplir cualquier motor de evaluación de prompts.

    Implementaciones posibles: DeepSeek, un mock determinista para pruebas, u
    otro LLM. La capa de aplicación solo conoce esta interfaz.
    """

    @abstractmethod
    def evaluate(
        self,
        prompt: DeveloperPrompt,
        examples: list[FewShotExample] | None = None,
    ) -> AgentEvaluation:
        """Analiza, critica y optimiza el prompt del usuario.

        Args:
            prompt: Prompt de desarrollo original validado.
            examples: Evaluaciones pasadas útiles para guiar al modelo (RAG).
                Si es `None` o vacío, el agente evalúa sin contexto histórico.

        Returns:
            Evaluación estructurada del meta-agente.

        Raises:
            PromptEvaluationError: Si la evaluación no puede completarse.
        """
        raise NotImplementedError


class EvaluationRepositoryPort(ABC):
    """Contrato de persistencia de evaluaciones (la "memoria" del agente).

    Aísla el almacenamiento (SQLite, Postgres, memoria...) del resto del sistema.
    """

    @abstractmethod
    def save(self, record: EvaluationRecord) -> None:
        """Persiste una evaluación recién generada."""
        raise NotImplementedError

    @abstractmethod
    def set_feedback(self, evaluation_id: str, helpful: bool) -> bool:
        """Registra el voto de utilidad sobre una evaluación.

        Returns:
            True si la evaluación existía y se actualizó; False si no se encontró.
        """
        raise NotImplementedError

    @abstractmethod
    def find_similar_helpful(
        self, prompt: str, limit: int = 3
    ) -> list[EvaluationRecord]:
        """Recupera evaluaciones pasadas marcadas como ÚTILES y similares al prompt.

        Es el corazón del aprendizaje: devuelve los mejores ejemplos históricos
        para reinyectarlos como contexto en la siguiente evaluación.

        Args:
            prompt: Texto del nuevo prompt con el que medir similitud.
            limit: Número máximo de ejemplos a devolver.

        Returns:
            Lista (posiblemente vacía) de registros útiles, más similares primero.
        """
        raise NotImplementedError


class ProjectGeneratorPort(ABC):
    """Contrato del "agente que construye": convierte un prompt en un proyecto.

    Implementaciones: DeepSeek (genera según el prompt) o un mock (devuelve un
    starter real y auto-instalable para probar sin coste).
    """

    @abstractmethod
    def generate(self, prompt: str, language: str = "es") -> GeneratedProject:
        """Genera un proyecto de software a partir de un prompt de ingeniería.

        Args:
            prompt: Prompt optimizado (idealmente el `prompt_final_optimizado`).
            language: Idioma para nombres/documentación generada.

        Returns:
            El proyecto generado (nombre + archivos + instrucciones).

        Raises:
            ProjectGenerationError: Si la generación falla.
        """
        raise NotImplementedError

    @abstractmethod
    def repair_with_error(
        self, project: GeneratedProject, error: str
    ) -> GeneratedProject:
        """Corrige el proyecto a partir de un ERROR REAL de ejecución.

        Es el corazón de la auto-verificación: en vez de reparar a ciegas, se le
        entrega al agente el traceback exacto que produjo el código.

        Args:
            project: Proyecto generado que falló.
            error: Salida de error real (traceback) al intentar ejecutarlo.

        Returns:
            El proyecto con los archivos corregidos.
        """
        raise NotImplementedError

    def aplicar_stubs(self, project: GeneratedProject) -> GeneratedProject:
        """Genera stubs para los símbolos que faltan, para que el sistema arranque.

        Último recurso cuando la reparación no logra implementar unas funciones:
        se crean versiones vacías pero seguras, el proyecto compila y arranca, y
        esas funciones quedan como ejercicio para el modo profesor. Por defecto
        no hace nada (los generadores que no lo necesiten heredan este no-op).
        """
        return project


class ProjectRunnerPort(ABC):
    """Contrato para ARRANCAR un proyecto generado y exponer su URL.

    Es lo que convierte el entregable en algo usable por alguien no técnico:
    en vez de "aquí tienes archivos, instala Docker", se le da una URL viva.
    """

    @abstractmethod
    def start(self, project_dir: str, project_name: str) -> str | None:
        """Arranca el proyecto y devuelve su URL, o None si no se pudo."""
        raise NotImplementedError

    @abstractmethod
    def stop(self, project_name: str) -> None:
        """Detiene el proyecto si estaba corriendo."""
        raise NotImplementedError

    def url_activa(self, project_name: str) -> str | None:
        """URL del proyecto si está corriendo AHORA, o None.

        Por defecto no se sabe (los runners que no lleven registro heredan este
        no-op). El despachador multistack sí la recuerda para el panel 'en vivo'.
        """
        return None


class ProjectVerifierPort(ABC):
    """Contrato para verificar que un proyecto generado realmente ejecuta."""

    @abstractmethod
    def verify(self, project_dir: str) -> str | None:
        """Comprueba el proyecto escrito en disco.

        Returns:
            None si todo está correcto; si no, el mensaje/traceback del error.
        """
        raise NotImplementedError


class ProjectWriterPort(ABC):
    """Contrato para materializar un proyecto generado en el sistema de archivos."""

    @abstractmethod
    def write(self, project: GeneratedProject) -> str:
        """Escribe el proyecto en disco de forma segura.

        Returns:
            La ruta absoluta de la carpeta raíz del proyecto escrito.

        Raises:
            ProjectGenerationError: Si alguna ruta es insegura o falla la escritura.
        """
        raise NotImplementedError


class ProjectReaderPort(ABC):
    """Contrato para leer un proyecto del disco (para que el agente lo audite)."""

    @abstractmethod
    def read(self, project_name: str) -> list[GeneratedFile]:
        """Lee los archivos de texto de un proyecto.

        Args:
            project_name: Nombre del proyecto (se convierte a slug/carpeta).

        Returns:
            Lista de archivos (ruta relativa + contenido).

        Raises:
            AuditError: Si el proyecto no existe o no se puede leer.
        """
        raise NotImplementedError


class CodeTeacherPort(ABC):
    """Contrato del agente PROFESOR: explica un proyecto y enseña a completarlo."""

    @abstractmethod
    def teach(
        self,
        target_name: str,
        files: list[GeneratedFile],
        language: str = "es",
    ) -> TeachingGuide:
        """Genera una guía didáctica del proyecto para un aprendiz.

        Raises:
            AuditError: Si la explicación falla.
        """
        raise NotImplementedError


class CodeAuditorPort(ABC):
    """Contrato del agente auditor: revisa un proyecto y sugiere mejoras."""

    @abstractmethod
    def audit(
        self,
        target_name: str,
        files: list[GeneratedFile],
        language: str = "es",
    ) -> AuditReport:
        """Analiza el código y devuelve un informe de mejoras priorizadas.

        Args:
            target_name: Nombre del proyecto/sistema auditado.
            files: Archivos del proyecto a revisar.
            language: Idioma del informe.

        Returns:
            Informe de auditoría con sugerencias.

        Raises:
            AuditError: Si la auditoría falla.
        """
        raise NotImplementedError


class AjustadorModuloPort(ABC):
    """Contrato del agente que CONVIERTE una lección en un cambio de código.

    Se separa del profesor a propósito: el profesor explica (no toca nada), y
    este propone el cambio concreto. Así el modo profesor sigue siendo seguro
    por construcción y la capacidad de modificar es una decisión explícita.
    """

    @abstractmethod
    def proponer(
        self,
        target_name: str,
        files: list[GeneratedFile],
        ajuste: str,
        language: str = "es",
    ) -> tuple[list[CambioArchivo], str, str]:
        """Traduce el ajuste pedido a cambios concretos sobre los archivos.

        Args:
            target_name: Proyecto sobre el que se trabaja.
            files: Archivos actuales del proyecto.
            ajuste: Lo que el alumno quiere ajustar, en sus palabras.
            language: Idioma de la explicación.

        Returns:
            Tupla (cambios, explicación didáctica, concepto que enseña). Los
            cambios traen el contenido COMPLETO de cada archivo tocado; el diff
            lo calcula el caso de uso, que es quien conoce lo que había.

        Raises:
            AuditError: Si no se puede proponer el ajuste.
        """
        raise NotImplementedError


class GeneradorSyllabusPort(ABC):
    """Contrato del agente que diseña el PLAN DE ESTUDIOS de un proyecto.

    A partir del código real del proyecto del alumno, arma N clases con
    objetivo, contenido, reto y — lo esencial — un criterio de superación
    VERIFICABLE por clase.
    """

    @abstractmethod
    def generar(
        self,
        proyecto: str,
        arquetipo: str,
        files: list[GeneratedFile],
        num_clases: int,
        language: str = "es",
        nivel: str | Callable[[], str] = "desconocido",
        tema: str = "",
    ) -> Syllabus:
        """Diseña el temario, ADAPTADO al nivel del alumno.

        Con `nivel='bajo'` los retos avanzados (git, publicar) se plantean de
        forma suave (reflexión) en vez de exigir repo/URL reales de golpe.

        `nivel` puede ser un CALLABLE sin argumentos: el generador lo lee en
        cada lote de detalle, de modo que un nivel reajustado a mitad de la
        generación calibra las clases que aún faltan por escribir.

        Con `tema` relleno el curso es sobre un TEMA EXTERNO (n8n, SQL): no hay
        `files` que leer, así que ningún criterio puede pedir tocar un archivo
        concreto. El resto del circuito —clases, quizzes, progreso, superación—
        es el mismo.

        Raises AuditError si falla.
        """
        raise NotImplementedError


class ProfesorChatPort(ABC):
    """Contrato del PROFESOR conversacional dentro de una clase.

    Responde al alumno en el contexto de UNA clase concreta, con memoria del
    historial y del código de su proyecto. Paciente, claro, sin adelantar la
    respuesta del reto: guía hasta que el alumno la encuentre.
    """

    @abstractmethod
    def responder(
        self,
        clase: Clase,
        historial: list[MensajeChat],
        mensaje: str,
        contexto_proyecto: str,
        language: str = "es",
        nivel: str = "desconocido",
    ) -> str:
        """Devuelve la respuesta del profesor, adaptada al nivel del alumno.

        `nivel` (bajo/medio/alto/desconocido) calibra la profundidad y el tono.
        Raises AuditError si falla.
        """
        raise NotImplementedError

    @abstractmethod
    def evaluar_reflexion(
        self,
        clase: Clase,
        respuesta: str,
        language: str = "es",
    ) -> tuple[bool, str]:
        """Juzga si la reflexión del alumno demuestra que entendió.

        Returns (aprobado, mensaje_del_profesor).
        """
        raise NotImplementedError

    @abstractmethod
    def estimar_nivel(
        self,
        respuesta: str,
        language: str = "es",
    ) -> tuple[str, str]:
        """Estima el nivel del alumno (bajo/medio/alto) a partir de lo que cuenta.

        El profesor mide conversando, sin examen: unas frases del alumno bastan
        para calibrar cómo enseñarle. Returns (nivel, mensaje_de_bienvenida).
        """
        raise NotImplementedError


class SpecPlanPort(ABC):
    """Diseña el CONTRATO (spec + plan) de un proyecto antes de generarlo.

    Inspirado en Spec-Driven Development: primero se define el qué y el cómo
    de forma explícita y verificable, y con eso se guía la generación.
    """

    @abstractmethod
    def disenar(self, idea: str, contexto: str = "", language: str = "es") -> SpecPlan:
        """Devuelve el spec+plan de la idea. Raises PromptEvaluationError si falla."""
        raise NotImplementedError


class GeneradorMetaPort(ABC):
    """Diseña el MAPA DE HITOS de una meta de proceso (no solo código).

    Convierte 'quiero monetizar mi canal' en un camino honesto de pasos, cada
    uno marcado según de quién depende (el alumno, la plataforma, el tiempo, o
    lo que construimos aquí).
    """

    @abstractmethod
    def generar(
        self,
        objetivo: str,
        contexto: str,
        language: str = "es",
    ) -> MetaProceso:
        """Diseña la meta con sus hitos. Raises AuditError si falla."""
        raise NotImplementedError


class MetaRepositoryPort(ABC):
    """Persistencia de las metas de proceso y su avance por hito."""

    @abstractmethod
    def guardar(self, meta: MetaProceso) -> None:
        raise NotImplementedError

    @abstractmethod
    def cargar(self, meta_id: str) -> MetaProceso | None:
        raise NotImplementedError

    @abstractmethod
    def de_usuario(self, usuario_sub: str) -> list[MetaProceso]:
        """Todas las metas de un usuario (recientes primero)."""
        raise NotImplementedError


class CasoRepositoryPort(ABC):
    """Banco de casos: la memoria que hace al agente mejor con cada proyecto.

    Guarda qué se pidió, qué salió y qué se aprendió; y ante una idea nueva
    recupera los casos más parecidos para reinyectar lo que funcionó y evitar
    lo que falló. Es también el dataset de fallos del agente-profesor.
    """

    @abstractmethod
    def guardar(self, caso: CasoGeneracion) -> None:
        """Persiste un caso de generación."""
        raise NotImplementedError

    @abstractmethod
    def similares(self, idea: str, limit: int = 3) -> list[CasoGeneracion]:
        """Casos anteriores más parecidos a la idea (más similar primero)."""
        raise NotImplementedError

    @abstractmethod
    def todos(self, limit: int = 500) -> list[CasoGeneracion]:
        """Todos los casos (recientes primero) — para inspección/dataset."""
        raise NotImplementedError

    @abstractmethod
    def ultimo_por_slug(self, slug: str) -> CasoGeneracion | None:
        """El caso más reciente de un proyecto (por su slug), o None.

        Sirve para recuperar la idea original y poder RELANZAR el proyecto.
        """
        raise NotImplementedError


class DiagnosticadorMVPPort(ABC):
    """Contrato del agente que juzga si el MVP entregado SIRVE de verdad.

    Recibe el código real del proyecto más señales objetivas (¿hay una interfaz?
    ¿el navegador la renderiza o se ve en blanco? ¿es solo un JSON de API?) y
    emite un veredicto honesto pensado para un usuario que no sabe programar.
    """

    @abstractmethod
    def diagnosticar(
        self,
        proyecto: str,
        files: list[GeneratedFile],
        senales: dict,
        language: str = "es",
    ) -> DiagnosticoMVP:
        """Evalúa el MVP y devuelve su estado real. Raises AuditError si falla.

        Args:
            proyecto: Nombre del proyecto.
            files: Archivos del proyecto (para ver si hay UI o solo API).
            senales: Hechos objetivos ya medidos (tiene_frontend, render_error,
                url, solo_api...). El adaptador NO vuelve a medir: interpreta.
            language: Idioma del veredicto.
        """
        raise NotImplementedError


class CursoRepositoryPort(ABC):
    """Persistencia de cursos, progreso e historial de chat por clase."""

    @abstractmethod
    def guardar_curso(self, curso_id: str, usuario_sub: str, syllabus: Syllabus) -> None:
        raise NotImplementedError

    @abstractmethod
    def cargar_syllabus(self, curso_id: str) -> Syllabus | None:
        raise NotImplementedError

    @abstractmethod
    def cargar_progreso(self, curso_id: str) -> ProgresoCurso | None:
        raise NotImplementedError

    @abstractmethod
    def guardar_progreso(self, progreso: ProgresoCurso) -> None:
        raise NotImplementedError

    @abstractmethod
    def curso_de(self, usuario_sub: str, proyecto: str) -> str | None:
        """Id del curso de un usuario para un proyecto, o None si no existe."""
        raise NotImplementedError

    @abstractmethod
    def cursos_de(self, usuario_sub: str) -> list[ProgresoCurso]:
        """Todos los cursos (progreso) de un usuario."""
        raise NotImplementedError

    @abstractmethod
    def guardar_mensaje(self, curso_id: str, numero_clase: int, mensaje: MensajeChat) -> None:
        raise NotImplementedError

    @abstractmethod
    def historial(self, curso_id: str, numero_clase: int) -> list[MensajeChat]:
        raise NotImplementedError

    def inicio_clase(self, curso_id: str, numero_clase: int) -> str | None:
        """Cuándo se abrió la clase (ISO con zona), o None si nunca se abrió.

        Lo usa la verificación con git: solo cuentan los commits del alumno
        POSTERIORES al inicio de la clase. No es abstracto a propósito: los
        repositorios que no lo registren (mocks antiguos) heredan este None y
        el juicio simplemente no acota por fecha (generoso antes que injusto).
        """
        return None


class DesplieguePort(ABC):
    """Contrato del agente que PUBLICA: convierte una carpeta en una URL pública.

    Implementaciones: Render real (repo en GitHub + web service) o un mock que
    simula los hitos sin tocar la nube. La aplicación solo conoce este contrato.
    """

    @abstractmethod
    def publicar(
        self,
        ruta_proyecto: Path,
        nombre: str,
        al_avanzar: Callable[[str], None] | None = None,
    ) -> InfoDespliegue:
        """Publica el proyecto y devuelve su despliegue ya VIVO.

        Args:
            ruta_proyecto: Carpeta del proyecto generado en disco.
            nombre: Nombre/slug con el que se publica (define la URL).
            al_avanzar: Callback opcional de progreso, hito a hito. Contar el
                progreso jamás puede romper el despliegue: los adaptadores lo
                envuelven en try/except.

        Returns:
            El `InfoDespliegue` final (estado "vivo", con su URL y su repo).

        Raises:
            DespliegueError: Si la publicación no llegó a estar viva.
        """
        raise NotImplementedError


class DespliegueRepositoryPort(ABC):
    """Persistencia de los despliegues publicados: UNO vigente por slug.

    Es la fuente de verdad de GET /agent/despliegues y lo que la auditoría
    periódica revisa y actualiza (vivo/caido/fallido).
    """

    @abstractmethod
    def guardar(self, info: InfoDespliegue) -> None:
        """Upsert por slug: cada proyecto tiene UN despliegue (el vigente)."""
        raise NotImplementedError

    @abstractmethod
    def obtener(self, slug: str) -> InfoDespliegue | None:
        """El despliegue vigente de un proyecto, o None si nunca se publicó."""
        raise NotImplementedError

    @abstractmethod
    def listar(self) -> list[InfoDespliegue]:
        """Todos los despliegues (más recientes primero)."""
        raise NotImplementedError


class AgenteCliPort(ABC):
    """Contrato del AGENTE CLI local: Claude Code (u otro) por subprocess.

    Es la Orquesta hablando con un agente ya logueado en la máquina: el coste
    va contra la suscripción local, no contra una bolsa de créditos. Las
    implementaciones traducen sus fallos a `AgenteCliError`.
    """

    @abstractmethod
    def disponible(self) -> bool:
        """True si el binario del agente existe en este entorno."""
        raise NotImplementedError

    @abstractmethod
    def probar(self) -> str | None:
        """Llamada mínima real de salud. None = sano; texto = qué falló.

        Nunca lanza: la UI muestra el resultado tal cual.
        """
        raise NotImplementedError

    @abstractmethod
    def ejecutar(
        self,
        system: str,
        user: str,
        validar: Callable | None = None,
        cwd: Path | None = None,
        timeout_s: int = 300,
    ) -> Any:
        """Una llamada completa al agente. Devuelve dict validado o str.

        `validar` corre DENTRO del bucle de reintentos (regla de oro del
        proyecto): una salida con la forma equivocada cuenta como fallo del
        modelo y se pide otra muestra, no tumba la petición.

        Raises:
            AgenteCliError: Si el agente no pudo completar el encargo.
        """
        raise NotImplementedError

    @abstractmethod
    def ejecutar_stream(
        self,
        system: str,
        user: str,
        al_evento: Callable[[dict], None],
        validar: Callable | None = None,
        cwd: Path | None = None,
        timeout_s: int = 600,
    ) -> Any:
        """Como `ejecutar`, pero emitiendo cada evento del agente según llega.

        `al_evento` recibe cada evento (dict) para enchufarlo al canal de
        progreso; un callback que lanza jamás aborta el trabajo.

        Raises:
            AgenteCliError: Si el agente no pudo completar el encargo.
        """
        raise NotImplementedError


class TrabajosRepositoryPort(ABC):
    """Persistencia de los TRABAJOS DE FONDO (el "estado.json" generalizado).

    Todo trabajo largo (revisión de una entrega, publicación, futuras
    generaciones) queda registrado y consultable por HTTP, y sobrevive a un
    refresh del navegador o a un reinicio del proceso.
    """

    @abstractmethod
    def guardar(self, trabajo: TrabajoFondo) -> None:
        """Upsert por id: cada transición persiste la foto completa."""
        raise NotImplementedError

    @abstractmethod
    def obtener(self, id: str) -> TrabajoFondo | None:  # noqa: A002 - id es el nombre natural
        raise NotImplementedError

    @abstractmethod
    def listar_de(self, dueno: str, limite: int = 20) -> list[TrabajoFondo]:
        """Los trabajos de un dueño (más recientes primero)."""
        raise NotImplementedError


class ActividadRepositoryPort(ABC):
    """Registro de la ACTIVIDAD diaria del alumno: la señal del hábito.

    Una fila por (usuario, día). No guarda QUÉ hizo — eso vive en cursos,
    chat y despliegues — solo QUE ese día estuvo. De aquí salen la racha y
    el mapa semanal del camino del alumno.
    """

    @abstractmethod
    def registrar(self, usuario: str, fecha_iso: str) -> None:
        """Marca actividad de un usuario en un día. Idempotente y tolerante:
        una entrada ilegible se descarta con warning, jamás tumba el flujo
        que la emite (verificar una clase, publicar...)."""
        raise NotImplementedError

    @abstractmethod
    def fechas_de(self, usuario: str, limite_dias: int = 120) -> list[str]:
        """Días con actividad ('yyyy-mm-dd'), el más reciente primero."""
        raise NotImplementedError


class GitAlumnoPort(ABC):
    """Contrato para mirar la historia REAL de git del proyecto del alumno.

    Con esto el profesor deja de creerse el texto: una clase de "cambio" se
    supera con un commit del alumno, no contándolo bonito.
    """

    @abstractmethod
    def commits_del_alumno(
        self,
        slug: str,
        autor: str,
        desde_iso: str,
        archivo: str | None = None,
    ) -> list[dict]:
        """Commits del alumno (más reciente primero) como dicts
        {hash, mensaje, fecha, archivos}.

        Args:
            slug: Carpeta del proyecto generado.
            autor: Firma a buscar; vacío = la firma estándar del alumno.
            desde_iso: Solo commits posteriores a esta fecha ISO; vacío = todos.
            archivo: Si viene, solo commits que tocan ese archivo.

        Nunca lanza: si git falla o no hay repositorio, devuelve lista vacía.
        """
        raise NotImplementedError
