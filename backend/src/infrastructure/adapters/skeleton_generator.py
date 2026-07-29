"""Generador que GARANTIZA el MVP para la clase más común (CRUD web con login).

Estrategia (la "forma adecuada" hallada tras 4 generaciones libres rotas): en vez
de re-generar y parchear la plomería, se REUTILIZA un esqueleto probado. El LLM
solo hace UNA tarea pequeña y fiable: leer la idea y devolver los TEXTOS visibles
(nombre de la app, qué son los ítems). El código sale correcto por construcción.

Si la idea NO es un CRUD con login (p. ej. un juego, una landing), delega en el
generador libre de siempre.
"""

from __future__ import annotations

import logging

from src.domain.entities import GeneratedFile, GeneratedProject
from src.domain.ports import ProjectGeneratorPort
from src.infrastructure.adapters.multimodel_llm import MultiModelLLM
from src.infrastructure.adapters.skeleton_fullstack import MARCADOR, construir
from src.infrastructure.adapters.skeleton_landing import construir_landing

logger = logging.getLogger(__name__)

_SYSTEM = (
    "Eres un analista que traduce la idea de una app a su MODELO DE DATOS. "
    "Devuelve SOLO un JSON válido, sin texto alrededor.\n\n"
    "Primero elige el tipo:\n"
    "- 'crud_login': app donde el usuario inicia sesión y gestiona registros "
    "(catas, gastos, inventario, clientes, tareas, hábitos, citas...).\n"
    "- 'landing': página de presentación de un producto, servicio o negocio, "
    "SIN login ni base de datos.\n"
    "- 'por_clases': la idea es DEMASIADO GRANDE para una sola entrega — pide "
    "varios módulos, tiempo real, gráficos avanzados, motores de cálculo o "
    "integraciones externas (un SaaS de trading, un ERP con facturación, nómina "
    "e inventario, una red social completa). NO intentes hacerlo todo: propón "
    "un TEMARIO por clases y describe el dominio de la PRIMERA.\n"
    "- 'otro': cualquier otra cosa (un juego, solo una API...).\n\n"
    "Si es 'crud_login', DISEÑA EL DOMINIO REAL de esa idea. No inventes campos "
    "genéricos: piensa qué datos concretos anotaría de verdad esa persona.\n\n"
    "Forma del JSON:\n"
    "{\n"
    '  "tipo": "crud_login|landing|otro",\n'
    '  "dominio": {\n'
    '    "app_name": "Bitácora de Catas",\n'
    '    "entidad": "Cata", "entidad_plural": "Catas",\n'
    '    "tono": "cálido|frío|sobrio|vivo|neutro",\n'
    '    "campos": [\n'
    '      {"nombre":"cafe","etiqueta":"Café","tipo":"texto","obligatorio":true},\n'
    '      {"nombre":"tueste","etiqueta":"Tueste","tipo":"opcion",'
    '"opciones":["Claro","Medio","Oscuro"],"obligatorio":true},\n'
    '      {"nombre":"puntaje","etiqueta":"Puntuación","tipo":"entero",'
    '"minimo":1,"maximo":100,"obligatorio":true}\n'
    "    ],\n"
    '    "calculos": [\n'
    '      {"etiqueta":"Puntuación media","operacion":"promedio","campo":"puntaje"},\n'
    '      {"etiqueta":"Catas registradas","operacion":"conteo"}\n'
    "    ]\n"
    "  },\n"
    '  "title":"...", "tagline":"...", "cta":"...", "sections":[{"heading":"...","text":"..."}],\n'
    '  "temario": {\n'
    '    "titulo":"Plataforma de Trading",\n'
    '    "resumen":"Qué será cuando esté completo, en dos frases.",\n'
    '    "motivo":"Por qué se hace por partes, dicho con honestidad.",\n'
    '    "clases":[\n'
    '      {"numero":1,"titulo":"Motor de precios en vivo",'
    '"entregable":"Ver los precios actualizándose y guardarlos",'
    '"porque":"Sin datos no hay nada que analizar despues"},\n'
    '      {"numero":2,"titulo":"...","entregable":"...","porque":"..."}\n'
    "    ]\n"
    "  }\n"
    "}\n\n"
    "Reglas del dominio:\n"
    "- tipos válidos: texto, texto_largo, entero, decimal, fecha, opcion, booleano.\n"
    "- entre 3 y 7 campos. Los que de verdad importan, no relleno.\n"
    "- 'opcion' necesita al menos 2 opciones.\n"
    "- 'calculos' solo sobre campos numéricos (o 'conteo', que no necesita campo). "
    "Operaciones: suma, promedio, maximo, minimo, conteo.\n"
    "- el 'tono' debe pegar con el tema (café→cálido, finanzas→frío, "
    "corporativo→sobrio, creativo→vivo).\n\n"
    "Si el tipo es 'por_clases': rellena 'temario' con 4 a 8 clases (cada una "
    "debe dejar algo USABLE por sí solo, no un andamio a medias) Y rellena "
    "'dominio' con lo que se construye en la CLASE 1, siguiendo las mismas "
    "reglas de arriba.\n"
    "Rellena SOLO lo del tipo elegido. Para 'landing' incluye 3 a 5 sections."
)


