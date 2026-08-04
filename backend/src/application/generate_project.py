"""Caso de uso: generar un proyecto de software CON AUTO-VERIFICACIÓN.

Es el "agente que construye". Flujo:
  1. GENERAR  -> el agente produce los archivos.
  2. ESCRIBIR -> se materializan en disco.
  3. VERIFICAR-> se intenta ejecutar/importar de verdad.
  4. CORREGIR -> si falla, se le pasa el ERROR REAL al agente y reintenta.

Ese bucle (3-4) es lo que convierte "código plausible" en "código que funciona".
"""

from __future__ import annotations

import logging

from src.application.diagnostico_mvp import senales_visibilidad
from src.domain.entities import (
    CasoGeneracion,
    EstadoMVP,
    GeneratedFile,
    GeneratedProject,
)
from src.domain.ports import (
    CasoRepositoryPort,
    ProjectGeneratorPort,
    ProjectRunnerPort,
    ProjectVerifierPort,
    ProjectWriterPort,
    SpecPlanPort,
)

logger = logging.getLogger(__name__)

# Cuántas veces intentamos corregir con el error real antes de rendirnos.
# Se subió de 3 a 7 porque el bucle CONVERGE pero necesita vueltas: en una
# corrida real iba 5 -> 3 símbolos pendientes y se quedó sin intentos justo
# antes de terminar. Ahora repetir es barato (las dependencias están cacheadas)
# y el bucle se corta solo en cuanto una corrección no cambia nada.
_MAX_FIX_ATTEMPTS = 7


def _fase(nombre: str, detalle: str = "", paso: int = 0, de: int = 0) -> None:
    """Anuncia en qué fase va la construcción.

    La aplicación no debería saber de WebSockets, así que el import va DENTRO y
    cualquier fallo se traga: si el canal de progreso no está disponible, la
    generación sigue igual. Contar lo que pasa nunca puede impedir que pase.
    """
    try:
        from src.infrastructure.entrypoints.progreso import DIFUSOR

        DIFUSOR.fase(nombre, detalle, paso, de)
    except Exception:  # noqa: BLE001
        pass


def _solo_falla_el_frontend(error: str) -> bool:
    """True si lo único roto es la compilación de la interfaz.

    En ese caso el backend está instalado y comprobado, y merece entregarse:
    media entrega honesta vale más que ninguna.
    """
    marcadores = ("EL FRONTEND NO COMPILA", "Fallo instalando dependencias del frontend")
    return any(m in error for m in marcadores)


