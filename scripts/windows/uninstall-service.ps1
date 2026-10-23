# Removes the KEM Site scheduled tasks (data is not touched). Run in an Administrator PowerShell.
foreach ($name in "KEM Site", "KEM Site backup") {
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "Removed $name"
  }
}
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*next*start*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
