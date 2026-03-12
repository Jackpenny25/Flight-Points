@echo off
:: Flight-Points Server Restart Utility
:: Double-click to restart the API server and Cloudflare tunnel.
:: Will self-elevate to Administrator if needed.

:: --- Self-elevate to admin ---
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: --- Run the restart PowerShell script ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-server.ps1"

pause
exit /b
