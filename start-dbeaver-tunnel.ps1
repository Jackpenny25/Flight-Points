# PowerShell Script to Start Cloudflare Tunnel for DBeaver

# Define common paths for cloudflared
$cloudflaredPaths = @(
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe"
)

# Find the cloudflared executable
$cloudflaredPath = $cloudflaredPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-Not $cloudflaredPath) {
    Write-Host "[ERROR] cloudflared not found in common locations." -ForegroundColor Red
    exit 1
}

# Define the tunnel command
$tunnelCommand = "& `"$cloudflaredPath`" access tcp --hostname db.flightpoints.uk --url localhost:6543"

# Check if the tunnel is already running
$tcpTest = Test-NetConnection -ComputerName localhost -Port 6543
if ($tcpTest.TcpTestSucceeded) {
    Write-Host "[INFO] Tunnel is already running on localhost:6543" -ForegroundColor Green
    exit 0
}

# Start the tunnel
Write-Host "[INFO] Starting Cloudflare tunnel..." -ForegroundColor Yellow
Invoke-Expression $tunnelCommand

# Confirm the tunnel is running
Start-Sleep -Seconds 2
$tcpTest = Test-NetConnection -ComputerName localhost -Port 6543
if ($tcpTest.TcpTestSucceeded) {
    Write-Host "[SUCCESS] Tunnel started successfully!" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to start the tunnel." -ForegroundColor Red
}