# Flight-Points Server Restart Utility
# Called by restart-server.bat after elevation.

$ErrorActionPreference = 'Stop'
$taskName = 'Flight-Points_Server_Tunnel'

Write-Host ''
Write-Host '================================================' -ForegroundColor Cyan
Write-Host '   Flight-Points Server Restart' -ForegroundColor Cyan
Write-Host '================================================' -ForegroundColor Cyan
Write-Host ''

try {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

    if (-not $task) {
        Write-Host "ERROR: Scheduled task not found: $taskName" -ForegroundColor Red
        Write-Host 'You may need to register it first using setup-auto-deploy.ps1' -ForegroundColor Yellow
        exit 1
    }

    Write-Host 'Stopping server...' -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 4

    Write-Host 'Starting server...' -ForegroundColor Yellow
    Start-ScheduledTask -TaskName $taskName
    Start-Sleep -Seconds 5

    $info = Get-ScheduledTaskInfo -TaskName $taskName
    $state = (Get-ScheduledTask -TaskName $taskName).State

    if ($info.LastTaskResult -eq 0 -or $state -eq 'Running') {
        Write-Host ''
        Write-Host 'Server started successfully!' -ForegroundColor Green
    }
    else {
        Write-Host ''
        Write-Host ("WARNING: Task result code: $($info.LastTaskResult)") -ForegroundColor Yellow
        Write-Host 'Check logs at: C:\inetpub\wwwroot\Flight-Points\Logs\Server' -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host ("Last run:  $($info.LastRunTime)") -ForegroundColor Gray
    Write-Host ("Task state: $state") -ForegroundColor Gray
    exit 0
}
catch {
    Write-Host ''
    Write-Host ("ERROR: $($_.Exception.Message)") -ForegroundColor Red
    exit 1
}
finally {
    Write-Host ''
    Write-Host '================================================' -ForegroundColor Cyan
}
