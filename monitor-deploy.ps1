# monitor-deploy.ps1 — Live dashboard showing auto-deploy activity.
# Keep this window open to watch commits arrive and deployments run.
# Type "check" + Enter to manually check for incoming commits.

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
        $logContent = Read-LogSafe -Path $LogFile -Tail 100
        $lastDeploy = $logContent | Where-Object { $_ -match "Deployment complete|ERROR during deployment" } | Select-Object -Last 1
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

        $lastMode = $logContent | Where-Object { $_ -match "MODE ->" } | Select-Object -Last 1
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
    Write-Host "  Commands: " -NoNewline -ForegroundColor DarkGray
    Write-Host "check" -NoNewline -ForegroundColor Yellow
    Write-Host " = check for commits  |  " -NoNewline -ForegroundColor DarkGray
    Write-Host "Ctrl+C" -NoNewline -ForegroundColor Yellow
    Write-Host " = exit" -ForegroundColor DarkGray
    Write-Host "  -------- Live Log --------" -ForegroundColor DarkGray
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
    elseif ($message -match '^CHECK #') {
        $icon = [char]0x2022 + " "  # bullet
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

# --- Safe log reader (non-locking) ---
function Read-LogSafe {
    param([string]$Path, [int]$Tail = 0)
    try {
        $fs = [System.IO.FileStream]::new($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $sr = [System.IO.StreamReader]::new($fs)
        $allLines = @()
        while ($null -ne ($line = $sr.ReadLine())) {
            $allLines += $line
        }
        $sr.Close()
        $fs.Close()
        if ($Tail -gt 0 -and $allLines.Count -gt $Tail) {
            return $allLines[($allLines.Count - $Tail)..($allLines.Count - 1)]
        }
        return $allLines
    } catch {
        return @()
    }
}

# --- Manual commit check ---
function Invoke-CommitCheck {
    Write-Host ""
    Write-Host "  Checking for incoming commits..." -ForegroundColor Yellow
    try {
        Push-Location $ProjectDir
        git fetch origin 2>&1 | Out-Null
        $local = git rev-parse HEAD 2>&1
        $remote = git rev-parse "origin/main" 2>&1
        if ($local -ne $remote) {
            $behind = git rev-list --count "HEAD..origin/main" 2>&1
            $commits = git log --oneline "HEAD..origin/main" 2>&1
            Write-Host ""
            Write-Host "  $behind incoming commit(s) found!" -ForegroundColor Green
            Write-Host ""
            foreach ($c in $commits) {
                Write-Host "    $c" -ForegroundColor Cyan
            }
        } else {
            Write-Host "  No incoming commits. You are up to date." -ForegroundColor DarkGray
        }
        Pop-Location
    } catch {
        Write-Host "  Error checking commits: $_" -ForegroundColor Red
    }
    Write-Host ""
}

# --- Main ---
Write-Header

if (-not (Test-Path $LogFile)) {
    Write-Host "  Waiting for log file to be created..." -ForegroundColor Yellow
    Write-Host "  (Is the auto-deploy task running?)" -ForegroundColor DarkGray
    while (-not (Test-Path $LogFile)) {
        Start-Sleep -Seconds 2
    }
    Write-Host ""
}

# Show last 15 lines of history
Write-Host "  --- Recent History ---" -ForegroundColor DarkGray
$history = Read-LogSafe -Path $LogFile -Tail 15
if ($history) {
    foreach ($line in $history) {
        Format-LogLine $line
    }
}
Write-Host "  --- Live ---" -ForegroundColor DarkGray
Write-Host ""

# Track file position for tailing without locking
$lastSize = (Get-Item $LogFile -ErrorAction SilentlyContinue).Length
$inputBuffer = ""

# Poll-based tail loop with keyboard input support
while ($true) {
    # Check for new log content (non-locking read)
    try {
        $currentSize = (Get-Item $LogFile -ErrorAction SilentlyContinue).Length
        if ($currentSize -gt $lastSize) {
            $fs = [System.IO.FileStream]::new($LogFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            $fs.Seek($lastSize, [System.IO.SeekOrigin]::Begin) | Out-Null
            $sr = [System.IO.StreamReader]::new($fs)
            while ($null -ne ($line = $sr.ReadLine())) {
                if ($line.Trim()) {
                    Format-LogLine $line
                }
            }
            $sr.Close()
            $fs.Close()
            $lastSize = $currentSize
        }
    } catch {
        # File may be momentarily locked by writer, skip this cycle
    }

    # Check for keyboard input (non-blocking)
    while ([Console]::KeyAvailable) {
        $key = [Console]::ReadKey($true)
        if ($key.Key -eq 'Enter') {
            $cmd = $inputBuffer.Trim().ToLower()
            $inputBuffer = ""
            if ($cmd -eq 'check') {
                Invoke-CommitCheck
            } elseif ($cmd -eq 'clear') {
                Write-Header
                Write-Host "  --- Live ---" -ForegroundColor DarkGray
                Write-Host ""
            } elseif ($cmd -eq 'help') {
                Write-Host ""
                Write-Host "  Available commands:" -ForegroundColor Yellow
                Write-Host "    check  — Fetch and show incoming commits" -ForegroundColor Gray
                Write-Host "    clear  — Refresh the header and clear screen" -ForegroundColor Gray
                Write-Host "    help   — Show this help" -ForegroundColor Gray
                Write-Host ""
            } elseif ($cmd) {
                Write-Host "  Unknown command: '$cmd'. Type 'help' for commands." -ForegroundColor DarkYellow
            }
        } elseif ($key.Key -eq 'Backspace') {
            if ($inputBuffer.Length -gt 0) {
                $inputBuffer = $inputBuffer.Substring(0, $inputBuffer.Length - 1)
            }
        } else {
            $inputBuffer += $key.KeyChar
        }
    }

    Start-Sleep -Milliseconds 500
}
