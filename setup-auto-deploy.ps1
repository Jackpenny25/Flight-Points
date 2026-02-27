# setup-auto-deploy.ps1 — Registers the auto-deploy script as a Windows Scheduled Task.
# Must be run as Administrator on the server.

$ErrorActionPreference = "Stop"

$TaskName = "FlightPoints-AutoDeploy"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath = Join-Path $ProjectDir "auto-deploy.ps1"
$IntervalMinutes = 2

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "This script must be run as Administrator. Elevating..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host ""
Write-Host "=== Flight-Points Auto-Deploy Setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Task Name       : $TaskName"
Write-Host "Script          : $ScriptPath"
Write-Host "Check Interval  : Every $IntervalMinutes minutes"
Write-Host "Working Dir     : $ProjectDir"
Write-Host ""

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing scheduled task '$TaskName'..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Build the action — run PowerShell with the auto-deploy script
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`" -IntervalMinutes $IntervalMinutes" `
    -WorkingDirectory $ProjectDir

# Trigger: at system startup (the script loops internally)
$trigger = New-ScheduledTaskTrigger -AtStartup

# Settings: run whether user is logged on or not, restart on failure, don't stop on idle
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0)

# Principal: run as SYSTEM with highest privileges (no UAC prompt)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Register the task
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Checks for new commits every $IntervalMinutes minutes and deploys Flight-Points automatically." `
    -Force

Write-Host ""
Write-Host "Scheduled task '$TaskName' created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "The task will:" -ForegroundColor Cyan
Write-Host "  1. Start automatically at system boot"
Write-Host "  2. Check for new commits every $IntervalMinutes minutes"
Write-Host "  3. Pull, build, and restart the service if new commits are found"
Write-Host "  4. Log all activity to: $ProjectDir\auto-deploy.log"
Write-Host ""

# Offer to start it now
$startNow = Read-Host "Start the task now? (Y/n)"
if ($startNow -ne 'n' -and $startNow -ne 'N') {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "Task started! Check auto-deploy.log for output." -ForegroundColor Green
} else {
    Write-Host "Task will start at next system boot." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  Get-ScheduledTask -TaskName '$TaskName'             # Check status"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'           # Start manually"
Write-Host "  Stop-ScheduledTask -TaskName '$TaskName'            # Stop"
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName'      # Remove"
Write-Host "  Get-Content '$ProjectDir\auto-deploy.log' -Tail 20  # View recent logs"
Write-Host ""
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
