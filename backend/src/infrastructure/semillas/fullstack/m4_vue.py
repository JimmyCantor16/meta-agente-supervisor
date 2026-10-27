"""Módulo 4 — Frontend con Vue 3, TypeScript y Composition API."""

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


def modulo_4() -> ModuloCurso:
    return ModuloCurso(
        id="m4-vue",
        orden=4,
        titulo="Frontend con Vue 3, TypeScript y Composition API",
        descripcion="Tipos compartidos con la API, cliente Axios con errores tipados, Pinia y componentes reactivos.",
        lecciones=[_l1_estructura(), _l2_axios(), _l3_pinia()],
    )


def _l1_estructura() -> Leccion:
    return Leccion(
        id="m4-l1-estructura",
        orden=1,
        titulo="Proyecto Vue 3 + TypeScript: estructura por features y tipos del contrato",
        resumen="Vite, `<script setup>`, carpetas por funcionalidad y tipos que reflejan los DTOs del backend.",
        duracion_min=12,
        contenido=t("""
            ## Crear el proyecto

            `npm create vue@latest` con TypeScript, Vue Router y Pinia activados genera
            un proyecto Vite listo. `npm run type-check` corre `vue-tsc` y es tu primera
            línea de defensa: un campo mal escrito falla **antes** de llegar al navegador.

            ## Por features, no por tipo de archivo

            Agrupar en `components/`, `stores/`, `services/` funciona con diez archivos.
            Con cien, cada cambio toca cinco carpetas. Mejor una carpeta por
            **funcionalidad**, con todo lo suyo dentro — la misma idea que los módulos del
            backend.

            ## Los tipos son el contrato

            El backend expone `PedidoResponse(id, estado, total)`. En el frontend, una
            `interface` idéntica. Si el backend cambia el contrato, el compilador te dice
            en qué pantallas impacta. (Con OpenAPI puedes **generar** estos tipos con
            `openapi-typescript` en vez de escribirlos.)

            Ojo con los números de dinero: Jackson serializa `BigDecimal` como número
            JSON, y en JavaScript un `number` es un *double*. Para mostrar está bien;
            para **calcular** dinero en el cliente, no: los totales los calcula siempre el
            servidor.
        """),
        pasos=[
            PasoExplicado(
                titulo="Crea el proyecto",
                explicacion="Con TypeScript, Router y Pinia.",
                codigo="npm create vue@latest tienda-web\ncd tienda-web && npm install && npm run dev",
                lenguaje="bash",
            ),
            PasoExplicado(
                titulo="Organiza por features",
                explicacion="`features/pedidos/` contiene su API, su store, sus componentes y sus tipos.",
            ),
            PasoExplicado(
                titulo="Escribe los tipos del contrato",
                explicacion="Uno por DTO del backend, con los mismos nombres de campo.",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m4-l1-s1",
                titulo="Estructura por features",
                lenguaje="text",
                codigo=t("""
                    src/
                    ├── lib/http.ts                 ← instancia de Axios compartida
                    ├── features/
                    │   └── pedidos/
                    │       ├── types.ts            ← espejo de los DTOs
                    │       ├── api.ts              ← llamadas HTTP de la feature
                    │       ├── store.ts            ← estado con Pinia
                    │       └── components/
                    │           ├── ListaPedidos.vue
                    │           └── DetallePedido.vue
                    ├── router/index.ts
                    └── main.ts
                """),
            ),
            SnippetCodigo(
                id="m4-l1-s2",
                titulo="Tipos espejo de los DTOs",
                lenguaje="ts",
                archivo="src/features/pedidos/types.ts",
                codigo=t("""
                    export type EstadoPedido = "BORRADOR" | "CONFIRMADO" | "ENVIADO";

                    export interface PedidoResponse {
                      id: string;
                      estado: EstadoPedido;
                      total: number;
                    }

                    export interface LineaRequest {
                      sku: string;
                      cantidad: number;
                    }

                    export interface CrearPedidoRequest {
                      email: string;
                      lineas: LineaRequest[];
                    }
                """),
                explicacion="`EstadoPedido` como unión de literales: el compilador rechaza `\"CONFIRMDO\"`.",
            ),
        ],
        evaluacion=Evaluacion(
            id="m4-l1-quiz",
            titulo="Quiz: estructura y tipos",
            preguntas=[
                PreguntaOpcion(
                    id="m4-l1-q1",
                    enunciado="¿Qué ventaja tiene organizar el frontend por features?",
                    opciones=[
                        "Vite compila más rápido",
                        "Todo lo de una funcionalidad vive junto y un cambio no se reparte por cinco carpetas",
                        "Es obligatorio en Vue 3",
                        "Permite usar JavaScript sin tipos",
                    ],
                    correcta=1,
                    explicacion="Es la cohesión de los módulos del backend, aplicada al cliente.",
                ),
                PreguntaOpcion(
                    id="m4-l1-q2",
                    enunciado="El total de un pedido, ¿dónde debe calcularse?",
                    opciones=[
                        "En el frontend, sumando precios con `number`",
                        "En el servidor, que lo devuelve en el DTO",
                        "En un `computed` de Pinia que se envía al backend",
                        "En la base de datos con un trigger, sin pasar por el dominio",
                    ],
                    correcta=1,
                    explicacion="El cliente puede manipularse y `number` es un double: el dinero lo calcula el servidor.",
                ),
                PreguntaOpcion(
                    id="m4-l1-q3",
                    enunciado="¿Qué detecta `npm run type-check` (`vue-tsc`)?",
                    opciones=[
                        "Errores de tipos en `.ts` y en los `<script setup lang=\"ts\">` de los `.vue`",
                        "Errores de estilo CSS",
                        "Peticiones HTTP que fallan",
                        "Vulnerabilidades en dependencias",
                    ],
                    correcta=0,
                    explicacion="`tsc` solo no entiende archivos `.vue`; `vue-tsc` sí.",
                ),
            ],
        ),
    )


