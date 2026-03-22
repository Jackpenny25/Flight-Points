# ================================================================
# Install-PanelService.ps1
# Installs the Flight-Points Control Panel as an NSSM Windows service.
# Run this once on the production server with admin privileges.
# ================================================================
#
# Usage:
#   cd C:\inetpub\wwwroot\Flight-Points\Code\Flight-Points
#   powershell -ExecutionPolicy Bypass -File panel\Install-PanelService.ps1
#
# Prerequisites:
#   - NSSM installed (https://nssm.cc/) and on PATH, OR at C:\nssm\nssm.exe
#   - Node.js installed and on PATH
#   - ADMIN_TOTP_SECRET set in .env.local
#   - ADMIN_BACKUP_CODE set in .env.local (long random backup code)
#   - PANEL_PORT optionally set in .env.local (default: 4000)

param(
    [string]$ServiceName = 'flight-points-panel',
    [string]$NssmPath    = '',     # auto-detected if empty
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent

function Find-Nssm {
    # Try PATH first
    $found = Get-Command nssm -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    # Common locations
    foreach ($loc in @(
        'C:\nssm\nssm.exe',
        'C:\nssm\win64\nssm.exe',
        'C:\Program Files\nssm\nssm.exe',
        'C:\tools\nssm\nssm.exe',
        'C:\ProgramData\chocolatey\bin\nssm.exe',
        'C:\Users\Administrator\scoop\shims\nssm.exe',
        'C:\Windows\System32\nssm.exe'
    )) {
        if (Test-Path $loc) { return $loc }
    }
    return $null
}

function Find-Node {
    $found = Get-Command node -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    foreach ($loc in @('C:\Program Files\nodejs\node.exe','C:\Program Files (x86)\nodejs\node.exe')) {
        if (Test-Path $loc) { return $loc }
    }
    return $null
}

# Locate tools
$nssm = if ($NssmPath) { $NssmPath } else { Find-Nssm }
if (-not $nssm) {
    Write-Host "Checked PATH and common locations for nssm.exe, but none were found." -ForegroundColor Yellow
    Write-Host "Install NSSM, then re-run this script." -ForegroundColor Yellow
    Write-Host "Example:" -ForegroundColor Yellow
    Write-Host "  choco install nssm -y"
    Write-Host "Or provide -NssmPath explicitly:" -ForegroundColor Yellow
    Write-Host "  panel\Install-PanelService.ps1 -NssmPath 'C:\nssm\win64\nssm.exe'"
    Write-Error "NSSM not found. Install from https://nssm.cc/ and ensure it is on PATH or provide -NssmPath."
    exit 1
}

$nodeExe = Find-Node
if (-not $nodeExe) {
    Write-Error "node.exe not found. Ensure Node.js is installed and on PATH."
    exit 1
}

Write-Host "NSSM:    $nssm"
Write-Host "Node:    $nodeExe"
Write-Host "Project: $ProjectDir"
Write-Host ""

# Uninstall
if ($Uninstall) {
    Write-Host "Stopping and removing service: $ServiceName"
    & $nssm stop $ServiceName 2>$null
    Start-Sleep -Seconds 2
    & $nssm remove $ServiceName confirm
    Write-Host "Service '$ServiceName' removed."
    exit 0
}

# Check .env.local has safeguard auth config
$envFile = Join-Path $ProjectDir '.env.local'
if (-not (Test-Path $envFile)) {
    Write-Error ".env.local not found at $envFile. Cannot continue - ADMIN_TOTP_SECRET and ADMIN_BACKUP_CODE must be set."
    exit 1
}
$envContent = Get-Content $envFile -Raw
if ($envContent -notmatch 'ADMIN_TOTP_SECRET\s*=\s*.+') {
    Write-Error "ADMIN_TOTP_SECRET not found in .env.local. Add it before installing the panel service."
    exit 1
}
if ($envContent -notmatch 'ADMIN_BACKUP_CODE\s*=\s*.+') {
    Write-Error "ADMIN_BACKUP_CODE not found in .env.local. Add one long random backup code before installing the panel service."
    exit 1
}

# Read PANEL_PORT from .env.local
$panelPort = 4000
if ($envContent -match 'PANEL_PORT\s*=\s*(\d+)') {
    $panelPort = [int]$Matches[1]
}
Write-Host "Panel will run on port $panelPort"

# Log and data dirs
$nssmLogDir = 'C:\inetpub\wwwroot\Flight-Points\Logs\Panel'
if (-not (Test-Path $nssmLogDir)) {
    New-Item -ItemType Directory -Path $nssmLogDir -Force | Out-Null
    Write-Host "Created log directory: $nssmLogDir"
}
$stdoutLog = Join-Path $nssmLogDir 'panel-stdout.log'
$stderrLog = Join-Path $nssmLogDir 'panel-stderr.log'

# Stop existing service if present
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Service '$ServiceName' already exists - stopping and reconfiguring..."
    & $nssm stop $ServiceName 2>$null
    Start-Sleep -Seconds 2
    Write-Host "Removing existing service before reinstall..."
    & $nssm remove $ServiceName confirm
    Start-Sleep -Seconds 1
}

# Install / configure NSSM service
$panelScript = Join-Path $ProjectDir 'panel\panel-server.cjs'
if (-not (Test-Path $panelScript)) {
    Write-Error "panel\panel-server.cjs not found at $panelScript. Ensure the panel folder is deployed."
    exit 1
}

Write-Host "Installing NSSM service '$ServiceName'..."

& $nssm install $ServiceName $nodeExe
& $nssm set $ServiceName AppParameters "`"$panelScript`""
& $nssm set $ServiceName AppDirectory $ProjectDir
& $nssm set $ServiceName DisplayName 'Flight-Points Control Panel'
& $nssm set $ServiceName Description 'Flight-Points server management control panel (port 4000)'
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppStdout $stdoutLog
& $nssm set $ServiceName AppStderr $stderrLog
& $nssm set $ServiceName AppStdoutCreationDisposition 4   # append
& $nssm set $ServiceName AppStderrCreationDisposition 4
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateSeconds 86400
& $nssm set $ServiceName AppRotateBytes 10485760           # 10 MB
& $nssm set $ServiceName AppRestartDelay 5000
& $nssm set $ServiceName AppThrottle 5000

# Set PATH so node can find npm and other tools
$nodeBin = Split-Path $nodeExe -Parent
$npmGlobal = "$env:APPDATA\npm"
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$pathExtra = @($nodeBin, $npmGlobal, 'C:\Windows\System32', 'C:\Windows', $pgBin) | Where-Object { Test-Path $_ }
& $nssm set $ServiceName AppEnvironmentExtra "PATH=$($pathExtra -join ';')"

Write-Host ""
Write-Host "Starting service..."
& $nssm start $ServiceName
Start-Sleep -Seconds 3

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Write-Host ""
    Write-Host "SUCCESS: '$ServiceName' is running."
    Write-Host "Panel URL : http://localhost:$panelPort"
    Write-Host "Stdout log: $stdoutLog"
    Write-Host ""
    Write-Host "To access externally, add a Cloudflare tunnel route for this port."
    Write-Host "  e.g. panel.flightpoints.uk -> localhost:$panelPort"
} else {
    Write-Warning "Service may not have started. Check: $stdoutLog"
    Write-Host "You can also run the panel manually to see errors:"
    Write-Host ('  node "' + $panelScript + '"')
}
