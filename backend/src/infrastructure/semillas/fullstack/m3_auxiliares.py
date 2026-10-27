"""Módulo 3 — Servicios auxiliares: archivos y notificaciones."""

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


def modulo_3() -> ModuloCurso:
    return ModuloCurso(
        id="m3-auxiliares",
        orden=3,
        titulo="Servicios Auxiliares: archivos y notificaciones",
        descripcion="Puertos para almacenamiento local o S3 y para envío de emails, intercambiables por configuración.",
        lecciones=[_l1_storage(), _l2_email()],
    )


def _l1_storage() -> Leccion:
    return Leccion(
        id="m3-l1-storage",
        orden=1,
        titulo="Puerto de almacenamiento: disco local y Amazon S3",
        resumen="Un mismo puerto, dos adaptadores, y Spring elige cuál según la configuración.",
        duracion_min=16,
        contenido=t("""
            ## Aquí es donde hexagonal se paga sola

            Guardar archivos es el ejemplo perfecto de **adaptador intercambiable**:

            - En local quieres guardarlos en una carpeta (`./uploads`), sin cuentas.
            - En producción, en un *bucket* de S3 (o compatible: MinIO, Cloudflare R2).
            - En los tests, en memoria.

            El caso de uso **no cambia** en ninguno de los tres casos: depende de
            `AlmacenamientoPort`. Lo que cambia es qué adaptador se registra.

            ## El puerto

            Tres operaciones expresadas en términos del dominio: guardar contenido bajo
            una clave, recuperarlo y generar una URL de descarga temporal. Nada de
            `S3Client`, `Path` ni `MultipartFile`: esos tipos son de los adaptadores.

            ## Elegir el adaptador por configuración

            `@ConditionalOnProperty(name = "app.storage", havingValue = "s3")` registra
            el adaptador de S3 solo cuando `APP_STORAGE=s3`. El local es el valor por
            defecto (`matchIfMissing = true`).

            ## Seguridad que no es opcional

            - **Nunca** uses el nombre que manda el usuario como ruta: `../../etc/passwd`
              es un nombre válido. Genera la clave tú (`UUID` + extensión validada).
            - Limita el tamaño (`spring.servlet.multipart.max-file-size`) y valida el tipo.
            - En S3, el bucket es **privado**; se descarga con URL prefirmada que caduca.
        """),
        pasos=[
            PasoExplicado(
                titulo="Define el puerto en la aplicación",
                explicacion="`guardar`, `leer` y `urlTemporal`, con tipos de Java estándar.",
            ),
            PasoExplicado(
                titulo="Adaptador local",
                explicacion="Escribe bajo una carpeta raíz y comprueba que la ruta final no se sale de ella.",
            ),
            PasoExplicado(
                titulo="Adaptador S3",
                explicacion="AWS SDK v2: `PutObjectRequest` para subir y `S3Presigner` para la URL temporal.",
            ),
            PasoExplicado(
                titulo="Activa uno u otro por propiedad",
                explicacion="`APP_STORAGE=local` en tu máquina, `APP_STORAGE=s3` en Render.",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m3-l1-s1",
                titulo="Puerto de almacenamiento",
                lenguaje="java",
                archivo="application/port/out/AlmacenamientoPort.java",
                codigo=t("""
                    public interface AlmacenamientoPort {
                        void guardar(String clave, byte[] contenido, String tipoMime);
                        Optional<byte[]> leer(String clave);
                        URI urlTemporal(String clave, Duration vigencia);
                    }
                """),
            ),
            SnippetCodigo(
                id="m3-l1-s2",
                titulo="Adaptador local (por defecto)",
                lenguaje="java",
                archivo="infrastructure/storage/LocalAlmacenamientoAdapter.java",
                codigo=t("""
                    @Component
                    @ConditionalOnProperty(name = "app.storage", havingValue = "local", matchIfMissing = true)
                    class LocalAlmacenamientoAdapter implements AlmacenamientoPort {
                        private final Path raiz;

                        LocalAlmacenamientoAdapter(@Value("${app.storage-dir:./uploads}") String dir) throws IOException {
                            this.raiz = Files.createDirectories(Path.of(dir)).toRealPath();
                        }

                        @Override
                        public void guardar(String clave, byte[] contenido, String tipoMime) {
                            Path destino = resolver(clave);
                            try {
                                Files.createDirectories(destino.getParent());
                                Files.write(destino, contenido);
                            } catch (IOException e) {
                                throw new UncheckedIOException(e);
                            }
                        }

                        @Override
                        public Optional<byte[]> leer(String clave) {
                            Path origen = resolver(clave);
                            try {
                                return Files.exists(origen) ? Optional.of(Files.readAllBytes(origen)) : Optional.empty();
                            } catch (IOException e) {
                                throw new UncheckedIOException(e);
                            }
                        }

                        @Override
                        public URI urlTemporal(String clave, Duration vigencia) {
                            return URI.create("/api/archivos/" + clave);   // lo sirve un controlador propio
                        }

                        private Path resolver(String clave) {
                            Path ruta = raiz.resolve(clave).normalize();
                            if (!ruta.startsWith(raiz)) throw new IllegalArgumentException("Clave fuera del almacén");
                            return ruta;
                        }
                    }
                """),
                explicacion="`normalize()` + `startsWith(raiz)` bloquea el *path traversal* (`../`).",
            ),
            SnippetCodigo(
                id="m3-l1-s3",
                titulo="Adaptador S3 (AWS SDK v2)",
                lenguaje="java",
                archivo="infrastructure/storage/S3AlmacenamientoAdapter.java",
                codigo=t("""
                    @Component
                    @ConditionalOnProperty(name = "app.storage", havingValue = "s3")
                    class S3AlmacenamientoAdapter implements AlmacenamientoPort {
                        private final S3Client s3;
                        private final S3Presigner presigner;
                        private final String bucket;

                        S3AlmacenamientoAdapter(S3Client s3, S3Presigner presigner,
                                                @Value("${app.s3-bucket}") String bucket) {
                            this.s3 = s3;
                            this.presigner = presigner;
                            this.bucket = bucket;
                        }

                        @Override
                        public void guardar(String clave, byte[] contenido, String tipoMime) {
                            s3.putObject(PutObjectRequest.builder().bucket(bucket).key(clave).contentType(tipoMime).build(),
                                         RequestBody.fromBytes(contenido));
                        }

                        @Override
                        public Optional<byte[]> leer(String clave) {
                            try {
                                return Optional.of(s3.getObjectAsBytes(b -> b.bucket(bucket).key(clave)).asByteArray());
                            } catch (NoSuchKeyException e) {
                                return Optional.empty();
                            }
                        }

                        @Override
                        public URI urlTemporal(String clave, Duration vigencia) {
                            var peticion = GetObjectPresignRequest.builder()
                                    .signatureDuration(vigencia)
                                    .getObjectRequest(b -> b.bucket(bucket).key(clave))
                                    .build();
                            return URI.create(presigner.presignGetObject(peticion).url().toString());
                        }
                    }
                """),
                explicacion="Las credenciales de AWS las toma el SDK del entorno (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`).",
            ),
        ],
        evaluacion=Evaluacion(
            id="m3-l1-quiz",
            titulo="Quiz: almacenamiento",
            preguntas=[
                PreguntaOpcion(
                    id="m3-l1-q1",
                    enunciado="Pasar de disco local a S3 en producción obliga a cambiar…",
                    opciones=[
                        "El caso de uso que sube los archivos",
                        "La entidad de dominio",
                        "Solo la configuración que elige el adaptador",
                        "El controlador REST y el frontend",
                    ],
                    correcta=2,
                    explicacion="El núcleo depende del puerto; el adaptador concreto se elige por propiedad.",
                ),
                PreguntaOpcion(
                    id="m3-l1-q2",
                    enunciado="¿Por qué no se usa el nombre original del archivo como ruta en disco?",
                    opciones=[
                        "Porque puede contener `../` y escribir fuera de la carpeta (path traversal)",
                        "Porque los nombres con espacios no se pueden guardar",
                        "Porque S3 no admite nombres largos",
                        "Por rendimiento",
                    ],
                    correcta=0,
                    explicacion="La clave la genera el servidor; el nombre original, si hace falta, se guarda como metadato.",
                ),
                PreguntaOpcion(
                    id="m3-l1-q3",
                    enunciado="¿Cómo debe descargar el navegador un archivo de un bucket privado?",
                    opciones=[
                        "Haciendo público el bucket",
                        "Con una URL prefirmada que caduca",
                        "Enviando las credenciales de AWS al frontend",
                        "No se puede: hay que copiarlo a disco local",
                    ],
                    correcta=1,
                    explicacion="La URL prefirmada da acceso temporal a UN objeto sin exponer credenciales.",
                ),
            ],
        ),
    )


