"""Módulo 1 — Fundamentos de Arquitectura Hexagonal en Java."""

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


def modulo_1() -> ModuloCurso:
    return ModuloCurso(
        id="m1-hexagonal",
        orden=1,
        titulo="Fundamentos de Arquitectura Hexagonal en Java",
        descripcion=(
            "Puertos, adaptadores, dominio, aplicación e infraestructura: qué es cada "
            "pieza, por qué existe y en qué dirección apuntan las dependencias."
        ),
        lecciones=[_l1_problema(), _l2_dominio(), _l3_puertos()],
    )


def _l1_problema() -> Leccion:
    return Leccion(
        id="m1-l1-problema",
        orden=1,
        titulo="El problema que resuelve: el acoplamiento",
        resumen="Por qué un servicio que conoce JPA, SMTP y HTTP a la vez se vuelve imposible de cambiar.",
        duracion_min=12,
        contenido=t("""
            ## Un servicio que sabe demasiado

            Casi todos los proyectos Spring empiezan igual: un `@Service` que recibe un
            `JpaRepository`, arma un correo con `JavaMailSender` y devuelve una
            `ResponseEntity`. Funciona el primer mes. El problema llega cuando hay que
            **cambiar algo**:

            - Pasar de PostgreSQL a otra base obliga a tocar la lógica de negocio.
            - Probar una regla («no se puede confirmar un pedido vacío») exige levantar
              una base de datos o llenar el test de mocks de JPA.
            - Una regla de negocio termina duplicada en el controlador, en el servicio y
              en un `@PrePersist`.

            La causa es siempre la misma: **la lógica de negocio depende de los detalles
            técnicos**. La arquitectura hexagonal (Alistair Cockburn la llamó *Ports &
            Adapters*) invierte esa relación.

            ## La idea en una frase

            > El núcleo de la aplicación no conoce el mundo exterior; el mundo exterior se
            > enchufa al núcleo a través de **puertos** que el núcleo define.

            Imagina el núcleo como un hexágono. Cada lado es un **puerto**: una interfaz
            Java escrita *en el idioma del negocio* (`GuardarPedidoPort`,
            `NotificarClientePort`). Fuera del hexágono viven los **adaptadores**: el
            controlador REST, el repositorio JPA, el cliente SMTP. Los adaptadores
            implementan o llaman a los puertos, nunca al revés.

            ## Las tres capas

            | Capa | Qué contiene | De qué puede depender |
            |---|---|---|
            | **Dominio** | Entidades, value objects, reglas | De nada (Java puro) |
            | **Aplicación** | Casos de uso, puertos | Solo del dominio |
            | **Infraestructura** | Spring, JPA, REST, SMTP, S3 | De todo lo anterior |

            La regla que no se negocia: **las dependencias apuntan hacia dentro**. Si un
            `import org.springframework` aparece en tu dominio, la frontera está rota.
        """),
        pasos=[
            PasoExplicado(
                titulo="Detecta el acoplamiento",
                explicacion="Mira el servicio de abajo: mezcla regla de negocio, persistencia JPA y envío de correo en el mismo método.",
            ),
            PasoExplicado(
                titulo="Nombra las responsabilidades",
                explicacion=(
                    "Hay una regla (no confirmar pedidos vacíos), una necesidad de guardar y una de avisar. "
                    "Solo la primera es *negocio*; las otras dos son **capacidades** que el negocio necesita."
                ),
            ),
            PasoExplicado(
                titulo="Convierte cada capacidad en un puerto",
                explicacion="«Guardar» y «avisar» se vuelven interfaces del núcleo. Quién las cumple (JPA, SMTP) se decide fuera.",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m1-l1-s1",
                titulo="Antes: un servicio acoplado",
                lenguaje="java",
                archivo="PedidoService.java",
                codigo=t("""
                    @Service
                    public class PedidoService {
                        private final PedidoJpaRepository repo;   // detalle: JPA
                        private final JavaMailSender mail;        // detalle: SMTP

                        public PedidoService(PedidoJpaRepository repo, JavaMailSender mail) {
                            this.repo = repo;
                            this.mail = mail;
                        }

                        @Transactional
                        public ResponseEntity<PedidoEntity> confirmar(Long id) {   // detalle: HTTP
                            PedidoEntity p = repo.findById(id).orElseThrow();
                            if (p.getLineas().isEmpty()) {
                                return ResponseEntity.badRequest().build();
                            }
                            p.setEstado("CONFIRMADO");
                            repo.save(p);
                            SimpleMailMessage msg = new SimpleMailMessage();
                            msg.setTo(p.getEmailCliente());
                            msg.setText("Tu pedido " + id + " está confirmado");
                            mail.send(msg);
                            return ResponseEntity.ok(p);
                        }
                    }
                """),
                explicacion="La regla «un pedido vacío no se confirma» está enterrada entre JPA, SMTP y HTTP: no se puede probar sin todo eso.",
            ),
            SnippetCodigo(
                id="m1-l1-s2",
                titulo="Después: el caso de uso solo habla con puertos",
                lenguaje="java",
                archivo="application/ConfirmarPedidoService.java",
                codigo=t("""
                    public class ConfirmarPedidoService implements ConfirmarPedidoUseCase {
                        private final CargarPedidoPort cargar;
                        private final GuardarPedidoPort guardar;
                        private final NotificarClientePort notificar;

                        public ConfirmarPedidoService(CargarPedidoPort cargar,
                                                      GuardarPedidoPort guardar,
                                                      NotificarClientePort notificar) {
                            this.cargar = cargar;
                            this.guardar = guardar;
                            this.notificar = notificar;
                        }

                        @Override
                        public Pedido confirmar(PedidoId id) {
                            Pedido pedido = cargar.cargar(id)
                                    .orElseThrow(() -> new PedidoNoEncontrado(id));
                            pedido.confirmar();          // la regla vive en el dominio
                            guardar.guardar(pedido);
                            notificar.pedidoConfirmado(pedido);
                            return pedido;
                        }
                    }
                """),
                explicacion="Ni una anotación de Spring, ni JPA, ni HTTP. Se prueba con tres implementaciones en memoria.",
            ),
        ],
        evaluacion=Evaluacion(
            id="m1-l1-quiz",
            titulo="Quiz: el problema del acoplamiento",
            preguntas=[
                PreguntaOpcion(
                    id="m1-l1-q1",
                    enunciado="En arquitectura hexagonal, ¿hacia dónde apuntan las dependencias?",
                    opciones=[
                        "Del dominio hacia la infraestructura",
                        "Hacia dentro: la infraestructura depende de la aplicación y del dominio",
                        "En ambas direcciones, siempre que haya interfaces",
                        "Da igual mientras se use inyección de dependencias",
                    ],
                    correcta=1,
                    explicacion="El núcleo no conoce los detalles. Los adaptadores (fuera) dependen de los puertos (dentro).",
                ),
                PreguntaOpcion(
                    id="m1-l1-q2",
                    enunciado="¿Cuál de estas señales indica que la frontera del dominio está rota?",
                    opciones=[
                        "La entidad `Pedido` tiene un método `confirmar()`",
                        "Un caso de uso recibe un puerto por constructor",
                        "La entidad de dominio importa `jakarta.persistence.Entity`",
                        "El controlador REST llama a un caso de uso",
                    ],
                    correcta=2,
                    explicacion="Una anotación de JPA en el dominio ata las reglas de negocio a un detalle de persistencia.",
                ),
                PreguntaOpcion(
                    id="m1-l1-q3",
                    enunciado="¿Qué es un *puerto*?",
                    opciones=[
                        "Un número de red donde escucha el servidor",
                        "Una interfaz definida por el núcleo, en el idioma del negocio",
                        "Una clase de Spring anotada con `@Component`",
                        "Un DTO que viaja por HTTP",
                    ],
                    correcta=1,
                    explicacion="El núcleo declara lo que necesita (o lo que ofrece) como interfaz; los adaptadores la cumplen.",
                ),
            ],
        ),
    )


