# ========== START SERVER AND CLOUDFLARE TUNNEL WITH AUTO-RESTART ==========
# This script starts both npm server and cloudflared tunnel as background jobs
# and monitors them, auto-restarting if either crashes.
# 
# Logs go to: C:\inetpub\wwwroot\Flight-Points\Logs\Server and Logs\Tunnel
# 
# Usage: .\start-server-and-tunnel.ps1
# Stop: Press Ctrl+C to gracefully shut down both services

param(
    [string]$LogRoot = "C:\inetpub\wwwroot\Flight-Points\Logs",
    [int]$RestartDelaySeconds = 5
)

# Create log directories if they don't exist
$ServerLogDir = Join-Path $LogRoot "Server"
$TunnelLogDir = Join-Path $LogRoot "Tunnel"

if (!(Test-Path $ServerLogDir)) {
    New-Item -ItemType Directory -Path $ServerLogDir -Force | Out-Null
    Write-Host "[Setup] Created server log directory: $ServerLogDir"
}

if (!(Test-Path $TunnelLogDir)) {
    New-Item -ItemType Directory -Path $TunnelLogDir -Force | Out-Null
    Write-Host "[Setup] Created tunnel log directory: $TunnelLogDir"
}

# Log file paths with timestamps
$ServerLogFile = Join-Path $ServerLogDir "server-$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').log"
$TunnelLogFile = Join-Path $TunnelLogDir "tunnel-$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').log"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Flight-Points Server & Cloudflare Tunnel Auto-Starter" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Server logs: $ServerLogFile" -ForegroundColor Green
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Tunnel logs: $TunnelLogFile" -ForegroundColor Green
Write-Host ""

# Paths
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommandPath
$CloudflaredPath = Get-Command cloudflared.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (!$CloudflaredPath) {
    Write-Host "[ERROR] cloudflared.exe not found in PATH. Please install cloudflare tunnel client." -ForegroundColor Red
    exit 1
}

# Function to start/restart server
function Start-AppServer {
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting npm server..." -ForegroundColor Yellow
    $ServerJob = Start-Job -Name "FlightPointsServer" -ScriptBlock {
        param($RepoRoot, $LogFile)
        Set-Location $RepoRoot
        & npm run server *>> $LogFile 2>&1
    } -ArgumentList $RepoRoot, $ServerLogFile
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Server started (Job ID: $($ServerJob.Id))" -ForegroundColor Green
    return $ServerJob
}

# Function to start/restart tunnel
function Start-Tunnel {
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting Cloudflare tunnel..." -ForegroundColor Yellow
    $TunnelJob = Start-Job -Name "CloudflareTunnel" -ScriptBlock {
        param($CloudflaredPath, $LogFile)
        & $CloudflaredPath tunnel --config "C:\Users\Admin\.cloudflared\config.yml" run 1ca34d31-ae16-42e8-ba67-75d95a8fb2f8 *>> $LogFile 2>&1
    } -ArgumentList $CloudflaredPath, $TunnelLogFile
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Tunnel started (Job ID: $($TunnelJob.Id))" -ForegroundColor Green
    return $TunnelJob
}

# Start both services
$ServerJob = Start-AppServer
$TunnelJob = Start-Tunnel

# Monitor loops counter
$Cycles = 0

# Monitor and auto-restart
try {
    while ($true) {
        $Cycles++
        Start-Sleep -Seconds 2
        
        # Check server
        if ($ServerJob.State -eq "Completed" -or $ServerJob.State -eq "Failed") {
            Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [ALERT] Server crashed! State: $($ServerJob.State). Restarting in $RestartDelaySeconds seconds..." -ForegroundColor Red
            Receive-Job -Job $ServerJob | Out-File -FilePath $ServerLogFile -Append
            Remove-Job -Job $ServerJob -Force
            Start-Sleep -Seconds $RestartDelaySeconds
            $ServerJob = Start-AppServer
        }

        # Check tunnel
        if ($TunnelJob.State -eq "Completed" -or $TunnelJob.State -eq "Failed") {
            Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [ALERT] Tunnel crashed! State: $($TunnelJob.State). Restarting in $RestartDelaySeconds seconds..." -ForegroundColor Red
            Receive-Job -Job $TunnelJob | Out-File -FilePath $TunnelLogFile -Append
            Remove-Job -Job $TunnelJob -Force
            Start-Sleep -Seconds $RestartDelaySeconds
            $TunnelJob = Start-Tunnel
        }

        # Log status every 60 cycles (~120 seconds)
        if ($Cycles % 60 -eq 0) {
            Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Status: Server=$($ServerJob.State), Tunnel=$($TunnelJob.State)" -ForegroundColor Gray
        }
    }
}
catch {
    Write-Host "[ERROR] Exception: $_" -ForegroundColor Red
}
finally {
    Write-Host ""
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Shutting down services..." -ForegroundColor Yellow
    
    if ($ServerJob) {
        Stop-Job -Job $ServerJob -ErrorAction SilentlyContinue
        Remove-Job -Job $ServerJob -Force -ErrorAction SilentlyContinue
        Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Server stopped" -ForegroundColor Green
    }
    
    if ($TunnelJob) {
        Stop-Job -Job $TunnelJob -ErrorAction SilentlyContinue
        Remove-Job -Job $TunnelJob -Force -ErrorAction SilentlyContinue
        Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Tunnel stopped" -ForegroundColor Green
    }
    
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] All services shut down. Logs saved to $LogRoot" -ForegroundColor Cyan
}
