"""Módulo 2 — Backend robusto con Spring Boot 3 y PostgreSQL."""

from __future__ import annotations

from src.domain.catalogo import (
    Evaluacion,
    Leccion,
    ModuloCurso,
    PasoExplicado,
    PreguntaOpcion,
    RetoCodigo,
    SnippetCodigo,
)
from src.infrastructure.semillas.fullstack._texto import t


def modulo_2() -> ModuloCurso:
    return ModuloCurso(
        id="m2-spring",
        orden=2,
        titulo="Backend robusto con Spring Boot 3 y PostgreSQL",
        descripcion="Casos de uso, adaptadores REST y persistencia con Spring Data JPA, sin que Spring entre al dominio.",
        lecciones=[_l1_proyecto(), _l2_rest(), _l3_jpa()],
    )


def _l1_proyecto() -> Leccion:
    return Leccion(
        id="m2-l1-proyecto",
        orden=1,
        titulo="El proyecto Spring Boot 3: dependencias y configuración por entorno",
        resumen="Java 21, Spring Boot 3, dependencias mínimas y configuración que se lee del entorno.",
        duracion_min=12,
        contenido=t("""
            ## Arrancar bien

            Spring Boot 3 exige **Java 17 o superior** (usaremos 21, LTS) y migró de
            `javax.*` a **`jakarta.*`**: si copias un ejemplo viejo con
            `javax.persistence`, no compila.

            Dependencias que necesita este backend:

            - `spring-boot-starter-web` → adaptadores REST.
            - `spring-boot-starter-validation` → validar DTOs con `@Valid`.
            - `spring-boot-starter-data-jpa` + driver `postgresql` → persistencia.
            - `flyway-core` + `flyway-database-postgresql` → migraciones versionadas.
            - `spring-boot-starter-mail` → el adaptador de email (módulo 3).
            - `spring-boot-starter-test` y **Testcontainers** → probar contra un
              PostgreSQL real, no contra H2.

            ## Configuración: nunca secretos en el repositorio

            `application.yml` define **qué** se configura; el **valor** llega del
            entorno con `${VARIABLE:valor-por-defecto}`. En local usas los valores por
            defecto; en Render (o cualquier PaaS) defines las variables en el panel.

            ## `ddl-auto` en producción: `validate`

            Hibernate puede crear tablas solo (`ddl-auto=update`), pero en producción eso
            es una ruleta: un cambio de entidad altera la base sin control. Las tablas las
            crea **Flyway** con scripts versionados (`V1__crear_pedidos.sql`), y Hibernate
            solo **valida** que coincidan.
        """),
        pasos=[
            PasoExplicado(
                titulo="Genera el esqueleto",
                explicacion="En start.spring.io elige Maven o Gradle, Java 21 y las dependencias de arriba.",
            ),
            PasoExplicado(
                titulo="Parametriza por entorno",
                explicacion="Cada valor sensible o que cambie entre entornos va como `${VAR:defecto}`.",
            ),
            PasoExplicado(
                titulo="Primera migración",
                explicacion="Flyway ejecuta los scripts de `db/migration` en orden al arrancar, una sola vez cada uno.",
                codigo=t("""
                    -- src/main/resources/db/migration/V1__crear_pedidos.sql
                    CREATE TABLE pedidos (
                        id          UUID PRIMARY KEY,
                        estado      VARCHAR(20) NOT NULL,
                        email       VARCHAR(255) NOT NULL,
                        creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
                    );
                    CREATE TABLE lineas_pedido (
                        id          BIGSERIAL PRIMARY KEY,
                        pedido_id   UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
                        sku         VARCHAR(64) NOT NULL,
                        cantidad    INT NOT NULL CHECK (cantidad > 0),
                        precio      NUMERIC(12,2) NOT NULL CHECK (precio >= 0)
                    );
                """),
                lenguaje="sql",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m2-l1-s1",
                titulo="application.yml parametrizado",
                lenguaje="yaml",
                archivo="src/main/resources/application.yml",
                codigo=t("""
                    server:
                      port: ${PORT:8080}

                    spring:
                      datasource:
                        url: ${DATABASE_URL:jdbc:postgresql://localhost:5432/tienda}
                        username: ${DB_USER:tienda}
                        password: ${DB_PASSWORD:tienda}
                      jpa:
                        open-in-view: false
                        hibernate:
                          ddl-auto: validate
                      flyway:
                        enabled: true

                    app:
                      cors-origins: ${CORS_ORIGINS:http://localhost:5173}
                """),
                explicacion="`open-in-view: false` evita consultas perezosas escondidas en la capa web.",
            ),
        ],
        evaluacion=Evaluacion(
            id="m2-l1-quiz",
            titulo="Quiz: proyecto y configuración",
            preguntas=[
                PreguntaOpcion(
                    id="m2-l1-q1",
                    enunciado="¿Qué paquete usan las anotaciones de JPA en Spring Boot 3?",
                    opciones=["javax.persistence", "jakarta.persistence", "org.hibernate.jpa", "spring.persistence"],
                    correcta=1,
                    explicacion="Spring Boot 3 se basa en Jakarta EE 9+, que renombró `javax.*` a `jakarta.*`.",
                ),
                PreguntaOpcion(
                    id="m2-l1-q2",
                    enunciado="En producción, ¿qué valor de `spring.jpa.hibernate.ddl-auto` es el más seguro si usas Flyway?",
                    opciones=["create-drop", "update", "validate", "create"],
                    correcta=2,
                    explicacion="Flyway crea y versiona el esquema; Hibernate solo comprueba que coincide.",
                ),
                PreguntaOpcion(
                    id="m2-l1-q3",
                    enunciado="¿Qué significa `${DB_PASSWORD:tienda}` en `application.yml`?",
                    opciones=[
                        "La contraseña es literalmente «DB_PASSWORD:tienda»",
                        "Usa la variable de entorno DB_PASSWORD y, si no existe, «tienda»",
                        "Cifra la contraseña «tienda» con DB_PASSWORD",
                        "Es un error de sintaxis",
                    ],
                    correcta=1,
                    explicacion="Así el secreto real vive en el entorno (panel de Render), no en git.",
                ),
            ],
        ),
    )


