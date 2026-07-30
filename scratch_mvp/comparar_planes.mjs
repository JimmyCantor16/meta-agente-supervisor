// Arnés de la FASE 7: el MISMO prompt exigente en los cuatro planes.
//
// El examen final del producto. Si al terminar los cuatro resultados son
// indistinguibles, los planes de pago no se pueden vender y hay que volver a la
// Fase 6. Este arnés existe para que esa respuesta sea un dato, no una opinión.
//
// Qué hace, por plan: pone el plan al usuario de prueba, manda el prompt, mide
// el tiempo, y recoge la evidencia real (archivos, modelo de datos, URL viva,
// si entró el experto). Al final escribe una comparación lado a lado.
//
// Uso:
//   node comparar_planes.mjs                 # los cuatro planes
//   node comparar_planes.mjs studio business # solo esos
//
// Requiere, en el entorno:
//   API        (por omisión http://localhost:8000)
//   TOKEN      sesión de un super-admin (es quien puede cambiar planes)
//   EMAIL      usuario de prueba al que se le cambia el plan

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const API = process.env.API || "http://localhost:8000";
const TOKEN = process.env.TOKEN || "";
const EMAIL = process.env.EMAIL || "";
const PLANES = ["free", "pro", "studio", "business"];

const pedidos = process.argv.slice(2).filter((p) => PLANES.includes(p));
const aProbar = pedidos.length ? pedidos : PLANES;

const prompt = readFileSync(join(AQUI, "prompt_definitivo.txt"), "utf8");

/** Llamada a la API con la sesión del admin. El body va en UTF-8 explícito:
 *  con acentos mal codificados el servidor responde 400 al parsear. */
async function api(ruta, cuerpo, metodo = "POST") {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: cuerpo ? Buffer.from(JSON.stringify(cuerpo), "utf8") : undefined,
  });
  const texto = await r.text();
  let datos = null;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = { detail: texto.slice(0, 400) };
  }
  return { ok: r.ok, status: r.status, datos };
}

/** Escucha el canal de progreso mientras se construye: de ahí sale la evidencia
 *  de si el experto entró y cuántos modelos participaron. */
function escucharProgreso() {
  const lineas = [];
  const ws = new WebSocket(`${API.replace(/^http/, "ws")}/api/v1/ws/progreso`);
  ws.addEventListener("message", (e) => lineas.push(String(e.data || "")));
  return {
    lineas,
    cerrar: () => {
      try {
        ws.close();
      } catch {
        /* ya cerrado */
      }
    },
  };
}

async function correrPlan(plan) {
  process.stdout.write(`\n── ${plan.toUpperCase()} ${"─".repeat(50 - plan.length)}\n`);

  // 1) Poner el plan al usuario de prueba (solo un super-admin puede).
  const cambio = await api("/api/v1/agent/admin/approve", { email: EMAIL, plan });
  if (!cambio.ok) {
    console.log(`  ✕ no pude poner el plan ${plan}: ${cambio.datos?.detail}`);
    return { plan, error: `no se pudo aplicar el plan (${cambio.status})` };
  }
  console.log(`  plan aplicado a ${EMAIL}`);

  // 2) Qué dice el sistema que hará el experto con este plan.
  const experto = await api("/api/v1/agent/experto", null, "GET");
  const momentos = experto.ok ? experto.datos.momentos : [];
  console.log(`  experto en: ${momentos.length ? momentos.join(", ") : "ningún momento"}`);

  // 3) El mismo prompt, cronometrado.
  const oyente = escucharProgreso();
  const arranque = Date.now();
  const gen = await api("/api/v1/agent/generate", { prompt, language: "es" });
  const segundos = Math.round((Date.now() - arranque) / 1000);
  oyente.cerrar();

  if (!gen.ok) {
    console.log(`  ✕ falló (${gen.status}): ${gen.datos?.detail}`);
    return { plan, momentos, segundos, error: gen.datos?.detail || `HTTP ${gen.status}` };
  }

  const entroExperto = oyente.lineas.filter((l) => /AGENTE EXPERTO|experto reforzó/i.test(l));
  const modelos = [
    ...new Set(oyente.lineas.map((l) => l.match(/IA «(.+?)»/)?.[1]).filter(Boolean)),
  ];

  const resultado = {
    plan,
    momentos,
    segundos,
    nombre: gen.datos.name,
    resumen: gen.datos.summary,
    archivos: gen.datos.files || [],
    url: gen.datos.url || null,
    entroExperto: entroExperto.map((l) => l.replace(/^[^\p{L}]*/u, "")),
    modelos,
  };
  console.log(`  ✓ ${resultado.archivos.length} archivos en ${segundos}s`);
  console.log(`    url: ${resultado.url || "(sin URL viva)"}`);
  if (entroExperto.length) console.log(`    experto: ${entroExperto.length} intervención(es)`);
  return resultado;
}