class GenerateProjectUseCase:
    """Convierte un prompt en un proyecto escrito en disco y VERIFICADO."""

    def __init__(
        self,
        generator: ProjectGeneratorPort,
        writer: ProjectWriterPort,
        verifier: ProjectVerifierPort | None = None,
        runner: ProjectRunnerPort | None = None,
        caso_repo: CasoRepositoryPort | None = None,
        spec_plan: SpecPlanPort | None = None,
    ) -> None:
        """Inyecta el generador, el escritor y (opcionales) verificador, runner,
        banco de casos (memoria) y diseñador spec+plan (contrato previo)."""
        self._generator = generator
        self._writer = writer
        self._verifier = verifier
        self._runner = runner
        self._caso_repo = caso_repo
        self._spec_plan = spec_plan
        # URL del último proyecto arrancado (la expone el entrypoint).
        self.last_url: str | None = None
        # Rama de entrega y traza de la corrida, para el informe de revisión.
        self.rama_entrega: str | None = None
        self.intentos_verificacion: int = 0
        self.atascos: list[str] = []
        # Si la interfaz no compiló, aquí queda el motivo para poder decírselo
        # al usuario en vez de entregarle una URL a medias sin explicación.
        self.frontend_error: str | None = None
        # Si el gate de "MVP visible" tuvo que relanzar por entregar solo JSON.
        self.relanzado_por_visibilidad: bool = False

    def execute(self, prompt: str, language: str = "es") -> tuple[GeneratedProject, str]:
        """Genera, escribe y auto-verifica el proyecto.

        Ahora, además, APRENDE: reinyecta lecciones de proyectos similares antes
        de generar (RAG del banco de casos), garantiza que el MVP SE VEA antes de
        entregarlo (gate anti-Azure) y guarda el caso para las ideas futuras.

        Returns:
            Tupla (proyecto final, ruta absoluta donde quedó escrito).

        Raises:
            ValueError: Si el prompt está vacío.
            ProjectGenerationError: Si falla la generación o la escritura.
        """
        if not prompt or not prompt.strip():
            raise ValueError("El prompt para generar el proyecto no puede estar vacío.")

        original = prompt.strip()
        self.last_url = None
        self.frontend_error = None
        self.relanzado_por_visibilidad = False
        self.rama_entrega = None
        self.intentos_verificacion = 0
        self.atascos = []

        project, output_path = self._generar_y_verificar(original, language)
        self._guardar_caso(original, project)
        self._entregar_en_rama(original, project, output_path)
        return project, output_path

    def _entregar_en_rama(self, idea: str, project: GeneratedProject, output_path: str) -> None:
        """Deja el trabajo en una rama con su informe, listo para revisión.

        Nunca bloquea: si algo falla aquí, el proyecto generado sigue siendo
        válido; solo se pierde la comodidad de revisarlo como un cambio de git.
        """
        try:
            from src.infrastructure.adapters.entrega_en_rama import (
                EntregaEnRama,
                InformeEntrega,
            )

            atascos = list(self.atascos)
            if self.frontend_error:
                atascos.append(self.frontend_error.splitlines()[0][:200])
            if self.last_url is None:
                atascos.append("No conseguí dejarlo arrancado: no hay URL que entregar.")

            pendientes = ["Revisar el diseño visual: es funcional, pero genérico."]
            if self.relanzado_por_visibilidad:
                pendientes.append("Hubo que insistir para que trajera interfaz; conviene revisarla.")
            if atascos:
                pendientes.append("Resolver los puntos de «dónde me atasqué».")

            informe = InformeEntrega(
                idea=idea,
                proyecto=project.slug(),
                archivos=len(project.files),
                intentos=max(1, self.intentos_verificacion),
                verificado=self.last_url is not None or not atascos,
                url=self.last_url,
                atascos=atascos,
                pendientes=pendientes,
            )
            self.rama_entrega = EntregaEnRama().entregar(output_path, informe)
            if self.rama_entrega:
                # Mensaje que las 3 apps convierten en aviso de "hay algo que revisar".
                logger.info(
                    "ENTREGA LISTA PARA REVISION en la rama '%s' (proyecto '%s').",
                    self.rama_entrega, project.slug(),
                )
        except Exception as exc:  # noqa: BLE001 - entregar es best-effort
            logger.warning("No se pudo entregar en rama: %s", exc)

    def _generar_y_verificar(
        self, original: str, language: str
    ) -> tuple[GeneratedProject, str]:
        """El bucle generar→verificar→corregir, con spec+plan, RAG y gate."""
        # 1) Contrato spec+plan (qué/cómo explícito) y 2) lecciones de casos.
        _fase("entender", "Leyendo tu idea y decidiendo qué construir")
        spec = self._disenar_spec(original)
        prompt_gen = self._con_lecciones(self._con_spec(original, spec))

        logger.info("Generando proyecto a partir del prompt (%d caracteres)...", len(prompt_gen))
        _fase("escribir", "Escribiendo el código de tu sistema")
        project = self._generator.generate(prompt_gen, language)

        # El spec+plan se guarda como material del alumno y guía del proyecto.
        if spec is not None:
            project.files.append(GeneratedFile(path="SPEC.md", content=spec.como_markdown()))

        logger.info("Proyecto '%s' generado con %d archivo(s).", project.name, len(project.files))
        output_path = self._writer.write(project)

        if self._verifier is None:
            return project, output_path

        # --- Bucle de auto-verificación con el error REAL ---
        for attempt in range(1, _MAX_FIX_ATTEMPTS + 1):
            # Antes de verificar: fixes DETERMINISTAS (sin IA) de los errores que
            # el modelo repite y que el verificador no atrapa solo (cableado de
            # routers, pines incompatibles, módulos ES). Convierte "abre pero no
            # deja entrar" en "usable".
            self._normalizar_determinista(output_path)
            self.intentos_verificacion = attempt
            # Con paso/de, la vista puede pintar una barra de verdad en vez de
            # una lista de frases: "Comprobando · intento 3 de 7".
            _fase("verificar", "Comprobando que arranca y responde", attempt, _MAX_FIX_ATTEMPTS)
            error = self._verifier.verify(output_path)
            if error is None:
                logger.info("Verificación superada en el intento %d.", attempt)
                _fase("publicar", "Arrancando tu sistema y preparando su dirección")
                project, output_path = self._entregar(project, output_path, original, language)
                if self.last_url is None:
                    # Sin URL el entregable está incompleto: el usuario recibe
                    # código en disco en vez del sistema funcionando.
                    logger.warning(
                        "ENTREGABLE INCOMPLETO: '%s' no se pudo arrancar, no hay URL.",
                        project.name,
                    )
                return project, output_path

            # PRIMERO: reparación DETERMINISTA dirigida por el ERROR real (imports
            # faltantes, import desde el módulo equivocado). El auto-repair del LLM
            # resultó poco fiable hasta para esto; esto lo arregla garantizado y
            # gratis. Si resuelve, re-verifica y entrega sin gastar una llamada.
            if self._reparar_por_error(output_path, error):
                self._resync_desde_disco(project, output_path)
                error_post = self._verifier.verify(output_path)
                if error_post is None:
                    logger.info("Verificación superada tras fix determinista de imports (intento %d).", attempt)
                    project, output_path = self._entregar(project, output_path, original, language)
                    if self.last_url is None:
                        logger.warning(
                            "ENTREGABLE INCOMPLETO: '%s' no se pudo arrancar, no hay URL.",
                            project.name,
                        )
                    return project, output_path
                error = error_post  # sigue roto: el LLM recibe el error ya actualizado

            # Se registra el error COMPLETO de cada intento, no solo el último:
            # sin esto no hay forma de saber por qué falló una ronda intermedia,
            # y cada iteración se convierte en una adivinanza.
            logger.warning(
                "Verificación falló (intento %d/%d):\n%s\n--- corrigiendo ---",
                attempt,
                _MAX_FIX_ATTEMPTS,
                error[-1800:],
            )
            # Se guarda la PRIMERA línea útil del error para el informe de
            # revisión: es lo que necesita quien vaya a arreglarlo.
            resumen = next(
                (l.strip() for l in reversed(error.splitlines()) if l.strip() and "File \"" not in l),
                "",
            )
            if resumen and resumen not in self.atascos:
                self.atascos.append(f"Intento {attempt}: {resumen[:200]}")
            # El LLM repara sobre la versión YA normalizada en disco (si no, pisa
            # los fixes deterministas con su copia en memoria desactualizada).
            self._resync_desde_disco(project, output_path)
            huella_previa = {f.path: f.content for f in project.files}
            project = self._generator.repair_with_error(project, error)

            # Con la misma entrada y temperatura baja, el modelo devuelve
            # exactamente la misma corrección: reintentar es tiempo perdido.
            # Si nada cambió, se para en vez de repetir la jugada.
            if {f.path: f.content for f in project.files} == huella_previa:
                logger.warning(
                    "La corrección no cambió NADA; se generan stubs para los "
                    "símbolos que faltan y así el sistema al menos ARRANCA "
                    "(intento %d).", attempt,
                )
                # Última bala: si lo que bloquea son símbolos sin implementar,
                # se crean stubs seguros para que el proyecto compile y arranque.
                # Las funciones quedan como ejercicio del modo profesor.
                project = self._generator.aplicar_stubs(project)
                nuevo_output = self._writer.write(project)
                if self._verifier.verify(nuevo_output) is None:
                    output_path = nuevo_output
                    break
                # Si ni con stubs arranca, no hay más que hacer.
                if {f.path: f.content for f in project.files} == huella_previa:
                    break
                output_path = nuevo_output
                continue

            output_path = self._writer.write(project)

        # Último chequeo tras la corrección final.
        final_error = self._verifier.verify(output_path)
        if final_error is None:
            logger.info("Verificación OK tras las correcciones.")
            project, output_path = self._entregar(project, output_path, original, language)
        elif _solo_falla_el_frontend(final_error):
            # El backend está instalado y verificado: descartarlo entero porque
            # la interfaz no compiló es tirar lo que SÍ funciona. Se entrega la
            # URL del backend y se dice con claridad qué quedó pendiente.
            logger.warning(
                "La interfaz no compila, pero el backend sí funciona: se entrega "
                "igualmente su URL. Detalle del fallo del frontend:\n%s",
                final_error[-800:],
            )
            self._launch(project, output_path)
            self.frontend_error = final_error
        else:
            # Se registra el final del error (donde está el diagnóstico), no los
            # primeros 200 caracteres, que solo mostraban la cabecera inútil del
            # traceback y dejaban a ciegas a quien revisa los logs.
            logger.warning(
                "El proyecto se entrega con un fallo pendiente tras %d intentos:\n%s",
                _MAX_FIX_ATTEMPTS,
                final_error[-1500:],
            )
        return project, output_path

    def _normalizar_determinista(self, output_path: str) -> None:
        """Aplica los fixes deterministas (sin IA) antes de verificar/entregar:
        cableado de routers y pines incompatibles (backend) + módulos ES
        (frontend). Nunca bloquea: si algo falla, sigue el flujo normal."""
        try:
            from src.infrastructure.adapters.backend_fixes import reparar_backend
            from src.infrastructure.adapters.frontend_fixes import reparar_frontend

            reparar_backend(output_path)
            reparar_frontend(output_path)
        except Exception as exc:  # noqa: BLE001 - normalizar es best-effort
            logger.warning("Normalización determinista falló (no bloquea): %s", exc)

    def _reparar_por_error(self, output_path: str, error: str) -> bool:
        """Fix determinista dirigido por el error de verificación (imports)."""
        try:
            from src.infrastructure.adapters.backend_fixes import reparar_por_error

            return reparar_por_error(output_path, error)
        except Exception as exc:  # noqa: BLE001 - reparar es best-effort
            logger.warning("Fix por error falló (no bloquea): %s", exc)
            return False

    def _resync_desde_disco(self, project: GeneratedProject, output_path: str) -> None:
        """Re-lee los archivos del proyecto desde disco a memoria, para que las
        reparaciones deterministas (que editan en disco) no las pise el LLM con
        su copia en memoria desactualizada."""
        from pathlib import Path

        base = Path(output_path)
        for f in project.files:
            p = base / f.path
            if p.exists():
                try:
                    f.content = p.read_text(encoding="utf-8", errors="ignore")
                except Exception:  # noqa: BLE001
                    pass

    def _launch(self, project: GeneratedProject, output_path: str) -> None:
        """Arranca el proyecto verificado y guarda su URL para entregarla.

        GATE DE RENDER: antes de entregar la URL, un navegador real comprueba
        que la página SE VE y no revienta en JavaScript. El usuario final no
        sabe programar: una URL en blanco es peor que no entregar URL.
        """
        if self._runner is None:
            return
        try:
            self.last_url = self._runner.start(output_path, project.slug())
            if not self.last_url:
                return
            from src.infrastructure.adapters.validacion_navegador import validar_render

            fallo_render = validar_render(self.last_url)
            if fallo_render is not None:
                # ENTRENAMIENTO DETERMINISTA: antes de retener la URL, arreglamos
                # los dos fallos de carga de frontend más comunes (módulos ES sin
                # type=module; símbolos importados que el módulo destino no
                # exporta) SIN gastar una llamada al LLM. Los estáticos se sirven
                # por-petición, así que no hay que reiniciar el runner: se parchea
                # en disco y se revalida una vez.
                from src.infrastructure.adapters.frontend_fixes import reparar_frontend

                if reparar_frontend(output_path):
                    logger.info(
                        "Gate de render: reparación determinista de frontend aplicada; "
                        "revalidando %s.", self.last_url,
                    )
                    fallo_render = validar_render(self.last_url)
            if fallo_render is None:
                logger.info("Proyecto disponible en %s (render validado).", self.last_url)
                return
            logger.warning(
                "URL RETENIDA para '%s': el navegador demostró que la página "
                "no sirve al usuario final.\n%s",
                project.slug(), fallo_render,
            )
            self._runner.stop(project.slug())
            self.frontend_error = (
                "El proyecto compila y arranca, pero el navegador detectó que "
                "la página no se muestra correctamente, así que la URL no se "
                "entrega todavía:\n" + fallo_render
            )
            self.last_url = None
        except Exception as exc:  # noqa: BLE001 - arrancar es "best effort"
            logger.warning("No se pudo arrancar el proyecto: %s", exc)
            self.last_url = None

    # ------------------------------------------------------------------
    # Fase 0: memoria (RAG) + gate de "MVP visible" + banco de casos
    # ------------------------------------------------------------------
    def _disenar_spec(self, original: str):
        """Diseña el contrato spec+plan (best-effort: nunca bloquea generar)."""
        if self._spec_plan is None:
            return None
        try:
            spec = self._spec_plan.disenar(original)
            logger.info("Spec+plan: %d pantalla(s), %d endpoint(s).",
                        len(spec.pantallas), len(spec.endpoints))
            return spec
        except Exception as exc:  # noqa: BLE001 - el spec nunca tumba la generación
            logger.warning("No se pudo diseñar el spec+plan: %s", exc)
            return None

    def _con_spec(self, original: str, spec) -> str:
        """Antepone el CONTRATO (qué/cómo) al prompt, para generar predecible."""
        if spec is None:
            return original
        def lista(items):
            return "; ".join(items) if items else "(por definir)"
        contrato = (
            "=== CONTRATO DEL PROYECTO (respétalo) ===\n"
            f"Pantallas: {lista(spec.pantallas)}\n"
            f"Datos/entidades: {lista(spec.entidades)}\n"
            f"Endpoints del backend (el frontend SOLO puede pedir estas rutas): "
            f"{lista(spec.endpoints)}\n"
            f"DEBE VERSE (si no, no sirve): {lista(spec.criterios_visibles)}\n"
            + (f"Stack: {spec.stack_sugerido}\n" if spec.stack_sugerido else "")
        )
        return f"{original}\n\n{contrato}"

    def _con_lecciones(self, original: str) -> str:
        """Antepone lecciones de proyectos SIMILARES antes de generar (RAG).

        El sistema aprende: reinyecta lo que funcionó y lo que falló en ideas
        parecidas para no repetir errores. Si no hay banco o no hay casos
        similares, devuelve el prompt tal cual.
        """
        if self._caso_repo is None:
            return original
        try:
            casos = self._caso_repo.similares(original, limit=3)
        except Exception as exc:  # noqa: BLE001 - la memoria nunca bloquea generar
            logger.warning("No se pudieron leer casos similares: %s", exc)
            return original
        if not casos:
            return original

        lineas: list[str] = []
        for c in casos:
            estado = c.estado_mvp.value if hasattr(c.estado_mvp, "value") else c.estado_mvp
            marca = "✅ funcionó" if c.exito else f"⚠️ resultó {estado}"
            lineas.append(f"- Idea similar ('{c.idea[:80]}') → {marca}.")
            for p in c.problemas[:2]:
                lineas.append(f"    · evita: {p[:160]}")
            for l in c.lecciones[:2]:
                lineas.append(f"    · aplica: {l[:160]}")
        bloque = "\n".join(lineas)[:1200]
        logger.info("RAG: %d caso(s) similar(es) reinyectado(s) al generar.", len(casos))
        return (
            f"{original}\n\n"
            "=== LECCIONES DE PROYECTOS SIMILARES (contexto de ingeniería para el "
            "generador; NO cambian la idea del usuario) ===\n"
            f"{bloque}"
        )

    def _entregar(
        self, project: GeneratedProject, output_path: str, original: str, language: str
    ) -> tuple[GeneratedProject, str]:
        """Gate de 'MVP visible' + arranque. Nunca entrega un JSON sin nada."""
        project, output_path = self._asegurar_visible(project, output_path, original, language)
        self._launch(project, output_path)
        return project, output_path

    def _asegurar_visible(
        self, project: GeneratedProject, output_path: str, original: str, language: str
    ) -> tuple[GeneratedProject, str]:
        """El caso Azure NO llega al usuario: si es solo API/JSON, relanza pidiendo UI.

        Solo dispara cuando NO hay ningún archivo de interfaz y SÍ hay API — la
        señal inequívoca de 'solo JSON, nada que ver'. Relanza UNA vez.
        """
        tiene_frontend, tiene_api = senales_visibilidad(project.files)
        if tiene_frontend or not tiene_api or self.relanzado_por_visibilidad:
            return project, output_path

        logger.warning(
            "GATE MVP-VISIBLE: '%s' entregó solo API/JSON sin interfaz. "
            "Relanzando la generación con exigencia de UI (caso Azure).",
            project.slug(),
        )
        self.relanzado_por_visibilidad = True
        prompt_ui = (
            f"{original}\n\n"
            "IMPORTANTE: la versión anterior entregó SOLO una API/JSON, sin una "
            "pantalla que un usuario pueda ver. DEBES incluir un frontend visible "
            "(por ejemplo un index.html o una app React) que muestre y use esos "
            "datos en el navegador. El usuario final no sabe programar: si abre la "
            "URL y ve texto crudo, se va. No entregues solo endpoints."
        )
        try:
            nuevo = self._generator.generate(prompt_ui, language)
            nueva_ruta = self._writer.write(nuevo)
            if self._verifier is not None:
                # Verificación best-effort: si no arranca, se sigue el bucle normal
                # en el siguiente chequeo; aquí solo queremos recuperar la UI.
                self._verifier.verify(nueva_ruta)
            tiene_frontend_nuevo, _ = senales_visibilidad(nuevo.files)
            if tiene_frontend_nuevo:
                logger.info("GATE MVP-VISIBLE: el relanzamiento SÍ trae interfaz.")
                return nuevo, nueva_ruta
            logger.warning("GATE MVP-VISIBLE: el relanzamiento tampoco trajo UI.")
        except Exception as exc:  # noqa: BLE001 - relanzar es best-effort
            logger.warning("GATE MVP-VISIBLE: falló el relanzamiento: %s", exc)
        return project, output_path

    def _guardar_caso(self, original: str, project: GeneratedProject) -> None:
        """Guarda el caso en el banco: qué se pidió, qué salió y qué se aprendió."""
        if self._caso_repo is None:
            return
        tiene_frontend, tiene_api = senales_visibilidad(project.files)
        if not tiene_frontend and tiene_api:
            estado = EstadoMVP.VACIO
        elif self.last_url:
            estado = EstadoMVP.FUNCIONA
        else:
            estado = EstadoMVP.PARCIAL

        problemas: list[str] = []
        if estado == EstadoMVP.VACIO:
            problemas.append("Entregó solo API/JSON, sin interfaz visible para el usuario.")
        if self.frontend_error:
            problemas.append(self.frontend_error[:300])
        if not self.last_url and estado != EstadoMVP.VACIO:
            problemas.append("No se pudo entregar una URL viva.")

        try:
            self._caso_repo.guardar(CasoGeneracion(
                idea=original[:1000],
                slug=project.slug(),
                estado_mvp=estado,
                tuvo_url=bool(self.last_url),
                relanzado=self.relanzado_por_visibilidad,
                problemas=problemas,
                num_archivos=len(project.files),
            ))
        except Exception as exc:  # noqa: BLE001 - guardar memoria nunca rompe la entrega
            logger.warning("No se pudo guardar el caso en el banco: %s", exc)
