//! App de escritorio autocontenida del Meta-Agente.
//!
//! No necesita Docker ni Python instalado: el backend viaja empaquetado como
//! *sidecar* (un ejecutable creado con PyInstaller). Al abrir la app se arranca
//! ese proceso, se espera a que su puerto responda y recién ahí se muestra la
//! ventana; al cerrar, el proceso se mata para no dejar nada colgando.

use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, State};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Puerto en el que escucha el backend embebido (ver `backend/desktop_server.py`).
const BACKEND_PORT: u16 = 8756;

/// Tiempo máximo de espera a que el backend arranque antes de mostrar la ventana.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

/// Guarda el proceso del backend para poder cerrarlo al salir.
///
/// Se guarda también el PID porque no basta con matar el proceso lanzado: el
/// ejecutable creado por PyInstaller en modo `--onefile` se re-lanza a sí mismo
/// como proceso hijo, así que matar solo al padre deja al hijo vivo ocupando el
/// puerto. Hay que matar el ÁRBOL completo.
#[derive(Default)]
struct BackendProcess {
    child: Mutex<Option<CommandChild>>,
    pid: Mutex<Option<u32>>,
}

/// Mata el proceso del backend y todos sus descendientes.
fn kill_backend(state: &BackendProcess) {
    let pid = *state.pid.lock().unwrap();

    #[cfg(windows)]
    if let Some(pid) = pid {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: evita el parpadeo de una consola al cerrar la app.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }

    // En el resto de plataformas (y como respaldo en Windows) basta con matar
    // el proceso que lanzamos.
    let child = state.child.lock().unwrap().take();
    if let Some(child) = child {
        let _ = child.kill();
    }

    let _ = pid;
}

/// Espera a que el backend acepte conexiones en su puerto.
///
/// Devuelve `true` si respondió dentro del tiempo límite. Se sondea el puerto en
/// vez de hacer una petición HTTP para no arrastrar un cliente HTTP entero.
fn wait_for_backend() -> bool {
    let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, BACKEND_PORT);
    let deadline = Instant::now() + STARTUP_TIMEOUT;

    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&address.into(), Duration::from_millis(500)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(BackendProcess::default())
        .setup(|app| {
            // Arranca el backend empaquetado.
            let (mut rx, child) = app
                .shell()
                .sidecar("metaagente-backend")
                .expect("no se encontró el sidecar 'metaagente-backend'")
                .spawn()
                .expect("no se pudo arrancar el backend embebido");

            let state = app.state::<BackendProcess>();
            state.pid.lock().unwrap().replace(child.pid());
            state.child.lock().unwrap().replace(child);

            // Reenvía la salida del backend a la consola: sin esto, depurar un
            // fallo de arranque en la app instalada sería a ciegas.
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                            print!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[backend] terminó con código {:?}", payload.code);
                        }
                        _ => {}
                    }
                }
            });

            // La ventana nace oculta: se muestra cuando el backend ya responde,
            // así el usuario no ve una pantalla con errores de conexión.
            let window = app.get_webview_window("main").expect("falta la ventana 'main'");
            tauri::async_runtime::spawn(async move {
                if !wait_for_backend() {
                    eprintln!("[backend] no respondió a tiempo; se muestra la ventana igualmente");
                }
                let _ = window.show();
                let _ = window.set_focus();
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error al construir la aplicación Tauri")
        .run(|app_handle, event| {
            // Al salir hay que matar el backend: si no, el proceso sigue vivo y
            // el puerto queda ocupado para la siguiente apertura.
            if let RunEvent::Exit = event {
                let state: State<BackendProcess> = app_handle.state();
                kill_backend(&state);
            }
        });
}
