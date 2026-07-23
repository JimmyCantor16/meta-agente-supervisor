# Construye la app de escritorio AUTOCONTENIDA del Meta-Agente.
#
# Resultado: un instalador que NO necesita Docker ni Python en la máquina del
# usuario, porque el backend viaja dentro como ejecutable (sidecar).
#
# Requisitos en la máquina que compila (solo aquí, no en la del usuario final):
#   - Python 3.11+  con:  pip install pyinstaller
#   - Rust:               https://rustup.rs
#   - Node 20+
#
# Uso:  cd desktop ; .\build-desktop.ps1

$ErrorActionPreference = "Stop"

$desktop  = $PSScriptRoot
$root     = Split-Path $desktop -Parent
$backend  = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$binaries = Join-Path $desktop "src-tauri\binaries"

Write-Host "==> 1/4 Compilando el frontend apuntando al backend embebido" -ForegroundColor Cyan
# El frontend empaquetado no tiene un proxy delante (no hay Nginx ni Vite), así
# que debe llamar directamente al puerto del sidecar.
$env:VITE_API_URL = "http://127.0.0.1:8756"
Push-Location $frontend
npm install
npm run build
Pop-Location

# Tauri sirve los estáticos desde desktop/dist (ver `frontendDist`).
$dist = Join-Path $desktop "dist"
if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
Copy-Item -Recurse (Join-Path $frontend "dist") $dist
Write-Host "    frontend -> $dist"

Write-Host "==> 2/4 Empaquetando el backend con PyInstaller" -ForegroundColor Cyan

# En Windows, `python` suele resolver al alias del Microsoft Store, que no es un
# intérprete real. Se busca una instalación de verdad antes de rendirse.
function Resolve-Python {
    $candidates = @()
    $candidates += (Get-Command py -ErrorAction SilentlyContinue).Source
    $candidates += Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName "python.exe" }
    $candidates += @("C:\Program Files\Python312\python.exe", "C:\Program Files\Python311\python.exe")
    $candidates += (Get-Command python -ErrorAction SilentlyContinue).Source

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            # El alias del Store existe pero falla al ejecutarse: se descarta así.
            & $candidate --version *> $null
            if ($LASTEXITCODE -eq 0) { return $candidate }
        }
    }
    throw "No se encontro un Python real. Instalalo desde https://www.python.org/downloads/"
}

$python = Resolve-Python
Write-Host "    python: $python"
& $python -m pip install --quiet --upgrade pyinstaller
& $python -m pip install --quiet -r (Join-Path $backend "requirements.txt")

# El sidecar DEBE llamarse <nombre>-<target triple>.exe para que Tauri lo
# encuentre; el triple se obtiene del propio compilador de Rust.
$triple = (rustc -vV | Select-String -Pattern "^host: " ).Line -replace "^host: ", ""
if (-not $triple) { throw "No se pudo determinar el target triple de Rust." }
Write-Host "    target triple: $triple"

Push-Location $backend
& $python -m PyInstaller `
    --onefile `
    --name metaagente-backend `
    --distpath (Join-Path $backend "dist-desktop") `
    --workpath (Join-Path $backend "build-desktop") `
    --specpath (Join-Path $backend "build-desktop") `
    --collect-all uvicorn `
    --collect-all fastapi `
    --collect-all pydantic `
    --collect-all openai `
    --collect-all google.auth `
    --collect-all websockets `
    --hidden-import "uvicorn.logging" `
    --hidden-import "uvicorn.protocols.http.auto" `
    --hidden-import "uvicorn.protocols.websockets.auto" `
    --hidden-import "uvicorn.lifespan.on" `
    --add-data "$backend\bases;bases" `
    --add-data "$backend\skills;skills" `
    --noconfirm `
    desktop_server.py
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "PyInstaller fallo (exit $LASTEXITCODE): NO se empaqueta un backend viejo."
}
Pop-Location

if (-not (Test-Path $binaries)) { New-Item -ItemType Directory -Path $binaries | Out-Null }
$built  = Join-Path $backend "dist-desktop\metaagente-backend.exe"
$target = Join-Path $binaries "metaagente-backend-$triple.exe"
Copy-Item -Force $built $target
Write-Host "    backend  -> $target"

Write-Host "==> 3/4 Construyendo el instalador con Tauri" -ForegroundColor Cyan
Push-Location $desktop
npm install
npm run tauri build
Pop-Location

Write-Host "==> 4/4 Listo" -ForegroundColor Green
$installer = Join-Path $desktop "src-tauri\target\release\bundle\nsis"
Write-Host "Instalador en: $installer"
Write-Host ""
Write-Host "Recuerda: la configuracion (claves de IA, Google) NO va dentro del" -ForegroundColor Yellow
Write-Host "instalador. Cada usuario la coloca en su carpeta de datos:" -ForegroundColor Yellow
Write-Host "  %LOCALAPPDATA%\MetaAgente\.env" -ForegroundColor Yellow
