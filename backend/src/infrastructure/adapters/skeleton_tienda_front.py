"""Frontend de la TIENDA generada.

Lo que separa esto de un CRUD con una tabla:

- El **catálogo se ve sin cuenta**. Se pide entrar en el momento de pagar, no en
  la puerta. Una tienda que exige registrarse para enseñar el precio no vende.
- El **carrito vive en el navegador** (`localStorage`) y sobrevive a un refresco,
  como en cualquier tienda de verdad. Solo se convierte en pedido al confirmar.
- El **total que se muestra al pagar es el que devuelve el servidor**, no el que
  suma esta pantalla. La suma de aquí es para que el usuario vea lo que lleva
  mientras compra; la que vale es la del servidor, calculada con SUS precios.

Las pantallas de entrar y crear cuenta se reutilizan tal cual del esqueleto por
dominio: son las mismas dos pantallas separadas, ya probadas.
"""

from __future__ import annotations


def js_api() -> str:
    return r'''// Cliente de API. Rutas relativas: sirven igual en local y en producción.
import { getToken } from "./state.js";

async function req(path, opts = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  return fetch(path, Object.assign({}, opts, { headers }));
}

export async function register(username, password) {
  return req("api/register", { method: "POST", body: JSON.stringify({ username, password }) });
}

export async function login(username, password) {
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);
  return fetch("api/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function quienSoy() { return req("api/me"); }

// El escaparate es público: se puede pedir sin token.
export async function productos(categoria = "", q = "") {
  const p = new URLSearchParams();
  if (categoria) p.set("categoria", categoria);
  if (q) p.set("q", q);
  const cola = p.toString();
  return req("api/productos" + (cola ? "?" + cola : ""));
}

// Confirmar la compra. Se manda SOLO qué producto y cuántos: el precio y el
// total los pone el servidor con los datos de su base.
export async function confirmarCompra(lineas) {
  return req("api/pedidos", { method: "POST", body: JSON.stringify({ lineas }) });
}

export async function misPedidos() { return req("api/pedidos"); }
export async function resumen() { return req("api/resumen"); }

// --- gestión del dueño ---
export async function todasLasVentas() { return req("api/admin/pedidos"); }
export async function crearProducto(datos) {
  return req("api/admin/productos", { method: "POST", body: JSON.stringify(datos) });
}
export async function actualizarProducto(id, datos) {
  return req("api/admin/productos/" + id, { method: "PUT", body: JSON.stringify(datos) });
}
export async function borrarProducto(id) {
  return req("api/admin/productos/" + id, { method: "DELETE" });
}
'''


def js_carrito_estado() -> str:
    return r'''// EL CARRITO. Vive en el navegador y sobrevive a un refresco de la página.
//
// Guarda lo mínimo: qué producto y cuántas unidades. El nombre y el precio se
// guardan solo para poder DIBUJAR el carrito sin volver a pedir el catálogo;
// al confirmar la compra no se envían, porque el precio bueno es el del
// servidor. Si aquí se guardara el precio "de verdad", bastaría con editar el
// almacenamiento del navegador para comprar a otro precio.

const CLAVE = "carrito";
const suscriptores = [];

function leer() {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE) || "[]");
    return Array.isArray(crudo) ? crudo.filter((l) => l && l.producto_id) : [];
  } catch (_) {
    return [];
  }
}

function escribir(lineas) {
  localStorage.setItem(CLAVE, JSON.stringify(lineas));
  suscriptores.forEach((f) => f());
}

export function alCambiar(fn) { suscriptores.push(fn); }
export function lineas() { return leer(); }
export function unidades() { return leer().reduce((n, l) => n + l.cantidad, 0); }
export function vacio() { return leer().length === 0; }

export function agregar(producto, cantidad = 1) {
  const lineas = leer();
  const ya = lineas.find((l) => l.producto_id === producto.id);
  // El tope es el stock: dejar añadir doce de algo de lo que quedan tres solo
  // sirve para que el servidor rechace la compra al final, que es el peor
  // momento para enterarse.
  const maximo = Math.max(0, producto.stock);
  if (ya) ya.cantidad = Math.min(maximo, ya.cantidad + cantidad);
  else if (maximo > 0) {
    lineas.push({
      producto_id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad: Math.min(maximo, cantidad),
      stock: maximo,
    });
  }
  escribir(lineas);
}

export function cambiarCantidad(producto_id, cantidad) {
  const lineas = leer();
  const linea = lineas.find((l) => l.producto_id === producto_id);
  if (!linea) return;
  linea.cantidad = Math.max(1, Math.min(linea.stock || 99, cantidad));
  escribir(lineas);
}

export function quitar(producto_id) {
  escribir(leer().filter((l) => l.producto_id !== producto_id));
}

export function vaciar() { escribir([]); }

/** Lo que se manda al servidor: SOLO producto y cantidad. */
export function paraEnviar() {
  return leer().map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad }));
}

/** Suma de la pantalla. Orientativa: la que se cobra la calcula el servidor. */
export function subtotal() {
  return leer().reduce((n, l) => n + l.precio * l.cantidad, 0);
}
'''