def _l2_rest() -> Leccion:
    return Leccion(
        id="m2-l2-rest",
        orden=2,
        titulo="Casos de uso y adaptadores REST",
        resumen="Controladores delgados, DTOs con records y traducción de errores de dominio a HTTP.",
        duracion_min=18,
        contenido=t("""
            ## El controlador es un adaptador, no un servicio

            Un buen `@RestController` hace solo tres cosas:

            1. **Traduce la petición** HTTP a un comando o a tipos de dominio.
            2. **Llama al puerto de entrada** (el caso de uso).
            3. **Traduce el resultado** a un DTO de respuesta.

            Si ves un `if` de negocio en el controlador, está en el sitio equivocado.

            ## DTOs: el contrato con el frontend

            Nunca expongas la entidad de dominio (ni la de JPA) por HTTP: el día que
            renombres un campo interno, rompes al frontend. Los DTOs son **records** con
            validación de Bean Validation, y viven en el adaptador web.

            ## Errores de dominio → códigos HTTP, en un solo sitio

            El dominio lanza `PedidoNoEncontrado`, `PedidoVacio`, `PedidoYaConfirmado`.
            Un `@RestControllerAdvice` los traduce:

            | Excepción de dominio | HTTP |
            |---|---|
            | `PedidoNoEncontrado` | 404 Not Found |
            | `PedidoVacio` | 422 Unprocessable Entity |
            | `PedidoYaConfirmado` | 409 Conflict |
            | `MethodArgumentNotValidException` | 400 Bad Request |

            Spring 6 trae `ProblemDetail` (RFC 9457): un formato estándar de error que el
            frontend puede leer siempre igual.
        """),
        pasos=[
            PasoExplicado(
                titulo="Define los DTOs como records",
                explicacion="Entrada validada con anotaciones, salida con un método `desde(dominio)`.",
            ),
            PasoExplicado(
                titulo="Controlador delgado",
                explicacion="Recibe el caso de uso por constructor (la interfaz, no la implementación).",
            ),
            PasoExplicado(
                titulo="Traduce los errores en el advice",
                explicacion="Un `@ExceptionHandler` por familia de errores; el controlador no lleva `try/catch`.",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m2-l2-s1",
                titulo="Controlador y DTOs",
                lenguaje="java",
                archivo="infrastructure/web/PedidoController.java",
                codigo=t("""
                    @RestController
                    @RequestMapping("/api/pedidos")
                    class PedidoController {
                        private final ConfirmarPedidoUseCase confirmar;
                        private final CrearPedidoUseCase crear;

                        PedidoController(ConfirmarPedidoUseCase confirmar, CrearPedidoUseCase crear) {
                            this.confirmar = confirmar;
                            this.crear = crear;
                        }

                        @PostMapping
                        ResponseEntity<PedidoResponse> crear(@Valid @RequestBody CrearPedidoRequest req) {
                            Pedido pedido = crear.crear(req.email(), req.lineas().stream().map(LineaRequest::aDominio).toList());
                            return ResponseEntity.status(HttpStatus.CREATED).body(PedidoResponse.desde(pedido));
                        }

                        @PostMapping("/{id}/confirmar")
                        PedidoResponse confirmar(@PathVariable UUID id) {
                            return PedidoResponse.desde(confirmar.confirmar(new PedidoId(id)));
                        }
                    }

                    record CrearPedidoRequest(@Email @NotBlank String email,
                                              @NotEmpty List<@Valid LineaRequest> lineas) {}

                    record LineaRequest(@NotBlank String sku, @Positive int cantidad) {
                        LineaPedidoNueva aDominio() { return new LineaPedidoNueva(sku, cantidad); }
                    }

                    record PedidoResponse(UUID id, String estado, BigDecimal total) {
                        static PedidoResponse desde(Pedido p) {
                            return new PedidoResponse(p.id().valor(), p.estado().name(), p.total().monto());
                        }
                    }
                """),
                explicacion="Fíjate: el request NO trae precio. El precio lo pone el servidor leyendo su catálogo.",
            ),
            SnippetCodigo(
                id="m2-l2-s2",
                titulo="Traducción de errores con ProblemDetail",
                lenguaje="java",
                archivo="infrastructure/web/ErroresHttp.java",
                codigo=t("""
                    @RestControllerAdvice
                    class ErroresHttp {
                        @ExceptionHandler(PedidoNoEncontrado.class)
                        ProblemDetail noEncontrado(PedidoNoEncontrado e) {
                            return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
                        }

                        @ExceptionHandler(PedidoVacio.class)
                        ProblemDetail vacio(PedidoVacio e) {
                            return ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
                        }

                        @ExceptionHandler(PedidoYaConfirmado.class)
                        ProblemDetail yaConfirmado(PedidoYaConfirmado e) {
                            return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
                        }
                    }
                """),
            ),
        ],
        evaluacion=Evaluacion(
            id="m2-l2-quiz",
            titulo="Quiz y reto: adaptadores REST",
            preguntas=[
                PreguntaOpcion(
                    id="m2-l2-q1",
                    enunciado="¿Por qué no se devuelve la entidad de dominio directamente en el controlador?",
                    opciones=[
                        "Porque Jackson no sabe serializar clases de dominio",
                        "Porque acopla el contrato HTTP a la estructura interna del dominio",
                        "Porque Spring lo prohíbe",
                        "Porque las entidades son más lentas",
                    ],
                    correcta=1,
                    explicacion="El DTO es el contrato público; el dominio debe poder cambiar sin romper al frontend.",
                ),
                PreguntaOpcion(
                    id="m2-l2-q2",
                    enunciado="Confirmar un pedido que ya estaba confirmado debería responder…",
                    opciones=["200 OK", "404 Not Found", "409 Conflict", "500 Internal Server Error"],
                    correcta=2,
                    explicacion="El recurso existe pero su estado actual impide la operación: conflicto.",
                ),
                PreguntaOpcion(
                    id="m2-l2-q3",
                    enunciado="¿De qué depende el `PedidoController`?",
                    opciones=[
                        "De `ConfirmarPedidoService` (la clase concreta)",
                        "De `PedidoJpaRepository`",
                        "De la interfaz `ConfirmarPedidoUseCase`",
                        "De `JavaMailSender`",
                    ],
                    correcta=2,
                    explicacion="El adaptador de entrada conoce el puerto, no su implementación.",
                ),
            ],
            retos=[
                RetoCodigo(
                    id="m2-l2-reto",
                    enunciado=t("""
                        Escribe el endpoint `GET /api/pedidos/{id}` en el `PedidoController`.

                        - Usa un puerto de entrada `ConsultarPedidoUseCase` con el método
                          `Optional<Pedido> consultar(PedidoId id)`.
                        - Si el pedido existe, responde **200** con un `PedidoResponse`.
                        - Si no existe, responde **404** (lanzando `PedidoNoEncontrado` para que lo
                          traduzca el advice, o devolviendo `ResponseEntity.notFound()`).
                        - El controlador no debe tocar ningún repositorio JPA.
                    """),
                    lenguaje="java",
                    codigo_inicial=t("""
                        @GetMapping("/{id}")
                        ResponseEntity<PedidoResponse> consultar(@PathVariable UUID id) {
                            // tu código aquí
                        }
                    """),
                    criterios=[
                        "Define un método mapeado a GET /{id}",
                        "Llama a ConsultarPedidoUseCase para obtener el pedido",
                        "Devuelve 200 con PedidoResponse cuando el pedido existe",
                        "Devuelve 404 (o lanza PedidoNoEncontrado) cuando no existe",
                        "No usa un repositorio JPA directamente",
                    ],
                    pista="`Optional.map(...)` + `orElseThrow(...)` o `orElse(ResponseEntity.notFound().build())`.",
                    solucion_referencia=t("""
                        @GetMapping("/{id}")
                        ResponseEntity<PedidoResponse> consultar(@PathVariable UUID id) {
                            PedidoId pedidoId = new PedidoId(id);
                            return consultar.consultar(pedidoId)
                                    .map(PedidoResponse::desde)
                                    .map(ResponseEntity::ok)
                                    .orElseThrow(() -> new PedidoNoEncontrado(pedidoId));
                        }
                    """),
                ),
            ],
        ),
    )


