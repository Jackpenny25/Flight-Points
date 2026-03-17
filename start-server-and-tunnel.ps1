# ========== START SERVER AND CLOUDFLARE TUNNEL WITH AUTO-RESTART ==========
# This script starts both npm server and cloudflared tunnel as background jobs,
# auto-restarts them if they crash, and sends uptime alert emails for DOWN/UP.
#
# Logs go to: C:\inetpub\wwwroot\Flight-Points\Logs\Server and Logs\Tunnel
#
# Usage: .\start-server-and-tunnel.ps1
# Stop: Press Ctrl+C to gracefully shut down both services

param(
    [string]$LogRoot = "C:\inetpub\wwwroot\Flight-Points\Logs",
    [int]$RestartDelaySeconds = 5,
    [string]$WebsiteHealthUrl = "https://flightpoints.uk",
    [int]$HealthCheckTimeoutSeconds = 8,
    [int]$MonitorIntervalSeconds = 5
)

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommandPath
$StatusFile = Join-Path $RepoRoot "data\uptime-status.json"

# Create log directories if they do not exist
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

function Write-MonitorLog {
    param([string]$Message, [string]$Color = "Gray")
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Write-Host "[$ts] $Message" -ForegroundColor $Color
}

function Test-TcpPort {
    param(
        [string]$Host,
        [int]$Port,
        [int]$TimeoutMs = 1500
    )
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($Host, $Port, $null, $null)
        $connected = $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if (-not $connected) {
            $client.Close()
            return $false
        }
        $client.EndConnect($iar)
        $client.Close()
        return $true
    }
    catch {
        return $false
    }
}

function Test-WebsiteReachable {
    param(
        [string]$Url,
        [int]$TimeoutSeconds
    )
    if (-not $Url) {
        return $true
    }
    try {
        $resp = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec $TimeoutSeconds
        return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500)
    }
    catch {
        return $false
    }
}

function Format-Duration {
    param([datetime]$Start, [datetime]$End)
    $span = $End - $Start
    if ($span.TotalSeconds -lt 60) {
        return "{0}s" -f [math]::Floor($span.TotalSeconds)
    }
    if ($span.TotalMinutes -lt 60) {
        return "{0}m {1}s" -f [math]::Floor($span.TotalMinutes), $span.Seconds
    }
    return "{0}h {1}m {2}s" -f [math]::Floor($span.TotalHours), $span.Minutes, $span.Seconds
}

# --- Email alerting configuration ---
$script:SmtpTo = $env:SMTP_TO
$script:SmtpFrom = $env:SMTP_FROM
$script:SmtpServer = $env:SMTP_SERVER
$script:SmtpPort = if ($env:SMTP_PORT) { [int]$env:SMTP_PORT } else { 587 }
$script:SmtpUser = $env:SMTP_USER
$script:SmtpPass = $env:SMTP_PASS

function Load-EnvSmtp {
    $envFile = Join-Path $RepoRoot '.env.local'
    if (-not (Test-Path $envFile)) { return }
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*(SMTP_\w+)\s*=\s*(.+)$') {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim().Trim('"').Trim("'")
            switch ($key) {
                'SMTP_TO'     { if (-not $script:SmtpTo)     { $script:SmtpTo = $val } }
                'SMTP_FROM'   { if (-not $script:SmtpFrom)   { $script:SmtpFrom = $val } }
                'SMTP_SERVER' { if (-not $script:SmtpServer) { $script:SmtpServer = $val } }
                'SMTP_PORT'   { if (-not $script:SmtpPort -or $script:SmtpPort -eq 587) { $script:SmtpPort = [int]$val } }
                'SMTP_USER'   { if (-not $script:SmtpUser)   { $script:SmtpUser = $val } }
                'SMTP_PASS'   { if (-not $script:SmtpPass)   { $script:SmtpPass = $val } }
            }
        }
    }
}
Load-EnvSmtp

function Send-StatusEmail {
    param(
        [string]$EventName,
        [string]$Body,
        [string]$CurrentServerState,
        [string]$CurrentTunnelState,
        [bool]$LocalApiUp,
        [bool]$WebsiteUp
    )

    if (-not $script:SmtpTo -or -not $script:SmtpServer -or -not $script:SmtpFrom) {
        Write-MonitorLog "Email alerting not configured (SMTP_TO/SMTP_SERVER/SMTP_FROM). Skipping alert email." "DarkYellow"
        return
    }

    try {
        $subject = "[Flight-Points] $EventName - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        $message = @"
Flight-Points server status update.

Event:              $EventName
Time:               $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Server machine:     $env:COMPUTERNAME
Server job state:   $CurrentServerState
Tunnel job state:   $CurrentTunnelState
Local API (3001):   $(if ($LocalApiUp) { 'UP' } else { 'DOWN' })
Website reachable:  $(if ($WebsiteUp) { 'UP' } else { 'DOWN' })
Website URL:        $WebsiteHealthUrl

Details:
$Body

Logs:
Server log: $ServerLogFile
Tunnel log: $TunnelLogFile
"@

        $mailParams = @{
            To         = $script:SmtpTo
            From       = $script:SmtpFrom
            Subject    = $subject
            Body       = $message
            SmtpServer = $script:SmtpServer
            Port       = $script:SmtpPort
            UseSsl     = $true
        }

        if ($script:SmtpUser -and $script:SmtpPass) {
            $secPass = ConvertTo-SecureString $script:SmtpPass -AsPlainText -Force
            $cred = New-Object System.Management.Automation.PSCredential($script:SmtpUser, $secPass)
            $mailParams['Credential'] = $cred
        }

        Send-MailMessage @mailParams -ErrorAction Stop
        Write-MonitorLog "Status email sent: $EventName -> $($script:SmtpTo)" "Green"
    }
    catch {
        Write-MonitorLog "WARNING: Failed to send status email: $_" "Red"
    }
}

