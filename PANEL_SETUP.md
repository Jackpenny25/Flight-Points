# Flight-Points Control Panel Setup Guide

## Overview

The Control Panel runs as a standalone service (`flight-points-panel`) on port 4000. It provides a browser-based dashboard for managing server operations, logs, deployments, and more.

**Features:**
- 🔐 Secure PIN or TOTP (authenticator app) authentication
- 📊 Real-time server status monitoring
- 🚀 One-click deployment controls
- 📝 Live log streaming
- 🗄️ Database backups and status
- 🌐 Git and Cloudflare tunnel management
- ⚙️ Process and system monitoring

---

## Quick Start

### 1. Configure Authentication

Add credentials to `.env.local`:

```
ADMIN_PIN=123456
```

**Optional: Enable TOTP (Authenticator App)**

To use an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.):

```
PANEL_PIN=123456
PANEL_TOTP_SECRET=YOUR_BASE32_SECRET_HERE
```

`PANEL_PIN` is the panel-only backup code. It is separate from the website login and is used only for the standalone control panel.

**Generate a TOTP Secret:**

`PANEL_TOTP_SECRET` must be a Base32 secret using only `A-Z` and `2-7`.

Do not paste a Base64 string directly into the authenticator app. The previous guidance using `openssl rand -base64 20` was wrong unless you convert it to Base32 first.

Use one of these safe setup methods:

1. Generate a Base32 secret with an online Base32 generator and store it in `PANEL_TOTP_SECRET`.
2. In your authenticator app, choose `Enter setup key` or `Manual entry`.
3. Account name: `Flight-Points Panel`
4. Key: paste the exact Base32 value from `PANEL_TOTP_SECRET`
5. Key type: `Time based` / `TOTP`

Example valid secret format:

```
JBSWY3DPEHPK3PXP
```

If you want to provision it as a QR code later, the value would be embedded in an `otpauth://` URI. `Scan with authenticator app` means scanning that QR code, not typing the secret into the normal 6-digit code login box.

**Login methods:**
- **PIN only:** Enter your PIN (e.g., `123456`)
- **TOTP enabled:** Enter either your PIN or a 6-digit code from authenticator app

### 2. Deploy Control Panel Service

On your server, run:

```powershell
cd C:\inetpub\wwwroot\Flight-Points

# Pull latest changes
git pull

# Install the panel service
.\panel\Install-PanelService.ps1

# Verify service is running
Get-Service flight-points-panel

# Check logs
Get-Content C:\inetpub\wwwroot\Flight-Points\Logs\Panel\panel-stdout.log -Tail 50
```

