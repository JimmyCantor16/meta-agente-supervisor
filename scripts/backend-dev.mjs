// Terminal 1 (mitad backend): uvicorn con recarga, hablando con DeepSeek LOCAL.
//
// Fuerza DEEPSEEK_MODE=local y DEEPSEEK_API_URL hacia deepseek-web-chat (la
// terminal 2) salvo que ya vengan en el entorno: así basta con `npm run dev`,
// sin tocar backend/.env. Si deepseek-web-chat no está arrancado, el backend
// funciona igual: el fallback sigue con el resto de la cadena.
//
//   node scripts/backend-dev.mjs           → arranca uvicorn en :8000
//   node scripts/backend-dev.mjs --check   → compila el backend y corre las pruebas offline nuevas
import { spawnSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const backend = join(raiz, "backend");
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const env = {
  ...process.env,
  PYTHONIOENCODING: "utf-8",
  DEEPSEEK_MODE: process.env.DEEPSEEK_MODE || "local",
  DEEPSEEK_API_URL: process.env.DEEPSEEK_API_URL || "http://127.0.0.1:6174",
};

if (process.argv.includes("--check")) {
  const pasos = [
    ["-m", "compileall", "-q", "src", "main.py"],
    ["pruebas/cadena_ia.py"],
    ["pruebas/catalogo_cursos.py"],
    ["pruebas/contrato_en_el_fallback.py"],
  ];
  // Las pruebas corren con el entorno tal cual: sin el DEEPSEEK_MODE de arriba.
  const envPruebas = { ...process.env, PYTHONIOENCODING: "utf-8" };
  for (const args of pasos) {
    console.log(`\n> python ${args.join(" ")}`);
    const r = spawnSync(python, args, { cwd: backend, env: envPruebas, stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  process.exit(0);
}

console.log(`[backend] DEEPSEEK_MODE=${env.DEEPSEEK_MODE} → ${env.DEEPSEEK_API_URL}`);
const hijo = spawn(python, ["-m", "uvicorn", "main:app", "--reload", "--port", "8000"], {
  cwd: backend,
  env,
  stdio: "inherit",
});
hijo.on("exit", (code) => process.exit(code ?? 0));
for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, () => hijo.kill(senal));