def _l2_axios() -> Leccion:
    return Leccion(
        id="m4-l2-axios",
        orden=2,
        titulo="Cliente HTTP con Axios: instancia, interceptores y errores tipados",
        resumen="Una sola instancia configurada por entorno, el token en un interceptor y el ProblemDetail del backend convertido en un error útil.",
        duracion_min=14,
        contenido=t("""
            ## Una instancia, configurada por entorno

            Nunca escribas `axios.get("http://localhost:8080/...")` en un componente. Crea
            **una** instancia con `baseURL` leída de `import.meta.env.VITE_API_URL`. En
            local apunta a tu backend; en Render, a la URL pública. Las variables `VITE_*`
            se **hornean en el build**: cambiarlas exige reconstruir el frontend.

            ## Interceptores

            - **De petición**: añaden el `Authorization: Bearer <token>` a todas las
              llamadas, sin repetirlo en cada función.
            - **De respuesta**: convierten el error HTTP en algo que la UI entienda. El
              backend del módulo 2 responde con `ProblemDetail` (`{status, detail}`):
              lo transformamos en un `ApiError` con el mensaje y el código.

            Un 401 global (sesión caducada) se gestiona aquí, una vez, no en cada pantalla.

            ## Funciones de API tipadas

            Cada feature tiene su `api.ts` con funciones pequeñas que devuelven tipos del
            contrato: `crearPedido(req): Promise<PedidoResponse>`. Los componentes y el
            store nunca ven Axios.
        """),
        pasos=[
            PasoExplicado(
                titulo="Instancia compartida",
                explicacion="`baseURL` del entorno y un `timeout` razonable.",
            ),
            PasoExplicado(
                titulo="Interceptor de errores",
                explicacion="Lee `detail` del ProblemDetail y lanza un `ApiError` tipado.",
            ),
            PasoExplicado(
                titulo="Funciones por feature",
                explicacion="Pequeñas, tipadas y sin estado.",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m4-l2-s1",
                titulo="Instancia de Axios con interceptores",
                lenguaje="ts",
                archivo="src/lib/http.ts",
                codigo=t("""
                    import axios, { AxiosError } from "axios";

                    export class ApiError extends Error {
                      constructor(message: string, public readonly status: number) {
                        super(message);
                        this.name = "ApiError";
                      }
                    }

                    interface ProblemDetail {
                      status?: number;
                      detail?: string;
                    }

                    export const http = axios.create({
                      baseURL: import.meta.env.VITE_API_URL ?? "",
                      timeout: 15_000,
                    });

                    http.interceptors.request.use((config) => {
                      const token = localStorage.getItem("token");
                      if (token) config.headers.Authorization = `Bearer ${token}`;
                      return config;
                    });

                    http.interceptors.response.use(
                      (res) => res,
                      (error: AxiosError<ProblemDetail>) => {
                        const status = error.response?.status ?? 0;
                        if (status === 401) window.dispatchEvent(new Event("sesion-caducada"));
                        const detalle = error.response?.data?.detail ?? "No se pudo conectar con el servidor.";
                        return Promise.reject(new ApiError(detalle, status));
                      },
                    );
                """),
                explicacion="`status === 0` significa fallo de red: el servidor ni respondió.",
            ),
            SnippetCodigo(
                id="m4-l2-s2",
                titulo="API de la feature",
                lenguaje="ts",
                archivo="src/features/pedidos/api.ts",
                codigo=t("""
                    import { http } from "@/lib/http";
                    import type { CrearPedidoRequest, PedidoResponse } from "./types";

                    export async function crearPedido(req: CrearPedidoRequest): Promise<PedidoResponse> {
                      const { data } = await http.post<PedidoResponse>("/api/pedidos", req);
                      return data;
                    }

                    export async function confirmarPedido(id: string): Promise<PedidoResponse> {
                      const { data } = await http.post<PedidoResponse>(`/api/pedidos/${id}/confirmar`);
                      return data;
                    }

                    export async function listarPedidos(): Promise<PedidoResponse[]> {
                      const { data } = await http.get<PedidoResponse[]>("/api/pedidos");
                      return data;
                    }
                """),
            ),
        ],
        evaluacion=Evaluacion(
            id="m4-l2-quiz",
            titulo="Quiz: Axios",
            preguntas=[
                PreguntaOpcion(
                    id="m4-l2-q1",
                    enunciado="¿Dónde se añade el header `Authorization` a todas las peticiones?",
                    opciones=[
                        "En cada componente antes de llamar",
                        "En un interceptor de petición de la instancia compartida",
                        "En el `index.html`",
                        "En el backend",
                    ],
                    correcta=1,
                    explicacion="Un solo sitio: si cambia la forma de autenticar, se cambia una vez.",
                ),
                PreguntaOpcion(
                    id="m4-l2-q2",
                    enunciado="Cambias `VITE_API_URL` en el panel de Render. ¿Qué hace falta para que surta efecto?",
                    opciones=[
                        "Nada, se lee en cada petición",
                        "Recargar la página",
                        "Reconstruir (y redesplegar) el frontend: las `VITE_*` se hornean en el build",
                        "Reiniciar el backend",
                    ],
                    correcta=2,
                    explicacion="Vite sustituye `import.meta.env.VITE_*` por su valor al compilar.",
                ),
                PreguntaOpcion(
                    id="m4-l2-q3",
                    enunciado="El backend responde 409 con un ProblemDetail. ¿Qué recibe el store?",
                    opciones=[
                        "Un `AxiosError` crudo",
                        "Un `ApiError` con `detail` como mensaje y `status` 409",
                        "Nada: Axios ignora los 4xx",
                        "Un objeto `PedidoResponse` vacío",
                    ],
                    correcta=1,
                    explicacion="El interceptor de respuesta traduce el error HTTP a un tipo propio y legible.",
                ),
            ],
        ),
    )


