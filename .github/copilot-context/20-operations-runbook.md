# Operations Runbook

## Scheduled tasks (Windows)
- Flight-Points_Server_Tunnel: runs API + Cloudflare tunnel, restarts on failures
- FlightPoints-AutoDeploy: runs auto-deploy.ps1 every 2 minutes
- FlightPoints-Weekly-Backup: weekly backup (Sunday 03:00)

## Deploy flow (auto-deploy.ps1)
1. Resolve git lock safety
2. Reset and clean working tree
3. Pull latest branch
4. npm install
5. Pre-deploy gate: npx tsc --noEmit
6. npm run build
7. Restart service flight-points
8. Post-deploy smoke test: GET http://localhost:3001/api/health (3 attempts)
9. If smoke fails: rollback to previous commit + reinstall + rebuild + restart

## Verified endpoint behavior (2026-03-17)
- /api/test returns: { message: "Server is working!" }
- /api/health returns status + checks (db, disk, uptime, memory)
- If /api/test works but /api/health returns 404, the running code is stale or route registration is broken and redeploy is required

## Monitoring/logs
- Primary log root on server: C:\inetpub\wwwroot\Flight-Points\Logs
- Subfolders: Server, Tunnel, Deploy, Backup
- Local fallback exists when server path is not writable

## Alerting
- Deploy failures: email + data/deploy-status.json status=failed
- Deploy recoveries: status=success clears Integrity banner
- Uptime transitions from start-server-and-tunnel.ps1: SERVER DOWN, SERVER RECOVERED, SERVER RESTARTED
- Uptime state file: data/uptime-status.json

## Useful verification commands (PowerShell)
- Get-ScheduledTask -TaskName "Flight-Points_Server_Tunnel","FlightPoints-AutoDeploy","FlightPoints-Weekly-Backup"
- Get-ScheduledTaskInfo -TaskName "Flight-Points_Server_Tunnel"
- Get-ScheduledTaskInfo -TaskName "FlightPoints-AutoDeploy"
- Get-ScheduledTaskInfo -TaskName "FlightPoints-Weekly-Backup"
- Get-ChildItem "C:\inetpub\wwwroot\Flight-Points\Logs\**\*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 20 FullName,LastWriteTime

## SMTP troubleshooting quick checks
- Ensure SMTP_* values are present in .env.local on server
- Confirm scheduled task account can read .env.local
- Confirm outbound SMTP allowed by firewall/network
- Use app password when provider requires it

## API auth troubleshooting quick checks
- "Invalid or expired token" usually means placeholder token was used or token expired
- Generate a fresh token via POST /api/auth/login before testing protected routes
