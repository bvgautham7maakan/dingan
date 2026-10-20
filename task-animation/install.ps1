# Installs the Claude Code task-animation companion.
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 [-Port 47821] [-ResetConfig]
param(
    [int]$Port = 0,
    [switch]$ResetConfig
)
$ErrorActionPreference = 'Stop'

$Src      = $PSScriptRoot
$Dest     = Join-Path $env:USERPROFILE '.claude\task-animation'
$Settings = Join-Path $env:USERPROFILE '.claude\settings.json'
$VenvPy   = Join-Path $Dest '.venv\Scripts\python.exe'

function Find-Python {
    $candidates = @(
        @{ Exe = 'py';      Args = @('-3') },
        @{ Exe = 'python';  Args = @() },
        @{ Exe = 'python3'; Args = @() }
    )
    foreach ($c in $candidates) {
        if (-not (Get-Command $c.Exe -ErrorAction SilentlyContinue)) { continue }
        try {
            $v = & $c.Exe @($c.Args) -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
            if ($LASTEXITCODE -eq 0 -and $v -match '^3\.(\d+)$' -and [int]$Matches[1] -ge 9) {
                return @{ Exe = $c.Exe; Args = $c.Args; Version = $v }
            }
        } catch { }
    }
    throw "Python 3.9+ not found. Install it from https://www.python.org/downloads/ (tick 'Add python.exe to PATH') and re-run."
}

function Stop-App {
    $cfgPath = Join-Path $Dest 'config.json'
    $p = 47821
    if (Test-Path $cfgPath) { try { $p = (Get-Content $cfgPath -Raw | ConvertFrom-Json).port } catch { } }
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:$p/quit" -Method Post -Headers @{ 'X-Task-Animation' = '1' } `
            -TimeoutSec 2 -UseBasicParsing | Out-Null
        Start-Sleep -Milliseconds 800
    } catch { }
    $run = Join-Path $Dest 'state\running.json'
    if (Test-Path $run) {
        try { Stop-Process -Id (Get-Content $run -Raw | ConvertFrom-Json).pid -Force -ErrorAction SilentlyContinue } catch { }
        Remove-Item $run -Force -ErrorAction SilentlyContinue
    }
}

$py = Find-Python
Write-Host "Python $($py.Version) found ($($py.Exe))"

Stop-App
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
foreach ($f in 'app.py', 'ui.html', 'hook.py', 'settings_merge.py', 'requirements.txt', 'README.md', 'uninstall.ps1') {
    Copy-Item (Join-Path $Src $f) (Join-Path $Dest $f) -Force
}
$cfgDest = Join-Path $Dest 'config.json'
if ($ResetConfig -or -not (Test-Path $cfgDest)) {
    Copy-Item (Join-Path $Src 'config.json') $cfgDest -Force
} else {
    Write-Host "Keeping existing config.json (use -ResetConfig to overwrite)"
}
if ($Port -gt 0) {
    $cfg = Get-Content $cfgDest -Raw | ConvertFrom-Json
    $cfg.port = $Port
    $cfg | ConvertTo-Json -Depth 5 | Set-Content $cfgDest -Encoding UTF8
}

if (-not (Test-Path $VenvPy)) {
    Write-Host "Creating virtual environment..."
    & $py.Exe @($py.Args) -m venv (Join-Path $Dest '.venv')
    if ($LASTEXITCODE -ne 0) { throw "venv creation failed" }
}
Write-Host "Installing dependencies (pywebview, pystray, Pillow)..."
& $VenvPy -m pip install --disable-pip-version-check -q --upgrade -r (Join-Path $Dest 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

Write-Host "Registering hooks in $Settings ..."
& $VenvPy (Join-Path $Dest 'settings_merge.py') install --settings $Settings --python $VenvPy --hook (Join-Path $Dest 'hook.py')
if ($LASTEXITCODE -ne 0) { throw "settings.json merge failed (file left unchanged)" }

Write-Host ""
Write-Host "Installed to $Dest" -ForegroundColor Green
Write-Host "The window appears on your next Claude Code prompt. Toggle: Ctrl+Alt+M or the tray icon."