def _l3_pinia() -> Leccion:
    return Leccion(
        id="m4-l3-pinia",
        orden=3,
        titulo="Estado con Pinia y componentes reactivos",
        resumen="Stores con la sintaxis setup, `storeToRefs`, `computed` y componentes que muestran carga, error y vacío.",
        duracion_min=18,
        contenido=t("""
            ## Pinia: el estado de la feature, tipado

            Pinia es el gestor de estado oficial de Vue 3. Con la **sintaxis setup**
            (`defineStore("id", () => {...})`) el store se escribe igual que un
            componente: `ref` para el estado, `computed` para lo derivado y funciones
            para las acciones. TypeScript infiere todos los tipos.

            Regla práctica: el store **orquesta** (llama a la API, guarda resultado,
            carga y error); los componentes **muestran** y emiten intenciones.

            ## `storeToRefs`, o pierdes la reactividad

            Desestructurar un store (`const { pedidos } = store`) rompe la reactividad.
            `storeToRefs(store)` devuelve refs que siguen conectados; las acciones se
            sacan del store directamente.

            ## Los cuatro estados de toda pantalla

            Una lista que viene del servidor siempre está en uno de estos estados:
            **cargando**, **error**, **vacía** o **con datos**. Si el componente no dibuja
            los cuatro, el usuario verá en algún momento una pantalla en blanco.

            ## Un flujo completo

            El usuario pulsa «Confirmar» → el componente llama a
            `store.confirmar(id)` → el store llama a `confirmarPedido(id)` (Axios) →
            el backend ejecuta el caso de uso → la respuesta reemplaza el pedido en el
            estado → Vue repinta solo lo que cambió.
        """),
        pasos=[
            PasoExplicado(
                titulo="Store con sintaxis setup",
                explicacion="Estado con `ref`, derivados con `computed`, acciones `async`.",
            ),
            PasoExplicado(
                titulo="Consume el store en `<script setup>`",
                explicacion="`storeToRefs` para el estado, el store para las acciones.",
            ),
            PasoExplicado(
                titulo="Dibuja los cuatro estados",
                explicacion="`v-if` para cargando y error, un mensaje para vacío, y la lista.",
            ),
        ],
        snippets=[
            SnippetCodigo(
                id="m4-l3-s1",
                titulo="Store de pedidos (Pinia, sintaxis setup)",
                lenguaje="ts",
                archivo="src/features/pedidos/store.ts",
                codigo=t("""
                    import { defineStore } from "pinia";
                    import { computed, ref } from "vue";
                    import { ApiError } from "@/lib/http";
                    import { confirmarPedido, listarPedidos } from "./api";
                    import type { PedidoResponse } from "./types";

                    export const usePedidosStore = defineStore("pedidos", () => {
                      const pedidos = ref<PedidoResponse[]>([]);
                      const cargando = ref(false);
                      const error = ref<string | null>(null);

                      const confirmados = computed(() => pedidos.value.filter((p) => p.estado === "CONFIRMADO"));

                      async function cargar(): Promise<void> {
                        cargando.value = true;
                        error.value = null;
                        try {
                          pedidos.value = await listarPedidos();
                        } catch (e) {
                          error.value = e instanceof ApiError ? e.message : "Error inesperado";
                        } finally {
                          cargando.value = false;
                        }
                      }

                      async function confirmar(id: string): Promise<void> {
                        try {
                          const actualizado = await confirmarPedido(id);
                          pedidos.value = pedidos.value.map((p) => (p.id === id ? actualizado : p));
                        } catch (e) {
                          error.value = e instanceof ApiError ? e.message : "Error inesperado";
                        }
                      }

                      return { pedidos, cargando, error, confirmados, cargar, confirmar };
                    });
                """),
            ),
            SnippetCodigo(
                id="m4-l3-s2",
                titulo="Componente con los cuatro estados",
                lenguaje="vue",
                archivo="src/features/pedidos/components/ListaPedidos.vue",
                codigo=t("""
                    <script setup lang="ts">
                    import { onMounted } from "vue";
                    import { storeToRefs } from "pinia";
                    import { usePedidosStore } from "../store";

                    const store = usePedidosStore();
                    const { pedidos, cargando, error } = storeToRefs(store);

                    onMounted(() => store.cargar());
                    </script>

                    <template>
                      <p v-if="cargando">Cargando pedidos…</p>
                      <p v-else-if="error" role="alert">{{ error }} <button @click="store.cargar()">Reintentar</button></p>
                      <p v-else-if="pedidos.length === 0">Aún no hay pedidos.</p>
                      <ul v-else>
                        <li v-for="p in pedidos" :key="p.id">
                          {{ p.id.slice(0, 8) }} · {{ p.estado }} · {{ p.total.toFixed(2) }}
                          <button v-if="p.estado === 'BORRADOR'" @click="store.confirmar(p.id)">Confirmar</button>
                        </li>
                      </ul>
                    </template>
                """),
                explicacion="`p.total` viene calculado del servidor: el cliente solo lo formatea.",
            ),
        ],
        evaluacion=Evaluacion(
            id="m4-l3-quiz",
            titulo="Quiz y reto: Pinia",
            preguntas=[
                PreguntaOpcion(
                    id="m4-l3-q1",
                    enunciado="`const { pedidos } = usePedidosStore()` ¿qué problema tiene?",
                    opciones=[
                        "Ninguno",
                        "Rompe la reactividad: hay que usar `storeToRefs`",
                        "No compila en TypeScript",
                        "Crea un segundo store",
                    ],
                    correcta=1,
                    explicacion="La desestructuración copia el valor; `storeToRefs` mantiene la conexión reactiva.",
                ),
                PreguntaOpcion(
                    id="m4-l3-q2",
                    enunciado="En la sintaxis setup de Pinia, un *getter* se escribe con…",
                    opciones=["`ref`", "`computed`", "`watch`", "`reactive`"],
                    correcta=1,
                    explicacion="Lo derivado del estado es un `computed`, igual que en un componente.",
                ),
                PreguntaOpcion(
                    id="m4-l3-q3",
                    enunciado="¿Qué estados debe dibujar una lista que llega del servidor?",
                    opciones=[
                        "Solo «con datos»",
                        "Cargando y con datos",
                        "Cargando, error, vacía y con datos",
                        "Error y con datos",
                    ],
                    correcta=2,
                    explicacion="Si falta alguno, en algún momento el usuario ve una pantalla en blanco o engañosa.",
                ),
            ],
            retos=[
                RetoCodigo(
                    id="m4-l3-reto",
                    enunciado=t("""
                        Escribe un store de Pinia **`useCarritoStore`** (sintaxis setup) con:

                        - estado `lineas: Ref<LineaRequest[]>` (`{ sku, cantidad }`),
                        - acción `agregar(sku: string)`: si el SKU ya está, suma 1 a su cantidad; si no, lo añade con cantidad 1,
                        - getter `totalUnidades` (suma de cantidades) con `computed`,
                        - **sin** precios: el total en dinero lo calcula el servidor.
                    """),
                    lenguaje="ts",
                    codigo_inicial=t("""
                        import { defineStore } from "pinia";
                        import { computed, ref } from "vue";
                        import type { LineaRequest } from "./types";

                        export const useCarritoStore = defineStore("carrito", () => {
                          // tu código aquí
                        });
                    """),
                    criterios=[
                        "Usa defineStore con la sintaxis setup",
                        "Declara el estado lineas con ref tipado",
                        "La acción agregar suma cantidad si el SKU ya existe o lo añade con cantidad 1",
                        "Expone totalUnidades como computed",
                        "No guarda ni calcula precios en el cliente",
                    ],
                    pista="`lineas.value.find((l) => l.sku === sku)` te dice si ya está.",
                    solucion_referencia=t("""
                        export const useCarritoStore = defineStore("carrito", () => {
                          const lineas = ref<LineaRequest[]>([]);

                          function agregar(sku: string): void {
                            const existente = lineas.value.find((l) => l.sku === sku);
                            if (existente) existente.cantidad += 1;
                            else lineas.value.push({ sku, cantidad: 1 });
                          }

                          const totalUnidades = computed(() => lineas.value.reduce((s, l) => s + l.cantidad, 0));

                          return { lineas, agregar, totalUnidades };
                        });
                    """),
                ),
            ],
        ),
    )