def js_dinero() -> str:
    return r'''// Formato de dinero, en un solo sitio.
//
// La agrupación se hace a mano, siempre cada tres cifras, en vez de dejarla en
// manos de `toLocaleString`: en español los números de cuatro dígitos NO se
// agrupan ("8000"), y aunque sea la norma tipográfica, junto a un precio de
// cinco cifras ya agrupado ("$ 89.000") se lee como un fallo del sistema. En
// una tienda, que dos importes de la misma pantalla se escriban distinto hace
// dudar de la cifra, que es lo último que uno quiere antes de pagar.
//
// El símbolo lo pone la tienda (window.__TIENDA__.moneda), no está aquí fijo.

export function dinero(n) {
  const valor = Number(n) || 0;
  const negativo = valor < 0;
  const absoluto = Math.abs(valor);
  const entero = Math.trunc(absoluto);
  // Solo se muestran decimales si los hay: "45.000,00" para un precio redondo
  // es ruido, pero "45.000,5" en vez de "45.000,50" parece un error de cuenta.
  const centimos = Math.round((absoluto - entero) * 100);
  const miles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cola = centimos ? "," + String(centimos).padStart(2, "0") : "";
  return window.__TIENDA__.moneda + " " + (negativo ? "-" : "") + miles + cola;
}
'''