def _l2_dominio() -> Leccion:
    return Leccion(
        id="m1-l2-dominio",
        orden=2,
        titulo="El dominio: entidades, value objects y reglas puras",
        resumen="Modelar el negocio en Java sin frameworks: invariantes, records e identidad.",
        duracion_min=15,
        contenido=t("""
            ## El corazón del hexágono

            El dominio es **Java puro**. Nada de Spring, JPA, Jackson ni Lombok con
            magia: si mañana cambias de framework, esta carpeta no se entera.

            Contiene tres tipos de piezas:

            1. **Entidades**: tienen identidad que dura en el tiempo (`Pedido` con su
               `PedidoId`). Dos pedidos con los mismos datos siguen siendo dos pedidos.
            2. **Value objects**: se definen por su valor (`Dinero`, `Email`). Son
               inmutables; en Java 17+ un `record` es perfecto para eso.
            3. **Reglas / invariantes**: lo que *siempre* debe ser cierto. «Un pedido
               confirmado no admite líneas nuevas». «El total nunca es negativo».

            ## Invariantes dentro, no alrededor

            Un error clásico es el **modelo anémico**: la entidad es una bolsa de
            getters y setters y las reglas viven en servicios. Así cualquiera puede
            hacer `pedido.setEstado("CONFIRMADO")` sin validar nada.

            En un dominio rico, la entidad **protege sus invariantes**: no hay setter de
            estado, hay un método `confirmar()` que valida y cambia el estado, o lanza
            una excepción de dominio.

            ## Excepciones de dominio

            Las reglas rotas se expresan con excepciones propias (`PedidoVacio`,
            `PedidoYaConfirmado`). Son parte del lenguaje del negocio; más adelante la
            infraestructura las traducirá a códigos HTTP (409, 422…), pero el dominio no
            sabe qué es HTTP.
        """),
        pasos=[
            PasoExplicado(
                titulo="Value object con validación en el constructor",
                explicacion="Un `record` compacto valida al construirse: es imposible tener un `Dinero` negativo.",
                codigo=t("""
                    public record Dinero(BigDecimal monto) {
                        public Dinero {
                            Objects.requireNonNull(monto);
                            if (monto.signum() < 0) throw new IllegalArgumentException("Monto negativo");
                        }
                        public Dinero sumar(Dinero otro) { return new Dinero(monto.add(otro.monto)); }
                    }
                """),
                lenguaje="java",
            ),
            PasoExplicado(
                titulo="Entidad que protege su estado",
                explicacion="No hay `setEstado`. La transición válida es un método con nombre de negocio.",
            ),
            PasoExplicado(
                titulo="Prueba unitaria sin frameworks",
                explicacion="Como el dominio es Java puro, el test es instantáneo: sin contexto de Spring ni base de datos.",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m1-l2-s1",
                titulo="Entidad rica: Pedido",
                lenguaje="java",
                archivo="domain/Pedido.java",
                codigo=t("""
                    public class Pedido {
                        private final PedidoId id;
                        private final List<LineaPedido> lineas = new ArrayList<>();
                        private EstadoPedido estado = EstadoPedido.BORRADOR;

                        public Pedido(PedidoId id) { this.id = Objects.requireNonNull(id); }

                        public void agregar(LineaPedido linea) {
                            if (estado != EstadoPedido.BORRADOR) throw new PedidoYaConfirmado(id);
                            lineas.add(linea);
                        }

                        public void confirmar() {
                            if (lineas.isEmpty()) throw new PedidoVacio(id);
                            if (estado == EstadoPedido.CONFIRMADO) throw new PedidoYaConfirmado(id);
                            estado = EstadoPedido.CONFIRMADO;
                        }

                        public Dinero total() {
                            return lineas.stream().map(LineaPedido::subtotal)
                                    .reduce(new Dinero(BigDecimal.ZERO), Dinero::sumar);
                        }

                        public PedidoId id() { return id; }
                        public EstadoPedido estado() { return estado; }
                        public List<LineaPedido> lineas() { return List.copyOf(lineas); }
                    }
                """),
                explicacion="`lineas()` devuelve una copia inmutable: nadie puede saltarse `agregar()` desde fuera.",
            ),
            SnippetCodigo(
                id="m1-l2-s2",
                titulo="Test del dominio en milisegundos",
                lenguaje="java",
                archivo="test/domain/PedidoTest.java",
                codigo=t("""
                    class PedidoTest {
                        @Test
                        void no_se_confirma_un_pedido_vacio() {
                            Pedido pedido = new Pedido(PedidoId.nuevo());
                            assertThrows(PedidoVacio.class, pedido::confirmar);
                        }

                        @Test
                        void confirmado_no_admite_lineas() {
                            Pedido pedido = new Pedido(PedidoId.nuevo());
                            pedido.agregar(new LineaPedido("SKU-1", 2, new Dinero(new BigDecimal("10.00"))));
                            pedido.confirmar();
                            assertThrows(PedidoYaConfirmado.class,
                                () -> pedido.agregar(new LineaPedido("SKU-2", 1, new Dinero(BigDecimal.ONE))));
                        }
                    }
                """),
            ),
        ],
        evaluacion=Evaluacion(
            id="m1-l2-quiz",
            titulo="Quiz: el dominio",
            preguntas=[
                PreguntaOpcion(
                    id="m1-l2-q1",
                    enunciado="¿Qué distingue a una entidad de un value object?",
                    opciones=[
                        "La entidad tiene identidad propia; el value object se define por su valor",
                        "El value object se guarda en base de datos y la entidad no",
                        "La entidad es inmutable y el value object no",
                        "No hay diferencia: son sinónimos",
                    ],
                    correcta=0,
                    explicacion="Dos `Dinero(10)` son iguales; dos pedidos con los mismos datos siguen siendo distintos por su id.",
                ),
                PreguntaOpcion(
                    id="m1-l2-q2",
                    enunciado="¿Qué es un modelo anémico?",
                    opciones=[
                        "Un modelo con demasiadas reglas de negocio",
                        "Entidades que solo tienen getters/setters y dejan las reglas fuera, en servicios",
                        "Un modelo sin base de datos",
                        "Un dominio escrito con records",
                    ],
                    correcta=1,
                    explicacion="Sin comportamiento, cualquiera puede dejar la entidad en un estado inválido.",
                ),
                PreguntaOpcion(
                    id="m1-l2-q3",
                    enunciado="Un pedido vacío intenta confirmarse. ¿Qué debe hacer el dominio?",
                    opciones=[
                        "Devolver `ResponseEntity.badRequest()`",
                        "Registrar un log y continuar",
                        "Lanzar una excepción de dominio como `PedidoVacio`",
                        "Guardar el pedido con estado `ERROR`",
                    ],
                    correcta=2,
                    explicacion="El dominio expresa la regla rota en su idioma; traducirla a HTTP es trabajo de la infraestructura.",
                ),
            ],
        ),
    )


