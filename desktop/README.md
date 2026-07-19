# Meta-Agente — App de escritorio (autocontenida)

Aplicación de escritorio que **no necesita Docker ni Python** en la máquina del
usuario final. El backend viaja dentro del instalador como ejecutable y la app
lo arranca y lo detiene sola.

## Cómo funciona

```
┌─ Ventana Tauri ────────────────────────────────────┐
│  Frontend React (estático, dentro del instalador)  │
│                      │ HTTP a 127.0.0.1:8756       │
│                      ▼                             │
│  Sidecar: metaagente-backend.exe (FastAPI)         │
│  · lo arranca Tauri al abrir la app                │
│  · la ventana se muestra cuando el puerto responde │
│  · se mata al cerrar la app                        │
└────────────────────────────────────────────────────┘
```

Piezas clave:

| Archivo | Rol |
|---|---|
| `backend/desktop_server.py` | Entrada del backend embebido: datos en la carpeta del usuario y `.env` propio |
| `src-tauri/src/lib.rs` | Arranca el sidecar, espera al puerto, muestra la ventana y mata el proceso al salir |
| `src-tauri/tauri.conf.json` | Declara el sidecar en `bundle.externalBin` |
| `build-desktop.ps1` | Compila frontend + empaqueta backend + genera el instalador |

## Compilar el instalador

Solo en la máquina que compila (no en la del usuario final):

- [Python 3.11+](https://www.python.org/downloads/)
- [Rust](https://rustup.rs)
- Node 20+

```powershell
cd desktop
.\build-desktop.ps1
```

El instalador queda en `src-tauri/target/release/bundle/nsis/`.

## Dónde guarda los datos

Nada se escribe junto al ejecutable (Program Files es de solo lectura). Todo va
a la carpeta de datos del usuario:

| Sistema | Carpeta |
|---|---|
| Windows | `%LOCALAPPDATA%\MetaAgente` |
| macOS | `~/Library/Application Support/MetaAgente` |
| Linux | `~/.local/share/MetaAgente` |

Allí se guardan la base de datos SQLite, los proyectos generados y el `.env`.

## Configuración (importante)

**Los secretos NO viajan dentro del instalador.** En el primer arranque la app
crea un `.env` de plantilla en la carpeta de datos y abre en **modo simulado**,
para que se pueda probar sin claves ni gastar cupo de IA.

Para usar IA real, edita ese `.env`:

```ini
USE_MOCK_LLM=false
DEEPSEEK_API_KEY=tu-clave
DEEPSEEK_BASE_URL=https://api.groq.com/openai/v1
DEEPSEEK_MODEL=llama-3.3-70b-versatile
GOOGLE_CLIENT_ID=tu-client-id
```

y vuelve a abrir la aplicación.
