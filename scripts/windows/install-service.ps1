# KEM Site – run as a background service on the ZBook (survives reboot) + nightly backup at 02:00.
# Run once in an *Administrator* PowerShell from the app folder:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\install-service.ps1
# Uses Windows Task Scheduler (built in, nothing to download). Tasks run as the current
# user ("S4U": no password stored, runs even when nobody is logged in, local files only).
$ErrorActionPreference = "Stop"
$App = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Me = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $Me -LogonType S4U -RunLevel Highest

# 1. the app – starts at boot, restarts itself (start-kem.cmd loop) and via Task Scheduler on failure
$start = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$App\scripts\windows\start-kem.cmd`"" -WorkingDirectory $App
$boot = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "KEM Site" -Action $start -Trigger $boot -Principal $principal -Settings $settings `
  -Description "KEM Site Coordination app (port 3000)" -Force | Out-Null

# 2. nightly backup at 02:00 (Asia/Dubai if the ZBook is on Dubai time)
$backup = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$App\scripts\windows\backup-now.cmd`"" -WorkingDirectory $App
$night = New-ScheduledTaskTrigger -Daily -At 2:00am
$bsettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName "KEM Site backup" -Action $backup -Trigger $night -Principal $principal -Settings $bsettings `
  -Description "KEM Site nightly backup to BACKUP_DIR" -Force | Out-Null

Start-ScheduledTask -TaskName "KEM Site"
Write-Host "Installed. App: http://localhost:3000   Logs: $App\data\logs" -ForegroundColor Green
Write-Host "Check:  Get-ScheduledTask 'KEM Site*' | Get-ScheduledTaskInfo"
