// Un solo canal para los tres aparatos.
//
// El problema: la web, el escritorio y el móvil escuchan el mismo canal de
// progreso, pero no siempre el MISMO. Si generas contra el backend de tu
// portátil, el móvil no puede verlo — no alcanza tu `localhost` — y por eso no
// avisaba de nada. Y cuando sí lo veían los tres, el aviso sonaba tres veces.
//
// Aquí viven las dos piezas que lo arreglan:
//   · `espejarEvento`  — reenvía al backend compartido lo que solo tú ves.
//   · `meTocaAvisar`   — reparte el aviso sonoro: suena uno, los tres lo guardan.

/**
 * Saca la URL de un mensaje del canal, sin la puntuación de la frase.
 *
 * Hace falta porque el mensaje amable acaba en signo de admiración — «¡Tu
 * sistema está VIVO en http://…:5301!» — y el `!` se pegaba a la dirección. El
 * resultado era un enlace «Abrir ↗» que no abría nada: el peor final posible
 * para una construcción que sí había salido bien.
 */
export function urlDelTexto(txt: string): string | null {
  const m = txt.match(/https?:\/\/\S+/);
  if (!m) return null;
  const limpio = m[0].replace(/[!?.,;:)\]}«»"']+$/, "");
  return limpio || null;
}

const PROD_HTTP = "https://metaagente-backend.onrender.com";
const PROD_WS = "wss://metaagente-backend.onrender.com/api/v1/ws/progreso";

/** True si corremos DENTRO de la app de escritorio (Tauri), no en el navegador. */
export function esEscritorio(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

/** El canal que este aparato debe escuchar, y si es el de tu propia máquina. */
export function canalDeEscucha(): { url: string; esLocal: boolean } {
  // La sesión viaja en la URL porque un navegador no puede poner cabeceras al
  // abrir un WebSocket. Sin ella se escucha igual, pero solo los eventos
  // generales: los pasos de una generación son de quien la pidió.
  const token = credencial();
  const conSesion = (base: string) =>
    token ? `${base}?token=${encodeURIComponent(token)}` : base;

  // Escritorio: el backend compartido. Ahí llega tanto lo que se genera en la
  // nube como lo que la web local reenvía, así que ve todo.
  if (esEscritorio()) return { url: conSesion(PROD_WS), esLocal: false };
  const host = window.location.host;
  // En Render el proxy del sitio estático NO reenvía WebSocket → directo al backend.
  if (host.endsWith(".onrender.com")) return { url: conSesion(PROD_WS), esLocal: false };
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return { url: conSesion(`${proto}://${host}/api/v1/ws/progreso`), esLocal: true };
}

function credencial(): string | null {
  try {
    return window.localStorage.getItem("auth.credential");
  } catch {
    return null;
  }
}

/**
 * Identificador de ESTE aparato. Estable entre recargas para que el turno de
 * aviso siga siendo suyo si el socket se cae y vuelve.
 */
export function idDeAparato(): string {
  const CLAVE = "app.aparato";
  try {
    const guardado = window.localStorage.getItem(CLAVE);
    if (guardado) return guardado;
    const c = window.crypto as Crypto | undefined;
    const nuevo = `${esEscritorio() ? "escritorio" : "web"}-${
      c && "randomUUID" in c ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
    }`;
    window.localStorage.setItem(CLAVE, nuevo);
    return nuevo;
  } catch {
    return esEscritorio() ? "escritorio" : "web";
  }
}

// Solo se reenvían los pasos que cuentan algo. El canal local también lleva
// ruido interno, y llenar el canal compartido de líneas irrelevantes gastaría
// datos del móvil sin darle información.
const VALE_LA_PENA =
  /(Cerebro IA|Plano listo|Escribiendo|Instalando|Compilando|Verificación|VIVO en|RETENIDA|no se entrega|REVISIÓN PENDIENTE|IA «|Arreglo automático|arquetipo|Idea única|proveedores de IA)/i;

let ultimoEspejo = 0;
const yaEspejado = new Set<string>();

/**
 * Reenvía un paso del progreso al backend compartido, para que el escritorio y
 * el móvil vean lo que está pasando en tu máquina.
 *
 * Silencioso a propósito: si falla (sin sesión, sin red, servidor dormido) el
 * progreso local sigue funcionando igual. Reenviar es un extra, no un requisito.
 */
export function espejarEvento(texto: string): void {
  const cred = credencial();
  if (!cred || !texto || !VALE_LA_PENA.test(texto)) return;

  // Un mismo paso no se reenvía dos veces (los sockets reconectan y repiten).
  if (yaEspejado.has(texto)) return;
  yaEspejado.add(texto);
  if (yaEspejado.size > 300) yaEspejado.clear();

  // Freno de ritmo: escribir 40 archivos son 40 líneas seguidas y el backend
  // compartido tiene límite por IP. Nos quedamos con ~3 por segundo.
  const ahora = Date.now();
  if (ahora - ultimoEspejo < 300 && !/VIVO en|RETENIDA|Verificación superada/i.test(texto)) return;
  ultimoEspejo = ahora;

  void fetch(`${PROD_HTTP}/api/v1/agent/eventos/reenviar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred}` },
    body: JSON.stringify({ texto }),
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * ¿Le toca a este aparato hacer sonar el aviso del sistema?
 *
 * Falla abierto: si no hay sesión o el servidor no responde, avisa. Es mejor un
 * aviso repetido que perderse que tu sistema ya está listo.
 */
export async function meTocaAvisar(clave: string): Promise<boolean> {
  const cred = credencial();
  if (!cred) return true;
  try {
    const r = await fetch(`${PROD_HTTP}/api/v1/agent/eventos/aviso`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred}` },
      body: JSON.stringify({ clave, cliente: idDeAparato() }),
    });
    if (!r.ok) return true;
    const datos = (await r.json()) as { avisar?: boolean };
    return datos.avisar !== false;
  } catch {
    return true;
  }
}
