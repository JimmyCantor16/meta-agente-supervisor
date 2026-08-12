# Construye la app de escritorio del Meta-Agente en MODO NUBE.
#
# La app ya NO empaqueta ningun backend: la ventana Tauri carga el frontend
# React estatico y este habla directo con el backend COMPARTIDO en produccion
# (https://metaagente-backend.onrender.com), igual que la web y el movil.
# Por eso aqui solo hay dos pasos: compilar el frontend y armar el instalador.
#
# El modo local con sidecar quedo PAUSADO: build-sidecar.ps1 sigue existiendo
# para quien quiera reempaquetar el backend con PyInstaller, pero lib.rs ya no
# arranca ningun proceso. Ver README.md de esta carpeta.
#
# Requisitos en la maquina que compila (solo aqui, no en la del usuario final):
#   - Node 20+
#   - Rust: https://rustup.rs
#
# Uso (desde cualquier carpeta):  .\desktop\build-desktop.ps1

$ErrorActionPreference = "Stop"

$desktop  = $PSScriptRoot
$root     = Split-Path $desktop -Parent
$frontend = Join-Path $root "frontend"

Write-Host "==> 1/3 Compilando el frontend apuntando al backend de produccion" -ForegroundColor Cyan
# El webview no tiene proxy delante (no hay Nginx ni Vite): el frontend debe
# llevar horneada la URL absoluta del backend. Si esta variable queda vacia,
# TODO el REST muere dentro de la app (api.ts, GoogleLoginButton y
# PublishGuide la leen en tiempo de build).
$env:VITE_API_URL = "https://metaagente-backend.onrender.com"

Push-Location $frontend
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install (frontend) fallo con exit $LASTEXITCODE" }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm run build (frontend) fallo con exit $LASTEXITCODE" }
Pop-Location

# Tauri sirve los estaticos desde desktop/dist (ver `frontendDist`).
$dist = Join-Path $desktop "dist"
if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
Copy-Item -Recurse (Join-Path $frontend "dist") $dist
Write-Host "    frontend -> $dist"

Write-Host "==> 2/3 Construyendo el instalador con Tauri" -ForegroundColor Cyan
Push-Location $desktop
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install (desktop) fallo con exit $LASTEXITCODE" }
npm run tauri build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "tauri build fallo con exit $LASTEXITCODE" }
Pop-Location

Write-Host "==> 3/3 Listo" -ForegroundColor Green
$installer = Join-Path $desktop "src-tauri\target\release\bundle\nsis"
Write-Host "Instalador en: $installer"
Write-Host ""
Write-Host "La app se conecta al backend compartido en la nube: el usuario final" -ForegroundColor Yellow
Write-Host "no configura nada (ni claves de IA ni Google en su maquina)." -ForegroundColor Yellow
