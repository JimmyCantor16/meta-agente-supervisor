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

from src.domain.dominio_app import DominioApp
from src.domain.entities import GeneratedFile, GeneratedProject
from src.domain.ports import ProjectGeneratorPort
from src.infrastructure.adapters.multimodel_llm import MultiModelLLM
from src.infrastructure.adapters.skeleton_fullstack import MARCADOR
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
    "El campo 'motor' es la base de datos: pon 'mysql' o 'postgres' SOLO si el "
    "encargo los nombra explícitamente (\"con MySQL\", \"en PostgreSQL\"); si no "
    "se nombra ninguna, pon 'sqlite'. Quien pide un motor concreto suele tenerlo "
    "ya en su empresa: darle otro es no entregarle lo que pidió.\n\n"
    "CATÁLOGOS (la diferencia entre una lista y un negocio): si el encargo "
    "nombra entidades DE APOYO que administra el dueño —los barberos de la "
    "barbería, los servicios con su precio, las categorías, las mesas, las "
    "canchas— decláralas en 'catalogos' (máximo 3, con 2-5 ejemplos cada uno) y "
    "enlázalas desde la entidad principal con un campo "
    '{"tipo":"relacion","catalogo":"Barbero"}. Así el formulario ofrece un '
    "desplegable con los ítems reales y el ADMINISTRADOR los gestiona desde su "
    "panel. El primer campo de cada catálogo es su nombre visible (texto). En "
    "los 'ejemplos' de la entidad principal usa EXACTAMENTE los nombres "
    "sembrados en los catálogos. NO conviertas en catálogo lo que cada usuario "
    "crea para sí (eso es la entidad principal), ni uses 'relacion' para listas "
    "fijas de 2-4 valores (eso es 'opcion').\n\n"
    "Forma del JSON:\n"
    "{\n"
    '  "tipo": "crud_login|landing|otro",\n'
    '  "dominio": {\n'
    '    "app_name": "Barbería Estilo",\n'
    '    "entidad": "Cita", "entidad_plural": "Citas",\n'
    '    "tono": "cálido|frío|sobrio|vivo|neutro",\n'
    '    "motor": "sqlite|mysql|postgres",\n'
    '    "catalogos": [\n'
    '      {"nombre":"Barbero","plural":"Barberos",\n'
    '       "campos":[{"nombre":"nombre","etiqueta":"Nombre","tipo":"texto","obligatorio":true}],\n'
    '       "ejemplos":[{"nombre":"Ana López"},{"nombre":"Luis Rivas"}]},\n'
    '      {"nombre":"Servicio","plural":"Servicios",\n'
    '       "campos":[{"nombre":"nombre","etiqueta":"Servicio","tipo":"texto","obligatorio":true},\n'
    '                 {"nombre":"precio","etiqueta":"Precio","tipo":"decimal","minimo":0}],\n'
    '       "ejemplos":[{"nombre":"Corte clásico","precio":25000}]}\n'
    "    ],\n"
    '    "campos": [\n'
    '      {"nombre":"cliente","etiqueta":"Cliente","tipo":"texto","obligatorio":true},\n'
    '      {"nombre":"barbero","etiqueta":"Barbero","tipo":"relacion","catalogo":"Barbero","obligatorio":true},\n'
    '      {"nombre":"servicio","etiqueta":"Servicio","tipo":"relacion","catalogo":"Servicio","obligatorio":true},\n'
    '      {"nombre":"fecha","etiqueta":"Fecha","tipo":"fecha","obligatorio":true},\n'
    '      {"nombre":"hora","etiqueta":"Hora","tipo":"opcion",'
    '"opciones":["09:00","10:00","11:00","15:00","16:00"],"obligatorio":true}\n'
    "    ],\n"
    '    "calculos": [\n'
    '      {"etiqueta":"Citas registradas","operacion":"conteo"}\n'
    "    ],\n"
    '    "ejemplos": [\n'
    '      {"cliente":"María Restrepo","barbero":"Ana López","servicio":"Corte clásico",'
    '"fecha":"2026-08-10","hora":"10:00"},\n'
    '      {"cliente":"Jorge Uribe","barbero":"Luis Rivas","servicio":"Corte clásico",'
    '"fecha":"2026-08-10","hora":"11:00"}\n'
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
    "corporativo→sobrio, creativo→vivo).\n"
    "- 'ejemplos': OBLIGATORIO, entre 6 y 12 registros. Es la parte que más se "
    "nota y la que más se descuida. Una aplicación que abre VACÍA no parece "
    "pobre, parece ROTA — y con cero registros todos los cálculos valen cero, "
    "así que nadie ve el trabajo del diseño.\n"
    "  · Que se lean como REALES: nombres, lugares y cantidades del oficio de "
    "verdad («Finca La Esperanza, Huila», no «Cliente 1»). Nada de «Ejemplo A», "
    "«Lorem», «Prueba 1» ni valores todos iguales.\n"
    "  · VARIADOS: que al mirar la lista se entienda de qué va el negocio y que "
    "los promedios y totales del resumen den números creíbles.\n"
    "  · Una clave por cada campo, con el MISMO 'nombre' que arriba. Las fechas "
    "en formato AAAA-MM-DD y repartidas en las últimas semanas. Los números sin "
    "símbolos de moneda ni unidades: solo la cifra.\n\n"
    "Si el tipo es 'por_clases': rellena 'temario' con 4 a 8 clases (cada una "
    "debe dejar algo USABLE por sí solo, no un andamio a medias) Y rellena "
    "'dominio' con lo que se construye en la CLASE 1, siguiendo las mismas "
    "reglas de arriba.\n"
    "Rellena SOLO lo del tipo elegido. Para 'landing' incluye 3 a 5 sections."
)


