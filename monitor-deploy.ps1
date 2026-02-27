# monitor-deploy.ps1 — Live dashboard showing auto-deploy activity.
# Keep this window open to watch commits arrive and deployments run.

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile = Join-Path $ProjectDir "auto-deploy.log"

$Host.UI.RawUI.WindowTitle = "Flight-Points Deploy Monitor"

function Write-Header {
    Clear-Host
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "   Flight-Points Deploy Monitor" -ForegroundColor White
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Watching: " -NoNewline -ForegroundColor DarkGray
    Write-Host "$LogFile" -ForegroundColor Gray
    Write-Host "  Started:  " -NoNewline -ForegroundColor DarkGray
    Write-Host "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
    Write-Host ""

    # Show current task status
    $task = Get-ScheduledTask -TaskName "FlightPoints-AutoDeploy" -ErrorAction SilentlyContinue
    if ($task) {
        $stateColor = switch ($task.State) {
            'Running'  { 'Green' }
            'Ready'    { 'Yellow' }
            'Disabled' { 'Red' }
            default    { 'Gray' }
        }
        Write-Host "  Task Status: " -NoNewline -ForegroundColor DarkGray
        Write-Host "$($task.State)" -ForegroundColor $stateColor
    } else {
        Write-Host "  Task Status: " -NoNewline -ForegroundColor DarkGray
        Write-Host "Not Installed" -ForegroundColor Red
    }

    # Show last few relevant events from log
    if (Test-Path $LogFile) {
        $lastDeploy = Get-Content $LogFile -Tail 100 | Where-Object { $_ -match "Deployment complete|ERROR during deployment" } | Select-Object -Last 1
        if ($lastDeploy) {
            $wasSuccess = $lastDeploy -match "Deployment complete"
            Write-Host "  Last Deploy: " -NoNewline -ForegroundColor DarkGray
            if ($wasSuccess) {
                $ts = if ($lastDeploy -match '^\[(.+?)\]') { $Matches[1] } else { "unknown" }
                Write-Host "SUCCESS at $ts" -ForegroundColor Green
            } else {
                Write-Host "FAILED" -ForegroundColor Red
            }
        }

        $lastMode = Get-Content $LogFile -Tail 50 | Where-Object { $_ -match "MODE ->" } | Select-Object -Last 1
        if ($lastMode -and $lastMode -match 'MODE -> (\w+)') {
            Write-Host "  Current Mode:" -NoNewline -ForegroundColor DarkGray
            $mode = $Matches[1]
            $modeColor = switch ($mode) {
                'BURST'     { 'Magenta' }
                'COOLDOWN'  { 'Yellow' }
                'NORMAL'    { 'Cyan' }
                'IDLE'      { 'DarkYellow' }
                'HIBERNATE' { 'Red' }
                default     { 'Gray' }
            }
            Write-Host " $mode" -ForegroundColor $modeColor
        }
    }

    Write-Host ""
    Write-Host "  -------- Live Log (Ctrl+C to exit) --------" -ForegroundColor DarkGray
    Write-Host ""
}

function Format-LogLine {
    param([string]$Line)

    # Extract timestamp and message
    $timestamp = ""
    $message = $Line
    if ($Line -match '^\[(.+?)\] (.+)$') {
        $timestamp = $Matches[1]
        $message = $Matches[2]
    }

    # Determine color and icon based on content
    $icon = "  "
    $color = "Gray"
    $tsColor = "DarkGray"

    if ($message -match 'New commits detected') {
        $icon = [char]0x25CF + " "  # filled circle
        $color = "Magenta"
        $tsColor = "Magenta"
    }
    elseif ($message -match '=== Starting deployment ===') {
        $icon = [char]0x25B6 + " "  # play triangle
        $color = "Yellow"
    }
    elseif ($message -match '=== Deployment complete ===') {
        $icon = [char]0x2714 + " "  # checkmark
        $color = "Green"
    }
    elseif ($message -match 'ERROR') {
        $icon = [char]0x2718 + " "  # X mark
        $color = "Red"
    }
    elseif ($message -match 'MODE ->') {
        $icon = [char]0x25CB + " "  # open circle
        if ($message -match 'BURST') { $color = "Magenta" }
        elseif ($message -match 'COOLDOWN') { $color = "Yellow" }
        elseif ($message -match 'NORMAL') { $color = "Cyan" }
        elseif ($message -match 'IDLE') { $color = "DarkYellow" }
        elseif ($message -match 'HIBERNATE') { $color = "Red" }
        else { $color = "White" }
    }
    elseif ($message -match 'Service restarted') {
        $icon = [char]0x2714 + " "
        $color = "Green"
    }
    elseif ($message -match 'npm install|npm build|Running') {
        $icon = "  "
        $color = "DarkCyan"
    }
    elseif ($message -match 'git pull|git reset|git clean') {
        $icon = "  "
        $color = "DarkGray"
    }
    elseif ($message -match 'No new commits') {
        $icon = "  "
        $color = "DarkGray"
    }
    elseif ($message -match 'Auto-deploy started|====') {
        $icon = "  "
        $color = "Cyan"
    }

    # Print formatted line
    if ($timestamp) {
        Write-Host "  $icon" -NoNewline -ForegroundColor $color
        Write-Host "$timestamp " -NoNewline -ForegroundColor $tsColor
        Write-Host "$message" -ForegroundColor $color
    } else {
        Write-Host "  $icon$message" -ForegroundColor $color
    }
}

# --- Main ---
Write-Header

if (-not (Test-Path $LogFile)) {
    Write-Host "  Waiting for log file to be created..." -ForegroundColor Yellow
    Write-Host "  (Is the auto-deploy task running?)" -ForegroundColor DarkGray
    # Wait for log file to appear
    while (-not (Test-Path $LogFile)) {
        Start-Sleep -Seconds 2
    }
    Write-Host ""
}

# Show last 15 lines of history then tail
Write-Host "  --- Recent History ---" -ForegroundColor DarkGray
$history = Get-Content $LogFile -Tail 15 -ErrorAction SilentlyContinue
if ($history) {
    foreach ($line in $history) {
        Format-LogLine $line
    }
}
Write-Host "  --- Live ---" -ForegroundColor DarkGray
Write-Host ""

# Tail the log file indefinitely with colored output
Get-Content $LogFile -Wait -Tail 0 | ForEach-Object {
    Format-LogLine $_
}