def js_catalogo() -> str:
    return r'''// EL ESCAPARATE. Es la primera pantalla y se ve SIN cuenta.
import { productos } from "../api.js";
import { agregar } from "../carrito.js";
import { dinero } from "../dinero.js";

export function CatalogoView() {
  const el = document.createElement("section");
  el.innerHTML = `
    <header class="portada">
      <h1></h1>
      <p class="sub"></p>
    </header>
    <div class="filtros">
      <input class="buscar" type="search" placeholder="Buscar" aria-label="Buscar">
      <div class="chips" role="group" aria-label="Categorías"></div>
    </div>
    <p class="estado" role="status" aria-live="polite">Cargando…</p>
    <div class="rejilla"></div>`;

  el.querySelector("h1").textContent = window.__TIENDA__.name;
  el.querySelector(".sub").textContent =
    window.__TIENDA__.envio > 0
      ? "Envío " + dinero(window.__TIENDA__.envio) + " en todos los pedidos."
      : "Envío gratis en todos los pedidos.";

  const rejilla = el.querySelector(".rejilla");
  const estado = el.querySelector(".estado");
  const buscar = el.querySelector(".buscar");
  const chips = el.querySelector(".chips");
  let categoria = "";

  const categorias = ["", ...(window.__TIENDA__.categorias || [])];
  categorias.forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip" + (c === "" ? " activo" : "");
    b.textContent = c || "Todo";
    b.onclick = () => {
      categoria = c;
      chips.querySelectorAll(".chip").forEach((x) => x.classList.remove("activo"));
      b.classList.add("activo");
      cargar();
    };
    chips.appendChild(b);
  });

  function tarjeta(p) {
    const art = document.createElement("article");
    art.className = "producto" + (p.agotado ? " agotado" : "");
    // El aviso de stock va ANTES del pie, no después: el pie se pega al fondo
    // con `margin-top:auto`, y para que la fila del precio quede a la misma
    // altura en todas las tarjetas tiene que ser el ÚLTIMO elemento. Con el
    // aviso debajo, las tarjetas con «quedan pocos» descuadraban la rejilla.
    art.innerHTML = `
      <div class="foto" aria-hidden="true"><span></span></div>
      <h3></h3>
      <p class="desc"></p>
      <p class="quedan"></p>
      <div class="pie">
        <span class="precio"></span>
        <button class="add">Añadir</button>
      </div>`;
    // textContent, no innerHTML: el nombre de un producto puede llevar comillas
    // o signos y no debe poder inyectar marcado en la página.
    art.querySelector(".foto span").textContent = (p.nombre || "?").trim()[0].toUpperCase();
    art.querySelector("h3").textContent = p.nombre;
    art.querySelector(".desc").textContent = p.descripcion || "";
    art.querySelector(".precio").textContent = dinero(p.precio);

    const quedan = art.querySelector(".quedan");
    const boton = art.querySelector(".add");
    if (p.agotado) {
      boton.disabled = true;
      boton.textContent = "Agotado";
      quedan.textContent = "Sin unidades por ahora.";
    } else {
      if (p.stock <= 5) quedan.textContent = "Quedan " + p.stock;
      boton.onclick = () => {
        agregar(p, 1);
        boton.textContent = "Añadido ✓";
        boton.classList.add("hecho");
        setTimeout(() => {
          boton.textContent = "Añadir";
          boton.classList.remove("hecho");
        }, 900);
      };
    }
    return art;
  }

  async function cargar() {
    estado.textContent = "Cargando…";
    estado.hidden = false;
    rejilla.innerHTML = "";
    try {
      const r = await productos(categoria, buscar.value.trim());
      if (!r.ok) throw new Error("respuesta " + r.status);
      const lista = await r.json();
      if (!lista.length) {
        estado.textContent = buscar.value.trim()
          ? "No encontramos nada con «" + buscar.value.trim() + "»."
          : "Todavía no hay productos en esta sección.";
        return;
      }
      estado.hidden = true;
      lista.forEach((p) => rejilla.appendChild(tarjeta(p)));
    } catch (_) {
      estado.textContent = "No se pudo cargar el catálogo. Revisa tu conexión.";
    }
  }

  let temporizador;
  buscar.oninput = () => {
    // Se espera a que deje de escribir: una petición por tecla satura el
    // servidor y hace parpadear la rejilla.
    clearTimeout(temporizador);
    temporizador = setTimeout(cargar, 250);
  };

  cargar();
  return el;
}
'''