function comparacionHtml(resultados) {
  const fila = (r) => {
    if (r.error) {
      return `<tr><td class="p">${r.plan}</td><td colspan="5" class="mal">✕ ${escapar(r.error)}</td></tr>`;
    }
    return `<tr>
      <td class="p">${r.plan}</td>
      <td>${r.archivos.length}</td>
      <td>${r.segundos}s</td>
      <td>${r.url ? `<a href="${escapar(r.url)}">viva ↗</a>` : '<span class="mal">sin URL</span>'}</td>
      <td>${r.momentos.length ? escapar(r.momentos.join(", ")) : "—"}</td>
      <td>${r.entroExperto.length}</td>
    </tr>`;
  };
  const detalle = (r) =>
    r.error
      ? ""
      : `<section><h3>${r.plan}</h3><p>${escapar(r.resumen || "")}</p>
         <p class="meta">modelos que participaron: ${escapar(r.modelos.join(" · ")) || "—"}</p>
         ${r.entroExperto.length ? `<ul>${r.entroExperto.map((l) => `<li>${escapar(l)}</li>`).join("")}</ul>` : ""}
         </section>`;

  return `<title>Comparación plan a plan</title>
<style>
 :root{--f:#0d1117;--t:#e6edf3;--t2:#8b949e;--l:#30363d;--a:#3fb950}
 @media (prefers-color-scheme: light){:root{--f:#fff;--t:#1f2328;--t2:#656d76;--l:#d0d7de;--a:#1a7f37}}
 body{background:var(--f);color:var(--t);font:15px/1.6 ui-sans-serif,system-ui;margin:0;padding:2rem}
 h1{font-size:1.5rem;margin:0 0 .3rem}
 .meta{color:var(--t2);font-size:.85rem}
 table{border-collapse:collapse;width:100%;margin:1.5rem 0;font-variant-numeric:tabular-nums}
 th,td{border-bottom:1px solid var(--l);padding:.55rem .7rem;text-align:left}
 th{color:var(--t2);font-size:.78rem;text-transform:uppercase;letter-spacing:.08em}
 .p{font-weight:700;text-transform:capitalize}
 .mal{color:#f85149}
 a{color:var(--a)}
 section{border-top:1px solid var(--l);padding-top:1rem;margin-top:1rem}
 h3{text-transform:capitalize;margin:0 0 .3rem}
</style>
<h1>El mismo encargo, los cuatro planes</h1>
<p class="meta">Distribuidora de café · facturación, nómina e inventario con pérdida de tueste.</p>
<table>
  <tr><th>Plan</th><th>Archivos</th><th>Tiempo</th><th>URL</th><th>Experto en</th><th>Entradas</th></tr>
  ${resultados.map(fila).join("\n")}
</table>
${resultados.map(detalle).join("\n")}
<p class="meta">El criterio es duro a propósito: si un tercero no distingue el de pago
del gratuito, el plan no se vende.</p>`;
}

function escapar(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

async function main() {
  if (!TOKEN || !EMAIL) {
    console.error("Falta TOKEN (sesión de super-admin) o EMAIL (usuario de prueba).");
    return 1;
  }
  console.log(`Comparando ${aProbar.join(", ")} contra ${API}`);
  const resultados = [];
  for (const plan of aProbar) {
    resultados.push(await correrPlan(plan));
  }
  const salida = join(AQUI, "comparacion_planes.html");
  writeFileSync(salida, comparacionHtml(resultados), "utf8");
  writeFileSync(join(AQUI, "comparacion_planes.json"), JSON.stringify(resultados, null, 2), "utf8");
  console.log(`\nComparación escrita en ${salida}`);
  return 0;
}

process.exit(await main());
