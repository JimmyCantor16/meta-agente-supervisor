"""Módulo 5 — Evaluación final integrada (10 preguntas)."""

from __future__ import annotations

from src.domain.catalogo import Evaluacion, Leccion, ModuloCurso, PasoExplicado, PreguntaOpcion, SnippetCodigo
from src.infrastructure.semillas.fullstack._texto import t


def modulo_5() -> ModuloCurso:
    return ModuloCurso(
        id="m5-final",
        orden=5,
        titulo="Evaluación Final Integrada",
        descripcion="Un recorrido completo de punta a punta y 10 preguntas técnicas sobre la arquitectura y el flujo fullstack.",
        lecciones=[_l1_recorrido()],
        evaluacion=_evaluacion_final(),
    )


def _l1_recorrido() -> Leccion:
    return Leccion(
        id="m5-l1-recorrido",
        orden=1,
        titulo="De un clic en Vue a una fila en PostgreSQL",
        resumen="Repaso integrado: sigue una petición por todas las capas antes de la evaluación final.",
        duracion_min=15,
        contenido=t("""
            ## El recorrido completo

            El usuario pulsa **Confirmar** en un pedido. Esto es todo lo que pasa, capa
            por capa:

            1. **Componente Vue** (`ListaPedidos.vue`): el `@click` llama a
               `store.confirmar(id)`. El componente no sabe qué es HTTP.
            2. **Store Pinia**: llama a `confirmarPedido(id)` de la API de la feature y,
               cuando vuelve, reemplaza el pedido en su estado. Vue repinta.
            3. **Axios**: la instancia compartida añade el token (interceptor) y hace
               `POST /api/pedidos/{id}/confirmar` contra `VITE_API_URL`.
            4. **Adaptador REST** (`PedidoController`): convierte el `UUID` del path en un
               `PedidoId` y llama al **puerto de entrada** `ConfirmarPedidoUseCase`.
            5. **Caso de uso** (`ConfirmarPedidoService`): dentro de una transacción
               abierta en la infraestructura, carga el pedido por `CargarPedidoPort`,
               llama a `pedido.confirmar()` y lo guarda por `GuardarPedidoPort`.
            6. **Dominio** (`Pedido`): valida la invariante. Si está vacío lanza
               `PedidoVacio`; si ya estaba confirmado, `PedidoYaConfirmado`.
            7. **Adaptador de persistencia**: mapea a `PedidoJpaEntity` y Spring Data
               ejecuta el `UPDATE` en PostgreSQL. Flyway creó esa tabla; Hibernate solo
               la validó al arrancar.
            8. **Tras el commit**: un `@TransactionalEventListener(AFTER_COMMIT)` llama a
               `NotificarClientePort` y el adaptador SMTP envía el email.
            9. **Vuelta**: el controlador mapea a `PedidoResponse`. Si hubo error de
               dominio, el `@RestControllerAdvice` lo convirtió en un `ProblemDetail` con
               su código (404/409/422) y el interceptor de Axios en un `ApiError` que el
               store muestra.

            ## Lo que hace que funcione

            - Cada capa conoce solo a la de dentro, a través de **interfaces**.
            - Las reglas viven en **un** sitio (el dominio) y se prueban sin
              infraestructura.
            - Lo que cambia entre entornos (base, almacenamiento, SMTP, URL de la API)
              es **configuración**, no código.

            Cuando tengas claro este recorrido, pasa a la evaluación final: 10 preguntas,
            aprobado con el 70 %.
        """),
        pasos=[
            PasoExplicado(
                titulo="Dibuja el recorrido",
                explicacion="Antes del examen, intenta escribir los 9 pasos de memoria. Donde dudes, vuelve a esa lección.",
            ),
            PasoExplicado(
                titulo="Pregúntale al tutor",
                explicacion="Si una frontera no te queda clara (¿quién traduce el error a HTTP?), pregúntalo aquí abajo.",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m5-l1-s1",
                titulo="El mapa de dependencias",
                lenguaje="text",
                codigo=t("""
                    Vue (componente) → Pinia (store) → api.ts → Axios
                            │ HTTP
                            ▼
                    PedidoController ─▶ ConfirmarPedidoUseCase  (puerto de entrada)
                                                │
                                      ConfirmarPedidoService
                                         │         │        │
                         CargarPedidoPort  GuardarPedidoPort  NotificarClientePort   (puertos de salida)
                                 ▲               ▲                    ▲
                    PedidoPersistenceAdapter (JPA→PostgreSQL)   EmailNotificacionAdapter (SMTP)

                    Dominio (Pedido, Dinero, excepciones): no depende de nada.
                """),
            ),
        ],
    )


