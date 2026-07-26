/* SPA del Núcleo Meta-Agente: una sola app, cualquier dominio.
   Lee el esquema de /api/_meta y construye pantallas CRUD, tienda,
   reservas y quiz en runtime. Sin frameworks, sin build. */
(function () {
  'use strict';

  var META = null;
  var raiz = document.getElementById('app');

  /* ================= sesión ================= */
  function sesion() {
    try { return JSON.parse(localStorage.getItem('sesion')) || null; } catch (e) { return null; }
  }
  function guardarSesion(s) {
    if (s) localStorage.setItem('sesion', JSON.stringify(s));
    else localStorage.removeItem('sesion');
  }
  function esAdmin() { var s = sesion(); return !!(s && s.usuario && s.usuario.rol === 'admin'); }

  async function api(ruta, opciones) {
    opciones = opciones || {};
    opciones.headers = Object.assign({ 'Content-Type': 'application/json' }, opciones.headers || {});
    var s = sesion();
    if (s && s.token) opciones.headers.Authorization = 'Bearer ' + s.token;
    if (opciones.cuerpo !== undefined) {
      opciones.body = JSON.stringify(opciones.cuerpo);
      delete opciones.cuerpo;
    }
    var r = await fetch('/api' + ruta, opciones);
    var datos = null;
    try { datos = await r.json(); } catch (e) { /* sin cuerpo */ }
    if (r.status === 401 && sesion()) {
      guardarSesion(null);
      toast('Tu sesión expiró. Entra de nuevo.', true);
      ir('#/entrar');
      throw new Error('sesion expirada');
    }
    if (!r.ok) throw new Error((datos && datos.error) || 'Algo salió mal. Intenta de nuevo.');
    return datos;
  }

  /* ================= utilidades UI ================= */
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(mensaje, mal) {
    var caja = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast' + (mal ? ' mal' : '');
    el.textContent = mensaje;
    caja.appendChild(el);
    setTimeout(function () { el.remove(); }, 3800);
  }
  function modal(html) {
    var velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    velo.addEventListener('click', function (e) { if (e.target === velo) velo.remove(); });
    document.body.appendChild(velo);
    return velo;
  }
  function moneda(v) { return (META.moneda || '$') + (Math.round(Number(v) * 100) / 100); }
  function ir(hash) { location.hash = hash; }

  /* ================= carrito (tienda) ================= */
  function carrito() {
    try { return JSON.parse(localStorage.getItem('carrito')) || []; } catch (e) { return []; }
  }
  function guardarCarrito(c) { localStorage.setItem('carrito', JSON.stringify(c)); }
  function agregarAlCarrito(item) {
    var c = carrito();
    var ya = c.find(function (x) { return x.id === item.id; });
    if (ya) ya.cantidad += 1; else c.push({ id: item.id, nombre: item.nombre, precio: item.precio, cantidad: 1 });
    guardarCarrito(c);
    toast('Añadido: ' + item.nombre + ' 🛒');
    pintarBurbujaCarrito();
  }
  function pintarBurbujaCarrito() {
    var n = carrito().reduce(function (a, x) { return a + x.cantidad; }, 0);
    var b = document.getElementById('burbuja-carrito');
    if (b) b.textContent = n;
  }

  /* ================= vistas públicas ================= */
  function vistaHero() {
    var m = META;
    var s = sesion();
    var acciones = '';
    if (m.modulos && m.modulos.tienda) acciones += '<a class="btn btn-primario" href="#/tienda">Ver el catálogo 🛍️</a>';
    if (m.modulos && m.modulos.quiz) acciones += '<a class="btn btn-primario" href="#/quiz">¡A jugar! 🎮</a>';
    if (m.modulos && m.modulos.reservas) acciones += '<a class="btn btn-primario" href="#/reservar">Reservar ahora 📅</a>';
    if (m.modulos && m.modulos.blog) acciones += '<a class="btn btn-primario" href="#/blog">Leer publicaciones 📰</a>';
    acciones += s
      ? '<a class="btn btn-suave" href="#/app">Entrar al panel →</a>'
      : '<a class="btn btn-suave" href="#/entrar">Iniciar sesión</a>';
    raiz.innerHTML =
      '<div class="publico"><section class="hero"><div class="hero-inner animar">' +
      '<img class="hero-logo" src="logo.svg" alt="">' +
      '<h1>' + esc(m.nombre) + '</h1>' +
      '<p>' + esc(m.descripcion) + '</p>' +
      '<div class="hero-acciones">' + acciones + '</div>' +
      '</div></section></div>';
  }

  function vistaAuth(modo) {
    var esRegistro = modo === 'registro';
    raiz.innerHTML =
      '<div class="auth"><form class="tarjeta-auth animar" id="form-auth">' +
      '<h1>' + (esRegistro ? '¡Crea tu cuenta! ✨' : '¡Hola de nuevo! 👋') + '</h1>' +
      '<p class="sub">' + esc(META.nombre) + '</p>' +
      '<div id="auth-error"></div>' +
      (esRegistro ? '<div class="campo"><label for="a-nombre">Tu nombre</label><input id="a-nombre" required autocomplete="name"></div>' : '') +
      '<div class="campo"><label for="a-email">Correo</label><input id="a-email" type="email" required autocomplete="email"></div>' +
      '<div class="campo"><label for="a-pass">Contraseña</label><input id="a-pass" type="password" required autocomplete="' + (esRegistro ? 'new-password' : 'current-password') + '"></div>' +
      '<button class="btn btn-primario" type="submit">' + (esRegistro ? 'Crear cuenta' : 'Entrar') + '</button>' +
      '<button class="enlace" type="button" id="auth-cambiar">' +
      (esRegistro ? '¿Ya tienes cuenta? Entra aquí' : '¿Primera vez? Crea tu cuenta') + '</button>' +
      '<a class="enlace" style="text-align:center" href="#/">← Volver al inicio</a>' +
      '</form></div>';

    document.getElementById('auth-cambiar').onclick = function () {
      ir(esRegistro ? '#/entrar' : '#/registro');
    };
    document.getElementById('form-auth').onsubmit = async function (e) {
      e.preventDefault();
      var caja = document.getElementById('auth-error');
      caja.innerHTML = '';
      var boton = this.querySelector('button[type=submit]');
      boton.disabled = true; boton.textContent = 'Un momento…';
      try {
        var cuerpo = {
          email: document.getElementById('a-email').value.trim(),
          password: document.getElementById('a-pass').value,
        };
        if (esRegistro) cuerpo.nombre = document.getElementById('a-nombre').value.trim();
        var r = await api(esRegistro ? '/auth/registro' : '/auth/login', { method: 'POST', cuerpo: cuerpo });
        guardarSesion({ token: r.token, usuario: r.usuario });
        toast('¡Bienvenido, ' + r.usuario.nombre + '! 🎉');
        ir('#/app');
      } catch (err) {
        caja.innerHTML = '<div class="error-caja">😅 ' + esc(err.message) + '</div>';
        boton.disabled = false; boton.textContent = esRegistro ? 'Crear cuenta' : 'Entrar';
      }
    };
  }

  /* ================= shell autenticado ================= */
  function shell(activo, contenidoHtml) {
    var s = sesion();
    if (!s) { ir('#/entrar'); return null; }
    var m = META;
    var items = [['#/app', '🏠', 'Inicio']];
    if (esAdmin()) {
      m.entidades.forEach(function (e) {
        items.push(['#/app/e/' + e.plural, e.icono || '📦', e.etiquetaPlural]);
      });
    }
    if (m.modulos && m.modulos.tienda) {
      items.push(['#/tienda', '🛍️', 'Catálogo']);
      items.push(['#/pedidos', '🧾', esAdmin() ? 'Pedidos' : 'Mis pedidos']);
    }
    if (m.modulos && m.modulos.reservas) {
      items.push(['#/reservar', '📅', 'Reservar']);
      items.push(['#/reservas', '🗓️', esAdmin() ? 'Reservas' : 'Mis reservas']);
    }
    if (m.modulos && m.modulos.quiz) {
      items.push(['#/quiz', '🎮', 'Jugar']);
      items.push(['#/progreso', '🏆', 'Mi progreso']);
    }
    if (m.modulos && m.modulos.blog) items.push(['#/blog', '📰', 'Publicaciones']);

    var nav = items.map(function (it) {
      return '<a class="nav-item' + (activo === it[0] ? ' activo' : '') + '" href="' + it[0] + '">' +
        '<span>' + it[1] + '</span>' + esc(it[2]) + '</a>';
    }).join('');

    raiz.innerHTML =
      '<div class="shell">' +
      '<aside class="lateral" id="lateral">' +
      '<div class="marca"><img src="logo.svg" alt=""><b>' + esc(m.nombre) + '</b></div>' +
      nav +
      '<div class="abajo">' +
      '<div class="usuario-mini"><div class="avatar">' + esc((s.usuario.nombre || '?')[0].toUpperCase()) + '</div>' +
      '<div><b style="font-size:.88rem">' + esc(s.usuario.nombre) + '</b>' +
      '<small>' + (s.usuario.rol === 'admin' ? 'Administrador' : 'Usuario') + '</small></div></div>' +
      '<button class="nav-item" id="salir">🚪 Cerrar sesión</button>' +
      '</div></aside>' +
      '<main class="contenido animar" id="zona">' + contenidoHtml + '</main>' +
      '</div>';

    document.getElementById('salir').onclick = function () {
      guardarSesion(null);
      toast('Sesión cerrada. ¡Hasta pronto! 👋');
      ir('#/');
    };
    return document.getElementById('zona');
  }

  /* ================= dashboard ================= */
  async function vistaDashboard() {
    var zona = shell('#/app',
      '<div class="cabecera"><h1>Hola, ' + esc((sesion() || { usuario: { nombre: '' } }).usuario.nombre) + ' 👋</h1></div>' +
      '<div class="tarjetas" id="tarjetas"><div class="esqueleto"><div></div><div></div></div></div>');
    if (!zona) return;
    var tarjetas = [];
    if (esAdmin()) {
      for (var i = 0; i < META.entidades.length; i++) {
        var e = META.entidades[i];
        try {
          var filas = await api('/' + e.plural);
          tarjetas.push({ icono: e.icono || '📦', n: filas.length, etiqueta: e.etiquetaPlural, ir: '#/app/e/' + e.plural });
        } catch (err) { /* entidad privada para este rol */ }
      }
    }
    if (META.modulos && META.modulos.tienda) {
      try {
        var pedidos = await api('/pedidos');
        tarjetas.push({ icono: '🧾', n: pedidos.length, etiqueta: esAdmin() ? 'Pedidos' : 'Mis pedidos', ir: '#/pedidos' });
      } catch (err) { }
    }
    if (META.modulos && META.modulos.reservas) {
      try {
        var reservas = await api('/reservas');
        tarjetas.push({ icono: '🗓️', n: reservas.length, etiqueta: esAdmin() ? 'Reservas' : 'Mis reservas', ir: '#/reservas' });
      } catch (err) { }
    }
    if (META.modulos && META.modulos.quiz) {
      try {
        var progreso = await api('/quiz/progreso');
        var mejor = progreso.reduce(function (a, p) { return Math.max(a, p.puntaje); }, 0);
        tarjetas.push({ icono: '🏆', n: mejor, etiqueta: 'Mejor puntaje', ir: '#/progreso' });
      } catch (err) { }
    }
    var caja = document.getElementById('tarjetas');
    caja.innerHTML = tarjetas.length === 0
      ? '<div class="vacio"><span class="emo">🌱</span><p>Todo listo. Usa el menú para empezar.</p></div>'
      : tarjetas.map(function (t) {
        return '<button class="tarjeta" data-ir="' + t.ir + '"><span class="icono">' + t.icono + '</span>' +
          '<b>' + t.n + '</b><span>' + esc(t.etiqueta) + '</span></button>';
      }).join('');
    caja.querySelectorAll('[data-ir]').forEach(function (el) {
      el.onclick = function () { ir(el.getAttribute('data-ir')); };
    });
  }

  /* ================= CRUD genérico ================= */
  function formularioEntidad(entidad, valores) {
    valores = valores || {};
    return entidad.campos.map(function (c) {
      var v = valores[c.nombre] == null ? '' : valores[c.nombre];
      var campo;
      if (c.tipo === 'textolargo') {
        campo = '<textarea id="f-' + c.nombre + '" rows="3">' + esc(v) + '</textarea>';
      } else if (c.tipo === 'opcion') {
        campo = '<select id="f-' + c.nombre + '">' + (c.opciones || []).map(function (o) {
          return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('') + '</select>';
      } else if (c.tipo === 'booleano') {
        campo = '<select id="f-' + c.nombre + '"><option value="1"' + (v ? ' selected' : '') + '>Sí</option>' +
          '<option value="0"' + (!v ? ' selected' : '') + '>No</option></select>';
      } else {
        var tipo = c.tipo === 'numero' || c.tipo === 'precio' ? 'number' :
          c.tipo === 'fecha' ? 'date' : c.tipo === 'email' ? 'email' : 'text';
        var paso = c.tipo === 'precio' ? ' step="0.01"' : '';
        campo = '<input id="f-' + c.nombre + '" type="' + tipo + '"' + paso + ' value="' + esc(v) + '">';
      }
      return '<div class="campo"><label for="f-' + c.nombre + '">' + esc(c.etiqueta) +
        (c.requerido ? ' *' : '') + '</label>' + campo + '</div>';
    }).join('');
  }

  function leerFormulario(entidad) {
    var cuerpo = {};
    entidad.campos.forEach(function (c) {
      var el = document.getElementById('f-' + c.nombre);
      cuerpo[c.nombre] = c.tipo === 'booleano' ? el.value === '1' : el.value;
    });
    return cuerpo;
  }

  async function vistaCrud(plural) {
    var entidad = META.entidades.find(function (e) { return e.plural === plural; });
    if (!entidad) { ir('#/app'); return; }
    var zona = shell('#/app/e/' + plural,
      '<div class="cabecera"><h1>' + (entidad.icono || '📦') + ' ' + esc(entidad.etiquetaPlural) + '</h1>' +
      (esAdmin() ? '<button class="btn btn-primario" id="crear">＋ Nuevo ' + esc(entidad.etiqueta.toLowerCase()) + '</button>' : '') +
      '</div>' +
      '<div class="panel"><div class="panel-barra"><div class="buscador"><input id="buscar" placeholder="Buscar…" aria-label="Buscar"></div></div>' +
      '<div id="lista"><div class="esqueleto"><div></div><div></div><div></div></div></div></div>');
    if (!zona) return;

    var filas = [];
    var columnas = entidad.campos.filter(function (c) { return c.enLista; });
    if (columnas.length === 0) columnas = entidad.campos.slice(0, 3);

    function pintar(filtro) {
      var visibles = !filtro ? filas : filas.filter(function (f) {
        return JSON.stringify(f).toLowerCase().includes(filtro.toLowerCase());
      });
      var caja = document.getElementById('lista');
      if (visibles.length === 0) {
        caja.innerHTML = '<div class="vacio"><span class="emo">' + (entidad.icono || '📦') + '</span>' +
          '<p>' + (filtro ? 'Nada coincide con tu búsqueda.' :
            'Aún no hay ' + esc(entidad.etiquetaPlural.toLowerCase()) + '. ¡Crea el primero!') + '</p>' +
          (esAdmin() && !filtro ? '<button class="btn btn-primario btn-mini" id="crear-vacio">＋ Crear ahora</button>' : '') +
          '</div>';
        var cv = document.getElementById('crear-vacio');
        if (cv) cv.onclick = abrirCrear;
        return;
      }
      caja.innerHTML = '<div class="tabla-scroll"><table><thead><tr>' +
        columnas.map(function (c) { return '<th>' + esc(c.etiqueta) + '</th>'; }).join('') +
        (esAdmin() ? '<th style="text-align:right">Acciones</th>' : '') +
        '</tr></thead><tbody>' +
        visibles.map(function (f) {
          return '<tr>' + columnas.map(function (c) {
            var v = f[c.nombre];
            if (c.tipo === 'precio') return '<td class="num">' + moneda(v || 0) + '</td>';
            if (c.tipo === 'numero') return '<td class="num">' + esc(v == null ? '—' : v) + '</td>';
            if (c.tipo === 'booleano') return '<td>' + (v ? '✅' : '—') + '</td>';
            return '<td>' + esc(v == null || v === '' ? '—' : v) + '</td>';
          }).join('') +
          (esAdmin()
            ? '<td><div class="acciones-fila">' +
              '<button class="btn btn-suave btn-mini" data-editar="' + f.id + '">✏️ Editar</button>' +
              '<button class="btn btn-peligro btn-mini" data-borrar="' + f.id + '">🗑</button></div></td>'
            : '') +
          '</tr>';
        }).join('') + '</tbody></table></div>';

      caja.querySelectorAll('[data-editar]').forEach(function (b) {
        b.onclick = function () { abrirEditar(Number(b.getAttribute('data-editar'))); };
      });
      caja.querySelectorAll('[data-borrar]').forEach(function (b) {
        b.onclick = function () { confirmarBorrar(Number(b.getAttribute('data-borrar'))); };
      });
    }

    function abrirFormulario(titulo, valores, alGuardar) {
      var velo = modal('<h2>' + titulo + '</h2><div id="m-error"></div>' +
        formularioEntidad(entidad, valores) +
        '<div class="modal-acciones"><button class="btn btn-suave" id="m-cancelar">Cancelar</button>' +
        '<button class="btn btn-primario" id="m-guardar">Guardar</button></div>');
      velo.querySelector('#m-cancelar').onclick = function () { velo.remove(); };
      velo.querySelector('#m-guardar').onclick = async function () {
        var boton = this; boton.disabled = true; boton.textContent = 'Guardando…';
        try {
          await alGuardar(leerFormulario(entidad));
          velo.remove();
        } catch (err) {
          velo.querySelector('#m-error').innerHTML = '<div class="error-caja">😅 ' + esc(err.message) + '</div>';
          boton.disabled = false; boton.textContent = 'Guardar';
        }
      };
    }

    function abrirCrear() {
      abrirFormulario('Nuevo ' + esc(entidad.etiqueta), null, async function (cuerpo) {
        var nuevo = await api('/' + plural, { method: 'POST', cuerpo: cuerpo });
        filas.unshift(nuevo);
        pintar(document.getElementById('buscar').value);
        toast(entidad.etiqueta + ' creado ✅');
      });
    }
    function abrirEditar(id) {
      var fila = filas.find(function (f) { return f.id === id; });
      abrirFormulario('Editar ' + esc(entidad.etiqueta), fila, async function (cuerpo) {
        var actualizado = await api('/' + plural + '/' + id, { method: 'PUT', cuerpo: cuerpo });
        filas = filas.map(function (f) { return f.id === id ? Object.assign({}, f, actualizado) : f; });
        pintar(document.getElementById('buscar').value);
        toast('Cambios guardados ✅');
      });
    }
    function confirmarBorrar(id) {
      var velo = modal('<h2>¿Borrar este ' + esc(entidad.etiqueta.toLowerCase()) + '?</h2>' +
        '<p style="color:var(--suave);margin:0">Esta acción no se puede deshacer.</p>' +
        '<div class="modal-acciones"><button class="btn btn-suave" id="m-no">Cancelar</button>' +
        '<button class="btn btn-peligro" id="m-si">Sí, borrar</button></div>');
      velo.querySelector('#m-no').onclick = function () { velo.remove(); };
      velo.querySelector('#m-si').onclick = async function () {
        try {
          await api('/' + plural + '/' + id, { method: 'DELETE' });
          filas = filas.filter(function (f) { return f.id !== id; });
          pintar(document.getElementById('buscar').value);
          toast('Borrado 🗑');
        } catch (err) { toast(err.message, true); }
        velo.remove();
      };
    }

    var botonCrear = document.getElementById('crear');
    if (botonCrear) botonCrear.onclick = abrirCrear;
    document.getElementById('buscar').oninput = function () { pintar(this.value); };

    try {
      filas = await api('/' + plural);
      pintar('');
    } catch (err) {
      document.getElementById('lista').innerHTML =
        '<div class="vacio"><span class="emo">⚠️</span><p>' + esc(err.message) + '</p></div>';
    }
  }

  /* ================= tienda ================= */
  async function vistaTienda() {
    var config = META.modulos.tienda;
    var entidad = META.entidades.find(function (e) { return e.nombre === config.entidad; }) || META.entidades[0];
    var dentro = !!sesion();
    var html =
      '<div class="cabecera"><h1>🛍️ Catálogo</h1></div>' +
      '<div class="grid-productos" id="productos"><div class="esqueleto"><div></div><div></div></div></div>' +
      '<button class="btn btn-primario carrito-flotante" id="ver-carrito">🛒 Carrito <span class="badge" id="burbuja-carrito">0</span></button>';
    var zona = dentro ? shell('#/tienda', html) : (raiz.innerHTML =
      '<div class="contenido" style="max-width:1100px;margin:0 auto">' +
      '<div class="cabecera"><a class="btn btn-suave" href="#/">← ' + esc(META.nombre) + '</a>' +
      '<a class="btn btn-primario" href="#/entrar">Iniciar sesión</a></div>' + html + '</div>', document.body);
    pintarBurbujaCarrito();

    var campoPrecio = (entidad.campos.find(function (c) { return c.tipo === 'precio'; }) || {}).nombre;
    var campoDesc = (entidad.campos.find(function (c) { return c.tipo === 'textolargo'; }) || {}).nombre;
    try {
      var filas = await api('/' + entidad.plural);
      var caja = document.getElementById('productos');
      caja.innerHTML = filas.length === 0
        ? '<div class="vacio"><span class="emo">🛍️</span><p>El catálogo está vacío por ahora.</p></div>'
        : filas.map(function (f) {
          return '<article class="producto animar"><div class="producto-media">' + (entidad.icono || '🛍️') + '</div>' +
            '<div class="producto-info"><b>' + esc(f.nombre) + '</b>' +
            (campoDesc && f[campoDesc] ? '<span class="desc">' + esc(f[campoDesc]) + '</span>' : '') +
            (campoPrecio ? '<span class="precio">' + moneda(f[campoPrecio]) + '</span>' : '') +
            (f.stock != null ? '<span class="chip-stock">' + (f.stock > 0 ? 'Disponible: ' + f.stock : 'Agotado') + '</span>' : '') +
            '<button class="btn btn-primario btn-mini" data-agregar="' + f.id + '"' + (f.stock === 0 ? ' disabled' : '') + '>Añadir al carrito</button>' +
            '</div></article>';
        }).join('');
      caja.querySelectorAll('[data-agregar]').forEach(function (b) {
        b.onclick = function () {
          var f = filas.find(function (x) { return x.id === Number(b.getAttribute('data-agregar')); });
          agregarAlCarrito({ id: f.id, nombre: f.nombre, precio: campoPrecio ? f[campoPrecio] : 0 });
        };
      });
    } catch (err) {
      document.getElementById('productos').innerHTML =
        '<div class="vacio"><span class="emo">⚠️</span><p>' + esc(err.message) + '</p></div>';
    }

    document.getElementById('ver-carrito').onclick = abrirCarrito;
  }

  function abrirCarrito() {
    var c = carrito();
    var total = c.reduce(function (a, x) { return a + x.precio * x.cantidad; }, 0);
    var velo = modal('<h2>🛒 Tu carrito</h2>' +
      (c.length === 0
        ? '<div class="vacio"><span class="emo">🕸️</span><p>Está vacío. ¡Añade algo rico!</p></div>'
        : '<div style="display:grid;gap:.5rem">' + c.map(function (x, i) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;gap:.6rem">' +
            '<span>' + esc(x.nombre) + ' × ' + x.cantidad + '</span>' +
            '<span style="display:flex;align-items:center;gap:.5rem"><b>' + moneda(x.precio * x.cantidad) + '</b>' +
            '<button class="btn btn-peligro btn-mini" data-quitar="' + i + '">✕</button></span></div>';
        }).join('') + '</div>' +
        '<p style="text-align:right;font-size:1.1rem;margin:.4rem 0 0">Total: <b>' + moneda(total) + '</b></p>') +
      '<div class="modal-acciones"><button class="btn btn-suave" id="c-seguir">Seguir mirando</button>' +
      (c.length > 0 ? '<button class="btn btn-primario" id="c-pagar">Confirmar pedido ✨</button>' : '') +
      '</div>');
    velo.querySelector('#c-seguir').onclick = function () { velo.remove(); };
    velo.querySelectorAll('[data-quitar]').forEach(function (b) {
      b.onclick = function () {
        var cc = carrito(); cc.splice(Number(b.getAttribute('data-quitar')), 1);
        guardarCarrito(cc); velo.remove(); pintarBurbujaCarrito(); abrirCarrito();
      };
    });
    var pagar = velo.querySelector('#c-pagar');
    if (pagar) pagar.onclick = async function () {
      if (!sesion()) { velo.remove(); toast('Inicia sesión para confirmar tu pedido 😉'); ir('#/entrar'); return; }
      pagar.disabled = true; pagar.textContent = 'Enviando…';
      try {
        var r = await api('/pedidos', { method: 'POST', cuerpo: { items: carrito() } });
        guardarCarrito([]); pintarBurbujaCarrito(); velo.remove();
        toast('¡Pedido #' + r.id + ' recibido! Total ' + moneda(r.total) + ' 🎉');
        ir('#/pedidos');
      } catch (err) {
        pagar.disabled = false; pagar.textContent = 'Confirmar pedido ✨';
        toast(err.message, true);
      }
    };
  }

  async function vistaPedidos() {
    var zona = shell('#/pedidos', '<div class="cabecera"><h1>🧾 ' + (esAdmin() ? 'Pedidos' : 'Mis pedidos') + '</h1></div>' +
      '<div id="pedidos" class="tarjetas" style="grid-template-columns:1fr"><div class="esqueleto"><div></div><div></div></div></div>');
    if (!zona) return;
    try {
      var pedidos = await api('/pedidos');
      var caja = document.getElementById('pedidos');
      caja.innerHTML = pedidos.length === 0
        ? '<div class="vacio"><span class="emo">🧾</span><p>Aún no hay pedidos. ' +
          '<a class="enlace" href="#/tienda">Ir al catálogo</a></p></div>'
        : pedidos.map(function (p) {
          return '<div class="panel" style="padding:1.1rem 1.3rem;display:grid;gap:.4rem">' +
            '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem">' +
            '<b>Pedido #' + p.id + (p.cliente ? ' · ' + esc(p.cliente) : '') + '</b>' +
            (esAdmin()
              ? '<select data-estado="' + p.id + '" class="btn btn-suave btn-mini">' +
                ['pendiente', 'preparando', 'entregado', 'cancelado'].map(function (s) {
                  return '<option' + (s === p.estado ? ' selected' : '') + '>' + s + '</option>';
                }).join('') + '</select>'
              : '<span class="chip-stock">' + esc(p.estado) + '</span>') +
            '</div>' +
            p.items.map(function (it) {
              return '<span style="color:var(--suave);font-size:.9rem">' + esc(it.nombre) + ' × ' + it.cantidad +
                ' — ' + moneda(it.precio * it.cantidad) + '</span>';
            }).join('') +
            '<b style="text-align:right">Total: ' + moneda(p.total) + '</b></div>';
        }).join('');
      caja.querySelectorAll('[data-estado]').forEach(function (sel) {
        sel.onchange = async function () {
          try {
            await api('/pedidos/' + sel.getAttribute('data-estado') + '/estado',
              { method: 'PUT', cuerpo: { estado: sel.value } });
            toast('Pedido actualizado ✅');
          } catch (err) { toast(err.message, true); }
        };
      });
    } catch (err) {
      document.getElementById('pedidos').innerHTML =
        '<div class="vacio"><span class="emo">⚠️</span><p>' + esc(err.message) + '</p></div>';
    }
  }

  /* ================= reservas ================= */
  async function vistaReservar() {
    var zona = shell('#/reservar',
      '<div class="cabecera"><h1>📅 Reservar</h1></div>' +
      '<div class="panel" style="padding:1.3rem;display:grid;gap:1rem;max-width:640px">' +
      '<div class="campo"><label for="r-fecha">Elige el día</label><input id="r-fecha" type="date"></div>' +
      '<div id="r-disponibilidad"><div class="vacio"><span class="emo">🗓️</span><p>Elige una fecha para ver los horarios.</p></div></div>' +
      '</div>');
    if (!zona) return;
    var elegida = null;
    var fechaEl = document.getElementById('r-fecha');
    fechaEl.min = new Date().toISOString().slice(0, 10);
    fechaEl.onchange = async function () {
      var caja = document.getElementById('r-disponibilidad');
      caja.innerHTML = '<div class="esqueleto"><div></div><div></div></div>';
      try {
        var d = await api('/reservas/disponibilidad?fecha=' + fechaEl.value);
        caja.innerHTML = d.disponibilidad.map(function (r) {
          return '<div style="display:grid;gap:.5rem;margin-bottom:.8rem"><b>' + esc(r.recurso) + '</b>' +
            '<div class="grid-horas">' + r.horas.map(function (h) {
              return '<button class="hora" data-r="' + esc(r.recurso) + '" data-h="' + h.hora + '"' +
                (h.libre ? '' : ' disabled') + '>' + h.hora + '</button>';
            }).join('') + '</div></div>';
        }).join('') +
          '<button class="btn btn-primario" id="r-confirmar" disabled>Confirmar reserva ✨</button>';
        caja.querySelectorAll('.hora:not(:disabled)').forEach(function (b) {
          b.onclick = function () {
            caja.querySelectorAll('.hora').forEach(function (x) { x.classList.remove('elegida'); });
            b.classList.add('elegida');
            elegida = { recurso: b.getAttribute('data-r'), hora: b.getAttribute('data-h') };
            document.getElementById('r-confirmar').disabled = false;
          };
        });
        document.getElementById('r-confirmar').onclick = async function () {
          this.disabled = true; this.textContent = 'Reservando…';
          try {
            await api('/reservas', { method: 'POST', cuerpo: { recurso: elegida.recurso, fecha: fechaEl.value, hora: elegida.hora } });
            toast('¡Reserva confirmada! 🎉');
            ir('#/reservas');
          } catch (err) { toast(err.message, true); fechaEl.onchange(); }
        };
      } catch (err) {
        caja.innerHTML = '<div class="vacio"><span class="emo">⚠️</span><p>' + esc(err.message) + '</p></div>';
      }
    };
  }

  async function vistaMisReservas() {
    var zona = shell('#/reservas', '<div class="cabecera"><h1>🗓️ ' + (esAdmin() ? 'Reservas' : 'Mis reservas') + '</h1>' +
      '<a class="btn btn-primario" href="#/reservar">＋ Nueva reserva</a></div>' +
      '<div id="lista-reservas"><div class="esqueleto"><div></div><div></div></div></div>');
    if (!zona) return;
    try {
      var filas = await api('/reservas');
      var caja = document.getElementById('lista-reservas');
      caja.innerHTML = filas.length === 0
        ? '<div class="vacio"><span class="emo">📅</span><p>No tienes reservas todavía.</p></div>'
        : '<div class="panel"><div class="tabla-scroll"><table><thead><tr>' +
          (esAdmin() ? '<th>Cliente</th>' : '') + '<th>Recurso</th><th>Fecha</th><th>Hora</th><th></th></tr></thead><tbody>' +
          filas.map(function (r) {
            return '<tr>' + (esAdmin() ? '<td>' + esc(r.cliente || '') + '</td>' : '') +
              '<td>' + esc(r.recurso) + '</td><td>' + esc(r.fecha) + '</td><td>' + esc(r.hora) + '</td>' +
              '<td><div class="acciones-fila"><button class="btn btn-peligro btn-mini" data-cancelar="' + r.id + '">Cancelar</button></div></td></tr>';
          }).join('') + '</tbody></table></div></div>';
      caja.querySelectorAll('[data-cancelar]').forEach(function (b) {
        b.onclick = async function () {
          try {
            await api('/reservas/' + b.getAttribute('data-cancelar'), { method: 'DELETE' });
            toast('Reserva cancelada.');
            vistaMisReservas();
          } catch (err) { toast(err.message, true); }
        };
      });
    } catch (err) {
      document.getElementById('lista-reservas').innerHTML =
        '<div class="vacio"><span class="emo">⚠️</span><p>' + esc(err.message) + '</p></div>';
    }
  }

  /* ================= quiz ================= */
  async function vistaQuiz() {
    var contenedor = sesion()
      ? shell('#/quiz', '<div id="quiz-zona" class="quiz-caja"></div>')
      : (raiz.innerHTML = '<div class="contenido" style="max-width:720px;margin:0 auto">' +
        '<div class="cabecera"><a class="btn btn-suave" href="#/">← Volver</a>' +
        '<a class="btn btn-primario" href="#/entrar">Iniciar sesión</a></div>' +
        '<div id="quiz-zona" class="quiz-caja"></div></div>', document.body);
    var zona = document.getElementById('quiz-zona');
    try {
      var q = await api('/quiz');
      var actual = 0;
      var respuestas = [];
      function pintarPregunta() {
        var p = q.preguntas[actual];
        zona.innerHTML =
          '<div class="cabecera"><h1>🎮 ' + esc(q.titulo) + '</h1></div>' +
          '<div class="progreso-quiz"><div style="width:' + Math.round((actual / q.preguntas.length) * 100) + '%"></div></div>' +
          '<div class="panel animar" style="padding:1.5rem;display:grid;gap:.8rem">' +
          '<b style="font-size:1.2rem">' + (actual + 1) + '. ' + esc(p.pregunta) + '</b>' +
          p.opciones.map(function (o, i) {
            return '<button class="opcion-quiz" data-i="' + i + '">' + esc(o) + '</button>';
          }).join('') + '</div>';
        zona.querySelectorAll('.opcion-quiz').forEach(function (b) {
          b.onclick = function () {
            respuestas[actual] = Number(b.getAttribute('data-i'));
            actual += 1;
            if (actual < q.preguntas.length) pintarPregunta();
            else enviar();
          };
        });
      }
      async function enviar() {
        zona.innerHTML = '<div class="vacio"><div class="spinner"></div><p>Revisando tus respuestas…</p></div>';
        if (!sesion()) {
          zona.innerHTML = '<div class="vacio"><span class="emo">🔐</span>' +
            '<p>Inicia sesión para guardar tu puntaje.</p>' +
            '<a class="btn btn-primario" href="#/entrar">Iniciar sesión</a></div>';
          return;
        }
        try {
          var r = await api('/quiz/responder', { method: 'POST', cuerpo: { respuestas: respuestas } });
          var perfecto = r.puntaje === r.total;
          zona.innerHTML =
            '<div class="panel animar" style="padding:2rem;text-align:center;display:grid;gap:.7rem;justify-items:center">' +
            '<span style="font-size:3rem">' + (perfecto ? '🏆' : r.puntaje >= r.total / 2 ? '🎉' : '💪') + '</span>' +
            '<h1>' + r.puntaje + ' de ' + r.total + '</h1>' +
            '<p style="color:var(--suave);margin:0">' + (perfecto ? '¡PERFECTO! Eres imparable.' :
              r.puntaje >= r.total / 2 ? '¡Muy bien! Sigue practicando.' : '¡Ánimo! La práctica hace al maestro.') + '</p>' +
            '<div style="display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center">' +
            '<button class="btn btn-primario" id="q-otra">Jugar otra vez 🔁</button>' +
            '<a class="btn btn-suave" href="#/progreso">Ver mi progreso</a></div></div>';
          document.getElementById('q-otra').onclick = function () { actual = 0; respuestas = []; pintarPregunta(); };
        } catch (err) {
          zona.innerHTML = '<div class="vacio"><span class="emo">⚠️</span><p>' + esc(err.message) + '</p></div>';
        }
      }
      pintarPregunta();
    } catch (err) {
      zona.innerHTML = '<div class="vacio"><span class="emo">⚠️</span><p>' + esc(err.message) + '</p></div>';
    }
  }

  async function vistaProgreso() {
    var zona = shell('#/progreso', '<div class="cabecera"><h1>🏆 Mi progreso</h1>' +
      '<a class="btn btn-primario" href="#/quiz">Jugar 🎮</a></div><div id="prog"><div class="esqueleto"><div></div><div></div></div></div>');
    if (!zona) return;
    try {
      var filas = await api('/quiz/progreso');
      document.getElementById('prog').innerHTML = filas.length === 0
        ? '<div class="vacio"><span class="emo">🎮</span><p>Aún no has jugado. ¡Tu primera partida te espera!</p></div>'
        : '<div class="panel"><div class="tabla-scroll"><table><thead><tr><th>Fecha</th><th class="num">Puntaje</th></tr></thead><tbody>' +
        filas.map(function (p) {
          return '<tr><td>' + esc(p.creado_en) + '</td><td class="num"><b>' + p.puntaje + '</b> / ' + p.total + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    } catch (err) {
      document.getElementById('prog').innerHTML =
        '<div class="vacio"><span class="emo">⚠️</span><p>' + esc(err.message) + '</p></div>';
    }
  }

  /* ================= blog / contenido ================= */
  async function vistaBlog() {
    var entidad = META.entidades.find(function (e) { return e.publico; }) || META.entidades[0];
    var campoTitulo = (entidad.campos.find(function (c) { return c.tipo === 'texto'; }) || {}).nombre || 'nombre';
    var campoCuerpo = (entidad.campos.find(function (c) { return c.tipo === 'textolargo'; }) || {}).nombre;
    var html = '<div class="cabecera"><h1>📰 ' + esc(entidad.etiquetaPlural) + '</h1></div>' +
      '<div id="posts" style="display:grid;gap:1rem;max-width:760px"><div class="esqueleto"><div></div><div></div></div></div>';
    if (sesion()) shell('#/blog', html);
    else raiz.innerHTML = '<div class="contenido" style="max-width:820px;margin:0 auto">' +
      '<div class="cabecera"><a class="btn btn-suave" href="#/">← ' + esc(META.nombre) + '</a></div>' + html + '</div>';
    try {
      var filas = await api('/' + entidad.plural);
      document.getElementById('posts').innerHTML = filas.length === 0
        ? '<div class="vacio"><span class="emo">📰</span><p>Todavía no hay publicaciones.</p></div>'
        : filas.map(function (f) {
          return '<article class="panel animar" style="padding:1.4rem;display:grid;gap:.4rem">' +
            '<h2 style="font-size:1.25rem">' + esc(f[campoTitulo]) + '</h2>' +
            (campoCuerpo ? '<p style="color:var(--suave);margin:0;white-space:pre-line">' + esc(f[campoCuerpo]) + '</p>' : '') +
            '<small style="color:var(--suave)">' + esc(f.creado_en || '') + '</small></article>';
        }).join('');
    } catch (err) {
      document.getElementById('posts').innerHTML =
        '<div class="vacio"><span class="emo">⚠️</span><p>' + esc(err.message) + '</p></div>';
    }
  }

  /* ================= router ================= */
  function enrutar() {
    var h = location.hash || '#/';
    if (h === '#/' || h === '') return vistaHero();
    if (h === '#/entrar') return vistaAuth('entrar');
    if (h === '#/registro') return vistaAuth('registro');
    if (h === '#/app') return vistaDashboard();
    if (h.indexOf('#/app/e/') === 0) return vistaCrud(h.slice(8));
    if (h === '#/tienda') return vistaTienda();
    if (h === '#/pedidos') return vistaPedidos();
    if (h === '#/reservar') return vistaReservar();
    if (h === '#/reservas') return vistaMisReservas();
    if (h === '#/quiz') return vistaQuiz();
    if (h === '#/progreso') return vistaProgreso();
    if (h === '#/blog') return vistaBlog();
    return vistaHero();
  }

  /* ================= arranque ================= */
  (async function iniciar() {
    try {
      META = await api('/_meta');
      document.title = META.nombre;
      document.documentElement.setAttribute('data-tema', META.tema || 'calido');
      window.addEventListener('hashchange', enrutar);
      enrutar();
    } catch (e) {
      raiz.innerHTML = '<div class="vacio" style="min-height:100vh;display:grid;place-items:center">' +
        '<div><span class="emo">🔌</span><p>No se pudo conectar con el servidor. Recarga la página.</p></div></div>';
    }
  })();
})();
