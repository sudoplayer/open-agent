#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

# ── Config ───────────────────────────────────────────────
$NGINX_PORT = 3066
$OPENWEBUI_PORT = 3088
$OPENWEBUI_ENV = 'open-webui'

$REPO_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$CONDA_BASE = 'D:\miniconda3'
$NGINX_HOME = 'D:\Software\nginx'
$NGINX_RUNTIME_DIR = Join-Path $env:USERPROFILE '.nginx'
$NGINX_TEMPLATE = Join-Path $REPO_DIR 'nginx\nginx.conf.template'
$NGINX_CONF = Join-Path $REPO_DIR 'nginx\nginx.conf'
$CONDA_EXE = Join-Path $CONDA_BASE 'Scripts\conda.exe'
$NGINX_BIN = Join-Path $NGINX_HOME 'nginx.exe'
$NGINX_PREFIX = $NGINX_HOME

function To-NginxPath([string]$Path) {
    return ($Path -replace '\\', '/')
}

function Test-PortListening([int]$Port) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($conn) { return $true }
    } catch {
        # Get-NetTCPConnection may be unavailable on some systems
    }

    return [bool](netstat -ano | Select-String -Pattern ":\s*$Port\s" -Quiet)
}

function Render-NginxConf {
    $repoDir = To-NginxPath $REPO_DIR
    $runtimeDir = To-NginxPath $NGINX_RUNTIME_DIR
    $mimeTypes = To-NginxPath (Join-Path $NGINX_HOME 'conf\mime.types')

    $content = Get-Content -Path $NGINX_TEMPLATE -Raw -Encoding UTF8
    $content = $content.Replace('${REPO_DIR}', $repoDir)
    $content = $content.Replace('${NGINX_RUNTIME_DIR}', $runtimeDir)
    $content = $content.Replace('${NGINX_MIME_TYPES}', $mimeTypes)

    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($NGINX_CONF, $content, $utf8NoBom)
}

function Invoke-NginxCommand {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$NginxArgs
    )

    & $NGINX_BIN -p $NGINX_PREFIX @NginxArgs
    if ($LASTEXITCODE -ne 0) {
        throw "nginx failed: nginx $($NginxArgs -join ' ')"
    }
}

function Start-Nginx {
    $nginxArgs = @('-p', $NGINX_PREFIX, '-c', $NGINX_CONF)
    Start-Process -FilePath $NGINX_BIN -ArgumentList $nginxArgs -WindowStyle Hidden
}

if (-not (Test-Path $CONDA_EXE)) {
    throw "conda not found at $CONDA_EXE"
}

if (-not (Test-Path $NGINX_BIN)) {
    throw "nginx not found at $NGINX_BIN"
}

$mimeTypesFile = Join-Path $NGINX_HOME 'conf\mime.types'
if (-not (Test-Path $mimeTypesFile)) {
    throw "mime.types not found at $mimeTypesFile"
}

# ── Ensure nginx runtime directories ─────────────────────
$runtimeDirs = @(
    (Join-Path $NGINX_RUNTIME_DIR 'logs'),
    (Join-Path $NGINX_RUNTIME_DIR 'tmp\client'),
    (Join-Path $NGINX_RUNTIME_DIR 'tmp\proxy'),
    (Join-Path $NGINX_RUNTIME_DIR 'tmp\fastcgi'),
    (Join-Path $NGINX_RUNTIME_DIR 'tmp\uwsgi'),
    (Join-Path $NGINX_RUNTIME_DIR 'tmp\scgi')
)
foreach ($dir in $runtimeDirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

# ── Start OpenWebUI ──────────────────────────────────────
Write-Host "==> Checking OpenWebUI on port $OPENWEBUI_PORT ..."
if (Test-PortListening $OPENWEBUI_PORT) {
    Write-Host '    OpenWebUI already running.'
} else {
    Write-Host '    Starting OpenWebUI ...'
    $env:ENABLE_FORWARD_USER_INFO_HEADERS = 'true'
    $env:DATA_DIR = Join-Path $env:USERPROFILE '.open-webui-latest'
    $env:HF_HUB_OFFLINE = '1'

    $proc = Start-Process -FilePath $CONDA_EXE `
        -ArgumentList @(
            'run', '-n', $OPENWEBUI_ENV, '--no-capture-output',
            'open-webui', 'serve', '--host', '0.0.0.0', '--port', "$OPENWEBUI_PORT"
        ) `
        -WorkingDirectory $REPO_DIR `
        -WindowStyle Minimized `
        -PassThru

    Write-Host "    OpenWebUI started (PID $($proc.Id))."
}

# ── Start / reload nginx ─────────────────────────────────
Write-Host "==> Configuring nginx on port $NGINX_PORT ..."
Render-NginxConf
Invoke-NginxCommand -t -c $NGINX_CONF

if (Test-PortListening $NGINX_PORT) {
    Write-Host '    Reloading nginx (paths refreshed from this repo) ...'
    Invoke-NginxCommand -s reload -c $NGINX_CONF
} else {
    Write-Host '    Starting nginx ...'
    Start-Nginx
    Write-Host '    nginx started.'
}

# ── Summary ──────────────────────────────────────────────
Write-Host ''
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
Write-Host "  OpenWebUI  → http://0.0.0.0:$NGINX_PORT"
Write-Host '  Backend    → http://0.0.0.0:8888   (start with: npm start)'
Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