function Save-UptimeState {
    param(
        [string]$State,
        [string]$Reason,
        [string]$DownSince
    )
    try {
        $dataDir = Join-Path $RepoRoot 'data'
        if (-not (Test-Path $dataDir)) {
            New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
        }
        $obj = @{
            state = $State
            reason = $Reason
            downSince = $DownSince
            updatedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        }
        $obj | ConvertTo-Json -Depth 3 | Set-Content -Path $StatusFile -Encoding UTF8 -Force
    }
    catch {
        Write-MonitorLog "WARNING: Failed to save uptime state: $_" "Red"
    }
}

function Load-UptimeState {
    if (-not (Test-Path $StatusFile)) {
        return @{
            state = 'unknown'
            reason = ''
            downSince = ''
            updatedAt = ''
        }
    }

    try {
        $raw = Get-Content -Path $StatusFile -Raw -ErrorAction Stop
        $json = ConvertFrom-Json -InputObject $raw -ErrorAction Stop
        return @{
            state = $json.state
            reason = $json.reason
            downSince = $json.downSince
            updatedAt = $json.updatedAt
        }
    }
    catch {
        Write-MonitorLog "WARNING: Invalid uptime status file; starting fresh." "DarkYellow"
        return @{
            state = 'unknown'
            reason = ''
            downSince = ''
            updatedAt = ''
        }
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Flight-Points Server & Cloudflare Tunnel Auto-Starter" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-MonitorLog "Server logs: $ServerLogFile" "Green"
Write-MonitorLog "Tunnel logs: $TunnelLogFile" "Green"
Write-MonitorLog "Website health URL: $WebsiteHealthUrl" "Green"
Write-Host ""

$CloudflaredPath = Get-Command cloudflared.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (!$CloudflaredPath) {
    Write-MonitorLog "[ERROR] cloudflared.exe not found in PATH. Please install cloudflare tunnel client." "Red"
    exit 1
}

function Start-AppServer {
    Write-MonitorLog "Starting npm server..." "Yellow"
    $ServerJob = Start-Job -Name "FlightPointsServer" -ScriptBlock {
        param($RepoRoot, $LogFile)
        Set-Location $RepoRoot
        & npm run server *>> $LogFile 2>&1
    } -ArgumentList $RepoRoot, $ServerLogFile
    Write-MonitorLog "Server started (Job ID: $($ServerJob.Id))" "Green"
    return $ServerJob
}

function Start-Tunnel {
    Write-MonitorLog "Starting Cloudflare tunnel..." "Yellow"
    $TunnelJob = Start-Job -Name "CloudflareTunnel" -ScriptBlock {
        param($CloudflaredPath, $LogFile)
        & $CloudflaredPath tunnel --config "C:\Users\Admin\.cloudflared\config.yml" run 1ca34d31-ae16-42e8-ba67-75d95a8fb2f8 *>> $LogFile 2>&1
    } -ArgumentList $CloudflaredPath, $TunnelLogFile
    Write-MonitorLog "Tunnel started (Job ID: $($TunnelJob.Id))" "Green"
    return $TunnelJob
}

$ServerJob = Start-AppServer
$TunnelJob = Start-Tunnel
$Cycles = 0

$state = Load-UptimeState
$previousState = if ($state.state) { $state.state } else { 'unknown' }
$downSince = if ($state.downSince) { $state.downSince } else { '' }

try {
    # Startup alert: server/script is back on after reboot/restart.
    Start-Sleep -Seconds 4
    $initialLocalApiUp = (Test-TcpPort -Host "127.0.0.1" -Port 3001) -or (Test-TcpPort -Host "localhost" -Port 3001)
    $initialWebsiteUp = Test-WebsiteReachable -Url $WebsiteHealthUrl -TimeoutSeconds $HealthCheckTimeoutSeconds
    Send-StatusEmail -EventName "SERVER RESTARTED / ONLINE" -Body "The monitor script started successfully. Services were launched and initial health checks were performed." -CurrentServerState $ServerJob.State -CurrentTunnelState $TunnelJob.State -LocalApiUp $initialLocalApiUp -WebsiteUp $initialWebsiteUp

    while ($true) {
        $Cycles++
        Start-Sleep -Seconds $MonitorIntervalSeconds

        # Auto-restart crashed jobs.
        if ($ServerJob.State -eq "Completed" -or $ServerJob.State -eq "Failed" -or $ServerJob.State -eq "Stopped") {
            Write-MonitorLog "[ALERT] Server job stopped. State: $($ServerJob.State). Restarting in $RestartDelaySeconds seconds..." "Red"
            Receive-Job -Job $ServerJob -ErrorAction SilentlyContinue | Out-File -FilePath $ServerLogFile -Append
            Remove-Job -Job $ServerJob -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds $RestartDelaySeconds
            $ServerJob = Start-AppServer
        }

        if ($TunnelJob.State -eq "Completed" -or $TunnelJob.State -eq "Failed" -or $TunnelJob.State -eq "Stopped") {
            Write-MonitorLog "[ALERT] Tunnel job stopped. State: $($TunnelJob.State). Restarting in $RestartDelaySeconds seconds..." "Red"
            Receive-Job -Job $TunnelJob -ErrorAction SilentlyContinue | Out-File -FilePath $TunnelLogFile -Append
            Remove-Job -Job $TunnelJob -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds $RestartDelaySeconds
            $TunnelJob = Start-Tunnel
        }

        $localApiUp = (Test-TcpPort -Host "127.0.0.1" -Port 3001) -or (Test-TcpPort -Host "localhost" -Port 3001)
        $websiteUp = Test-WebsiteReachable -Url $WebsiteHealthUrl -TimeoutSeconds $HealthCheckTimeoutSeconds

        $isDown = ($ServerJob.State -ne "Running") -or ($TunnelJob.State -ne "Running") -or (-not $localApiUp) -or (-not $websiteUp)
        $currentState = if ($isDown) { 'down' } else { 'up' }

        if ($currentState -eq 'down' -and $previousState -ne 'down') {
            $downAt = Get-Date
            $downSince = $downAt.ToString('yyyy-MM-dd HH:mm:ss')
            $reason = "ServerState=$($ServerJob.State), TunnelState=$($TunnelJob.State), LocalApiUp=$localApiUp, WebsiteUp=$websiteUp"

            Send-StatusEmail -EventName "SERVER DOWN" -Body "One or more required services became unavailable. `n$reason" -CurrentServerState $ServerJob.State -CurrentTunnelState $TunnelJob.State -LocalApiUp $localApiUp -WebsiteUp $websiteUp
            Save-UptimeState -State 'down' -Reason $reason -DownSince $downSince
            Write-MonitorLog "State transition: UP -> DOWN" "Red"
        }

        if ($currentState -eq 'up' -and $previousState -eq 'down') {
            $upAt = Get-Date
            $durationText = ''
            if ($downSince) {
                try {
                    $downAtParsed = [datetime]::Parse($downSince)
                    $durationText = Format-Duration -Start $downAtParsed -End $upAt
                }
                catch {
                    $durationText = 'unknown duration'
                }
            }

            $recoverMessage = if ($downSince) {
                "Service recovered. Downtime started at $downSince and lasted $durationText."
            } else {
                "Service recovered and is healthy now."
            }

            Send-StatusEmail -EventName "SERVER RECOVERED / WEBSITE BACK ONLINE" -Body $recoverMessage -CurrentServerState $ServerJob.State -CurrentTunnelState $TunnelJob.State -LocalApiUp $localApiUp -WebsiteUp $websiteUp
            Save-UptimeState -State 'up' -Reason 'Recovered' -DownSince ''
            Write-MonitorLog "State transition: DOWN -> UP" "Green"
            $downSince = ''
        }

        if ($currentState -eq 'up' -and $previousState -eq 'unknown') {
            Save-UptimeState -State 'up' -Reason 'Healthy' -DownSince ''
        }

        $previousState = $currentState

        if ($Cycles % [math]::Max([int](120 / [math]::Max($MonitorIntervalSeconds, 1)), 1) -eq 0) {
            Write-MonitorLog "Status: Server=$($ServerJob.State), Tunnel=$($TunnelJob.State), LocalApiUp=$localApiUp, WebsiteUp=$websiteUp" "DarkGray"
        }
    }
}
catch {
    Write-MonitorLog "[ERROR] Exception: $_" "Red"
}
finally {
    Write-Host ""
    Write-MonitorLog "Shutting down services..." "Yellow"

    if ($ServerJob) {
        Stop-Job -Job $ServerJob -ErrorAction SilentlyContinue
        Remove-Job -Job $ServerJob -Force -ErrorAction SilentlyContinue
        Write-MonitorLog "Server stopped" "Green"
    }

    if ($TunnelJob) {
        Stop-Job -Job $TunnelJob -ErrorAction SilentlyContinue
        Remove-Job -Job $TunnelJob -Force -ErrorAction SilentlyContinue
        Write-MonitorLog "Tunnel stopped" "Green"
    }

    Save-UptimeState -State 'down' -Reason 'Monitor script stopped manually' -DownSince (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    Write-MonitorLog "All services shut down. Logs saved to $LogRoot" "Cyan"
}
