//! App de escritorio del Meta-Agente.
//!
//! Se conecta al backend COMPARTIDO en producción, así que no empaqueta ningún
//! servidor: la ventana abre al instante y todo lo que ve el usuario viene de
//! la nube, igual que en la web y en el móvil.

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Ya NO se arranca ningún backend embebido: la app se conecta al
            // backend compartido en producción, así que aquel ejecutable de
            // ~69 MB solo servía para retrasar la apertura hasta 60 segundos
            // (y para dejar procesos huérfanos ocupando el puerto).
            //
            // La ventana se muestra de inmediato: si algo del servidor falla,
            // la propia interfaz lo explica, que es mejor que un icono que no
            // abre nada.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al arrancar la aplicación Tauri");
}