#: Lo que el clasificador tiene permitido responder. Cualquier otra cosa se
#: ignora: un tipo inventado dejaría la construcción sin camino.
_TIPOS_VALIDOS = ("crud_login", "por_clases", "landing", "otro")


def _contrato_del_clasificador(datos: dict) -> None:
    """Comprueba que la respuesta del clasificador SE PUEDA construir.

    Corre DENTRO del bucle de fallback (ver `MultiModelLLM.chat_json`), y ese es
    justo el punto: el modo de fallo típico del tier gratis no es JSON roto —eso
    ya se detecta— sino JSON impecable con la FORMA inventada. Sin esta
    comprobación, un proveedor que contestaba `{"tipo": "crud_login"}` y poco más
    contaba como ÉXITO, la cadena se paraba ahí con proveedores sanos sin probar,
    y el usuario recibía la plantilla genérica «Mi App» en lugar de su idea. Así
    se entregó un «carrito de compras» convertido en una lista de «elementos».

    Es un CHEQUEO: su retorno se descarta, y lanzar es la forma de decir «este
    proveedor no sirve, prueba el siguiente».
    """
    if not isinstance(datos, dict):
        raise ValueError("la respuesta no es un objeto JSON")

    tipo = str(datos.get("tipo") or "").strip().lower()
    if tipo not in _TIPOS_VALIDOS:
        raise ValueError(f"'tipo' inválido: {tipo!r}; se esperaba uno de {_TIPOS_VALIDOS}")

    # 'landing' y 'otro' se sostienen solos: el primero tiene valores por
    # omisión para cada texto y el segundo se va al generador libre. Solo los
    # dos que construyen una app POR DOMINIO necesitan que el dominio exista.
    if tipo not in ("crud_login", "por_clases"):
        return

    bruto = datos.get("dominio")
    if not isinstance(bruto, dict) or not bruto.get("campos"):
        raise ValueError(f"'tipo' es {tipo!r} pero no trae 'dominio' con 'campos'")
    # El retorno se DESCARTA a propósito: aquí solo se comprueba que el dominio
    # sea válido. Quien construye vuelve a validar con `sanear()`.
    DominioApp.model_validate(bruto)

    if tipo == "por_clases":
        temario = datos.get("temario")
        clases = temario.get("clases") if isinstance(temario, dict) else None
        if not (isinstance(clases, list) and len(clases) >= 2):
            raise ValueError("'tipo' es 'por_clases' pero el temario no trae 2+ clases")