def _l2_email() -> Leccion:
    return Leccion(
        id="m3-l2-email",
        orden=2,
        titulo="Notificaciones por email: SMTP real y doble de pruebas",
        resumen="El puerto de notificación, su adaptador SMTP y un fake en memoria para los tests.",
        duracion_min=15,
        contenido=t("""
            ## El puerto habla de negocio, no de correo

            El caso de uso no «manda un email»: **avisa al cliente de que su pedido está
            confirmado**. Por eso el puerto se llama `NotificarClientePort` y su método
            `pedidoConfirmado(Pedido)`. Hoy es un email; mañana puede ser WhatsApp o una
            notificación push, y el núcleo no se entera.

            ## Adaptador SMTP

            `spring-boot-starter-mail` configura un `JavaMailSender` a partir de
            `spring.mail.*`. El adaptador arma el mensaje (asunto, cuerpo, destinatario)
            y lo envía. Las credenciales SMTP van por variables de entorno.

            ## No mandes el correo dentro de la transacción

            Si el email sale y luego la transacción hace *rollback*, el cliente recibe la
            confirmación de un pedido que no existe. Dos soluciones habituales:

            1. Publicar un **evento** y escucharlo con
               `@TransactionalEventListener(phase = AFTER_COMMIT)`.
            2. Un **outbox**: guardar el aviso pendiente en la misma transacción y que un
               proceso aparte lo envíe (más robusto: sobrevive a caídas).

            ## El doble de pruebas

            Para los tests del caso de uso no quieres un servidor SMTP: un
            `NotificadorEnMemoria` que guarda los avisos en una lista te deja afirmar
            «se avisó exactamente una vez a este cliente».
        """),
        pasos=[
            PasoExplicado(
                titulo="Puerto con lenguaje de negocio",
                explicacion="Un método por tipo de aviso: `pedidoConfirmado`, `pedidoEnviado`…",
            ),
            PasoExplicado(
                titulo="Adaptador SMTP",
                explicacion="Traduce el aviso a `SimpleMailMessage` (o `MimeMessage` para HTML).",
            ),
            PasoExplicado(
                titulo="Envío tras el commit",
                explicacion="El listener se ejecuta solo si la transacción se confirmó.",
                codigo=t("""
                    @Component
                    class AvisosTrasCommit {
                        private final NotificarClientePort notificar;
                        AvisosTrasCommit(NotificarClientePort notificar) { this.notificar = notificar; }

                        @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
                        void alConfirmar(PedidoConfirmadoEvento evento) {
                            notificar.pedidoConfirmado(evento.pedido());
                        }
                    }
                """),
                lenguaje="java",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m3-l2-s1",
                titulo="Adaptador SMTP",
                lenguaje="java",
                archivo="infrastructure/notification/EmailNotificacionAdapter.java",
                codigo=t("""
                    @Component
                    class EmailNotificacionAdapter implements NotificarClientePort {
                        private final JavaMailSender mail;
                        private final String remitente;

                        EmailNotificacionAdapter(JavaMailSender mail, @Value("${app.mail-from}") String remitente) {
                            this.mail = mail;
                            this.remitente = remitente;
                        }

                        @Override
                        public void pedidoConfirmado(Pedido pedido) {
                            SimpleMailMessage msg = new SimpleMailMessage();
                            msg.setFrom(remitente);
                            msg.setTo(pedido.emailCliente().valor());
                            msg.setSubject("Pedido confirmado");
                            msg.setText("Tu pedido " + pedido.id() + " por " + pedido.total().monto() + " está confirmado.");
                            mail.send(msg);
                        }
                    }
                """),
            ),
            SnippetCodigo(
                id="m3-l2-s2",
                titulo="Configuración SMTP por entorno",
                lenguaje="yaml",
                archivo="application.yml",
                codigo=t("""
                    spring:
                      mail:
                        host: ${SMTP_HOST:localhost}
                        port: ${SMTP_PORT:1025}          # 1025 = Mailpit/MailHog en local
                        username: ${SMTP_USER:}
                        password: ${SMTP_PASSWORD:}
                        properties:
                          mail.smtp.auth: ${SMTP_AUTH:false}
                          mail.smtp.starttls.enable: ${SMTP_TLS:false}
                    app:
                      mail-from: ${MAIL_FROM:no-responder@tienda.local}
                """),
                explicacion="En local, Mailpit captura los correos en http://localhost:8025 sin enviarlos a nadie.",
            ),
        ],
        evaluacion=Evaluacion(
            id="m3-l2-quiz",
            titulo="Quiz y reto: notificaciones",
            preguntas=[
                PreguntaOpcion(
                    id="m3-l2-q1",
                    enunciado="¿Qué nombre de puerto respeta mejor la arquitectura hexagonal?",
                    opciones=["SmtpPort", "JavaMailSenderPort", "NotificarClientePort", "EmailUtils"],
                    correcta=2,
                    explicacion="El puerto expresa la intención de negocio; SMTP es un detalle del adaptador.",
                ),
                PreguntaOpcion(
                    id="m3-l2-q2",
                    enunciado="¿Qué riesgo hay en enviar el email dentro de la transacción del caso de uso?",
                    opciones=[
                        "Ninguno",
                        "Que el email salga y la transacción haga rollback, avisando de algo que no ocurrió",
                        "Que PostgreSQL bloquee el servidor SMTP",
                        "Que el email llegue dos veces siempre",
                    ],
                    correcta=1,
                    explicacion="Por eso se envía tras el commit (`AFTER_COMMIT`) o mediante un outbox.",
                ),
                PreguntaOpcion(
                    id="m3-l2-q3",
                    enunciado="En el test unitario del caso de uso, el puerto de notificación se cumple con…",
                    opciones=[
                        "El adaptador SMTP real apuntando a Gmail",
                        "Un doble en memoria que registra los avisos",
                        "Nada: se comenta la línea que notifica",
                        "Un `@MockBean` de JavaMailSender",
                    ],
                    correcta=1,
                    explicacion="El fake en memoria hace el test rápido, determinista y sin red.",
                ),
            ],
            retos=[
                RetoCodigo(
                    id="m3-l2-reto",
                    enunciado=t("""
                        Escribe `NotificadorEnMemoria`, un doble de pruebas que implemente
                        `NotificarClientePort`:

                        - guarda cada pedido notificado en una lista,
                        - expone un método para consultar los avisos enviados (sin permitir
                          modificar la lista desde fuera),
                        - no usa Spring ni ninguna librería de correo.
                    """),
                    lenguaje="java",
                    codigo_inicial=t("""
                        public class NotificadorEnMemoria implements NotificarClientePort {
                            // tu código aquí
                        }
                    """),
                    criterios=[
                        "Implementa NotificarClientePort",
                        "Guarda los pedidos notificados en una colección en memoria",
                        "Expone los avisos de forma inmutable o como copia",
                        "No depende de Spring ni de librerías de correo",
                    ],
                    pista="`List.copyOf(lista)` devuelve una copia inmutable.",
                    solucion_referencia=t("""
                        public class NotificadorEnMemoria implements NotificarClientePort {
                            private final List<Pedido> avisados = new ArrayList<>();

                            @Override
                            public void pedidoConfirmado(Pedido pedido) {
                                avisados.add(pedido);
                            }

                            public List<Pedido> avisados() {
                                return List.copyOf(avisados);
                            }
                        }
                    """),
                ),
            ],
        ),
    )