def _l3_jpa() -> Leccion:
    return Leccion(
        id="m2-l3-jpa",
        orden=3,
        titulo="Persistencia con Spring Data JPA y PostgreSQL",
        resumen="Entidades JPA separadas del dominio, mappers y un adaptador que implementa los puertos.",
        duracion_min=20,
        contenido=t("""
            ## Dos modelos, a propósito

            En hexagonal hay **dos clases** para un pedido:

            - `Pedido` (dominio): reglas e invariantes, Java puro.
            - `PedidoJpaEntity` (infraestructura): anotaciones `@Entity`, `@Table`,
              constructor vacío que JPA exige, relaciones `@OneToMany`.

            Parece duplicación, pero cada una cambia por motivos distintos: el dominio
            cambia cuando cambia el negocio; la entidad JPA, cuando cambia la base. Un
            **mapper** traduce entre las dos.

            ## El adaptador de persistencia

            `PedidoPersistenceAdapter` implementa `CargarPedidoPort` y
            `GuardarPedidoPort`. Por dentro usa un `JpaRepository` de Spring Data, que
            **nunca sale del adaptador**.

            ## Transacciones

            La transacción envuelve **el caso de uso completo**, no cada llamada al
            repositorio: cargar, confirmar y guardar deben ser todo o nada. Como el caso
            de uso es Java puro, la transacción se aplica en la infraestructura: o con
            `@Transactional` en un *bean* decorador, o con `TransactionTemplate`.

            ## Probar contra PostgreSQL de verdad

            H2 en memoria «casi» se comporta como PostgreSQL… hasta que usas `UUID`,
            `JSONB` o un `CHECK`. **Testcontainers** levanta un PostgreSQL real en Docker
            para cada suite de tests del adaptador.
        """),
        pasos=[
            PasoExplicado(
                titulo="Entidad JPA",
                explicacion="Refleja la tabla creada por Flyway. Constructor protegido vacío para JPA.",
            ),
            PasoExplicado(
                titulo="Mapper",
                explicacion="Dos métodos estáticos: `aDominio(entity)` y `aEntidad(pedido)`. Sin lógica de negocio.",
            ),
            PasoExplicado(
                titulo="Adaptador que implementa los puertos",
                explicacion="El caso de uso recibe el adaptador como `CargarPedidoPort` y `GuardarPedidoPort`: no sabe que hay JPA.",
            ),
            PasoExplicado(
                titulo="Transacción en el borde",
                explicacion="Envuelve el caso de uso en la configuración, sin anotar el núcleo.",
                codigo=t("""
                    @Bean
                    ConfirmarPedidoUseCase confirmarPedido(PedidoPersistenceAdapter p,
                                                           NotificarClientePort n,
                                                           PlatformTransactionManager tm) {
                        var real = new ConfirmarPedidoService(p, p, n);
                        var tx = new TransactionTemplate(tm);
                        return id -> tx.execute(status -> real.confirmar(id));
                    }
                """),
                lenguaje="java",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m2-l3-s1",
                titulo="Entidad JPA",
                lenguaje="java",
                archivo="infrastructure/persistence/PedidoJpaEntity.java",
                codigo=t("""
                    @Entity
                    @Table(name = "pedidos")
                    class PedidoJpaEntity {
                        @Id
                        private UUID id;

                        @Column(nullable = false, length = 20)
                        private String estado;

                        @Column(nullable = false)
                        private String email;

                        @OneToMany(mappedBy = "pedido", cascade = CascadeType.ALL, orphanRemoval = true)
                        private List<LineaPedidoJpaEntity> lineas = new ArrayList<>();

                        protected PedidoJpaEntity() {}   // lo exige JPA
                        // getters/setters de infraestructura
                    }

                    interface PedidoJpaRepository extends JpaRepository<PedidoJpaEntity, UUID> {}
                """),
            ),
            SnippetCodigo(
                id="m2-l3-s2",
                titulo="Adaptador de persistencia",
                lenguaje="java",
                archivo="infrastructure/persistence/PedidoPersistenceAdapter.java",
                codigo=t("""
                    @Component
                    class PedidoPersistenceAdapter implements CargarPedidoPort, GuardarPedidoPort {
                        private final PedidoJpaRepository repo;

                        PedidoPersistenceAdapter(PedidoJpaRepository repo) { this.repo = repo; }

                        @Override
                        public Optional<Pedido> cargar(PedidoId id) {
                            return repo.findById(id.valor()).map(PedidoMapper::aDominio);
                        }

                        @Override
                        public void guardar(Pedido pedido) {
                            repo.save(PedidoMapper.aEntidad(pedido));
                        }
                    }
                """),
                explicacion="El `JpaRepository` es un detalle privado del adaptador: nadie fuera de este paquete lo ve.",
            ),
            SnippetCodigo(
                id="m2-l3-s3",
                titulo="Test del adaptador con Testcontainers",
                lenguaje="java",
                archivo="test/infrastructure/PedidoPersistenceAdapterTest.java",
                codigo=t("""
                    @DataJpaTest
                    @AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
                    @Testcontainers
                    @Import(PedidoPersistenceAdapter.class)
                    class PedidoPersistenceAdapterTest {
                        @Container
                        @ServiceConnection
                        static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16-alpine");

                        @Autowired PedidoPersistenceAdapter adapter;

                        @Test
                        void guarda_y_recupera_un_pedido() {
                            Pedido p = PedidoDePrueba.conUnaLinea();
                            adapter.guardar(p);
                            assertThat(adapter.cargar(p.id())).isPresent();
                        }
                    }
                """),
                explicacion="`@ServiceConnection` (Spring Boot 3.1+) conecta el datasource al contenedor sin configurar URLs.",
            ),
        ],
        evaluacion=Evaluacion(
            id="m2-l3-quiz",
            titulo="Quiz: persistencia",
            preguntas=[
                PreguntaOpcion(
                    id="m2-l3-q1",
                    enunciado="¿Por qué se separa `PedidoJpaEntity` de `Pedido`?",
                    opciones=[
                        "Porque JPA no admite clases con métodos",
                        "Porque cambian por motivos distintos: la base de datos y el negocio",
                        "Para que el código sea más largo",
                        "Porque Spring Data solo funciona con clases sin lógica",
                    ],
                    correcta=1,
                    explicacion="Separarlas evita que una decisión de mapeo (un `@OneToMany`, un constructor vacío) contamine el dominio.",
                ),
                PreguntaOpcion(
                    id="m2-l3-q2",
                    enunciado="¿Qué tipo devuelve el `JpaRepository` fuera del adaptador?",
                    opciones=[
                        "`PedidoJpaEntity`",
                        "Ninguno: el `JpaRepository` no sale del adaptador",
                        "`ResponseEntity`",
                        "`Pedido` directamente, Spring lo convierte solo",
                    ],
                    correcta=1,
                    explicacion="Fuera del adaptador solo circulan objetos de dominio, a través de los puertos.",
                ),
                PreguntaOpcion(
                    id="m2-l3-q3",
                    enunciado="¿Qué abarca la transacción al confirmar un pedido?",
                    opciones=[
                        "Solo el `save` del repositorio",
                        "Cada consulta por separado",
                        "El caso de uso completo: cargar, confirmar y guardar",
                        "Nada: PostgreSQL ya es transaccional por sí mismo",
                    ],
                    correcta=2,
                    explicacion="La unidad de trabajo es el caso de uso: o se confirma todo o nada.",
                ),
            ],
        ),
    )
