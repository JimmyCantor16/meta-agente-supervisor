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
export async function borrar(id) { return req("api/registros/" + id, { method: "DELETE" }); }
export async function resumen() { return req("api/resumen"); }
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

export function dibujarCampos(contenedor) {
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
    if (c.tipo === "opcion") {
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
    return r'''// Panel principal: los cálculos, el formulario y la lista.
import { listar, crear, borrar, resumen } from "../api.js";
import { clearToken } from "../state.js";
import { dibujarCampos, leerCampos, limpiarCampos, pintarRegistro } from "../campos.js";

export function BoardView(onLogout) {
  const el = document.createElement("section");
  el.className = "card";
  el.innerHTML = `
    <div class="cab">
      <h1></h1>
      <button class="out ghost small">Salir</button>
    </div>
    <div class="resumen"></div>
    <form class="alta"></form>
    <p class="msg" role="status" aria-live="polite"></p>
    <ul class="lista"></ul>
    <p class="vacio"></p>`;

  el.querySelector("h1").textContent = window.__APP__.name;
  el.querySelector(".vacio").textContent =
    "Aún no hay " + window.__APP__.plural.toLowerCase() + ". Añade el primero arriba.";

  const form = el.querySelector(".alta");
  const lista = el.querySelector(".lista");
  const vacio = el.querySelector(".vacio");
  const cajaResumen = el.querySelector(".resumen");
  const msg = el.querySelector(".msg");

  dibujarCampos(form);
  const enviar = document.createElement("button");
  enviar.type = "submit";
  enviar.textContent = "Añadir " + window.__APP__.entidad.toLowerCase();
  enviar.style.marginTop = "1rem";
  form.appendChild(enviar);

  async function refrescar() {
    const r = await listar();
    if (r.status === 401) { clearToken(); onLogout(); return; }
    const registros = await r.json();
    lista.innerHTML = "";
    vacio.style.display = registros.length ? "none" : "block";
    for (const reg of registros) lista.appendChild(fila(reg, refrescar));

    // Los cálculos declarados en el dominio: lo que vuelve informativa la lista.
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

  el.querySelector(".out").onclick = () => { clearToken(); onLogout(); };
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const r = await crear(leerCampos(form));
    if (r.ok) {
      limpiarCampos(form);
      msg.textContent = "";
      msg.className = "msg";
      refrescar();
    } else {
      const d = await r.json().catch(() => ({}));
      // El motivo exacto del servidor: quien escribe debe saber qué corregir.
      msg.textContent = d.detail || "No se pudo guardar.";
      msg.className = "msg error";
    }
  };

  refrescar();
  return el;
}

function fila(reg, refrescar) {
  const li = document.createElement("li");
  li.className = "item";
  li.appendChild(pintarRegistro(reg));
  const del = document.createElement("button");
  del.className = "del";
  del.textContent = "✕";
  del.title = "Borrar";
  del.onclick = async () => { await borrar(reg.id); refrescar(); };
  li.appendChild(del);
  return li;
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