class SkeletonProjectGenerator(ProjectGeneratorPort):
    """Usa el esqueleto probado para CRUD+login; delega el resto al generador libre."""

    def __init__(self, fallback: ProjectGeneratorPort) -> None:
        self._fallback = fallback
        self._llm = MultiModelLLM(role="prompt")

    def generate(self, prompt: str, language: str = "es") -> GeneratedProject:
        datos = self._extraer(prompt)
        # Momento DISEÑO del agente experto. Va aquí, ANTES de decidir qué se
        # construye, porque el error más caro de los modelos gratuitos no es
        # elegir mal un campo: es aplanar un encargo de tres subsistemas a un
        # solo CRUD y dejar dos fuera sin decirlo. Corregir eso exige poder
        # replantear la respuesta entera, no solo retocar el modelo de datos.
        datos = self._replantear_con_experto(datos, prompt)
        tipo = (datos or {}).get("tipo")
        if tipo == "crud_login":
            proyecto = self._construir_por_dominio(datos)
            if proyecto is not None:
                return proyecto
            # Sin dominio utilizable NO se entrega la plantilla genérica. Durante
            # meses esta rama devolvió `construir("Mi App", "elementos", ...)`, y
            # eso no es «una app genérica que funciona»: es OTRA app, la misma
            # para todos, con el nombre y las palabras de nadie. Quien pidió un
            # carrito de compras recibía una lista de «elementos» y con razón lo
            # leyó como que el agente no había hecho nada. Un intento real sobre
            # la idea de verdad, aunque salga imperfecto, siempre vale más.
            logger.warning(
                "Esqueleto: 'crud_login' sin dominio construible; se delega al generador libre."
            )
            return self._fallback.generate(prompt, language)
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
    def _replantear_con_experto(datos: dict | None, prompt: str) -> dict | None:
        """Deja que el agente experto replantee la respuesta, si el plan lo incluye.

        Puede cambiar tres cosas, y en este orden de importancia:

          1. **El tipo de respuesta.** Es su potestad más valiosa: convertir «un
             CRUD» en «tres clases con su orden» cuando el encargo pedía varios
             subsistemas. Ningún retoque del modelo de datos arregla eso.
          2. **El temario**, si decide que la respuesta honesta es por clases.
          3. **El modelo de datos**, que es donde se decide si la aplicación va a
             parecer pensada o genérica.

        Devuelve los datos replanteados, o los mismos de entrada si no hay
        experto o si no aportó nada. Nunca lanza: pagar por experto no puede
        convertirse en una forma de que la construcción falle.
        """
        if not isinstance(datos, dict):
            return datos
        try:
            from src.application.experto_contexto import experto_actual
            from src.domain.experto import MomentoExperto

            servicio = experto_actual()
            if servicio is None:
                return datos

            aporte = servicio.intervenir(
                MomentoExperto.DISENO,
                {
                    # El encargo original: sin él, el experto no puede juzgar si
                    # los modelos gratuitos dejaron algo fuera.
                    "prompt": prompt[:4000],
                    "tipo_propuesto": datos.get("tipo"),
                    "dominio": datos.get("dominio"),
                    "temario": datos.get("temario"),
                },
            )
            if aporte is None:
                return datos

            replanteado = dict(datos)

            dominio = aporte.datos.get("dominio")
            if isinstance(dominio, dict) and dominio.get("campos"):
                # Red de seguridad: un modelo de datos mejor SIN datos dentro se
                # ve peor que el mediocre que reemplaza, porque todos los
                # cálculos valen cero. Si el experto no trajo ejemplos, se
                # rescatan los que había — los que no encajen con los campos
                # nuevos los descarta `sanear()` sin romper nada.
                if not dominio.get("ejemplos"):
                    previos = (datos.get("dominio") or {}).get("ejemplos") or []
                    if previos:
                        logger.warning(
                            "El experto rehizo el modelo sin ejemplos; se reutilizan los %d "
                            "anteriores para que la app no se entregue vacía.", len(previos),
                        )
                        dominio = {**dominio, "ejemplos": previos}
                replanteado["dominio"] = dominio

            temario = aporte.datos.get("temario")
            if isinstance(temario, dict) and temario.get("clases"):
                replanteado["temario"] = temario

            tipo = str(aporte.datos.get("tipo") or "").strip().lower()
            if tipo and tipo != datos.get("tipo"):
                cambio = SkeletonProjectGenerator._tipo_aceptable(tipo, replanteado)
                if cambio:
                    logger.info(
                        "El experto REPLANTEÓ la respuesta: de '%s' a '%s'.",
                        datos.get("tipo"), tipo,
                    )
                    replanteado["tipo"] = tipo
                else:
                    logger.warning(
                        "El experto pidió tipo '%s' pero sin lo necesario para sostenerlo; "
                        "se mantiene '%s'.", tipo, datos.get("tipo"),
                    )

            logger.info("Experto en el diseño: %s", aporte.resumen)
            return replanteado
        except Exception as exc:  # noqa: BLE001 - el experto es un extra, no un requisito
            logger.warning("El experto no pudo replantear el diseño: %s", exc)
            return datos

    @staticmethod
    def _tipo_aceptable(tipo: str, datos: dict) -> bool:
        """Si el tipo que pide el experto se puede sostener con lo que hay.

        Cambiar el tipo sin lo que ese tipo necesita sería peor que no cambiarlo:
        pedir «por clases» sin temario acaba en la rama de emergencia y el
        usuario recibe algo peor que antes de pagar.
        """
        if tipo not in _TIPOS_VALIDOS:
            return False
        if tipo == "por_clases":
            temario = datos.get("temario")
            clases = temario.get("clases") if isinstance(temario, dict) else None
            return bool(isinstance(clases, list) and len(clases) >= 2 and datos.get("dominio"))
        if tipo == "crud_login":
            dominio = datos.get("dominio")
            return bool(isinstance(dominio, dict) and dominio.get("campos"))
        return True

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
            data = self._llm.chat_json(
                _SYSTEM, prompt, temperature=0.1, validar=_contrato_del_clasificador
            )
        except Exception as exc:  # noqa: BLE001 - si el LLM falla, se delega
            logger.warning("Esqueleto: no se pudo clasificar la idea (%s); se delega.", exc)
            return None
        return data if isinstance(data, dict) else None
