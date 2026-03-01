Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ==========================================
# Install weekly backup task (Sundays)
# ==========================================

# ---------- CONFIGURATION (EDIT IF NEEDED) ----------
$TaskName = 'FlightPoints-Weekly-Backup'
$RunTime = '03:00'
# -----------------------------------------------------

$scriptPath = Join-Path $PSScriptRoot 'server-backup.ps1'
if (-not (Test-Path -Path $scriptPath)) {
    throw "Could not find backup script at: $scriptPath"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At $RunTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Scheduled task installed/updated: $TaskName"
Write-Host "Runs every Sunday at $RunTime"