def js_carrito_vista() -> str:
    return r'''// EL CARRITO Y EL PAGO.
import { confirmarCompra } from "../api.js";
import {
  cambiarCantidad, lineas, paraEnviar, quitar, subtotal, vaciar,
} from "../carrito.js";
import { dinero } from "../dinero.js";
import { isLogged } from "../state.js";

// Esta pantalla se repinta A SÍ MISMA cuando cambia el carrito. Antes pedía un
// repintado global de la aplicación, y eso se llevaba por delante la pantalla de
// «compra confirmada»: se creaba una vista nueva —con el carrito ya vacío— y el
// comprobante se dibujaba sobre el nodo viejo, que ya no estaba en la página.
// El contador de la cabecera no lo necesita: se actualiza solo, suscrito al carrito.
export function CarritoView(irALogin, irACatalogo) {
  const el = document.createElement("section");
  el.className = "card";
  el.innerHTML = `
    <h1>Tu carrito</h1>
    <div class="lineas"></div>
    <div class="cuentas" hidden>
      <div class="fila"><span>Subtotal</span><span class="sub"></span></div>
      <div class="fila"><span>Envío</span><span class="env"></span></div>
      <div class="fila total"><span>Total</span><span class="tot"></span></div>
    </div>
    <p class="msg" role="status" aria-live="polite"></p>
    <div class="acciones" hidden>
      <button class="seguir ghost">Seguir comprando</button>
      <button class="pagar">Confirmar compra</button>
    </div>`;

  const cajaLineas = el.querySelector(".lineas");
  const cuentas = el.querySelector(".cuentas");
  const acciones = el.querySelector(".acciones");
  const msg = el.querySelector(".msg");
  const botonPagar = el.querySelector(".pagar");

  el.querySelector(".seguir").onclick = irACatalogo;

  function pintar() {
    const items = lineas();
    cajaLineas.innerHTML = "";
    if (!items.length) {
      cuentas.hidden = true;
      acciones.hidden = true;
      const vacio = document.createElement("p");
      vacio.className = "vacio";
      vacio.textContent = "Tu carrito está vacío.";
      const ir = document.createElement("button");
      ir.className = "ghost";
      ir.textContent = "Ver el catálogo";
      ir.onclick = irACatalogo;
      cajaLineas.append(vacio, ir);
      return;
    }
    cuentas.hidden = false;
    acciones.hidden = false;

    items.forEach((l) => {
      const fila = document.createElement("div");
      fila.className = "linea";
      fila.innerHTML = `
        <div class="quien"><strong></strong><span class="unit"></span></div>
        <div class="cantidad">
          <button class="menos" aria-label="Quitar uno">−</button>
          <span class="n"></span>
          <button class="mas" aria-label="Añadir uno">+</button>
        </div>
        <span class="importe"></span>
        <button class="quitar" aria-label="Quitar del carrito">✕</button>`;
      fila.querySelector("strong").textContent = l.nombre;
      fila.querySelector(".unit").textContent = dinero(l.precio) + " c/u";
      fila.querySelector(".n").textContent = l.cantidad;
      fila.querySelector(".importe").textContent = dinero(l.precio * l.cantidad);
      fila.querySelector(".menos").disabled = l.cantidad <= 1;
      fila.querySelector(".mas").disabled = l.cantidad >= (l.stock || 99);
      fila.querySelector(".menos").onclick = () => {
        cambiarCantidad(l.producto_id, l.cantidad - 1);
        pintar();
      };
      fila.querySelector(".mas").onclick = () => {
        cambiarCantidad(l.producto_id, l.cantidad + 1);
        pintar();
      };
      fila.querySelector(".quitar").onclick = () => {
        quitar(l.producto_id);
        pintar();
      };
      cajaLineas.appendChild(fila);
    });

    const envio = window.__TIENDA__.envio || 0;
    el.querySelector(".sub").textContent = dinero(subtotal());
    el.querySelector(".env").textContent = envio > 0 ? dinero(envio) : "Gratis";
    el.querySelector(".tot").textContent = dinero(subtotal() + envio);
  }

  botonPagar.onclick = async () => {
    // Se pide la cuenta AQUÍ, no en la puerta de la tienda: el carrito ya está
    // hecho y se conserva, así que entrar no cuesta perder la compra.
    if (!isLogged()) {
      msg.textContent = "Entra con tu cuenta para confirmar la compra.";
      msg.className = "msg";
      setTimeout(irALogin, 700);
      return;
    }
    botonPagar.disabled = true;
    msg.textContent = "Confirmando…";
    msg.className = "msg";
    try {
      const r = await confirmarCompra(paraEnviar());
      if (r.ok) {
        const pedido = await r.json();
        vaciar();
        // El total que se enseña es el que devolvió el SERVIDOR, no la suma de
        // esta pantalla: es el que se ha cobrado de verdad.
        cajaLineas.innerHTML = "";
        cuentas.hidden = true;
        acciones.hidden = true;
        const ok = document.createElement("div");
        ok.className = "confirmado";
        ok.innerHTML = `
          <h2>¡Compra confirmada!</h2>
          <p class="numero"></p>
          <p class="cobrado"></p>
          <button class="ghost">Seguir comprando</button>`;
        ok.querySelector(".numero").textContent = "Pedido n.º " + pedido.id;
        ok.querySelector(".cobrado").textContent =
          pedido.articulos + " artículo(s) · Total " + dinero(pedido.total);
        ok.querySelector("button").onclick = irACatalogo;
        cajaLineas.appendChild(ok);
        msg.textContent = "";
        return;
      }
      const d = await r.json().catch(() => ({}));
      msg.textContent = d.detail || "No se pudo confirmar la compra.";
      msg.className = "msg error";
    } catch (_) {
      msg.textContent = "No se pudo conectar. Revisa tu conexión.";
      msg.className = "msg error";
    }
    botonPagar.disabled = false;
  };

  pintar();
  return el;
}
'''


