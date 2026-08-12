# Meta-Agente — App de escritorio (modo nube)

Ventana nativa (Tauri) que carga el frontend React estático y habla directo
con el backend **compartido en producción**:
`https://metaagente-backend.onrender.com`.

No empaqueta ningún servidor: no necesita Docker ni Python en la máquina del
usuario final, y **no hay nada que configurar** — las claves de IA y de Google
viven en el backend de la nube, igual que en la web y en el móvil.

## Cómo funciona

```
┌─ Ventana Tauri ────────────────────────────────────┐
│  Frontend React (estático, dentro del instalador)  │
│                      │ HTTPS / WSS                 │
└──────────────────────┼─────────────────────────────┘
                       ▼
        Backend compartido en Render
        https://metaagente-backend.onrender.com
```

Piezas clave:

| Archivo | Rol |
|---|---|
| `src-tauri/src/lib.rs` | Muestra la ventana de inmediato; ya **no** arranca ningún proceso |
| `src-tauri/tauri.conf.json` | `frontendDist: ../dist` y un CSP que solo permite conectar al backend de producción |
| `build-desktop.ps1` | Compila el frontend con la URL del backend horneada y genera el instalador |
| `build-sidecar.ps1` | *(pausado)* Empaqueta el backend local con PyInstaller, por si vuelve el modo local |

## Por qué se retiró el sidecar

La primera versión empaquetaba el backend FastAPI como ejecutable (~69 MB) y
lo arrancaba al abrir la app. En la práctica solo retrasaba la apertura hasta
60 segundos y dejaba procesos huérfanos ocupando el puerto (`lib.rs` lo narra
en su comentario de `setup`). Ahora la ventana abre al instante y, si el
servidor falla, la propia interfaz lo explica.

Restos del modo local, a propósito:

- `src-tauri/binaries/metaagente-backend-x86_64-pc-windows-msvc.exe` (69 MB)
  quedó **huérfano**: nada lo arranca ni lo empaqueta (ya no hay
  `bundle.externalBin` en `tauri.conf.json`). Se conserva por ahora; bórralo
  cuando el modo local se descarte del todo.
- `build-sidecar.ps1` y `backend/desktop_server.py` quedan como opción
  **pausada** para reconstruir ese modo local si algún día hace falta trabajar
  sin conexión.

## Compilar el instalador

Solo en la máquina que compila (no en la del usuario final):

- Node 20+
- [Rust](https://rustup.rs)

```powershell
.\desktop\build-desktop.ps1   # se puede correr desde cualquier carpeta
```

El script hace tres cosas:

1. Compila `frontend/` con `VITE_API_URL=https://metaagente-backend.onrender.com`
   horneada. **Si esa variable queda vacía, TODO el REST muere dentro del
   webview**: el frontend la lee en tiempo de build (`src/lib/api.ts`,
   `GoogleLoginButton.tsx`, `PublishGuide.tsx`) y sin ella llama rutas
   relativas que dentro de Tauri no llegan a ningún lado.
2. Copia el resultado a `desktop/dist`, de donde Tauri sirve los estáticos
   (ver `frontendDist`).
3. Corre `tauri build`. El instalador queda en
   `src-tauri/target/release/bundle/nsis/`.

## Versión

La versión de la app vive en **tres** sitios y deben coincidir:
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `package.json`
(hoy: **1.1.0**).