**Manual Testing (if service doesn't start):**

```powershell
node .\panel\panel-server.cjs
```

Expected output:
```
[panel] ✓ Flight-Points Control Panel on http://0.0.0.0:4000
[panel]   Project : C:\inetpub\wwwroot\Flight-Points
[panel]   API port: 3001
[panel]   Logs    : C:\inetpub\wwwroot\Flight-Points\Logs
[panel] ✓ Auth: TOTP enabled (PIN as backup)
```

### 3. Access Locally

Open in browser:
```
http://localhost:4000
```

Login with your PIN or authenticator code.

---

## Remote Access via Cloudflare Tunnel

### Configure Tunnel Route

Add the following to your Cloudflare tunnel config (at your tunnel provider/dashboard):

**Cloudflare Zero Trust Dashboard:**

1. Go to https://one.dash.cloudflare.com → **Access** → **Tunnels**
2. Select your `Flight-Points` tunnel
3. Click **Configure**
4. Add a new public hostname:
   - **Subdomain:** `panel`
   - **Domain:** `flightpoints.uk` (or your domain)
   - **Protocol:** `http`
   - **URL:** `localhost:4000`
5. Save

**Or via tunnel config file:**

If using a config file at `~/.cloudflared/config.yml`:

```yaml
ingress:
  - hostname: panel.flightpoints.uk
    service: http://localhost:4000
  - hostname: api.flightpoints.uk
    service: http://localhost:3001
  - hostname: flightpoints.uk
    service: http://localhost:5173
  - service: http_status:404
```

Then:
```powershell
# Restart tunnel service
Restart-Service flight-points-tunnel
```

If you are using the server's main config file, a ready-to-copy example now exists at `cloudflared/config.example.yml` in this repo.

### Test Remote Access

```powershell
# From your main device
Invoke-WebRequest https://panel.flightpoints.uk -UseBasicParsing
```

Expected: HTTP 200, HTML response

---

## Environment Variables (.env.local)

### Required

| Variable | Example | Notes |
|----------|---------|-------|
| `ADMIN_PIN` | `123456` | PIN for panel login |

### Optional

| Variable | Default | Notes |
|----------|---------|-------|
| `PANEL_PIN` | (none) | Alternate PIN; if set with TOTP_SECRET, allows PIN as backup |
| `PANEL_TOTP_SECRET` | (none) | Base32 TOTP secret for authenticator app login |
| `PANEL_PORT` | `4000` | Port for panel server |
| `PANEL_LOGS_ROOT` | `C:\inetpub\wwwroot\Flight-Points\Logs` | Logs directory |
| `PANEL_BACKUPS_DIR` | `C:\inetpub\wwwroot\Flight-Points\Backups` | Backups directory |
| `PORT` | `3001` | API server port (for health check connection) |

---

## Usage

### Overview Dashboard

Real-time status:
- **API Server:** Running/Down
- **Tunnel:** Connection status
- **Database:** Connected/Offline (with error diagnostics)
- **Memory:** Current usage %
- **Git Status:** Current branch, commits behind, local changes
- **System Uptime:** Server uptime and panel uptime

### Services Tab

Control the two main services:
- **flight-points:** API server (port 3001)
- **flight-points-tunnel:** Cloudflare tunnel

Actions: Start, Stop, Restart, View Info, Event Log

### Deploy Tab

Build and deploy pipeline:
1. **Build** — Compile frontend with Vite
2. **Type Check** — Run TypeScript validation
3. **Install** — `npm install` dependencies
4. **Run Server** — Manually launch API (alternative to service)
5. **Audit** — Check for dependency vulnerabilities

### Logs Tab

View and stream logs:
- **nssm:** NSSM Windows service logs
- **server:** API server output
- **panel:** Control panel output
- **deploy:** Auto-deploy script logs

Actions: View full log, Live stream (via SSE), Clear log

### Database Tab

- **Status:** Connected/Offline with latency
- **API Reachable:** Health endpoint status
- **Health Details:** DB, disk, memory, uptime checks
- **Create Backup:** Manual database dump
- **View Backups:** List and manage backup files

### Processes Tab

List running processes and kill unsafe ones:
- Can kill: `node.exe`, `cloudflared.exe`
- Cannot kill: Other processes (safety restriction)

### System Tab

System information:
- Hostname, uptime, OS version
- CPU, memory, disk usage
- Network interfaces and IP addresses
- Environment variable availability (values hidden for security)

### Tunnel Tab

Cloudflare tunnel status:
- Tunnel service status (running/down)
- Connection state
- Last connection time
- Public endpoint check

---

## Troubleshooting

### Service won't start / enters SERVICE_PAUSED

Check logs:
```powershell
Get-Content C:\inetpub\wwwroot\Flight-Points\Logs\Panel\panel-stdout.log -Tail 50
Get-Content C:\inetpub\wwwroot\Flight-Points\Logs\Panel\panel-stderr.log -Tail 50
```

Common issues:
- **PANEL_PIN not set** → Add to `.env.local`
- **Port 4000 in use** → Check `netstat -ano | findstr :4000` or change via `PANEL_PORT`
- **Missing Node.js** → Ensure node.exe is in PATH
- **Permission issues** → Reinstall service: `.\panel\Install-PanelService.ps1`

### Database shows "Offline" but API is running

1. Check API health endpoint manually:
   ```powershell
   Invoke-WebRequest http://localhost:3001/api/health -UseBasicParsing | Select-Object StatusCode, Content
   ```

2. Check API server logs:
   ```powershell
   Get-Content C:\inetpub\wwwroot\Flight-Points\Logs\Server\server-errors-*.log -Tail 30
   ```

3. Check database connection string:
   ```powershell
   # In .env.local, verify DATABASE_URL is set
   Get-Content .env.local | Select-String DATABASE_URL
   ```

### 401 Favicon error in browser console

Harmless — the browser requests `/favicon.ico` before authentication. This is expected and does not affect functionality.

---

## Security

### Authentication

- **PIN:** 4–10 digits
- **TOTP:** 6-digit code from authenticator app, synced to server clock ±1 window (30-second tolerance)
- **Rate Limiting:** 5 failed attempts → 15-minute account lockout
- **Session:** 2-hour sliding window; automatically extends on activity

### Network

- **Local access:** `http://localhost:4000` (unencrypted, localhost only)
- **Remote access:** `https://panel.flightpoints.uk` (TLS via Cloudflare tunnel)
- **API calls:** Require valid session token (header or cookie)

### Best Practices

1. **Use strong PIN:** Avoid sequential numbers or common patterns
2. **Use TOTP if possible:** 6-digit codes are more secure than PINs
3. **Keep secrets in `.env.local`:** Never commit credentials to Git
4. **Access via Cloudflare:** Always use HTTPS tunnel for remote access, not direct port forwarding
5. **Monitor logs:** Check panel and API logs regularly for anomalies

---

## Reinstalling Service

If you need to update the panel code or change configuration:

```powershell
# Stop the service
Stop-Service -Name flight-points-panel

# Pull latest code
git pull

# Reinstall (removes old service, creates new one with latest config)
.\panel\Install-PanelService.ps1

# Start
Start-Service -Name flight-points-panel

# Verify
Get-Service flight-points-panel | Select-Object Status
```

---

## Logs Location

All logs are stored at: `C:\inetpub\wwwroot\Flight-Points\Logs\Panel\`

- `panel-stdout.log` — Normal output and info logs
- `panel-stderr.log` — Error logs

Configure via `.env.local`:
```
PANEL_LOGS_ROOT=C:\your\custom\logs\path
```

---

## API Reference (for developers)

### Auth Endpoints

**POST /api/auth/login**
```json
{
  "pin": "123456",
  "totp": ""
}
```
Returns: `{ token: "hex_string" }`

**GET /api/auth/check**
Returns: `{ ok: true, totpEnabled: true }`

### Data Endpoints

All require authentication header: `Authorization: Bearer {token}`

- `GET /api/overview` — Summary of all services
- `GET /api/db/status` — Database connectivity and health
- `GET /api/logs` — List available logs
- `GET /api/logs/{type}/stream` — SSE log stream
- `POST /api/services/{name}/{action}` — Control services
- `POST /api/git/fetch`, `/api/git/pull` — Git operations
- `POST /api/deploy/*` — Build and deploy
- `GET /api/system`, `/api/tunnel` — System and tunnel info

---

## Development

To run panel locally during development:

```powershell
npm run panel
```

This runs `node panel/panel-server.cjs` directly without installing as a service.

Access at: `http://localhost:4000`

---

## Support

For issues or feature requests, check:
1. Log files in `C:\inetpub\wwwroot\Flight-Points\Logs\Panel\`
2. Panel UI "Logs" tab for diagnostics
3. Panel UI "Database" tab for health details
4. API health endpoint: `http://localhost:3001/api/health`

---

**Last Updated:** 2026-03-22