def js_pedidos() -> str:
    return r'''// MIS PEDIDOS. El historial de quien compró.
import { misPedidos } from "../api.js";
import { dinero } from "../dinero.js";

export function PedidosView(irACatalogo) {
  const el = document.createElement("section");
  el.className = "card";
  el.innerHTML = `
    <h1>Mis pedidos</h1>
    <p class="estado" role="status" aria-live="polite">Cargando…</p>
    <div class="pedidos"></div>`;

  const estado = el.querySelector(".estado");
  const caja = el.querySelector(".pedidos");

  (async () => {
    try {
      const r = await misPedidos();
      if (!r.ok) throw new Error("respuesta " + r.status);
      const lista = await r.json();
      if (!lista.length) {
        estado.textContent = "Todavía no has comprado nada.";
        const ir = document.createElement("button");
        ir.className = "ghost";
        ir.textContent = "Ver el catálogo";
        ir.onclick = irACatalogo;
        caja.appendChild(ir);
        return;
      }
      estado.hidden = true;
      lista.forEach((p) => {
        const art = document.createElement("article");
        art.className = "pedido";
        art.innerHTML = `
          <header>
            <strong></strong>
            <span class="fecha"></span>
            <span class="total"></span>
          </header>
          <ul class="detalle"></ul>`;
        art.querySelector("strong").textContent = "Pedido n.º " + p.id;
        art.querySelector(".fecha").textContent = p.fecha;
        art.querySelector(".total").textContent = dinero(p.total);
        const ul = art.querySelector(".detalle");
        p.lineas.forEach((l) => {
          const li = document.createElement("li");
          li.textContent =
            l.cantidad + " × " + l.nombre + " — " + dinero(l.subtotal);
          ul.appendChild(li);
        });
        if (p.envio > 0) {
          const li = document.createElement("li");
          li.className = "envio";
          li.textContent = "Envío — " + dinero(p.envio);
          ul.appendChild(li);
        }
        caja.appendChild(art);
      });
    } catch (_) {
      estado.textContent = "No se pudieron cargar tus pedidos.";
    }
  })();

  return el;
}
'''


