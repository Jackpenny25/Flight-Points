# auto-deploy.ps1 — Periodically checks for new commits and deploys if needed.
# Designed to run as a Scheduled Task with admin privileges.

param(
    [int]$IntervalMinutes = 2,
    [switch]$RunOnce
)

$ErrorActionPreference = "Continue"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile = Join-Path $ProjectDir "auto-deploy.log"
$Branch = "main"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
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

# --- Main loop ---
Write-Log "Auto-deploy started. Checking every $IntervalMinutes minute(s) on branch '$Branch'."
Write-Log "Project directory: $ProjectDir"
Write-Log "Log file: $LogFile"

# Initial deploy check on startup
if (Test-NewCommits) {
    Invoke-Deploy
} else {
    Write-Log "No new commits. Up to date."
}

if ($RunOnce) {
    Write-Log "RunOnce flag set. Exiting."
    exit 0
}

# Continuous loop
while ($true) {
    Start-Sleep -Seconds ($IntervalMinutes * 60)
    try {
        if (Test-NewCommits) {
            Invoke-Deploy
        }
    }
    catch {
        Write-Log "ERROR in check loop: $_"
    }
}
