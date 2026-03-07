# setup-auto-deploy.ps1 — Registers the auto-deploy script as a Windows Scheduled Task
# and creates a desktop shortcut to restart it after hibernation.
# Must be run as Administrator on the server.

$ErrorActionPreference = "Stop"

$TaskName = "FlightPoints-AutoDeploy"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath = Join-Path $ProjectDir "auto-deploy.ps1"

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
Write-Host "Working Dir     : $ProjectDir"
Write-Host ""
Write-Host "Adaptive polling schedule:" -ForegroundColor DarkCyan
Write-Host "  After commit : 30s for 30min, then 1min for 30min, then 2min"
Write-Host "  After 7 days : every 1 hour (idle)"
Write-Host "  After 30 days: stop entirely (hibernate)"
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
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`"" `
    -WorkingDirectory $ProjectDir

# Trigger: at system startup (the script loops internally)
$trigger = New-ScheduledTaskTrigger -AtStartup

# Settings: run whether user is logged on or not, restart on failure, don't stop on idle
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
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
    -Description "Adaptive auto-deploy for Flight-Points. Checks for commits with burst/cooldown/normal/idle/hibernate modes." `
    -Force

Write-Host ""
Write-Host "Scheduled task '$TaskName' created successfully!" -ForegroundColor Green

# --- Create Desktop Shortcut ---
Write-Host ""
Write-Host "Creating desktop shortcut..." -ForegroundColor Cyan

# Try common desktop paths
$desktopPath = [Environment]::GetFolderPath("CommonDesktopDirectory")  # All users desktop
if (-not $desktopPath -or -not (Test-Path $desktopPath)) {
    $desktopPath = [Environment]::GetFolderPath("Desktop")  # Current user desktop
}

$shortcutPath = Join-Path $desktopPath "Restart Flight-Points Deploy.lnk"

# Create restart helper script
$restartScriptPath = Join-Path $ProjectDir "restart-auto-deploy.ps1"
$restartScriptContent = @"
# restart-auto-deploy.ps1 — Restarts the auto-deploy scheduled task.
# Double-click the desktop shortcut to run this after hibernation.

`$TaskName = "FlightPoints-AutoDeploy"

# Check admin
`$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not `$isAdmin) {
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"`$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "Restarting Flight-Points Auto-Deploy..." -ForegroundColor Cyan

# Stop if running
`$task = Get-ScheduledTask -TaskName `$TaskName -ErrorAction SilentlyContinue
if (`$task) {
    if (`$task.State -eq 'Running') {
        Stop-ScheduledTask -TaskName `$TaskName
        Start-Sleep -Seconds 2
    }
    Start-ScheduledTask -TaskName `$TaskName
    Write-Host "Auto-deploy restarted successfully!" -ForegroundColor Green
    Write-Host "It will check for commits immediately, then follow the adaptive schedule." -ForegroundColor DarkCyan
} else {
    Write-Host "Scheduled task '`$TaskName' not found. Run setup-auto-deploy.ps1 first." -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to close..."
`$null = `$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
"@

Set-Content -Path $restartScriptPath -Value $restartScriptContent -Encoding UTF8
Write-Host "  Created restart script: $restartScriptPath" -ForegroundColor DarkGray

# Create .lnk shortcut on desktop
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$restartScriptPath`""
$shortcut.WorkingDirectory = $ProjectDir
$shortcut.Description = "Restart Flight-Points Auto-Deploy (after hibernation or manual stop)"
$shortcut.Save()

Write-Host "  Desktop shortcut created: $shortcutPath" -ForegroundColor Green

# --- Create Monitor shortcut on desktop ---
$monitorScriptPath = Join-Path $ProjectDir "monitor-deploy.ps1"
$monitorShortcutPath = Join-Path $desktopPath "Deploy Monitor.lnk"

$monitorShortcut = $shell.CreateShortcut($monitorShortcutPath)
$monitorShortcut.TargetPath = "powershell.exe"
$monitorShortcut.Arguments = "-ExecutionPolicy Bypass -NoExit -File `"$monitorScriptPath`""
$monitorShortcut.WorkingDirectory = $ProjectDir
$monitorShortcut.Description = "Live dashboard showing Flight-Points deploy commits and status"
$monitorShortcut.Save()

Write-Host "  Monitor shortcut created: $monitorShortcutPath" -ForegroundColor Green

Write-Host ""
Write-Host "The system will:" -ForegroundColor Cyan
Write-Host "  1. Start automatically at system boot"
Write-Host "  2. After a commit: check every 30s (30min), then 1min (30min), then 2min"
Write-Host "  3. After 7 days idle: slow to hourly checks"
Write-Host "  4. After 30 days idle: stop entirely (hibernate)"
Write-Host "  5. Double-click 'Restart Flight-Points Deploy' to restart after hibernation"
Write-Host "  6. Double-click 'Deploy Monitor' to watch live commit/deploy status"
Write-Host "  7. Log all activity to: $ProjectDir\auto-deploy.log"
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