def js_admin() -> str:
    return r'''// PANEL DEL DUEÑO: el catálogo y las ventas. Solo lo ve quien es admin.
import {
  actualizarProducto, borrarProducto, crearProducto, productos, resumen, todasLasVentas,
} from "../api.js";
import { dinero } from "../dinero.js";

export function AdminView() {
  const el = document.createElement("section");
  el.className = "card";
  el.innerHTML = `
    <h1>Panel del negocio</h1>
    <div class="cifras"></div>
    <div class="barra">
      <h2>Catálogo</h2>
      <button class="nuevo">Añadir producto</button>
    </div>
    <p class="estado" role="status" aria-live="polite">Cargando…</p>
    <div class="tabla-productos"></div>
    <h2>Últimas ventas</h2>
    <div class="ventas"></div>
    <dialog class="editor">
      <form method="dialog">
        <h3 class="titulo"></h3>
        <label>Nombre<input class="f-nombre" required></label>
        <label>Precio<input class="f-precio" type="number" min="1" step="0.01" required></label>
        <label>Stock<input class="f-stock" type="number" min="0" step="1" required></label>
        <label>Categoría<input class="f-categoria"></label>
        <label>Descripción<input class="f-descripcion"></label>
        <p class="err error-campo" role="alert"></p>
        <div class="row">
          <button value="cancel" class="ghost" type="submit">Cancelar</button>
          <button class="guardar" type="button">Guardar</button>
        </div>
      </form>
    </dialog>`;

  const estado = el.querySelector(".estado");
  const tabla = el.querySelector(".tabla-productos");
  const editor = el.querySelector(".editor");
  const err = el.querySelector(".err");
  let editando = null;

  function abrir(producto) {
    editando = producto;
    el.querySelector(".titulo").textContent = producto ? "Editar producto" : "Nuevo producto";
    el.querySelector(".f-nombre").value = producto ? producto.nombre : "";
    el.querySelector(".f-precio").value = producto ? producto.precio : "";
    el.querySelector(".f-stock").value = producto ? producto.stock : 10;
    el.querySelector(".f-categoria").value = producto ? producto.categoria : "";
    el.querySelector(".f-descripcion").value = producto ? producto.descripcion : "";
    err.textContent = "";
    editor.showModal();
  }

  el.querySelector(".nuevo").onclick = () => abrir(null);

  el.querySelector(".guardar").onclick = async () => {
    const datos = {
      nombre: el.querySelector(".f-nombre").value.trim(),
      precio: Number(el.querySelector(".f-precio").value),
      stock: Number(el.querySelector(".f-stock").value),
      categoria: el.querySelector(".f-categoria").value.trim(),
      descripcion: el.querySelector(".f-descripcion").value.trim(),
    };
    if (!datos.nombre) { err.textContent = "El producto necesita un nombre."; return; }
    if (!(datos.precio > 0)) { err.textContent = "El precio debe ser mayor que cero."; return; }
    const r = editando
      ? await actualizarProducto(editando.id, datos)
      : await crearProducto(datos);
    if (r.ok) { editor.close(); cargar(); return; }
    const d = await r.json().catch(() => ({}));
    err.textContent = d.detail || "No se pudo guardar.";
  };

  async function cargar() {
    estado.hidden = false;
    estado.textContent = "Cargando…";
    tabla.innerHTML = "";
    try {
      const [rp, rr, rv] = await Promise.all([productos(), resumen(), todasLasVentas()]);
      const lista = rp.ok ? await rp.json() : [];
      const cifras = rr.ok ? await rr.json() : null;
      const ventas = rv.ok ? await rv.json() : [];

      if (cifras) {
        el.querySelector(".cifras").innerHTML = "";
        [
          ["Pedidos", cifras.pedidos],
          ["Artículos vendidos", cifras.articulos],
          ["Ingresos", dinero(cifras.total)],
          ["Ticket medio", dinero(cifras.ticket_medio)],
        ].forEach(([etiqueta, valor]) => {
          const d = document.createElement("div");
          d.className = "cifra";
          d.innerHTML = "<span class='n'></span><span class='e'></span>";
          d.querySelector(".n").textContent = valor;
          d.querySelector(".e").textContent = etiqueta;
          el.querySelector(".cifras").appendChild(d);
        });
      }

      estado.hidden = true;
      lista.forEach((p) => {
        const fila = document.createElement("div");
        fila.className = "fila-producto";
        fila.innerHTML = `
          <strong></strong>
          <span class="cat"></span>
          <span class="pre"></span>
          <span class="stk"></span>
          <span class="acc">
            <button class="editar ghost">Editar</button>
            <button class="borrar ghost">Borrar</button>
          </span>`;
        fila.querySelector("strong").textContent = p.nombre;
        fila.querySelector(".cat").textContent = p.categoria || "—";
        fila.querySelector(".pre").textContent = dinero(p.precio);
        fila.querySelector(".stk").textContent = p.stock + " en stock";
        fila.querySelector(".editar").onclick = () => abrir(p);
        fila.querySelector(".borrar").onclick = async () => {
          if (!confirm("¿Borrar «" + p.nombre + "»?")) return;
          const r = await borrarProducto(p.id);
          if (r.ok) cargar();
        };
        tabla.appendChild(fila);
      });

      const caja = el.querySelector(".ventas");
      caja.innerHTML = "";
      if (!ventas.length) {
        const p = document.createElement("p");
        p.className = "vacio";
        p.textContent = "Todavía no hay ventas.";
        caja.appendChild(p);
      }
      ventas.slice(0, 10).forEach((v) => {
        const d = document.createElement("div");
        d.className = "venta";
        d.innerHTML = "<span class='id'></span><span class='f'></span><span class='t'></span>";
        d.querySelector(".id").textContent = "n.º " + v.id;
        d.querySelector(".f").textContent = v.fecha + " · " + v.articulos + " art.";
        d.querySelector(".t").textContent = dinero(v.total);
        caja.appendChild(d);
      });
    } catch (_) {
      estado.textContent = "No se pudo cargar el panel.";
    }
  }

  cargar();
  return el;
}
'''


