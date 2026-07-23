# Fase 2 aislada: empaqueta SOLO el sidecar del backend, con log propio.
# Se puede correr suelta cuando el build completo es demasiado largo para
# una sola sesión, o para diagnosticar por qué PyInstaller muere.
$ErrorActionPreference = "Stop"

$desktop  = $PSScriptRoot
$root     = Split-Path $desktop -Parent
$backend  = Join-Path $root "backend"
$binaries = Join-Path $desktop "src-tauri\binaries"
$log      = Join-Path $env:TEMP "sidecar.log"

Start-Transcript -Path $log -Force | Out-Null
try {
    # cargo/rustc no viven en el PATH de un proceso desacoplado.
    $env:Path += ";$env:USERPROFILE\.cargo\bin"
    $python = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
    $triple = (rustc -vV | Select-String -Pattern "^host: ").Line -replace "^host: ", ""
    Write-Host "python: $python | triple: $triple"

    Push-Location $backend
    # PyInstaller narra TODO por stderr: con 'Stop', PowerShell 5.1 convierte
    # esa narración en excepción fatal. Aquí manda el exit code, no el stderr.
    $ErrorActionPreference = "Continue"
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
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller exit $LASTEXITCODE" }
    $ErrorActionPreference = "Stop"
    Pop-Location

    if (-not (Test-Path $binaries)) { New-Item -ItemType Directory -Path $binaries | Out-Null }
    Copy-Item -Force (Join-Path $backend "dist-desktop\metaagente-backend.exe") `
        (Join-Path $binaries "metaagente-backend-$triple.exe")
    Write-Host "SIDECAR OK -> $binaries\metaagente-backend-$triple.exe"
} finally {
    Stop-Transcript | Out-Null
}
