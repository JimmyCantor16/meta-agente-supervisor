// Terminal 2: arranca deepseek-web-chat (backend :6174 + su frontend :6173).
//
// La carpeta sale de DEEPSEEK_WEB_CHAT_DIR o, si no, de la ruta habitual del
// equipo (~/Documents/GitHub/deepseek-web-chat). La primera vez hay que
// iniciar sesión en DeepSeek desde su frontend (http://localhost:6173,
// botón «Iniciar sesión»); después el perfil queda guardado.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const carpeta = process.env.DEEPSEEK_WEB_CHAT_DIR || join(homedir(), "Documents", "GitHub", "deepseek-web-chat");
if (!existsSync(join(carpeta, "package.json"))) {
  console.error(`[deepseek] No encuentro deepseek-web-chat en: ${carpeta}`);
  console.error("[deepseek] Define DEEPSEEK_WEB_CHAT_DIR con su ruta.");
  process.exit(1);
}
console.log(`[deepseek] ${carpeta} → backend http://localhost:6174 · login en http://localhost:6173`);
const hijo = spawn("npm", ["run", "dev"], { cwd: carpeta, stdio: "inherit", shell: process.platform === "win32" });
hijo.on("exit", (code) => process.exit(code ?? 0));