def _l3_puertos() -> Leccion:
    return Leccion(
        id="m1-l3-puertos",
        orden=3,
        titulo="Puertos y adaptadores: de entrada y de salida",
        resumen="Puertos de entrada (casos de uso) y de salida (lo que el núcleo necesita), y quién implementa cada uno.",
        duracion_min=18,
        contenido=t("""
            ## Dos clases de puertos

            **Puertos de entrada (driving / primarios)**: lo que la aplicación *ofrece*.
            Son los casos de uso: `ConfirmarPedidoUseCase`, `RegistrarClienteUseCase`.
            Los **llaman** los adaptadores de entrada: un controlador REST, un consumidor
            de colas, un comando de consola, un test.

            **Puertos de salida (driven / secundarios)**: lo que la aplicación
            *necesita* del exterior: `CargarPedidoPort`, `GuardarPedidoPort`,
            `NotificarClientePort`. Los **implementan** los adaptadores de salida: JPA,
            SMTP, S3, un cliente HTTP.

            ```
            [REST Controller] ──llama──▶ (ConfirmarPedidoUseCase) ──usa──▶ (GuardarPedidoPort) ◀──implementa── [JPA Adapter]
                adaptador de entrada        puerto de entrada                puerto de salida              adaptador de salida
            ```

            ## Cómo nombrarlos

            - El puerto habla el idioma del **negocio**, no el de la tecnología:
              `GuardarPedidoPort.guardar(Pedido)`, no `PedidoDao.insertRow(...)`.
            - Puertos pequeños y enfocados (*Interface Segregation*): mejor
              `CargarPedidoPort` + `GuardarPedidoPort` que un `PedidoRepository` con
              veinte métodos que cada caso de uso usa a medias.

            ## ¿Y Spring?

            El ensamblaje (qué adaptador cumple qué puerto) se hace en la
            infraestructura, en una clase `@Configuration`. Así los casos de uso ni
            siquiera necesitan `@Service`: Spring los construye, pero ellos no lo saben.
        """),
        pasos=[
            PasoExplicado(
                titulo="Declara el puerto de entrada",
                explicacion="Una interfaz con el verbo del negocio. Es lo que el controlador conocerá.",
            ),
            PasoExplicado(
                titulo="Declara los puertos de salida",
                explicacion="Uno por capacidad. Devuelven y reciben objetos de DOMINIO, nunca entidades JPA.",
            ),
            PasoExplicado(
                titulo="Ensambla en la infraestructura",
                explicacion="Una `@Configuration` crea el caso de uso inyectándole los adaptadores concretos.",
                codigo=t("""
                    @Configuration
                    class PedidosConfig {
                        @Bean
                        ConfirmarPedidoUseCase confirmarPedido(PedidoPersistenceAdapter persistencia,
                                                               EmailNotificacionAdapter email) {
                            return new ConfirmarPedidoService(persistencia, persistencia, email);
                        }
                    }
                """),
                lenguaje="java",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m1-l3-s1",
                titulo="Puertos de entrada y de salida",
                lenguaje="java",
                archivo="application/port/",
                codigo=t("""
                    // Puerto de ENTRADA: lo que la aplicación ofrece
                    public interface ConfirmarPedidoUseCase {
                        Pedido confirmar(PedidoId id);
                    }

                    // Puertos de SALIDA: lo que la aplicación necesita
                    public interface CargarPedidoPort {
                        Optional<Pedido> cargar(PedidoId id);
                    }

                    public interface GuardarPedidoPort {
                        void guardar(Pedido pedido);
                    }

                    public interface NotificarClientePort {
                        void pedidoConfirmado(Pedido pedido);
                    }
                """),
            ),
            SnippetCodigo(
                id="m1-l3-s2",
                titulo="Estructura de paquetes resultante",
                lenguaje="text",
                codigo=t("""
                    com.tienda.pedidos
                    ├── domain/                 ← Java puro
                    │   ├── Pedido.java
                    │   ├── Dinero.java
                    │   └── PedidoVacio.java
                    ├── application/
                    │   ├── port/in/ConfirmarPedidoUseCase.java
                    │   ├── port/out/GuardarPedidoPort.java
                    │   └── ConfirmarPedidoService.java
                    └── infrastructure/         ← Spring vive aquí
                        ├── web/PedidoController.java
                        ├── persistence/PedidoPersistenceAdapter.java
                        ├── notification/EmailNotificacionAdapter.java
                        └── config/PedidosConfig.java
                """),
            ),
        ],
        evaluacion=Evaluacion(
            id="m1-l3-quiz",
            titulo="Quiz y reto: puertos",
            preguntas=[
                PreguntaOpcion(
                    id="m1-l3-q1",
                    enunciado="Un controlador REST que invoca `ConfirmarPedidoUseCase` es un…",
                    opciones=[
                        "Adaptador de salida",
                        "Puerto de entrada",
                        "Adaptador de entrada",
                        "Value object",
                    ],
                    correcta=2,
                    explicacion="Conduce la aplicación desde fuera llamando al puerto de entrada.",
                ),
                PreguntaOpcion(
                    id="m1-l3-q2",
                    enunciado="¿Qué debería devolver `CargarPedidoPort.cargar(id)`?",
                    opciones=[
                        "Un `Optional<PedidoEntity>` de JPA",
                        "Un `Optional<Pedido>` del dominio",
                        "Un `ResponseEntity<Pedido>`",
                        "Un `Map<String, Object>` con las columnas",
                    ],
                    correcta=1,
                    explicacion="Los puertos hablan en objetos de dominio; mapear desde JPA es trabajo del adaptador.",
                ),
                PreguntaOpcion(
                    id="m1-l3-q3",
                    enunciado="¿Dónde se decide qué adaptador concreto cumple cada puerto?",
                    opciones=[
                        "En la entidad de dominio",
                        "En el caso de uso, con `new JpaAdapter()`",
                        "En la infraestructura (p. ej. una clase `@Configuration`)",
                        "En el `application.yml` con el nombre de la clase",
                    ],
                    correcta=2,
                    explicacion="El ensamblaje es un detalle técnico: vive fuera del núcleo.",
                ),
            ],
            retos=[
                RetoCodigo(
                    id="m1-l3-reto",
                    enunciado=t("""
                        Diseña el **puerto de salida** para guardar archivos adjuntos de un pedido.

                        Escribe una interfaz Java `AlmacenarAdjuntoPort` que:
                        - reciba el id del pedido, el nombre del archivo y su contenido,
                        - devuelva una referencia de dominio (`AdjuntoRef`, un record con la clave del archivo),
                        - **no** mencione ninguna tecnología concreta (ni S3, ni `java.io.File`, ni Spring).
                    """),
                    lenguaje="java",
                    codigo_inicial=t("""
                        public record AdjuntoRef(String clave) {}

                        public interface AlmacenarAdjuntoPort {
                            // tu método aquí
                        }
                    """),
                    criterios=[
                        "Declara una interfaz llamada AlmacenarAdjuntoPort",
                        "Tiene un método que recibe el id del pedido, el nombre y el contenido del archivo",
                        "El método devuelve AdjuntoRef",
                        "No usa tipos de S3, java.io.File ni anotaciones de Spring",
                    ],
                    pista="El contenido puede ser un `byte[]` o un `InputStream`: los dos son Java estándar.",
                    solucion_referencia=t("""
                        public interface AlmacenarAdjuntoPort {
                            AdjuntoRef almacenar(PedidoId pedido, String nombreArchivo, byte[] contenido);
                        }
                    """),
                ),
            ],
        ),
    )
