// Corrida del experimento: genera la bitácora de catas y reporta lo que pasó,
// incluida la rama de entrega para la revisión.
import { readFileSync, writeFileSync } from "node:fs";

const API = "http://localhost:8000/api/v1/agent/generate";
const prompt = readFileSync(new URL("./prompt_catas.txt", import.meta.url), "utf8");
const t0 = Date.now();
const hora = () => new Date().toISOString().slice(11, 19);

console.log(`[${hora()}] Generando la bitácora de catas (solo IA gratis)…`);

const res = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer dev-local" },
  body: JSON.stringify({ prompt, language: "es", modo_inquieto: false }),
});
const secs = ((Date.now() - t0) / 1000).toFixed(0);
const d = await res.json();

const salida = {
  http: res.status,
  segundos: Number(secs),
  name: d.name ?? null,
  url: d.url ?? null,
  output_path: d.output_path ?? null,
  archivos: Array.isArray(d.files) ? d.files.length : null,
  detail: d.detail ?? null,
};
writeFileSync(new URL("./resultado_catas.json", import.meta.url), JSON.stringify(salida, null, 2));
console.log(`[${hora()}] HTTP ${res.status} en ${secs}s`);
console.log(JSON.stringify(salida, null, 2));
