# auto-deploy.ps1 — Periodically checks for new commits and deploys if needed.
# Designed to run as a Scheduled Task with admin privileges.
#
# Adaptive polling schedule:
#   After a commit detected:
#     - Every 30 seconds for 30 minutes  (heightened burst)
#     - Every 1 minute for the next 30 minutes (heightened cooldown)
#     - Then back to normal (every 2 minutes)
#   If no commit for 1 week:  every 1 hour (idle mode)
#   If no commit for 1 month: stop entirely (hibernated)
#   On restart after hibernation: resume normal schedule
#
# A desktop shortcut is created by setup-auto-deploy.ps1 to restart if hibernated.

param(
    [switch]$RunOnce
)

$ErrorActionPreference = "Continue"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile = Join-Path $ProjectDir "auto-deploy.log"
$Branch = "main"

# --- Timing constants (in seconds) ---
$BURST_INTERVAL     = 30        # 30 seconds — first 30 min after commit
$COOLDOWN_INTERVAL  = 60        # 1 minute  — next 30 min after burst
$NORMAL_INTERVAL    = 120       # 2 minutes — standard polling
$IDLE_INTERVAL      = 3600      # 1 hour    — no commit for 1 week

$BURST_DURATION     = 1800      # 30 minutes in seconds
$COOLDOWN_DURATION  = 1800      # 30 minutes in seconds
$IDLE_THRESHOLD     = 604800    # 1 week in seconds
$HIBERNATE_THRESHOLD = 2592000  # 30 days in seconds

# --- State ---
$script:LastCommitTime = Get-Date
$script:Mode = "normal"  # normal, burst, cooldown, idle

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

function Get-CurrentInterval {
    $now = Get-Date
    $secsSinceCommit = ($now - $script:LastCommitTime).TotalSeconds

    # Check for hibernate (1 month without commit)
    if ($secsSinceCommit -ge $HIBERNATE_THRESHOLD) {
        if ($script:Mode -ne "hibernate") {
            $script:Mode = "hibernate"
            Write-Log "MODE -> HIBERNATE (no commits for 30 days). Stopping auto-deploy."
            Write-Log "Double-click the desktop shortcut 'Restart Flight-Points Deploy' to resume."
        }
        return -1  # signal to stop
    }

    # Check for idle (1 week without commit)
    if ($secsSinceCommit -ge $IDLE_THRESHOLD) {
        if ($script:Mode -ne "idle") {
            $script:Mode = "idle"
            Write-Log "MODE -> IDLE (no commits for 7 days). Polling every $($IDLE_INTERVAL / 60) min."
        }
        return $IDLE_INTERVAL
    }

    # If we're in heightened mode (burst or cooldown), check timing
    if ($script:Mode -eq "burst") {
        if ($secsSinceCommit -lt $BURST_DURATION) {
            return $BURST_INTERVAL
        }
        # Transition to cooldown
        $script:Mode = "cooldown"
        Write-Log "MODE -> COOLDOWN (every $($COOLDOWN_INTERVAL)s for 30 min)"
        return $COOLDOWN_INTERVAL
    }

    if ($script:Mode -eq "cooldown") {
        if ($secsSinceCommit -lt ($BURST_DURATION + $COOLDOWN_DURATION)) {
            return $COOLDOWN_INTERVAL
        }
        # Transition to normal
        $script:Mode = "normal"
        Write-Log "MODE -> NORMAL (every $($NORMAL_INTERVAL / 60) min)"
        return $NORMAL_INTERVAL
    }

    # Normal mode
    return $NORMAL_INTERVAL
}

function Enter-HeightenedMode {
    $script:LastCommitTime = Get-Date
    $script:Mode = "burst"
    Write-Log "MODE -> BURST (every $($BURST_INTERVAL)s for 30 min)"
}

