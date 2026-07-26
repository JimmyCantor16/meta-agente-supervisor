/* Renderiza el panel a partir de window.DATOS. Sin dependencias: las gráficas
   se dibujan como SVG desde los datos, así SIEMPRE se ven (nunca vacías). */
(function () {
  var D = window.DATOS || {};
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  // Tema del documento
  if (D.tema === "oscuro") document.documentElement.setAttribute("data-theme", "oscuro");

  // Marca, título, descripción
  if ($("[data-marca]")) $("[data-marca]").textContent = D.nombre || "Panel";
  if ($("[data-titulo]")) $("[data-titulo]").textContent = D.titulo || "Resumen";
  if ($("[data-descripcion]")) $("[data-descripcion]").textContent = D.descripcion || "";
  document.title = D.nombre || "Panel";
  var avatar = document.querySelector(".usuario-avatar");
  if (avatar && D.nombre) avatar.textContent = (D.nombre[0] || "A").toUpperCase();

  // Menú lateral (secciones -> ancla a #resumen / #datos)
  var menu = $("[data-menu]");
  if (menu) {
    var secciones = (D.secciones && D.secciones.length) ? D.secciones : ["Resumen", "Datos"];
    var destinos = ["#resumen", "#datos", "#resumen", "#datos", "#resumen"];
    menu.innerHTML = secciones.map(function (s, i) {
      return '<a href="' + (destinos[i] || "#resumen") + '" class="' + (i === 0 ? "activo" : "") +
        '"><span class="punto"></span>' + esc(s) + "</a>";
    }).join("");
    menu.addEventListener("click", function (e) {
      var a = e.target.closest("a"); if (!a) return;
      menu.querySelectorAll("a").forEach(function (x) { x.classList.remove("activo"); });
      a.classList.add("activo");
    });
  }

  // KPIs
  var cont = $("[data-kpis]");
  if (cont && D.kpis) {
    cont.innerHTML = D.kpis.map(function (k) {
      return '<div class="kpi">' +
        (k.icono ? '<span class="kpi-icono">' + esc(k.icono) + "</span>" : "") +
        '<div class="kpi-etiqueta">' + esc(k.etiqueta) + "</div>" +
        '<div class="kpi-valor">' + esc(k.valor) + "</div>" +
        (k.delta ? '<div class="kpi-delta' + (k.baja ? " baja" : "") + '">' + esc(k.delta) + "</div>" : "") +
        "</div>";
    }).join("");
  }

  var acento = getComputedStyle(document.documentElement).getPropertyValue("--acento").trim() || "#4f6df5";

  // ---- Gráfica de líneas (SVG) ----
  function lineas(datos, sel) {
    var host = document.querySelector(sel); if (!host || !datos || !datos.length) return;
    var W = 560, H = 260, pl = 40, pr = 16, pt = 16, pb = 34;
    var max = Math.max.apply(null, datos.map(function (d) { return +d.valor || 0; })) || 1;
    var min = Math.min.apply(null, datos.map(function (d) { return +d.valor || 0; }), 0);
    var ancho = W - pl - pr, alto = H - pt - pb;
    var x = function (i) { return pl + (datos.length === 1 ? ancho / 2 : (ancho * i) / (datos.length - 1)); };
    var y = function (v) { return pt + alto - ((v - min) / (max - min || 1)) * alto; };
    var pts = datos.map(function (d, i) { return x(i) + "," + y(+d.valor || 0); });
    var area = "M" + pl + "," + (pt + alto) + " L" + pts.join(" L") + " L" + x(datos.length - 1) + "," + (pt + alto) + " Z";
    var grid = "";
    for (var g = 0; g <= 4; g++) { var gy = pt + (alto * g) / 4; grid += '<line x1="' + pl + '" y1="' + gy + '" x2="' + (W - pr) + '" y2="' + gy + '" stroke="var(--linea)" stroke-width="1"/>'; }
    var ejes = datos.map(function (d, i) { return '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="var(--tinta-suave)">' + esc(d.etiqueta) + "</text>"; }).join("");
    var puntos = datos.map(function (d, i) { return '<circle cx="' + x(i) + '" cy="' + y(+d.valor || 0) + '" r="3.5" fill="' + acento + '"/>'; }).join("");
    host.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" preserveAspectRatio="xMidYMid meet">' +
      '<defs><linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + acento + '" stop-opacity="0.28"/>' +
      '<stop offset="1" stop-color="' + acento + '" stop-opacity="0"/></linearGradient></defs>' +
      grid +
      '<path d="' + area + '" fill="url(#areaG)"/>' +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + acento + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      puntos + ejes + "</svg>";
  }

  // ---- Gráfica de barras (SVG) ----
  function barras(datos, sel) {
    var host = document.querySelector(sel); if (!host || !datos || !datos.length) return;
    var W = 560, H = 260, pl = 40, pr = 16, pt = 16, pb = 34;
    var max = Math.max.apply(null, datos.map(function (d) { return +d.valor || 0; })) || 1;
    var ancho = W - pl - pr, alto = H - pt - pb;
    var paso = ancho / datos.length, bw = Math.min(46, paso * 0.55);
    var grid = "";
    for (var g = 0; g <= 4; g++) { var gy = pt + (alto * g) / 4; grid += '<line x1="' + pl + '" y1="' + gy + '" x2="' + (W - pr) + '" y2="' + gy + '" stroke="var(--linea)" stroke-width="1"/>'; }
    var barras = datos.map(function (d, i) {
      var v = +d.valor || 0, bh = (v / max) * alto, cx = pl + paso * i + paso / 2;
      return '<rect x="' + (cx - bw / 2) + '" y="' + (pt + alto - bh) + '" width="' + bw + '" height="' + Math.max(bh, 2) + '" rx="6" fill="' + acento + '"/>' +
        '<text x="' + cx + '" y="' + (pt + alto - bh - 6) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--tinta-suave)">' + esc(v) + "</text>" +
        '<text x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="var(--tinta-suave)">' + esc(d.etiqueta) + "</text>";
    }).join("");
    host.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" preserveAspectRatio="xMidYMid meet">' + grid + barras + "</svg>";
  }

  if (D.grafica_lineas) {
    if ($('[data-grafica-titulo="lineas"]')) $('[data-grafica-titulo="lineas"]').textContent = D.grafica_lineas.titulo || "Evolución";
    lineas(D.grafica_lineas.datos, '[data-lienzo="lineas"]');
  }
  if (D.grafica_barras) {
    if ($('[data-grafica-titulo="barras"]')) $('[data-grafica-titulo="barras"]').textContent = D.grafica_barras.titulo || "Comparativa";
    barras(D.grafica_barras.datos, '[data-lienzo="barras"]');
  }

  // ---- Tabla ----
  if (D.tabla) {
    if ($("[data-tabla-titulo]")) $("[data-tabla-titulo]").textContent = D.tabla.titulo || "Detalle";
    var cab = $("[data-tabla-cabecera]"), cue = $("[data-tabla-cuerpo]");
    if (cab && D.tabla.columnas) cab.innerHTML = "<tr>" + D.tabla.columnas.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>";
    if (cue && D.tabla.filas) {
      cue.innerHTML = D.tabla.filas.map(function (fila) {
        return "<tr>" + fila.map(function (celda) {
          if (celda && typeof celda === "object" && celda.estado) {
            return '<td><span class="pastilla ' + esc(celda.estado) + '">' + esc(celda.texto) + "</span></td>";
          }
          var esNum = typeof celda === "string" && /^[\d$.,%\s-]+$/.test(celda);
          return '<td class="' + (esNum ? "num" : "") + '">' + esc(celda) + "</td>";
        }).join("") + "</tr>";
      }).join("");
    }
  }

  // Toggle de tema
  var btn = $("[data-tema]");
  if (btn) btn.addEventListener("click", function () {
    var actual = document.documentElement.getAttribute("data-theme") === "oscuro" ? "claro" : "oscuro";
    document.documentElement.setAttribute("data-theme", actual);
    btn.textContent = actual === "oscuro" ? "☀️" : "🌙";
  });
})();
