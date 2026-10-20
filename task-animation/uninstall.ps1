# Removes the task-animation hooks from ~/.claude/settings.json and deletes the install folder.
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\task-animation\uninstall.ps1"
$ErrorActionPreference = 'Stop'

$Dest     = Join-Path $env:USERPROFILE '.claude\task-animation'
$Settings = Join-Path $env:USERPROFILE '.claude\settings.json'
$VenvPy   = Join-Path $Dest '.venv\Scripts\python.exe'
$Merge    = Join-Path $Dest 'settings_merge.py'
if (-not (Test-Path $Merge)) { $Merge = Join-Path $PSScriptRoot 'settings_merge.py' }

# 1. Stop the app
$p = 47821
$cfgPath = Join-Path $Dest 'config.json'
if (Test-Path $cfgPath) { try { $p = (Get-Content $cfgPath -Raw | ConvertFrom-Json).port } catch { } }
try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$p/quit" -Method Post -Headers @{ 'X-Task-Animation' = '1' } `
        -TimeoutSec 2 -UseBasicParsing | Out-Null
    Start-Sleep -Milliseconds 800
} catch { }
$run = Join-Path $Dest 'state\running.json'
if (Test-Path $run) {
    try { Stop-Process -Id (Get-Content $run -Raw | ConvertFrom-Json).pid -Force -ErrorAction SilentlyContinue } catch { }
}

# 2. Remove hook entries (other hooks and settings are kept; a backup is written first)
$py = $null
if (Test-Path $VenvPy) { $py = @($VenvPy) }
elseif (Get-Command py -ErrorAction SilentlyContinue) { $py = @('py', '-3') }
elseif (Get-Command python -ErrorAction SilentlyContinue) { $py = @('python') }
if ($py -and (Test-Path $Merge)) {
    $tmp = Join-Path $env:TEMP 'task-animation-settings_merge.py'
    Copy-Item $Merge $tmp -Force          # run from TEMP so the folder can be deleted
    $exe = $py[0]; $rest = @($py | Select-Object -Skip 1)
    & $exe @rest $tmp uninstall --settings $Settings
    if ($LASTEXITCODE -ne 0) { throw "Could not update settings.json; folder NOT removed." }
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
} else {
    throw "Python not found: remove the 'task-animation/hook.py' entries from $Settings manually, then delete $Dest."
}

# 3. Delete the folder
Set-Location $env:USERPROFILE
if (Test-Path $Dest) {
    Start-Sleep -Milliseconds 300
    Remove-Item $Dest -Recurse -Force
}
Write-Host "task-animation uninstalled." -ForegroundColor Green
