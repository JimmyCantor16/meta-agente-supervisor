"""Puertos del dominio: contratos abstractos (interfaces).

Los puertos permiten que la capa de aplicación dependa de ABSTRACCIONES y no de
implementaciones concretas (DeepSeek, SQLite, un mock de test...). Esta es la
esencia de la inversión de dependencias en la arquitectura hexagonal.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from src.domain.entities import (
    AgentEvaluation,
    AuditReport,
    DeveloperPrompt,
    EvaluationRecord,
    FewShotExample,
    GeneratedFile,
    GeneratedProject,
    TeachingGuide,
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


class LicenseRequiredError(Exception):
    """Se agotaron las generaciones gratuitas y no hay licencia activa."""


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