function Invoke-Deploy {
    Write-Log "=== Starting deployment ==="

    Push-Location $ProjectDir
    try {
        # Prevent commits from this device
        & git config --local core.hooksPath /dev/null

        # Reset any local changes
        & git reset --hard 2>&1 | ForEach-Object { Write-Log "  git reset: $_" }
        & git clean -fd 2>&1 | ForEach-Object { Write-Log "  git clean: $_" }

        # Pull latest
        $pullOutput = & git pull --no-rebase 2>&1
        $pullOutput | ForEach-Object { Write-Log "  git pull: $_" }

        # Install dependencies
        Write-Log "Running npm install..."
        & npm install --no-fund --no-audit 2>&1 | Select-Object -Last 5 | ForEach-Object { Write-Log "  npm: $_" }

        # Build
        Write-Log "Running npm build..."
        & npm run build 2>&1 | Select-Object -Last 5 | ForEach-Object { Write-Log "  build: $_" }

        # Restart service if it exists
        $svc = Get-Service -Name "flight-points" -ErrorAction SilentlyContinue
        if ($svc) {
            Write-Log "Restarting flight-points service..."
            Stop-Service -Name "flight-points" -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Start-Service -Name "flight-points" -ErrorAction SilentlyContinue
            Write-Log "Service restarted."
        } else {
            Write-Log "Service 'flight-points' not found. Skipping restart."
        }

        Write-Log "=== Deployment complete ==="
    }
    catch {
        Write-Log "ERROR during deployment: $_"
    }
    finally {
        Pop-Location
    }
}

function Test-NewCommits {
    Push-Location $ProjectDir
    try {
        # Fetch latest from remote
        & git fetch origin $Branch 2>&1 | Out-Null

        $localHash = (& git rev-parse HEAD 2>&1).Trim()
        $remoteHash = (& git rev-parse "origin/$Branch" 2>&1).Trim()

        if ($localHash -ne $remoteHash) {
            Write-Log "New commits detected (local: $($localHash.Substring(0,7)) -> remote: $($remoteHash.Substring(0,7)))"
            return $true
        }
        return $false
    }
    catch {
        Write-Log "ERROR checking for commits: $_"
        return $false
    }
    finally {
        Pop-Location
    }
}

# --- Main ---
Write-Log "============================================"
Write-Log "Auto-deploy started with adaptive polling."
Write-Log "  Project : $ProjectDir"
Write-Log "  Branch  : $Branch"
Write-Log "  Schedule: burst(30s/30min) -> cooldown(1min/30min) -> normal(2min)"
Write-Log "            idle after 7 days (1hr), hibernate after 30 days (stop)"
Write-Log "============================================"

# Initial deploy check on startup
if (Test-NewCommits) {
    Invoke-Deploy
    Enter-HeightenedMode
} else {
    Write-Log "No new commits. Up to date. Starting in NORMAL mode."
}

if ($RunOnce) {
    Write-Log "RunOnce flag set. Exiting."
    exit 0
}

# Continuous loop with adaptive intervals
$script:CheckCount = 0
$script:LastHeartbeat = Get-Date

while ($true) {
    $interval = Get-CurrentInterval

    # Hibernate: stop the script
    if ($interval -lt 0) {
        Write-Log "Auto-deploy hibernated. Exiting process."
        exit 0
    }

    Start-Sleep -Seconds $interval

    try {
        $script:CheckCount++
        Write-Log "CHECK #$($script:CheckCount) ($($script:Mode.ToUpper()) mode, interval $($interval)s)"

        if (Test-NewCommits) {
            Invoke-Deploy
            Enter-HeightenedMode  # Reset to burst mode on every new commit
        } else {
            # Periodic heartbeat so the monitor knows we're alive
            $sinceHeartbeat = ((Get-Date) - $script:LastHeartbeat).TotalMinutes
            $heartbeatInterval = switch ($script:Mode) {
                'burst'    { 5 }    # every 5 min during burst
                'cooldown' { 10 }   # every 10 min during cooldown
                'normal'   { 30 }   # every 30 min during normal
                'idle'     { 120 }  # every 2 hrs during idle
                default    { 30 }
            }
            if ($sinceHeartbeat -ge $heartbeatInterval) {
                Write-Log "Heartbeat: $($script:Mode.ToUpper()) mode, checked $($script:CheckCount) times, no new commits. Next check in $($interval)s."
                $script:LastHeartbeat = Get-Date
                $script:CheckCount = 0
            }
        }
    }
    catch {
        Write-Log "ERROR in check loop: $_"
    }
}