def _evaluacion_final() -> Evaluacion:
    return Evaluacion(
        id="m5-final-quiz",
        titulo="Evaluación final integrada",
        aprobacion_minima=70,
        preguntas=[
            PreguntaOpcion(
                id="m5-q1",
                enunciado="¿Cuál de estas clases NO debería tener ninguna anotación de Spring ni de JPA?",
                opciones=["PedidoController", "PedidoPersistenceAdapter", "Pedido (entidad de dominio)", "PedidosConfig"],
                correcta=2,
                explicacion="El dominio es Java puro; Spring y JPA viven en la infraestructura.",
            ),
            PreguntaOpcion(
                id="m5-q2",
                enunciado="`ConfirmarPedidoUseCase` es un…",
                opciones=["Puerto de salida", "Puerto de entrada", "Adaptador de entrada", "Value object"],
                correcta=1,
                explicacion="Es lo que la aplicación ofrece; lo invoca el adaptador REST.",
            ),
            PreguntaOpcion(
                id="m5-q3",
                enunciado="¿Quién traduce `PedidoYaConfirmado` en un HTTP 409?",
                opciones=[
                    "La entidad `Pedido`",
                    "El caso de uso",
                    "El `@RestControllerAdvice` del adaptador web",
                    "El interceptor de Axios",
                ],
                correcta=2,
                explicacion="El dominio lanza la excepción; la frontera web decide su representación HTTP.",
            ),
            PreguntaOpcion(
                id="m5-q4",
                enunciado="Pasas de guardar archivos en disco a Amazon S3. ¿Qué cambia en `SubirAdjuntoService`?",
                opciones=[
                    "Hay que inyectarle un `S3Client`",
                    "Nada: depende de `AlmacenamientoPort` y el adaptador se elige por configuración",
                    "Hay que reescribirlo con `MultipartFile`",
                    "Hay que anotarlo con `@ConditionalOnProperty`",
                ],
                correcta=1,
                explicacion="Es justo la promesa de ports & adapters: el núcleo no se entera del cambio de tecnología.",
            ),
            PreguntaOpcion(
                id="m5-q5",
                enunciado="¿Qué devuelve `CargarPedidoPort.cargar(id)`?",
                opciones=["`Optional<PedidoJpaEntity>`", "`Optional<Pedido>`", "`PedidoResponse`", "`ResponseEntity<Pedido>`"],
                correcta=1,
                explicacion="Los puertos circulan objetos de dominio; el mapeo desde JPA ocurre dentro del adaptador.",
            ),
            PreguntaOpcion(
                id="m5-q6",
                enunciado="¿Qué combinación es la adecuada para el esquema de PostgreSQL en producción?",
                opciones=[
                    "`ddl-auto=update` y sin migraciones",
                    "Flyway con scripts versionados y `ddl-auto=validate`",
                    "`ddl-auto=create-drop` en cada arranque",
                    "Crear las tablas a mano desde pgAdmin",
                ],
                correcta=1,
                explicacion="Las migraciones versionadas son reproducibles; Hibernate solo valida que coincidan.",
            ),
            PreguntaOpcion(
                id="m5-q7",
                enunciado="¿Por qué se envía el email de confirmación con `@TransactionalEventListener(phase = AFTER_COMMIT)`?",
                opciones=[
                    "Porque es más rápido",
                    "Para no avisar de un pedido cuya transacción terminó en rollback",
                    "Porque `JavaMailSender` no funciona dentro de transacciones",
                    "Para enviar el email dos veces por seguridad",
                ],
                correcta=1,
                explicacion="El aviso sale solo si los datos quedaron confirmados en la base.",
            ),
            PreguntaOpcion(
                id="m5-q8",
                enunciado="En el frontend, ¿dónde se gestiona de forma global una respuesta 401?",
                opciones=[
                    "En cada componente",
                    "En el interceptor de respuesta de la instancia de Axios",
                    "En el `router` de Vue",
                    "En el backend, redirigiendo con un 302",
                ],
                correcta=1,
                explicacion="Un solo sitio para la sesión caducada; los componentes no repiten esa lógica.",
            ),
            PreguntaOpcion(
                id="m5-q9",
                enunciado="Un componente hace `const { pedidos } = usePedidosStore()` y la lista no se actualiza. ¿Por qué?",
                opciones=[
                    "Pinia no es reactivo",
                    "La desestructuración rompe la reactividad; hay que usar `storeToRefs`",
                    "Falta `await` en el `onMounted`",
                    "El backend no envía cabeceras de caché",
                ],
                correcta=1,
                explicacion="`storeToRefs` devuelve refs conectados al estado del store.",
            ),
            PreguntaOpcion(
                id="m5-q10",
                enunciado="El carrito envía `{ sku, cantidad }`. ¿Quién fija el precio y el total del pedido?",
                opciones=[
                    "El store de Pinia, sumando en el navegador",
                    "El backend, leyendo los precios de su base de datos",
                    "El frontend, y el backend solo lo guarda",
                    "Un `computed` que se envía en la petición",
                ],
                correcta=1,
                explicacion="Si el cliente mandara el precio, cualquiera podría comprar por lo que quisiera editando la petición.",
            ),
        ],
    )