def js_app() -> str:
    return r'''// Arranque y navegación. Las direcciones van en el hash (#/carrito), así que
// se puede compartir un enlace y el botón «atrás» del navegador funciona.
import { quienSoy } from "./api.js";
import { alCambiar, unidades } from "./carrito.js";
import { clearToken, isLogged } from "./state.js";
import { AdminView } from "./components/admin.js";
import { CarritoView } from "./components/carrito.js";
import { CatalogoView } from "./components/catalogo.js";
import { LoginView } from "./components/login.js";
import { PedidosView } from "./components/pedidos.js";
import { RegistroView } from "./components/registro.js";

const raiz = document.getElementById("app");
let usuario = null;

function ir(ruta) {
  if (location.hash === ruta) pintar();
  else location.hash = ruta;
}

function cabecera() {
  const el = document.createElement("header");
  el.className = "barra-top";
  el.innerHTML = `
    <button class="marca"></button>
    <nav>
      <button class="ir-catalogo">Catálogo</button>
      <button class="ir-pedidos">Mis pedidos</button>
      <button class="ir-admin" hidden>Panel</button>
    </nav>
    <div class="derecha">
      <button class="ir-carrito">Carrito <span class="cuenta"></span></button>
      <button class="sesion ghost"></button>
    </div>`;

  el.querySelector(".marca").textContent = window.__TIENDA__.name;
  el.querySelector(".marca").onclick = () => ir("#/");
  el.querySelector(".ir-catalogo").onclick = () => ir("#/");
  el.querySelector(".ir-pedidos").onclick = () => ir(isLogged() ? "#/pedidos" : "#/login");
  el.querySelector(".ir-admin").onclick = () => ir("#/admin");
  el.querySelector(".ir-carrito").onclick = () => ir("#/carrito");

  const n = unidades();
  const cuenta = el.querySelector(".cuenta");
  cuenta.textContent = n ? String(n) : "";
  cuenta.hidden = !n;

  if (usuario && usuario.es_admin) el.querySelector(".ir-admin").hidden = false;

  const sesion = el.querySelector(".sesion");
  sesion.textContent = isLogged() ? "Salir" : "Entrar";
  sesion.onclick = () => {
    if (isLogged()) {
      clearToken();
      usuario = null;
      ir("#/");
    } else ir("#/login");
  };
  return el;
}

async function refrescarUsuario() {
  if (!isLogged()) { usuario = null; return; }
  try {
    const r = await quienSoy();
    // Un token caducado no debe dejar la aplicación en un limbo: se limpia y
    // se sigue navegando como visitante, que es lo que se es.
    if (r.ok) usuario = await r.json();
    else { clearToken(); usuario = null; }
  } catch (_) {
    usuario = null;
  }
}

function vista() {
  const ruta = location.hash || "#/";
  if (ruta.startsWith("#/login")) {
    return LoginView(async () => { await refrescarUsuario(); ir("#/carrito"); },
                     () => ir("#/registro"));
  }
  if (ruta.startsWith("#/registro")) {
    return RegistroView(() => ir("#/login"), () => ir("#/login"));
  }
  if (ruta.startsWith("#/carrito")) {
    return CarritoView(() => ir("#/login"), () => ir("#/"));
  }
  if (ruta.startsWith("#/pedidos")) {
    if (!isLogged()) return LoginView(async () => { await refrescarUsuario(); ir("#/pedidos"); },
                                      () => ir("#/registro"));
    return PedidosView(() => ir("#/"));
  }
  if (ruta.startsWith("#/admin")) {
    if (!usuario || !usuario.es_admin) return CatalogoView();
    return AdminView();
  }
  return CatalogoView();
}

function pintar() {
  raiz.innerHTML = "";
  raiz.appendChild(cabecera());
  raiz.appendChild(vista());
}

window.addEventListener("hashchange", pintar);
// El contador del carrito se repinta solo cuando el carrito cambia, venga el
// cambio de la pantalla que venga.
alCambiar(() => {
  const cuenta = document.querySelector(".barra-top .cuenta");
  if (!cuenta) return;
  const n = unidades();
  cuenta.textContent = n ? String(n) : "";
  cuenta.hidden = !n;
});

refrescarUsuario().then(pintar);
'''