class SkeletonProjectGenerator(ProjectGeneratorPort):
    """Usa el esqueleto probado para CRUD+login; delega el resto al generador libre."""

    def __init__(self, fallback: ProjectGeneratorPort) -> None:
        self._fallback = fallback
        self._llm = MultiModelLLM(role="prompt")

    def generate(self, prompt: str, language: str = "es") -> GeneratedProject:
        datos = self._extraer(prompt)
        tipo = (datos or {}).get("tipo")
        if tipo == "crud_login":
            proyecto = self._construir_por_dominio(datos)
            if proyecto is not None:
                return proyecto
            # Sin dominio utilizable se cae al esqueleto de siempre: una app
            # genérica que funciona es mejor que ninguna.
            app_name = str(datos.get("app_name") or "Mi App")[:60]
            logger.warning("Esqueleto: sin dominio válido; se usa la plantilla básica.")
            return construir(app_name, "elementos", "Escribe algo...")
        if tipo == "por_clases":
            proyecto = self._construir_primera_clase(datos)
            if proyecto is not None:
                return proyecto
            logger.warning("Idea grande sin temario utilizable; se intenta como CRUD.")
            proyecto = self._construir_por_dominio(datos)
            if proyecto is not None:
                return proyecto
            return self._fallback.generate(prompt, language)

        if tipo == "landing":
            title = str(datos.get("title") or datos.get("app_name") or "Mi Producto")[:60]
            tagline = str(datos.get("tagline") or "Algo simple y bien hecho.")[:140]
            cta = str(datos.get("cta") or "Empezar")[:30]
            secciones = datos.get("sections") if isinstance(datos.get("sections"), list) else []
            secciones = [s for s in secciones if isinstance(s, dict) and s.get("heading")]
            logger.info("Esqueleto: LANDING PROBADA ('%s', %d secciones).", title, len(secciones))
            return construir_landing(title, tagline, cta, secciones)
        logger.info("Esqueleto: idea 'otro' -> generador libre.")
        return self._fallback.generate(prompt, language)

    def repair_with_error(self, project: GeneratedProject, error: str) -> GeneratedProject:
        # Un proyecto de esqueleto es correcto por construcción: NO lo toca el LLM
        # (evita que el reparador rompa algo que ya funciona).
        if self._es_esqueleto(project):
            logger.info("Esqueleto: proyecto correcto por construcción; no se repara.")
            return project
        return self._fallback.repair_with_error(project, error)

    def aplicar_stubs(self, project: GeneratedProject) -> GeneratedProject:
        if self._es_esqueleto(project):
            return project
        return self._fallback.aplicar_stubs(project)

    # -- internos ------------------------------------------------------------
    @staticmethod
    def _construir_por_dominio(datos: dict) -> GeneratedProject | None:
        """Construye la app A PARTIR DEL DOMINIO que diseñó el modelo.

        Es lo que hace que dos ideas distintas den dos aplicaciones distintas.
        Si el dominio viene mal formado, devuelve None y el llamador decide.
        """
        bruto = datos.get("dominio")
        if not isinstance(bruto, dict) or not bruto.get("campos"):
            return None
        try:
            from src.domain.dominio_app import DominioApp
            from src.infrastructure.adapters.skeleton_dominio_armar import (
                construir_desde_dominio,
            )

            dominio = DominioApp.model_validate(bruto).sanear()
        except Exception as exc:  # noqa: BLE001 - un dominio inválido no tumba la generación
            logger.warning("El dominio propuesto no era válido (%s).", exc)
            return None

        logger.info(
            "Esqueleto POR DOMINIO: '%s' · entidad=%s · %d campos · %d cálculo(s) · tono=%s",
            dominio.app_name, dominio.entidad, len(dominio.campos),
            len(dominio.calculos), dominio.tono,
        )
        return construir_desde_dominio(dominio)

    @staticmethod
    def _construir_primera_clase(datos: dict) -> GeneratedProject | None:
        """Para ideas grandes: entrega la CLASE 1 funcionando, más el temario.

        Es la respuesta honesta a un encargo que no cabe en una entrega. En vez
        de un amasijo a medias de todo, algo que funciona hoy y un camino claro
        de lo que falta.
        """
        bruto = datos.get("temario")
        if not isinstance(bruto, dict) or not bruto.get("clases"):
            return None
        try:
            from src.domain.temario import Temario

            temario = Temario.model_validate(bruto).sanear()
        except Exception as exc:  # noqa: BLE001
            logger.warning("El temario propuesto no era válido (%s).", exc)
            return None
        if temario.total < 2:
            return None  # si no son varias clases, no hacía falta trocearlo

        # La clase 1 se construye como cualquier app por dominio.
        proyecto = SkeletonProjectGenerator._construir_por_dominio(datos)
        if proyecto is None:
            return None

        primera = temario.clases[0]
        proyecto.files.append(
            GeneratedFile(path="PLAN-DE-CLASES.md", content=temario.como_markdown())
        )
        proyecto.summary = (
            f"Clase 1 de {temario.total}: {primera.titulo}. "
            f"{proyecto.summary} El plan completo está en PLAN-DE-CLASES.md."
        )
        logger.info(
            "IDEA GRANDE: temario de %d clases. Se entrega la clase 1 «%s» funcionando.",
            temario.total, primera.titulo,
        )
        return proyecto

    @staticmethod
    def _es_esqueleto(project: GeneratedProject) -> bool:
        return any(f.path == MARCADOR for f in project.files)

    def _extraer(self, prompt: str) -> dict | None:
        try:
            data = self._llm.chat_json(_SYSTEM, prompt, temperature=0.1)
        except Exception as exc:  # noqa: BLE001 - si el LLM falla, se delega
            logger.warning("Esqueleto: no se pudo clasificar la idea (%s); se delega.", exc)
            return None
        return data if isinstance(data, dict) else None
