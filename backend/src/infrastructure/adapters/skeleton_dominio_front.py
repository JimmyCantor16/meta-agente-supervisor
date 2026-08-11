"""Frontend de la aplicación generada: se dibuja A PARTIR DEL DOMINIO.

La clave está en `campos.js`: en vez de un formulario escrito a mano para una
entidad fija, el formulario se construye leyendo la descripción de los campos.
Un número se pide con un control numérico, una opción con un desplegable, una
fecha con un calendario. Eso es lo que hace que dos ideas distintas produzcan
dos aplicaciones distintas sin que el modelo escriba una línea de cableado.
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

export async function listar() { return req("api/registros"); }
export async function crear(datos) { return req("api/registros", { method: "POST", body: JSON.stringify(datos) }); }
// El backend siempre supo actualizar; hasta ahora nadie se lo pedia, asi que
// una errata obligaba a borrar el registro y volver a escribirlo entero.
export async function actualizar(id, datos) {
  return req("api/registros/" + id, { method: "PUT", body: JSON.stringify(datos) });
}
export async function borrar(id) { return req("api/registros/" + id, { method: "DELETE" }); }
export async function resumen() { return req("api/resumen"); }

// Quién soy (decide si se muestra el panel de administración) y los catálogos
// del negocio (alimentan los desplegables y el panel del admin).
export async function quienSoy() { return req("api/me"); }
export async function catalogos() { return req("api/catalogos"); }
export async function crearEnCatalogo(slug, datos) {
  return req("api/catalogos/" + slug, { method: "POST", body: JSON.stringify(datos) });
}
export async function borrarDeCatalogo(slug, id) {
  return req("api/catalogos/" + slug + "/" + id, { method: "DELETE" });
}
'''


def js_state() -> str:
    return r'''// Estado mínimo: el token de sesión, guardado en el navegador.
let token = localStorage.getItem("token") || "";

export function getToken() { return token; }
export function setToken(t) { token = t; localStorage.setItem("token", t); }
export function clearToken() { token = ""; localStorage.removeItem("token"); }
export function isLogged() { return Boolean(token); }
'''


def js_validacion() -> str:
    return r'''// Validación que corre ANTES de enviar nada al servidor.
// El servidor vuelve a validar siempre: esto es comodidad, no seguridad.

export const reglas = {
  usuario(v) {
    const s = (v || "").trim();
    if (!s) return "Escribe tu usuario.";
    if (s.length < 3) return "Al menos 3 caracteres.";
    if (s.length > 30) return "Como mucho 30 caracteres.";
    if (!/^[a-zA-Z0-9._-]+$/.test(s)) return "Solo letras, números, punto, guion y guion bajo.";
    return "";
  },
  clave(v) {
    const s = v || "";
    if (!s) return "Escribe una contraseña.";
    if (s.length < 8) return "Al menos 8 caracteres.";
    if (!/[a-zA-Z]/.test(s)) return "Debe llevar alguna letra.";
    if (!/[0-9]/.test(s)) return "Debe llevar algún número.";
    return "";
  },
  claveDeEntrada(v) {
    // Al entrar no se re-exige la política: la cuenta puede ser antigua. Solo
    // que no vaya vacía, para no gastar un viaje al servidor por nada.
    return (v || "") ? "" : "Escribe tu contraseña.";
  },
  repetir(v, original) {
    if (!(v || "")) return "Repite la contraseña.";
    if (v !== original) return "Las dos contraseñas no coinciden.";
    return "";
  },
};

/**
 * Enlaza un input con su hueco de error.
 *
 * El error se muestra PEGADO AL CAMPO que lo causa, no en un aviso global: así
 * el usuario ve cuál de los tres campos tiene que arreglar. Y no se le regaña
 * mientras escribe la primera vez — solo al salir del campo o al intentar
 * enviar — porque marcar en rojo desde la primera letra es hostil.
 */
export function campo(raiz, clase, validar, alCambiar) {
  const input = raiz.querySelector("." + clase);
  const hueco = raiz.querySelector("." + clase + "-error");
  let tocado = false;

  function pintar(forzar) {
    const error = validar(input.value);
    const visible = (tocado || forzar) ? error : "";
    hueco.textContent = visible;
    input.setAttribute("aria-invalid", visible ? "true" : "false");
    input.classList.toggle("malo", Boolean(visible));
    return error;
  }

  input.addEventListener("blur", () => { tocado = true; pintar(false); });
  input.addEventListener("input", () => { if (tocado) pintar(false); alCambiar(); });
  return {
    get valor() { return input.value; },
    get valido() { return !validar(input.value); },
    revisar: () => { tocado = true; return pintar(true); },
    // Repinta sin marcar como tocado. Lo necesita el campo "repite la
    // contraseña": si cambias la de arriba, su error debe actualizarse solo.
    refrescar: () => pintar(false),
    foco: () => input.focus(),
  };
}

/** Deshabilita el botón mientras el formulario no sea válido. */
export function gobernar(boton, campos) {
  const repintar = () => { boton.disabled = !campos.every((c) => c.valido); };
  repintar();
  return repintar;
}
'''


def js_login() -> str:
    return r'''// PANTALLA DE ENTRAR. El registro vive en su propia pantalla (registro.js).
import { login } from "../api.js";
import { setToken } from "../state.js";
import { reglas, campo, gobernar } from "../validacion.js";

export function LoginView(onLogged, irARegistro) {
  const el = document.createElement("section");
  el.className = "card";
  // Los campos van dentro de un <form> de verdad: así el Enter envía y los
  // gestores de contraseñas del navegador ofrecen guardar y autocompletar.
  el.innerHTML = `
    <h1></h1>
    <p class="sub">Entra con tu cuenta para continuar.</p>
    <form class="entrar" novalidate>
      <label for="u">Usuario</label>
      <input id="u" class="u" name="username" autocomplete="username" aria-describedby="u-err">
      <p class="u-error error-campo" id="u-err" role="alert"></p>
      <label for="p">Contraseña</label>
      <input id="p" class="p" name="password" type="password" autocomplete="current-password" aria-describedby="p-err">
      <p class="p-error error-campo" id="p-err" role="alert"></p>
      <div class="row">
        <button class="in" type="submit" disabled>Entrar</button>
      </div>
    </form>
    <p class="msg" role="status" aria-live="polite"></p>
    <p class="ayuda">¿No tienes cuenta?
      <a href="#/registro" class="ir-registro">Crea una aquí</a>.</p>
    <div class="mirar"></div>`;

  el.querySelector("h1").textContent = window.__APP__.name;

  const msg = el.querySelector(".msg");
  const boton = el.querySelector(".in");
  const cu = campo(el, "u", reglas.usuario, () => repintar());
  const cp = campo(el, "p", reglas.claveDeEntrada, () => repintar());
  const repintar = gobernar(boton, [cu, cp]);

  el.querySelector(".ir-registro").onclick = (e) => { e.preventDefault(); irARegistro(); };

  el.querySelector("form.entrar").onsubmit = async (e) => {
    e.preventDefault();
    if (cu.revisar() || cp.revisar()) return;
    boton.disabled = true;
    msg.textContent = "Entrando…";
    msg.className = "msg";
    try {
      const r = await login(cu.valor.trim(), cp.valor);
      if (r.ok) { setToken((await r.json()).access_token); onLogged(); return; }
      msg.textContent = "Usuario o contraseña incorrectos.";
      msg.className = "msg error";
    } catch (_) {
      msg.textContent = "No se pudo conectar. Revisa tu conexión.";
      msg.className = "msg error";
    }
    boton.disabled = false;
  };

  // Modo visita. Es lo que permite ENSEÑAR el sistema: quien recibe el enlace
  // entra en un clic, con datos dentro, y entiende de qué va antes de decidir
  // si se registra. Sin esto, un desconocido choca contra un formulario y se va.
  const demo = window.__APP__.demo;
  if (demo && demo.usuario) {
    const caja = el.querySelector(".mirar");
    caja.innerHTML = `
      <hr>
      <p class="ayuda">¿Solo quieres mirar? Entra a la cuenta de ejemplo, que ya
      tiene ${window.__APP__.plural.toLowerCase()} dentro. Lo que crees ahí no se
      mezcla con tu cuenta.</p>
      <button class="ver ghost">Ver una demostración</button>`;
    caja.querySelector(".ver").onclick = async () => {
      msg.textContent = "Entrando a la demostración…";
      msg.className = "msg";
      const r = await login(demo.usuario, demo.clave);
      if (r.ok) { setToken((await r.json()).access_token); onLogged(); }
      else { msg.textContent = "La demostración no está disponible."; msg.className = "msg error"; }
    };
  }
  return el;
}
'''


def js_registro() -> str:
    return r'''// PANTALLA DE CREAR CUENTA. Separada de la de entrar (login.js).
import { register } from "../api.js";
import { reglas, campo, gobernar } from "../validacion.js";

export function RegistroView(onRegistrado, irALogin) {
  const el = document.createElement("section");
  el.className = "card";
  // Igual que en la pantalla de entrar: <form> real, para que el Enter envíe y
  // el gestor de contraseñas ofrezca guardar la cuenta recién creada.
  el.innerHTML = `
    <h1>Crear cuenta</h1>
    <p class="sub"></p>
    <form class="alta-cuenta" novalidate>
      <label for="ru">Usuario</label>
      <input id="ru" class="u" name="username" autocomplete="username" aria-describedby="ru-err">
      <p class="u-error error-campo" id="ru-err" role="alert"></p>
      <label for="rp">Contraseña</label>
      <input id="rp" class="p" name="new-password" type="password" autocomplete="new-password" aria-describedby="rp-err">
      <p class="p-error error-campo" id="rp-err" role="alert"></p>
      <label for="rr">Repite la contraseña</label>
      <input id="rr" class="r" name="confirm-password" type="password" autocomplete="new-password" aria-describedby="rr-err">
      <p class="r-error error-campo" id="rr-err" role="alert"></p>
      <p class="ayuda">Usuario: 3 caracteres o más. Contraseña: 8 o más, con letras y números.</p>
      <div class="row">
        <button class="up" type="submit" disabled>Crear mi cuenta</button>
      </div>
    </form>
    <p class="msg" role="status" aria-live="polite"></p>
    <p class="ayuda">¿Ya tienes cuenta? <a href="#/login" class="ir-login">Entra aquí</a>.</p>`;

  el.querySelector(".sub").textContent =
    "Regístrate para gestionar tus " + window.__APP__.plural.toLowerCase() + ".";

  const msg = el.querySelector(".msg");
  const boton = el.querySelector(".up");
  const cu = campo(el, "u", reglas.usuario, () => repintar());
  // Al cambiar la contraseña hay que refrescar la de confirmación: si no, se
  // queda diciendo "no coinciden" cuando ya coinciden.
  const cp = campo(el, "p", reglas.clave, () => { cr.refrescar(); repintar(); });
  const cr = campo(el, "r", (v) => reglas.repetir(v, cp.valor), () => repintar());
  const repintar = gobernar(boton, [cu, cp, cr]);

  el.querySelector(".ir-login").onclick = (e) => { e.preventDefault(); irALogin(); };

  el.querySelector("form.alta-cuenta").onsubmit = async (e) => {
    e.preventDefault();
    // Se revisan los tres a la vez para que el usuario vea TODO lo que falta,
    // no un error, lo arregle, y descubra el siguiente.
    const errores = [cu.revisar(), cp.revisar(), cr.revisar()].filter(Boolean);
    if (errores.length) return;
    boton.disabled = true;
    msg.textContent = "Creando tu cuenta…";
    msg.className = "msg";
    try {
      const r = await register(cu.valor.trim(), cp.valor);
      if (r.ok) {
        msg.textContent = "Cuenta creada. Te llevamos a entrar…";
        msg.className = "msg ok";
        setTimeout(() => onRegistrado(cu.valor.trim()), 900);
        return;
      }
      const d = await r.json().catch(() => ({}));
      msg.textContent = d.detail || "No se pudo crear la cuenta.";
      msg.className = "msg error";
    } catch (_) {
      msg.textContent = "No se pudo conectar. Revisa tu conexión.";
      msg.className = "msg error";
    }
    boton.disabled = false;
  };
  return el;
}
'''


def js_campos() -> str:
    return r'''// Construye y lee el formulario a partir de los campos del dominio.
// Cada tipo tiene su control: un número no se pide con una caja de texto.

export function dibujarCampos(contenedor, itemsCatalogos) {
  itemsCatalogos = itemsCatalogos || {};
  for (const c of window.__CAMPOS__) {
    const id = "f_" + c.nombre;
    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.textContent = c.etiqueta;
    if (c.obligatorio) {
      const req = document.createElement("span");
      req.className = "req";
      req.textContent = " *";
      label.appendChild(req);
    }
    contenedor.appendChild(label);

    let control;
    if (c.tipo === "relacion") {
      // Un desplegable con los ítems REALES del catálogo (los barberos que la
      // dueña dio de alta), no una caja de texto libre.
      control = document.createElement("select");
      const vacia = document.createElement("option");
      vacia.value = "";
      vacia.textContent = "Elige...";
      control.appendChild(vacia);
      const def = (window.__CATALOGOS__ || []).find((k) => k.slug === c.catalogo) || {};
      const visible = def.visible || "nombre";
      for (const item of itemsCatalogos[c.catalogo] || []) {
        const op = document.createElement("option");
        op.value = String(item[visible] ?? "");
        op.textContent = String(item[visible] ?? "");
        control.appendChild(op);
      }
    } else if (c.tipo === "opcion") {
      control = document.createElement("select");
      const vacia = document.createElement("option");
      vacia.value = "";
      vacia.textContent = "Elige...";
      control.appendChild(vacia);
      for (const o of c.opciones) {
        const op = document.createElement("option");
        op.value = o;
        op.textContent = o;
        control.appendChild(op);
      }
    } else if (c.tipo === "texto_largo") {
      control = document.createElement("textarea");
    } else {
      control = document.createElement("input");
      if (c.tipo === "entero") { control.type = "number"; control.step = "1"; }
      else if (c.tipo === "decimal") { control.type = "number"; control.step = "any"; }
      else if (c.tipo === "fecha") { control.type = "date"; }
      else if (c.tipo === "booleano") { control.type = "checkbox"; }
      else { control.type = "text"; }
      if (c.minimo !== null && c.minimo !== undefined) control.min = c.minimo;
      if (c.maximo !== null && c.maximo !== undefined) control.max = c.maximo;
    }
    control.id = id;
    control.dataset.campo = c.nombre;
    control.dataset.tipo = c.tipo;
    if (c.obligatorio && c.tipo !== "booleano") control.required = true;
    contenedor.appendChild(control);

    if (c.ayuda) {
      const p = document.createElement("p");
      p.className = "ayuda";
      p.textContent = c.ayuda;
      contenedor.appendChild(p);
    }
  }
}

/** Recoge lo escrito, ya convertido al tipo que espera el servidor. */
export function leerCampos(contenedor) {
  const datos = {};
  for (const el of contenedor.querySelectorAll("[data-campo]")) {
    const tipo = el.dataset.tipo;
    if (tipo === "booleano") datos[el.dataset.campo] = el.checked;
    else if (tipo === "entero" || tipo === "decimal")
      datos[el.dataset.campo] = el.value === "" ? null : Number(el.value);
    else datos[el.dataset.campo] = el.value;
  }
  return datos;
}

export function limpiarCampos(contenedor) {
  for (const el of contenedor.querySelectorAll("[data-campo]")) {
    if (el.dataset.tipo === "booleano") el.checked = false;
    else el.value = "";
  }
}

/** Vuelca un registro EN el formulario. Es lo que hace posible editar. */
export function escribirCampos(contenedor, registro) {
  for (const el of contenedor.querySelectorAll("[data-campo]")) {
    const valor = registro[el.dataset.campo];
    if (el.dataset.tipo === "booleano") el.checked = Boolean(valor);
    else el.value = valor === null || valor === undefined ? "" : String(valor);
  }
}

/**
 * Como se MUESTRA el valor de un campo.
 *
 * Vive aqui y no en la tabla para que la celda, la ficha del movil y el indice
 * de busqueda digan exactamente lo mismo: si la tabla mostrara "Si" y el indice
 * guardara "true", buscar "si" no encontraria la fila que lo dice en pantalla.
 */
export function textoDeCampo(campo, valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (campo.tipo === "booleano") return valor ? "Sí" : "No";
  if (campo.tipo === "entero" || campo.tipo === "decimal") {
    return Number(valor).toLocaleString("es");
  }
  return String(valor);
}

/** Pinta un registro mostrando cada campo con su etiqueta. */
export function pintarRegistro(r) {
  const datos = document.createElement("div");
  datos.className = "datos";
  for (const c of window.__CAMPOS__) {
    const valor = r[c.nombre];
    if (valor === null || valor === undefined || valor === "") continue;
    const par = document.createElement("p");
    par.className = "par";
    const et = document.createElement("b");
    et.textContent = c.etiqueta;
    const v = document.createElement("span");
    if (c.tipo === "booleano") v.textContent = valor ? "Si" : "No";
    else v.textContent = String(valor);
    if (c.tipo === "entero" || c.tipo === "decimal") v.className = "num";
    par.append(et, v);
    datos.appendChild(par);
  }
  return datos;
}
'''


def js_board() -> str:
    return r'''// El panel: armazon de aplicacion con secciones, tabla y hoja lateral.
//
// Por que asi, y no la pila de antes (formulario arriba, lista al final):
// quien entra viene a MIRAR sus registros, no a crear uno. La lista manda; el
// alta se pide en una hoja lateral cuando hace falta. Antes el primer registro
// empezaba en el pixel 1472, debajo de dos catalogos y siete campos.
import {
  listar, crear, actualizar, borrar, resumen,
  quienSoy, catalogos, crearEnCatalogo, borrarDeCatalogo,
} from "../api.js";
import { clearToken } from "../state.js";
import { dibujarCampos, leerCampos, limpiarCampos, escribirCampos, textoDeCampo } from "../campos.js";

const ICONOS = {
  lupa: 'M11 4a7 7 0 1 0 4.19 12.6l3.1 3.1 1.42-1.42-3.1-3.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  editar: 'M4 16.5V20h3.5l9.4-9.4-3.5-3.5L4 16.5Zm15.7-9.6a1 1 0 0 0 0-1.4l-2.2-2.2a1 1 0 0 0-1.4 0l-1.7 1.7 3.5 3.5 1.8-1.6Z',
  borrar: 'M6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Zm3-3h6l1 2h3v2H5V6h3l1-2Z',
};

function icono(d, clase, titulo) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = clase;
  b.title = titulo;
  b.setAttribute("aria-label", titulo);
  b.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
  return b;
}

/** Sin tildes y en minusculas: en espanol, "peluqueria" DEBE encontrar "Peluquería". */
function plano(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function BoardView(onLogout) {
  const el = document.createElement("section");
  const A = window.__APP__;
  const CAMPOS = window.__CAMPOS__ || [];
  const CATS = window.__CATALOGOS__ || [];
  const plural = A.plural.toLowerCase();
  const singular = A.entidad.toLowerCase();

  el.className = "app";
  el.innerHTML = `
    <header class="barra">
      <div class="marca">
        <span class="logo" aria-hidden="true"></span>
        <h1></h1>
      </div>
      <span class="rol"></span>
      <button class="out ghost small" type="button">Salir</button>
    </header>
    <nav class="nav" aria-label="Secciones">
      <button class="nav-b" type="button" data-ir="lista" aria-current="page"></button>
      <button class="nav-b" type="button" data-ir="catalogos" hidden>Administración</button>
    </nav>
    <div class="lienzo">
      <section class="seccion sec-lista">
        <div class="resumen"></div>
        <div class="herramientas">
          <label class="buscar">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${ICONOS.lupa}"/></svg>
            <input type="search" class="q" placeholder="Buscar…" aria-label="Buscar">
          </label>
          <span class="cuenta" role="status" aria-live="polite"></span>
          <span class="crece"></span>
          <button class="nuevo" type="button"></button>
        </div>
        <div class="tabla-caja"><table class="tabla"><thead></thead><tbody></tbody></table></div>
        <div class="vacio"><h3></h3><p></p><button class="vacio-nuevo" type="button"></button></div>
      </section>
      <section class="seccion sec-catalogos" hidden></section>
    </div>
    <p class="msg" role="status" aria-live="polite"></p>`;

  el.querySelector("h1").textContent = A.name;
  el.querySelector(".logo").textContent = (A.name.trim()[0] || "A").toUpperCase();
  el.querySelector('[data-ir="lista"]').textContent = A.plural;
  el.querySelector(".nuevo").textContent = "Añadir " + singular;
  el.querySelector(".vacio-nuevo").textContent = "Añadir " + singular;

  const q = el.querySelector(".q");
  const cuenta = el.querySelector(".cuenta");
  const thead = el.querySelector(".tabla thead");
  const tbody = el.querySelector(".tabla tbody");
  const cajaTabla = el.querySelector(".tabla-caja");
  const vacio = el.querySelector(".vacio");
  const cajaResumen = el.querySelector(".resumen");
  const cajaCat = el.querySelector(".sec-catalogos");
  const msg = el.querySelector(".msg");

  let yo = { es_admin: false };
  let items = {};
  let registros = [];
  let orden = { campo: null, asc: true };

  // --- Hoja lateral: crear y EDITAR --------------------------------------
  // El backend generado siempre supo actualizar (PUT /api/registros/<id>) y el
  // panel nunca se lo pedia: se podia crear y borrar, pero no corregir una
  // errata sin borrar y volver a escribirlo todo.
  const velo = document.createElement("div");
  velo.className = "velo";
  const hoja = document.createElement("aside");
  hoja.className = "hoja";
  hoja.setAttribute("role", "dialog");
  hoja.setAttribute("aria-modal", "true");
  hoja.innerHTML = `
    <div class="hoja-cab">
      <h2></h2>
      <button class="cerrar ghost small" type="button" aria-label="Cerrar">✕</button>
    </div>
    <div class="hoja-cuerpo"><form class="alta"></form></div>`;
  const form = hoja.querySelector("form.alta");
  const tituloHoja = hoja.querySelector(".hoja-cab h2");
  let editando = null;

  function abrirHoja(registro) {
    editando = registro || null;
    tituloHoja.textContent = registro ? "Editar " + singular : "Nuevo " + singular;
    limpiarCampos(form);
    if (registro) escribirCampos(form, registro);
    velo.classList.add("abierto");
    hoja.classList.add("abierta");
    const primero = form.querySelector("[data-campo]");
    if (primero) primero.focus();
  }
  function cerrarHoja() {
    velo.classList.remove("abierto");
    hoja.classList.remove("abierta");
    editando = null;
  }
  velo.onclick = cerrarHoja;
  hoja.querySelector(".cerrar").onclick = cerrarHoja;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && hoja.classList.contains("abierta")) cerrarHoja();
  });
  el.querySelector(".nuevo").onclick = () => abrirHoja(null);
  el.querySelector(".vacio-nuevo").onclick = () => abrirHoja(null);

  // --- Secciones ----------------------------------------------------------
  function ir(seccion) {
    for (const b of el.querySelectorAll(".nav-b")) {
      const suya = b.dataset.ir === seccion;
      if (suya) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    el.querySelector(".sec-lista").hidden = seccion !== "lista";
    cajaCat.hidden = seccion !== "catalogos";
  }
  for (const b of el.querySelectorAll(".nav-b")) b.onclick = () => ir(b.dataset.ir);

  // --- Arranque -----------------------------------------------------------
  async function armar() {
    const rMe = await quienSoy();
    if (rMe.status === 401) { clearToken(); onLogout(); return; }
    if (rMe.ok) yo = await rMe.json();
    const rCat = await catalogos();
    if (rCat.ok) items = itemsPorNombre(await rCat.json());

    if (yo.es_admin) {
      const rol = el.querySelector(".rol");
      rol.textContent = "Administración";
      rol.className = "rol badge";
    }
    // La pestana de administracion solo existe si hay catalogos que administrar.
    el.querySelector('[data-ir="catalogos"]').hidden = !(yo.es_admin && CATS.length);

    form.innerHTML = "";
    dibujarCampos(form, items);
    const enviar = document.createElement("button");
    enviar.type = "submit";
    enviar.textContent = "Guardar";
    enviar.style.marginTop = "1.2rem";
    form.appendChild(enviar);

    pintarCabecera();
    pintarAdmin();
    await refrescar();
  }

  function itemsPorNombre(porSlug) {
    const salida = {};
    for (const def of CATS) {
      salida[def.nombre] = porSlug[def.slug] || [];
      salida[def.slug] = porSlug[def.slug] || [];
    }
    return salida;
  }

  // --- Tabla --------------------------------------------------------------
  function columnas() {
    const cols = CAMPOS.map((c) => ({ ...c, clave: c.nombre }));
    if (yo.es_admin) cols.unshift({ clave: "dueno", etiqueta: "De", tipo: "texto" });
    return cols;
  }

  function pintarCabecera() {
    const tr = document.createElement("tr");
    for (const c of columnas()) {
      const th = document.createElement("th");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c.etiqueta;
      b.onclick = () => {
        orden = { campo: c.clave, asc: orden.campo === c.clave ? !orden.asc : true };
        pintarFilas();
        pintarCabecera();
      };
      if (orden.campo === c.clave) {
        const f = document.createElement("span");
        f.textContent = orden.asc ? "▲" : "▼";
        b.appendChild(f);
        th.setAttribute("aria-sort", orden.asc ? "ascending" : "descending");
      }
      if (c.tipo === "entero" || c.tipo === "decimal") th.className = "num";
      th.appendChild(b);
      tr.appendChild(th);
    }
    const acc = document.createElement("th");
    acc.className = "acc";
    acc.innerHTML = '<span class="visualmente-oculto"></span>';
    tr.appendChild(acc);
    thead.innerHTML = "";
    thead.appendChild(tr);
  }

  function pintarFilas() {
    const busca = plano(q.value.trim());
    // El indice se calcula UNA vez por registro (al recibirlos), no en cada
    // pulsacion: con 200 registros y 9 columnas eran 1.800 normalizaciones por
    // tecla.
    let vistos = registros.filter((r) => !busca || r.__txt.includes(busca));

    if (orden.campo) {
      const dir = orden.asc ? 1 : -1;
      vistos = [...vistos].sort((a, b) => {
        const x = a[orden.campo], y = b[orden.campo];
        if (x === y) return 0;
        if (x === null || x === undefined || x === "") return 1;
        if (y === null || y === undefined || y === "") return -1;
        if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
        return String(x).localeCompare(String(y), "es", { numeric: true }) * dir;
      });
    }

    tbody.innerHTML = "";
    for (const r of vistos) tbody.appendChild(fila(r));

    const hayRegistros = registros.length > 0;
    const hayVistos = vistos.length > 0;
    cajaTabla.hidden = !hayVistos;
    vacio.hidden = hayVistos;
    if (!hayVistos) {
      // Dos vacios distintos: "aun no hay nada" invita a crear; "no coincide"
      // invita a borrar el filtro. Confundirlos deja al usuario atascado.
      const h3 = vacio.querySelector("h3"), p = vacio.querySelector("p");
      const btn = vacio.querySelector(".vacio-nuevo");
      if (hayRegistros) {
        h3.textContent = "Sin coincidencias";
        p.textContent = 'Nada encuentra «' + q.value.trim() + '».';
        btn.textContent = "Quitar la búsqueda";
        btn.onclick = () => { q.value = ""; pintarFilas(); };
      } else {
        h3.textContent = "Aún no hay " + plural;
        p.textContent = "Añade el primero y aparecerá aquí.";
        btn.textContent = "Añadir " + singular;
        btn.onclick = () => abrirHoja(null);
      }
    }
    cuenta.textContent = busca
      ? vistos.length + " de " + registros.length
      : registros.length + " " + (registros.length === 1 ? singular : plural);
  }

  function fila(r) {
    const tr = document.createElement("tr");
    for (const c of columnas()) {
      const td = document.createElement("td");
      td.dataset.col = c.etiqueta;
      if (c.clave === "dueno") {
        if (r.dueno) {
          const s = document.createElement("span");
          s.className = "dueno";
          s.textContent = r.dueno;
          td.appendChild(s);
        }
      } else {
        td.textContent = textoDeCampo(c, r[c.clave]);
        if (c.tipo === "entero" || c.tipo === "decimal") td.className = "num";
      }
      tr.appendChild(td);
    }
    const acc = document.createElement("td");
    acc.className = "acc";
    acc.dataset.col = "";
    const bEditar = icono(ICONOS.editar, "icono", "Editar");
    bEditar.onclick = () => abrirHoja(r);
    const bBorrar = icono(ICONOS.borrar, "icono borrar", "Borrar");
    bBorrar.onclick = async () => {
      const res = await borrar(r.id);
      if (res.ok) refrescar();
    };
    acc.append(bEditar, bBorrar);
    tr.appendChild(acc);
    return tr;
  }

  // --- Administracion de catalogos ---------------------------------------
  function pintarAdmin() {
    cajaCat.innerHTML = "";
    if (!yo.es_admin || !CATS.length) return;
    for (const def of CATS) {
      const bloque = document.createElement("div");
      bloque.className = "cat";
      const titulo = document.createElement("h2");
      titulo.textContent = def.plural;
      bloque.appendChild(titulo);

      const ul = document.createElement("ul");
      ul.className = "cat-lista";
      for (const item of items[def.slug] || []) {
        const li = document.createElement("li");
        const texto = document.createElement("span");
        texto.textContent = def.campos
          .map((c) => item[c.nombre])
          .filter((v) => v !== null && v !== undefined && v !== "")
          .join(" · ");
        const quitar = icono(ICONOS.borrar, "icono borrar", "Quitar de " + def.plural.toLowerCase());
        quitar.onclick = async () => {
          const r = await borrarDeCatalogo(def.slug, item.id);
          if (r.ok) armar();
        };
        li.append(texto, quitar);
        ul.appendChild(li);
      }
      bloque.appendChild(ul);

      const alta = document.createElement("form");
      alta.className = "cat-alta";
      for (const c of def.campos) {
        const input = document.createElement("input");
        input.placeholder = c.etiqueta + (c.obligatorio ? " *" : "");
        input.dataset.campo = c.nombre;
        input.setAttribute("aria-label", c.etiqueta);
        if (c.tipo === "entero" || c.tipo === "decimal") {
          input.type = "number";
          input.step = c.tipo === "entero" ? "1" : "any";
        }
        alta.appendChild(input);
      }
      const anadir = document.createElement("button");
      anadir.type = "submit";
      anadir.className = "small";
      anadir.textContent = "Añadir";
      alta.appendChild(anadir);
      alta.onsubmit = async (ev) => {
        ev.preventDefault();
        const datos = {};
        for (const input of alta.querySelectorAll("[data-campo]")) {
          datos[input.dataset.campo] = input.type === "number"
            ? (input.value === "" ? null : Number(input.value))
            : input.value;
        }
        const r = await crearEnCatalogo(def.slug, datos);
        if (r.ok) { armar(); return; }
        const d = await r.json().catch(() => ({}));
        aviso(d.detail || "No se pudo añadir.", true);
      };
      bloque.appendChild(alta);
      cajaCat.appendChild(bloque);
    }
  }

  function aviso(texto, malo) {
    msg.textContent = texto;
    msg.className = malo ? "msg error" : "msg ok";
  }

  async function refrescar() {
    const r = await listar();
    if (r.status === 401) { clearToken(); onLogout(); return; }
    registros = (await r.json()).map((reg) => ({
      ...reg,
      // Indice de busqueda precalculado, sobre TODO lo que se muestra: buscar
      // por algo que no se ve en ninguna columna seria desconcertante.
      __txt: plano(columnas().map((c) => textoDeCampo(c, reg[c.clave])).join(" ")),
    }));
    pintarFilas();

    const rs = await resumen();
    if (rs.ok) {
      const datos = await rs.json();
      cajaResumen.innerHTML = "";
      for (const clave of Object.keys(datos)) {
        const valor = datos[clave];
        const d = document.createElement("div");
        d.className = "dato";
        const v = document.createElement("div");
        v.className = "v";
        v.textContent = typeof valor === "number" ? valor.toLocaleString("es") : String(valor);
        const e = document.createElement("div");
        e.className = "e";
        e.textContent = clave;
        d.append(v, e);
        cajaResumen.appendChild(d);
      }
    }
  }

  q.oninput = () => pintarFilas();
  el.querySelector(".out").onclick = () => { clearToken(); onLogout(); };

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const datos = leerCampos(form);
    const r = editando ? await actualizar(editando.id, datos) : await crear(datos);
    if (r.ok) {
      cerrarHoja();
      aviso(editando ? "Cambio guardado." : "Añadido.", false);
      refrescar();
    } else {
      const d = await r.json().catch(() => ({}));
      // El motivo exacto del servidor: quien escribe debe saber que corregir.
      aviso(d.detail || "No se pudo guardar.", true);
    }
  };

  // El velo y la hoja viven FUERA del panel (position:fixed): dentro, el
  // `overflow:hidden` del marco los recortaria.
  document.body.append(velo, hoja);
  el.addEventListener("DOMNodeRemovedFromDocument", () => { velo.remove(); hoja.remove(); });

  armar();
  return el;
}
'''

def js_app() -> str:
    return r'''// Entrada y enrutador. Entrar y registrarse son DOS pantallas distintas,
// cada una con su dirección (#/login y #/registro), para que se pueda enlazar
// y compartir cada una por separado y el botón "atrás" del navegador funcione.
import { LoginView } from "./components/login.js";
import { RegistroView } from "./components/registro.js";
import { BoardView } from "./components/board.js";
import { isLogged } from "./state.js";

const root = document.getElementById("app");

function ir(ruta) {
  if (location.hash === ruta) render();
  else location.hash = ruta;
}

function render() {
  root.innerHTML = "";
  if (isLogged()) {
    root.appendChild(BoardView(render));
    return;
  }
  if (location.hash === "#/registro") {
    root.appendChild(RegistroView(() => ir("#/login"), () => ir("#/login")));
  } else {
    root.appendChild(LoginView(() => ir("#/"), () => ir("#/registro")));
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", render);
render();
'''
