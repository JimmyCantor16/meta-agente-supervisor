<#
.SYNOPSIS
  Abre el entorno local en DOS terminales:
    1) Meta-Agente: backend FastAPI (:8000, DEEPSEEK_MODE=local) + frontend Vite (:5173)
    2) deepseek-web-chat: backend (:6174) + su frontend (:6173, para el login)

.EXAMPLE
  .\scripts\dos-terminales.ps1
  .\scripts\dos-terminales.ps1 -DeepSeekDir "D:\repos\deepseek-web-chat"

.NOTES
  Primera vez: en la ventana de deepseek-web-chat, abre http://localhost:6173 y
  pulsa «Iniciar sesión» (Chrome se abre para entrar en chat.deepseek.com).
  Sin esa sesión, el Meta-Agente sigue funcionando con el resto de la cadena.
  Con Docker (docker compose up) el backend ya apunta a host.docker.internal:6174.
#>
param(
  [string]$DeepSeekDir = (Join-Path $env:USERPROFILE "Documents\GitHub\deepseek-web-chat")
)

$raiz = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $DeepSeekDir "package.json"))) {
  Write-Error "No encuentro deepseek-web-chat en '$DeepSeekDir'. Pásalo con -DeepSeekDir."
  exit 1
}
if (-not (Test-Path (Join-Path $raiz "node_modules\concurrently"))) {
  Write-Host "Instalando dependencias de arranque (concurrently)..."
  npm --prefix $raiz install --no-audit --no-fund | Out-Null
}

# Terminal 2 primero: así DeepSeek ya está escuchando cuando el backend arranca.
$env:DEEPSEEK_WEB_CHAT_DIR = $DeepSeekDir
Start-Process powershell -WorkingDirectory $raiz -ArgumentList @(
  "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'Terminal 2 - deepseek-web-chat'; npm run dev:deepseek"
)
Start-Process powershell -WorkingDirectory $raiz -ArgumentList @(
  "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'Terminal 1 - Meta-Agente'; npm run dev"
)

Write-Host ""
Write-Host "Terminal 1 · Meta-Agente     → http://localhost:5173  (API: http://localhost:8000/docs)"
Write-Host "Terminal 2 · deepseek-web-chat → http://localhost:6173  (login una vez)"
Write-Host "Cadena de IA en vivo (admin): GET http://localhost:8000/api/v1/agent/ia/cadena"
