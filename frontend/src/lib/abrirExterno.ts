/**
 * Abre un sitio de terceros (Facebook, WhatsApp Web, una noticia…) FUERA del
 * sistema, en el navegador donde el usuario ya tiene su sesión iniciada.
 *
 * Por qué no se incrustan: Facebook y WhatsApp Web prohíben mostrarse dentro de
 * otra página (`X-Frame-Options` / `frame-ancestors`), y aunque lo permitieran,
 * dentro de un marco no llegarían sus cookies: pedirían iniciar sesión otra vez.
 * Abrirlos aparte es justo "entrar como se entra normalmente en este equipo".
 *
 * En el escritorio (Tauri) un `window.open` abriría otra ventana del webview,
 * sin la sesión del navegador; por eso ahí se usa el plugin opener, que lo
 * manda al navegador predeterminado (mismo truco que AvisoVersion y el login).
 */
export function abrirExterno(url: string): void {
  if ("__TAURI_INTERNALS__" in window) {
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url))
      .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
    return;
  }
  // Síncrono a propósito: dentro del clic, el navegador no lo trata como popup.
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Las apps de uso diario con acceso directo desde el menú y La Sala. */
export const APPS_EXTERNAS = {
  facebook: "https://www.facebook.com/",
  whatsapp: "https://web.whatsapp.com/",
} as const;
