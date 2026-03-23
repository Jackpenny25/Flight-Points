'use strict';
// ============================================================
// Flight-Points Control Panel Server
// Standalone Node.js (no npm install required — built-ins only)
// Runs on PANEL_PORT (default 4000) as a separate NSSM service.
// ============================================================

const http    = require('http');
const https   = require('https');
const { exec } = require('child_process');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const crypto  = require('crypto');

// ─── Paths ───────────────────────────────────────────────────────────────────
const ROOT       = path.resolve(__dirname, '..');
const PANEL_DIR  = __dirname;

// ─── Load .env.local ──────────────────────────────────────────────────────────
;(function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
})();

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT       = parseInt(process.env.PANEL_PORT || '4000', 10);
const PANEL_TOTP_SECRET = String(process.env.PANEL_TOTP_SECRET || process.env.ADMIN_TOTP_SECRET || '').trim();
const ADMIN_BACKUP_CODE_MIN_LENGTH = parseInt(process.env.ADMIN_BACKUP_CODE_MIN_LENGTH || '24', 10);
const ADMIN_BACKUP_CODE_PATH = path.join(ROOT, 'data', 'admin-backup-code.txt');
const API_PORT   = parseInt(process.env.PORT || '3001', 10);
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours sliding window
const PANEL_MAX_LOGIN_ATTEMPTS = parseInt(process.env.PANEL_MAX_LOGIN_ATTEMPTS || '10', 10);
const PANEL_LOCKOUT_MINUTES = parseInt(process.env.PANEL_LOCKOUT_MINUTES || '15', 10);

// Locate log/backup directories (configurable so it works both in dev and on server)
const LOGS_ROOT    = process.env.PANEL_LOGS_ROOT   || 'C:\\inetpub\\wwwroot\\Flight-Points\\Logs';
const BACKUPS_DIR  = process.env.PANEL_BACKUPS_DIR || 'C:\\inetpub\\wwwroot\\Flight-Points\\Backups';
const PANEL_LOG_DIR = path.join(LOGS_ROOT, 'Panel');
const PANEL_DIAGNOSTICS_LOG = path.join(PANEL_LOG_DIR, 'panel-diagnostics.log');
const POWERSHELL_EXE = process.env.PANEL_POWERSHELL_PATH
  || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

const SERVICES = ['flight-points', 'flight-points-tunnel', 'flight-points-panel'];
const TASKS = {
  'server-tunnel': 'Flight-Points_Server_Tunnel',
  'auto-deploy': 'FlightPoints-AutoDeploy',
  'weekly-backup': 'FlightPoints-Weekly-Backup'
};
const TEAMVIEWER_PATHS = [
  'C:\\Program Files\\TeamViewer\\TeamViewer.exe',
  'C:\\Program Files (x86)\\TeamViewer\\TeamViewer.exe',
  'C:\\Program Files\\TeamViewer\\TeamViewer_Service.exe',
  'C:\\Program Files (x86)\\TeamViewer\\TeamViewer_Service.exe'
];
const PG_DUMP_PATHS = [
  'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
  'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe'
];
const UTILITY_SCRIPTS = {
  'dbeaver-tunnel': path.join(ROOT, 'start-dbeaver-tunnel.ps1'),
  'restart-server': path.join(ROOT, 'restart-server.ps1'),
  'install-backup-task': path.join(ROOT, 'install-backup-task.ps1'),
  'setup-auto-deploy': path.join(ROOT, 'setup-auto-deploy.ps1')
};

function generateBackupCode() {
  return crypto.randomBytes(48).toString('base64url');
}

function normalizeBackupCode(value) {
  return String(value || '').trim();
}

function loadOrCreateBackupCode() {
  const envCode = normalizeBackupCode(process.env.ADMIN_BACKUP_CODE || '');
  if (envCode) {
    if (envCode.length < ADMIN_BACKUP_CODE_MIN_LENGTH) {
      console.error(`[panel] FATAL: ADMIN_BACKUP_CODE must be at least ${ADMIN_BACKUP_CODE_MIN_LENGTH} characters.`);
      process.exit(1);
    }
    return envCode;
  }

  try {
    if (fs.existsSync(ADMIN_BACKUP_CODE_PATH)) {
      const fileCode = normalizeBackupCode(fs.readFileSync(ADMIN_BACKUP_CODE_PATH, 'utf8'));
      if (fileCode.length >= ADMIN_BACKUP_CODE_MIN_LENGTH) return fileCode;
    }

    const generated = generateBackupCode();
    fs.mkdirSync(path.dirname(ADMIN_BACKUP_CODE_PATH), { recursive: true });
    fs.writeFileSync(ADMIN_BACKUP_CODE_PATH, generated, { encoding: 'utf8', mode: 0o600 });
    console.warn(`[panel] Generated admin backup code at ${ADMIN_BACKUP_CODE_PATH}. Move it to ADMIN_BACKUP_CODE in .env.local.`);
    return generated;
  } catch (error) {
    console.error('[panel] FATAL: Failed to load or create backup code:', error);
    process.exit(1);
  }
}

function codesMatchConstantTime(submitted, expected) {
  const submittedBuffer = Buffer.from(submitted, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (submittedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(submittedBuffer, expectedBuffer);
}

const PANEL_BACKUP_CODE = loadOrCreateBackupCode();

if (!PANEL_TOTP_SECRET) {
  console.error('[panel] FATAL: PANEL_TOTP_SECRET or ADMIN_TOTP_SECRET must be set in .env.local');
  process.exit(1);
}

if (!PANEL_BACKUP_CODE || PANEL_BACKUP_CODE.length < ADMIN_BACKUP_CODE_MIN_LENGTH) {
  console.error('[panel] FATAL: ADMIN_BACKUP_CODE is missing or too short.');
  process.exit(1);
}

// Log auth method on startup
console.log('[panel] ✓ Auth: TOTP enabled (long backup code fallback)');

function appendDiagnosticLog(event, details) {
  try {
    fs.mkdirSync(PANEL_LOG_DIR, { recursive: true });
    const payload = typeof details === 'string' ? details : JSON.stringify(details);
    fs.appendFileSync(PANEL_DIAGNOSTICS_LOG, `${new Date().toISOString()} ${event} ${payload}${os.EOL}`, 'utf8');
  } catch {
    // Diagnostics must never crash the panel.
  }
}

function firstExistingPath(paths) {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function discoverTooling() {
  return {
    teamViewerPath: firstExistingPath(TEAMVIEWER_PATHS),
    pgDumpPath: firstExistingPath(PG_DUMP_PATHS),
    dbTunnelScript: fs.existsSync(UTILITY_SCRIPTS['dbeaver-tunnel']) ? UTILITY_SCRIPTS['dbeaver-tunnel'] : null,
    restartServerScript: fs.existsSync(UTILITY_SCRIPTS['restart-server']) ? UTILITY_SCRIPTS['restart-server'] : null,
    backupTaskScript: fs.existsSync(UTILITY_SCRIPTS['install-backup-task']) ? UTILITY_SCRIPTS['install-backup-task'] : null,
    setupAutoDeployScript: fs.existsSync(UTILITY_SCRIPTS['setup-auto-deploy']) ? UTILITY_SCRIPTS['setup-auto-deploy'] : null
  };
}

// ─── Session Store ────────────────────────────────────────────────────────────
const sessions = new Map(); // token -> expiresAt

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function validateSession(token) {
  if (!token || !sessions.has(token)) return false;
  const exp = sessions.get(token);
  if (Date.now() > exp) { sessions.delete(token); return false; }
  sessions.set(token, Date.now() + SESSION_TTL_MS); // sliding
  return true;
}

function getToken(req) {
  const hdr = req.headers['x-panel-token'] || '';
  if (hdr) return hdr;
  const cookie = (req.headers.cookie || '').split(';')
    .map(c => c.trim()).find(c => c.startsWith('panel_token='));
  return cookie ? cookie.split('=').slice(1).join('=') : '';
}

// ─── Login Rate Limiting ──────────────────────────────────────────────────────
const loginAttempts = new Map(); // ip -> {count, lockedUntil}

function isLocked(ip) {
  const a = loginAttempts.get(ip);
  return !!(a && a.lockedUntil && Date.now() < a.lockedUntil);
}
function recordAttempt(ip, success) {
  if (success) { loginAttempts.delete(ip); return; }
  const a = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  a.count++;
  if (a.count >= PANEL_MAX_LOGIN_ATTEMPTS) a.lockedUntil = Date.now() + PANEL_LOCKOUT_MINUTES * 60 * 1000;
  loginAttempts.set(ip, a);
}

// ─── TOTP Helper (RFC 6238) ──────────────────────────────────────────────────
// Converts base32 secret to bytes without external library
function base32Decode(b32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = [];
  let bits = 0, value = 0;
  for (const c of (b32 || '').toUpperCase().replace(/=/g, '')) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >> bits) & 0xff); }
  }
  return Buffer.from(bytes);
}

// Generate TOTP tokens valid for current 30-second window and adjacent windows
function generateTotp(secret) {
  if (!secret) return null;
  const key = base32Decode(secret);
  let now = Math.floor(Date.now() / 1000);
  const timeCounter = Math.floor(now / 30);
  const tokens = [];
  // Generate tokens for current, previous, and next 30-second windows (for clock skew tolerance)
  for (let i = -1; i <= 1; i++) {
    let counter = timeCounter + i;
    const buf = Buffer.alloc(8);
    for (let j = 7; j >= 0; j--) { buf[j] = counter & 0xff; counter >>>= 8; }
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = (((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)) % 1000000;
    tokens.push(code.toString().padStart(6, '0'));
  }
  return tokens; // [prev, current, next]
}

// ─── Execution Helpers ────────────────────────────────────────────────────────
function shell(cmd, timeout = 30000) {
  return new Promise(resolve => {
    exec(cmd, { timeout, windowsHide: true, cwd: ROOT, maxBuffer: 5 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({
        ok: !err,
        out: (stdout || '').trim(),
        err: (stderr || '').trim(),
        code: err ? (err.code || 1) : 0
      })
    );
  });
}

function ps(script, timeout = 30000) {
  const tmp = path.join(os.tmpdir(), `fp_panel_${crypto.randomBytes(6).toString('hex')}.ps1`);
  fs.writeFileSync(tmp, script, 'utf8');
  const psExe = fs.existsSync(POWERSHELL_EXE) ? POWERSHELL_EXE : 'powershell.exe';
  return new Promise(resolve => {
    exec(
      `"${psExe}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmp}"`,
      { timeout, windowsHide: true, cwd: ROOT, maxBuffer: 5 * 1024 * 1024 },
      (err, stdout, stderr) => {
        fs.unlink(tmp, () => {});
        resolve({
          ok: !err,
          out: (stdout || '').trim(),
          err: (stderr || '').trim(),
          code: err ? (err.code || 1) : 0
        });
      }
    );
  });
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────
const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN'
};

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 20000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function requireAuth(req, res) {
  if (!validateSession(getToken(req))) {
    json(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}

// ─── Local API Fetch ──────────────────────────────────────────────────────────
function fetchLocal(urlPath, timeout = 5000) {
  return new Promise(resolve => {
    const options = { hostname: 'localhost', port: API_PORT, path: urlPath, method: 'GET', timeout };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          if (res.statusCode >= 400) appendDiagnosticLog('local_fetch_non_ok', { urlPath, status: res.statusCode, body });
          resolve({ ok: res.statusCode < 400, status: res.statusCode, body });
        }
        catch {
          if (res.statusCode >= 400) appendDiagnosticLog('local_fetch_non_ok', { urlPath, status: res.statusCode, body: data });
          resolve({ ok: res.statusCode < 400, status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', err => {
      appendDiagnosticLog('local_fetch_error', { urlPath, error: err.message });
      resolve({ ok: false, status: 0, body: null, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      appendDiagnosticLog('local_fetch_timeout', { urlPath, timeout });
      resolve({ ok: false, status: 0, body: null, error: 'timeout' });
    });
    req.end();
  });
}

function getDbHealthSummary(health) {
  if (!health || typeof health !== 'object') return { ok: false, detail: 'No health payload' };
  if (health.database === 'ok') return { ok: true, detail: 'database=ok' };
  if (health.checks && health.checks.db) {
    return { ok: !!health.checks.db.ok, detail: health.checks.db.detail || 'DB check present' };
  }
  if (health.db && typeof health.db === 'object') {
    return { ok: !!health.db.ok, detail: health.db.detail || 'DB check present' };
  }
  return { ok: false, detail: 'DB check not found in health payload' };
}

async function getTunnelSummary() {
  const services = await getServicesMap();
  const cfResult = await ps(`
    $p = Get-Process -Name cloudflared -EA SilentlyContinue
    if ($p) {
      [PSCustomObject]@{
        Running=$true; Pid=$p.Id
        StartTime=if($p.StartTime){$p.StartTime.ToString('u')}else{''}
        MemMB=[Math]::Round($p.WorkingSet/1MB,1)
        CPU=[Math]::Round($p.CPU,2)
      }
    } else { [PSCustomObject]@{Running=$false;Pid=0;StartTime='';MemMB=0;CPU=0} }
  `);

  let process = { Running: false };
  try { process = JSON.parse(cfResult.out); }
  catch {
    appendDiagnosticLog('tunnel_process_parse_failed', { stdout: cfResult.out, stderr: cfResult.err });
  }

  let publicResult = { ok: false, status: 0, latency: 0 };
  const start = Date.now();
  try {
    publicResult = await new Promise(resolve => {
      const req2 = https.get('https://api.flightpoints.uk/api/health', { timeout: 6000 }, res2 => {
        res2.resume();
        resolve({ ok: res2.statusCode < 400, status: res2.statusCode, latency: Date.now() - start });
      });
      req2.on('error', err => resolve({ ok: false, status: 0, latency: Date.now() - start, error: err.message }));
      req2.on('timeout', () => { req2.destroy(); resolve({ ok: false, status: 0, latency: 6000, error: 'timeout' }); });
    });
  } catch {
    // Network unavailable.
  }

  const service = services['flight-points-tunnel'] || 'Unknown';
  return { ok: service === 'Running' || !!process.Running || !!publicResult.ok, service, process, public: publicResult };
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

// POST /api/auth/login
async function handleLogin(req, res, body) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (isLocked(ip)) return json(res, 429, { error: `Too many attempts. Try again in ${PANEL_LOCKOUT_MINUTES} minutes.` });
  const submittedCode = String(body.code || body.totp || body.pin || '').trim();
  const tokens = generateTotp(PANEL_TOTP_SECRET) || [];
  const totpValid = /^\d{6}$/.test(submittedCode) && tokens.includes(submittedCode);
  const backupValid = submittedCode.length >= ADMIN_BACKUP_CODE_MIN_LENGTH
    ? codesMatchConstantTime(submittedCode, PANEL_BACKUP_CODE)
    : false;
  const valid = totpValid || backupValid;
  
  if (!valid) {
    recordAttempt(ip, false);
    return json(res, 401, { error: 'Invalid authenticator or backup code' });
  }
  recordAttempt(ip, true);
  json(res, 200, { token: createSession() });
}

// GET /api/overview
async function handleOverview(req, res) {
  const [apiResult, branch, commit, svcMap, tunnel] = await Promise.all([
    fetchLocal('/api/health', 4000),
    shell('git rev-parse --abbrev-ref HEAD'),
    shell('git log -1 --format="%h||%s||%ai"'),
    getServicesMap(),
    getTunnelSummary()
  ]);
  const [behind, localMods] = await Promise.all([
    shell('git rev-list --count HEAD..@{u} 2>nul'),
    shell('git status --porcelain')
  ]);
  const parts = (commit.ok ? commit.out : '').split('||');
  const db = getDbHealthSummary(apiResult.body);
  appendDiagnosticLog('overview_snapshot', { apiStatus: apiResult.status, apiOk: apiResult.ok, db, tunnel, services: svcMap });
  json(res, 200, {
    api:      { ok: apiResult.ok, status: apiResult.status, health: apiResult.body, db },
    services: svcMap,
    tunnel,
    git: {
      branch:   branch.ok ? branch.out : 'unknown',
      commit:   { short: parts[0]||'', message: parts[1]||'', date: parts[2]||'' },
      behind:   behind.ok ? (parseInt(behind.out) || 0) : 0,
      dirty:    localMods.ok && localMods.out.length > 0
    },
    system: {
      uptime:        Math.round(os.uptime()),
      processUptime: Math.round(process.uptime()),
      memory: {
        total: os.totalmem(),
        free:  os.freemem(),
        usedPct: Math.round((os.totalmem() - os.freemem()) / os.totalmem() * 100)
      },
      hostname: os.hostname()
    },
    timestamp: new Date().toISOString()
  });
}

// Service status helper
async function getServicesMap() {
  const result = await ps(`
    $out = @{}
    foreach ($n in @('flight-points','flight-points-tunnel')) {
      try { $s = Get-Service -Name $n -EA Stop; $out[$n] = $s.Status.ToString() }
      catch { $out[$n] = 'NotFound' }
    }
    $out | ConvertTo-Json
  `);
  try { return JSON.parse(result.out); }
  catch {
    appendDiagnosticLog('services_map_parse_failed', { stdout: result.out, stderr: result.err });
    return { 'flight-points': 'Unknown', 'flight-points-tunnel': 'Unknown' };
  }
}

// GET /api/services
async function handleServices(req, res) {
  // Also get NSSM details
  const result = await ps(`
    $svc = @()
    foreach ($n in @('flight-points','flight-points-tunnel')) {
      try {
        $s = Get-Service -Name $n -EA Stop
        $svc += [PSCustomObject]@{
          Name      = $s.Name
          Status    = $s.Status.ToString()
          StartType = $s.StartType.ToString()
        }
      } catch {
        $svc += [PSCustomObject]@{ Name=$n; Status='NotFound'; StartType='Unknown' }
      }
    }
    $svc | ConvertTo-Json
  `);
  let svcs = [];
  try { svcs = JSON.parse(result.out); if (!Array.isArray(svcs)) svcs = [svcs]; } catch {}
  json(res, 200, svcs);
}

async function getTasksJson() {
  const result = await ps(`
    $list = @()
    $map = @{
      'server-tunnel' = 'Flight-Points_Server_Tunnel'
      'auto-deploy' = 'FlightPoints-AutoDeploy'
      'weekly-backup' = 'FlightPoints-Weekly-Backup'
    }
    foreach ($key in $map.Keys) {
      $name = $map[$key]
      try {
        $task = Get-ScheduledTask -TaskName $name -EA Stop
        $info = Get-ScheduledTaskInfo -TaskName $name -EA SilentlyContinue
        $list += [PSCustomObject]@{
          Key = $key
          Name = $name
          State = $task.State.ToString()
          Enabled = [bool]$task.Settings.Enabled
          LastRunTime = if($info){$info.LastRunTime.ToString('u')}else{''}
          NextRunTime = if($info){$info.NextRunTime.ToString('u')}else{''}
          LastTaskResult = if($info){$info.LastTaskResult}else{$null}
        }
      } catch {
        $list += [PSCustomObject]@{ Key=$key; Name=$name; State='NotFound'; Enabled=$false; LastRunTime=''; NextRunTime=''; LastTaskResult=$null }
      }
    }
    $list | ConvertTo-Json -Depth 4
  `, 45000);
  try {
    const parsed = JSON.parse(result.out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function handleTasks(req, res) {
  json(res, 200, await getTasksJson());
}

async function handleTaskAction(req, res, key, action) {
  const taskName = TASKS[key];
  if (!taskName) return json(res, 400, { error: 'Unknown task' });
  const actions = {
    run: `Start-ScheduledTask -TaskName '${taskName}' -EA Stop`,
    stop: `Stop-ScheduledTask -TaskName '${taskName}' -EA Stop`,
    enable: `Enable-ScheduledTask -TaskName '${taskName}' -EA Stop`,
    disable: `Disable-ScheduledTask -TaskName '${taskName}' -EA Stop`
  };
  if (!actions[action]) return json(res, 400, { error: 'Invalid task action' });
  const result = await ps(`
    try {
      ${actions[action]}
      Write-Output 'OK: ${taskName} ${action}'
    } catch {
      Write-Output ('ERROR: ' + $_.Exception.Message)
    }
  `, 60000);
  json(res, 200, { ok: (result.out || '').startsWith('OK'), output: result.out || result.err });
}

async function handleSystemUtilities(req, res) {
  const tooling = discoverTooling();
  const tasks = await getTasksJson();
  const dbeaverPort = await ps(`$r = Test-NetConnection -ComputerName localhost -Port 6543 -InformationLevel Quiet -WarningAction SilentlyContinue; if($r){'true'}else{'false'}`);
  const teamViewerRunning = await ps(`$p = Get-Process -Name TeamViewer,TeamViewer_Service -EA SilentlyContinue; if($p){'true'}else{'false'}`);
  json(res, 200, {
    ...tooling,
    dbeaverTunnelOpen: (dbeaverPort.out || '').trim() === 'true',
    teamViewerRunning: (teamViewerRunning.out || '').trim() === 'true',
    tasks
  });
}

async function handleUtilityAction(req, res, action) {
  if (action === 'start-teamviewer') {
    const teamViewerPath = firstExistingPath(TEAMVIEWER_PATHS);
    if (!teamViewerPath) return json(res, 404, { error: 'TeamViewer executable not found in common locations' });
    const result = await ps(`
      try {
        Start-Process -FilePath '${teamViewerPath}' -EA Stop
        Write-Output 'OK: TeamViewer started'
      } catch {
        Write-Output ('ERROR: ' + $_.Exception.Message)
      }
    `, 30000);
    return json(res, 200, { ok: (result.out || '').startsWith('OK'), output: result.out || result.err, path: teamViewerPath });
  }

  const scriptPath = UTILITY_SCRIPTS[action];
  if (!scriptPath || !fs.existsSync(scriptPath)) return json(res, 404, { error: 'Utility script not found' });
  const result = await ps(`Set-Location '${ROOT}'; & '${scriptPath}'`, 180000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') || 'Done' });
}

// POST /api/services/:name/:action
async function handleServiceAction(req, res, name, action) {
  if (!SERVICES.includes(name)) return json(res, 400, { error: 'Unknown service' });
  if (!['start', 'stop', 'restart'].includes(action)) return json(res, 400, { error: 'Invalid action' });
  const cmdlets = { start: 'Start-Service', stop: 'Stop-Service', restart: 'Restart-Service' };
  const result = await ps(`
    try {
      ${cmdlets[action]} -Name '${name}' -EA Stop
      Write-Output "OK: ${name} ${action}d successfully"
    } catch {
      Write-Output "ERROR: $($_.Exception.Message)"
    }
  `, 60000);
  json(res, 200, { ok: (result.out || '').startsWith('OK'), output: result.out || result.err });
}

// POST /api/services/restart-app — restart flight-points + flight-points-tunnel (panel stays up)
async function handleRestartApp(req, res) {
  const result = await ps(`
    $out = @()
    try {
      Restart-Service -Name 'flight-points' -Force -EA Stop
      $out += 'OK: flight-points restarted'
    } catch { $out += "ERROR flight-points: $($_.Exception.Message)" }
    Start-Sleep -Seconds 2
    try {
      Restart-Service -Name 'flight-points-tunnel' -Force -EA Stop
      $out += 'OK: flight-points-tunnel restarted'
    } catch { $out += "ERROR flight-points-tunnel: $($_.Exception.Message)" }
    $out -join [char]10
  `, 90000);
  const output = [result.out, result.err].filter(Boolean).join('\n') || 'Done';
  json(res, 200, { ok: !result.err && result.out.includes('OK'), output });
}

// POST /api/panel/restart — restart panel + all managed services
function handlePanelRestart(req, res) {
  json(res, 200, { ok: true, message: 'Restart initiated. Panel and all services will restart in ~1s.' });
  // Detached PowerShell process restarts all services; survives this process dying
  const script = [
    "Start-Sleep -Seconds 1",
    "Restart-Service -Name 'flight-points'        -Force -ErrorAction SilentlyContinue",
    "Restart-Service -Name 'flight-points-tunnel' -Force -ErrorAction SilentlyContinue",
    "Restart-Service -Name 'flight-points-panel'  -Force -ErrorAction SilentlyContinue"
  ].join('; ');
  const psExe = fs.existsSync(POWERSHELL_EXE) ? POWERSHELL_EXE : 'powershell.exe';
  const child = require('child_process').spawn(
    psExe, ['-NoProfile', '-NonInteractive', '-Command', script],
    { detached: true, stdio: 'ignore', windowsHide: true }
  );
  child.unref();
}

// GET /api/git/status
async function handleGitStatus(req, res) {
  const [branch, commitInfo, statusOut, aheadBehind] = await Promise.all([
    shell('git rev-parse --abbrev-ref HEAD'),
    shell('git log -1 --format="%H||%h||%s||%ai||%an"'),
    shell('git status --porcelain'),
    shell('git rev-list --left-right --count HEAD...@{u} 2>nul')
  ]);
  const parts = (commitInfo.ok ? commitInfo.out : '').split('||');
  const ab = (aheadBehind.ok ? aheadBehind.out : '0\t0').split(/\s+/);
  json(res, 200, {
    branch:  branch.ok ? branch.out : 'unknown',
    commit:  { hash: parts[0]||'', short: parts[1]||'', message: parts[2]||'', date: parts[3]||'', author: parts[4]||'' },
    dirty:   statusOut.ok && statusOut.out.length > 0,
    changed: statusOut.ok ? statusOut.out.split('\n').filter(Boolean) : [],
    ahead:   parseInt(ab[0]) || 0,
    behind:  parseInt(ab[1]) || 0
  });
}

// GET /api/git/log
async function handleGitLog(req, res) {
  const result = await shell('git log -30 --format="%h||%s||%an||%ar||%ai"');
  const entries = (result.ok ? result.out.split('\n').filter(Boolean) : []).map(l => {
    const [hash, msg, author, rel, abs] = l.split('||');
    return { hash, msg: msg||'', author: author||'', relative: rel||'', date: abs||'' };
  });
  json(res, 200, entries);
}

// POST /api/git/fetch
async function handleGitFetch(req, res) {
  const result = await shell('git fetch --prune origin 2>&1', 60000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') || 'Fetch complete (nothing new)' });
}

// POST /api/git/pull
async function handleGitPull(req, res) {
  const result = await shell('git pull --ff-only origin main 2>&1', 90000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') });
}

// POST /api/deploy/build
async function handleDeployBuild(req, res) {
  const result = await shell('npm run build 2>&1', 180000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') });
}

// POST /api/deploy/typecheck
async function handleDeployTypecheck(req, res) {
  const result = await shell('npx tsc --noEmit 2>&1', 90000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') || 'TypeScript check passed with no errors' });
}

// POST /api/deploy/install
async function handleDeployInstall(req, res) {
  const result = await shell('npm install 2>&1', 180000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') });
}

// POST /api/deploy/run  (triggers auto-deploy -RunOnce)
async function handleDeployRun(req, res) {
  const script = path.join(ROOT, 'auto-deploy.ps1');
  if (!fs.existsSync(script)) return json(res, 404, { error: 'auto-deploy.ps1 not found' });
  const result = await ps(`Set-Location '${ROOT}'; & '${script}' -RunOnce`, 300000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') });
}

// POST /api/deploy/audit  (npm audit)
async function handleDeployAudit(req, res) {
  const result = await shell('npm audit --omit=dev 2>&1', 60000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') });
}

// ─── Log Helpers ──────────────────────────────────────────────────────────────
function resolveLogPath(type) {
  // Named shortcuts
  const named = {
    'nssm':        path.join(ROOT, 'Logs', 'Server', 'nssm-stdout.log'),
    'server':      path.join(LOGS_ROOT, 'Server', 'nssm-stdout.log'),
    'panel':       path.join(PANEL_LOG_DIR, 'panel-stdout.log'),
    'panel-error': path.join(PANEL_LOG_DIR, 'panel-stderr.log'),
    'diagnostics': PANEL_DIAGNOSTICS_LOG,
  };
  if (named[type]) return named[type];

  // Directory-based: find latest .log file
  const dirs = {
    'error':  [path.join(ROOT, 'Logs', 'Server'), path.join(LOGS_ROOT, 'Server')],
    'tunnel': [path.join(LOGS_ROOT, 'Tunnel'), path.join(ROOT, 'Logs', 'Tunnel')],
    'deploy': [path.join(LOGS_ROOT, 'Deploy')],
    'backup': [path.join(LOGS_ROOT, 'Backup')],
  };
  const candidates = dirs[type];
  if (!candidates) return null;

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.log'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);
      if (files.length) return path.join(dir, files[0].name);
    } catch { /* skip */ }
  }
  return null;
}

// GET /api/logs/:type
function handleGetLog(req, res, type) {
  const url    = new URL(req.url, `http://localhost`);
  const lines  = Math.min(parseInt(url.searchParams.get('lines') || '400', 10), 5000);
  const logPath = resolveLogPath(type);
  if (!logPath || !fs.existsSync(logPath)) {
    return json(res, 200, { content: '(log file not found or empty)', path: logPath || '?', exists: false, size: 0, totalLines: 0 });
  }
  try {
    const content  = fs.readFileSync(logPath, 'utf8');
    const all      = content.split('\n');
    const lastLines = all.slice(-lines).join('\n');
    json(res, 200, { content: lastLines, path: logPath, exists: true, totalLines: all.length, size: fs.statSync(logPath).size });
  } catch (e) { json(res, 500, { error: e.message }); }
}

// GET /api/logs/:type/stream  (SSE)
function handleLogStream(req, res, type) {
  const logPath = resolveLogPath(type);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Frame-Options': 'SAMEORIGIN'
  });

  const send = (obj) => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* client gone */ }
  };

  if (!logPath || !fs.existsSync(logPath)) {
    send({ type: 'init', content: '(log file not found)' });
    res.end();
    return;
  }

  // Send last 150 lines immediately
  try {
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').slice(-150).join('\n');
    send({ type: 'init', content: lines });
  } catch { send({ type: 'init', content: '(error reading log)' }); }

  let watcher;
  try {
    watcher = fs.watch(logPath, { persistent: false }, (evt) => {
      if (evt !== 'change') return;
      try {
        const tail = fs.readFileSync(logPath, 'utf8').split('\n').slice(-8);
        send({ type: 'append', lines: tail });
      } catch { /* skip */ }
    });
  } catch { /* watch not supported */ }

  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(hb); } }, 20000);
  req.on('close', () => { clearInterval(hb); try { watcher && watcher.close(); } catch { /* ignore */ } });
}

// GET /api/logs/list
function handleListLogs(req, res) {
  const allLogs = [];
  const addDir = (dir, label) => {
    if (!fs.existsSync(dir)) return;
    try {
      fs.readdirSync(dir).forEach(f => {
        if (!f.endsWith('.log')) return;
        const fp = path.join(dir, f);
        try {
          const stat = fs.statSync(fp);
          allLogs.push({ name: f, path: fp, size: stat.size, modified: stat.mtime.toISOString(), type: label });
        } catch { /* skip */ }
      });
    } catch { /* skip */ }
  };
  addDir(path.join(ROOT, 'Logs', 'Server'), 'nssm');
  addDir(path.join(LOGS_ROOT, 'Server'),  'server');
  addDir(path.join(LOGS_ROOT, 'Panel'),   'panel');
  addDir(path.join(LOGS_ROOT, 'Tunnel'),  'tunnel');
  addDir(path.join(LOGS_ROOT, 'Deploy'),  'deploy');
  addDir(path.join(LOGS_ROOT, 'Backup'),  'backup');
  // Deduplicate by path
  const seen = new Set();
  const unique = allLogs.filter(l => { if (seen.has(l.path)) return false; seen.add(l.path); return true; });
  json(res, 200, unique.sort((a, b) => new Date(b.modified) - new Date(a.modified)));
}

// ─── Database ─────────────────────────────────────────────────────────────────
async function handleDbStatus(req, res) {
  const start = Date.now();
  const result = await fetchLocal('/api/health', 5000);
  const latency = Date.now() - start;
  const apiReachable = result.ok && result.status < 400;
  const dbSummary = getDbHealthSummary(result.body);
  const dbHealthy = apiReachable && dbSummary.ok;
  appendDiagnosticLog('db_status', { apiReachable, apiStatus: result.status, dbOk: dbHealthy, detail: dbSummary.detail });
  json(res, 200, {
    ok:             dbHealthy,
    latency,
    apiReachable,
    apiStatus:      result.status,
    health:         result.body || null,
    dbDetail:       dbSummary.detail,
    error:          !apiReachable ? (result.error || `API returned ${result.status}`) : null
  });
}

async function handleDbBackup(req, res) {
  const script = path.join(ROOT, 'server-backup.ps1');
  if (!fs.existsSync(script)) return json(res, 404, { error: 'server-backup.ps1 not found' });
  const result = await ps(`Set-Location '${ROOT}'; & '${script}'`, 120000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') });
}

async function handleDbBackups(req, res) {
  const dirs = [BACKUPS_DIR, path.join(ROOT, 'backups'), path.join(ROOT, 'data', 'backups')];
  const backups = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!/\.(dump|sql|gz|bak)$/.test(f)) continue;
        const fp = path.join(dir, f);
        try {
          const stat = fs.statSync(fp);
          backups.push({ name: f, path: fp, size: stat.size, modified: stat.mtime.toISOString(), dir });
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  json(res, 200, backups.sort((a, b) => new Date(b.modified) - new Date(a.modified)));
}

async function handleDbUtilities(req, res) {
  const tooling = discoverTooling();
  const tasks = await getTasksJson();
  const backupTask = tasks.find(task => task.Key === 'weekly-backup') || null;
  const dbeaverPort = await ps(`$r = Test-NetConnection -ComputerName localhost -Port 6543 -InformationLevel Quiet -WarningAction SilentlyContinue; if($r){'true'}else{'false'}`);
  json(res, 200, {
    pgDumpPath: tooling.pgDumpPath,
    dbTunnelScript: tooling.dbTunnelScript,
    dbeaverTunnelOpen: (dbeaverPort.out || '').trim() === 'true',
    weeklyBackupTask: backupTask,
    backupRoot: BACKUPS_DIR
  });
}

// ─── Processes ────────────────────────────────────────────────────────────────
async function handleProcesses(req, res) {
  const result = await ps(`
    try {
      $procs = Get-Process -Name node,cloudflared -EA SilentlyContinue
      if ($procs) {
        $procs | Select-Object Id, ProcessName,
          @{N='CPU';E={[Math]::Round($_.CPU,2)}},
          @{N='MemMB';E={[Math]::Round($_.WorkingSet/1MB,1)}},
          @{N='StartTime';E={if($_.StartTime){$_.StartTime.ToString('u')}else{''}}} |
          ConvertTo-Json -Depth 2
      } else { Write-Output '[]' }
    } catch { Write-Output '[]' }
  `);
  let procs = [];
  try { procs = JSON.parse(result.out); if (!Array.isArray(procs)) procs = [procs]; } catch {}
  json(res, 200, procs);
}

async function handleKillProcess(req, res, pid) {
  const pidNum = parseInt(pid, 10);
  if (!pidNum || pidNum <= 4) return json(res, 400, { error: 'Invalid PID' });

  const check = await ps(`$p = Get-Process -Id ${pidNum} -EA SilentlyContinue; if($p){$p.ProcessName}else{'NOTFOUND'}`);
  const name = (check.out || '').toLowerCase().trim();
  if (name === 'notfound') return json(res, 404, { error: 'Process not found' });
  if (!['node', 'cloudflared'].some(n => name.includes(n))) {
    return json(res, 403, { error: `Cannot kill process "${name}" — only node and cloudflared processes allowed` });
  }
  const result = await ps(`Stop-Process -Id ${pidNum} -Force -EA Stop`);
  json(res, result.ok ? 200 : 500, { ok: result.ok, output: result.ok ? `Process ${pidNum} killed` : result.err });
}

// ─── System ───────────────────────────────────────────────────────────────────
async function handleSystem(req, res) {
  const [diskResult, netResult, cpuResult, nodeVer, gitVer] = await Promise.all([
    ps(`Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Used -ne $null} | Select-Object Name,Used,Free | ConvertTo-Json`),
    ps(`Get-NetIPAddress -AddressFamily IPv4 -EA SilentlyContinue | Where-Object {$_.IPAddress -notmatch '^169\\.254' -and $_.InterfaceAlias -notmatch '^Loopback'} | Select-Object InterfaceAlias,IPAddress | ConvertTo-Json`),
    ps(`try{$c=(Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 1 -EA SilentlyContinue).CounterSamples.CookedValue;[Math]::Round($c,1)}catch{'0'}`),
    shell('node --version'),
    shell('git --version')
  ]);

  let disks = [], ifaces = [];
  try { disks = JSON.parse(diskResult.out); if (!Array.isArray(disks)) disks = [disks]; } catch {}
  try { ifaces = JSON.parse(netResult.out); if (!Array.isArray(ifaces)) ifaces = [ifaces]; } catch {}

  // Env checks (existence only — no values exposed)
  const envStatus = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    JWT_SECRET:   !!process.env.JWT_SECRET,
    ADMIN_TOTP_SECRET: !!process.env.ADMIN_TOTP_SECRET,
    PANEL_TOTP_SECRET: !!process.env.PANEL_TOTP_SECRET,
    ADMIN_BACKUP_CODE: !!process.env.ADMIN_BACKUP_CODE,
    PGSSLMODE:    process.env.PGSSLMODE || '(not set)',
    SMTP_SERVER:  !!process.env.SMTP_SERVER,
    NODE_ENV:     process.env.NODE_ENV || '(not set)'
  };

  const tooling = discoverTooling();
  const tasks = await getTasksJson();

  json(res, 200, {
    hostname:    os.hostname(),
    platform:    os.platform(),
    arch:        os.arch(),
    osRelease:   os.release(),
    nodeVersion: nodeVer.ok ? nodeVer.out : process.version,
    gitVersion:  gitVer.ok ? gitVer.out : 'unavailable',
    projectRoot: ROOT,
    logsRoot:    LOGS_ROOT,
    backupsDir:  BACKUPS_DIR,
    panelPort:   PORT,
    apiPort:     API_PORT,
    uptime:      { system: Math.round(os.uptime()), process: Math.round(process.uptime()) },
    memory:      { total: os.totalmem(), free: os.freemem() },
    cpu:         { count: os.cpus().length, model: os.cpus()[0]?.model || 'Unknown', usage: parseFloat(cpuResult.out) || 0 },
    disks,
    interfaces: ifaces,
    env:         envStatus,
    tooling,
    tasks
  });
}

// ─── Tunnel ───────────────────────────────────────────────────────────────────
async function handleTunnel(req, res) {
  const tunnel = await getTunnelSummary();
  appendDiagnosticLog('tunnel_status', tunnel);
  json(res, 200, { service: tunnel.service, process: tunnel.process, public: tunnel.public, ok: tunnel.ok, localApi: { port: API_PORT } });
}

// ─── Network Port Check ───────────────────────────────────────────────────────
async function handlePortCheck(req, res) {
  const result = await ps(`
    @(3001, 4000, 5432, 6543, 20241) | ForEach-Object {
      $port = $_
      $conn = Test-NetConnection -ComputerName localhost -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
      [PSCustomObject]@{ Port=$port; Open=$conn }
    } | ConvertTo-Json
  `);
  let ports = [];
  try { ports = JSON.parse(result.out); if (!Array.isArray(ports)) ports = [ports]; } catch {}
  json(res, 200, ports);
}

// ─── Deploy Status JSON ───────────────────────────────────────────────────────
async function handleDeployStatus(req, res) {
  const fp = path.join(ROOT, 'data', 'deploy-status.json');
  const up = path.join(ROOT, 'data', 'uptime-status.json');
  let deploy = null, uptime = null;
  try { deploy = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { /* not found */ }
  try { uptime = JSON.parse(fs.readFileSync(up, 'utf8')); } catch { /* not found */ }
  json(res, 200, { deploy, uptime });
}

// ─── NSSM Info ────────────────────────────────────────────────────────────────
async function handleNssmInfo(req, res, name) {
  if (!SERVICES.includes(name)) return json(res, 400, { error: 'Unknown service' });
  const [qc, status, appParams, appDir] = await Promise.all([
    shell('sc.exe qc "' + name + '" 2>&1'),
    shell('sc.exe query "' + name + '" 2>&1'),
    shell('nssm get "' + name + '" AppParameters 2>&1'),
    shell('nssm get "' + name + '" AppDirectory 2>&1')
  ]);
  json(res, 200, {
    qc:      qc.out      || qc.err,
    status:  status.out  || status.err,
    nssmGet: appParams.ok ? appParams.out : null,
    nssmDir: appDir.ok   ? appDir.out    : null
  });
}
async function handleEventLog(req, res, name) {
  if (!SERVICES.includes(name)) return json(res, 400, { error: 'Unknown service' });
  const result = await ps(`
    try {
      $events = Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Service Control Manager';Level=3,4;Id=7034,7036,7040} -MaxEvents 20 -EA SilentlyContinue |
        Where-Object { $_.Message -match '${name.replace(/-/g, '[-]')}' } |
        Select-Object TimeCreated, Id, LevelDisplayName, Message |
        ConvertTo-Json -Depth 2
      if ($events) { $events } else { '[]' }
    } catch { Write-Output '[]' }
  `);
  let events = [];
  try { events = JSON.parse(result.out); if (!Array.isArray(events)) events = [events]; } catch {}
  json(res, 200, events);
}

// ─── Serve HTML ───────────────────────────────────────────────────────────────
const INDEX_PATH = path.join(PANEL_DIR, 'index.html');
let _htmlCache = null; let _htmlMtime = 0;

function serveHtml(res) {
  try {
    const mtime = fs.statSync(INDEX_PATH).mtimeMs;
    if (!_htmlCache || mtime > _htmlMtime) { _htmlCache = fs.readFileSync(INDEX_PATH, 'utf8'); _htmlMtime = mtime; }
  } catch { _htmlCache = '<h1>Panel UI not found - place index.html next to panel-server.cjs</h1>'; }
  res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(_htmlCache);
}

// ─── Main Request Dispatcher ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { method } = req;
  const parsed = new URL(req.url, `http://localhost`);
  const p = parsed.pathname.replace(/\/+$/, '') || '/';

  // Frontend & static assets
  if (method === 'GET' && p === '/') return serveHtml(res);
  if (method === 'GET' && p === '/favicon.ico') return json(res, 204, {}); // No favicon

  // Body
  let body = {};
  if (method === 'POST' || method === 'PUT') body = await parseBody(req);

  // ── Auth routes (no token required) ──
  if (method === 'POST' && p === '/api/auth/login')  return handleLogin(req, res, body);
  if (method === 'POST' && p === '/api/auth/logout') { sessions.delete(getToken(req)); return json(res, 200, { ok: true }); }
  if (method === 'GET'  && p === '/api/auth/check')  return json(res, 200, { ok: validateSession(getToken(req)), totpEnabled: true, backupCodeMinLength: ADMIN_BACKUP_CODE_MIN_LENGTH });

  // ── All routes below require auth ──
  if (!requireAuth(req, res)) return;

  // Overview
  if (method === 'GET' && p === '/api/overview')         return handleOverview(req, res);
  if (method === 'GET' && p === '/api/deploy-status')    return handleDeployStatus(req, res);
  if (method === 'GET' && p === '/api/ports')            return handlePortCheck(req, res);

  // Panel self-restart
  if (method === 'POST' && p === '/api/panel/restart')   return handlePanelRestart(req, res);
  if (method === 'POST' && p === '/api/services/restart-app') return handleRestartApp(req, res);

  // Services
  if (method === 'GET' && p === '/api/services')         return handleServices(req, res);
  const svcAct = p.match(/^\/api\/services\/([^/]+)\/(start|stop|restart)$/);
  if (method === 'POST' && svcAct)                       return handleServiceAction(req, res, svcAct[1], svcAct[2]);
  const nssmInfo = p.match(/^\/api\/services\/([^/]+)\/info$/);
  if (method === 'GET' && nssmInfo)                      return handleNssmInfo(req, res, nssmInfo[1]);
  const svcEvt = p.match(/^\/api\/services\/([^/]+)\/events$/);
  if (method === 'GET' && svcEvt)                        return handleEventLog(req, res, svcEvt[1]);

  // Git
  if (method === 'GET'  && p === '/api/git/status')      return handleGitStatus(req, res);
  if (method === 'GET'  && p === '/api/git/log')         return handleGitLog(req, res);
  if (method === 'POST' && p === '/api/git/fetch')       return handleGitFetch(req, res);
  if (method === 'POST' && p === '/api/git/pull')        return handleGitPull(req, res);

  // Deploy
  if (method === 'POST' && p === '/api/deploy/build')    return handleDeployBuild(req, res);
  if (method === 'POST' && p === '/api/deploy/typecheck') return handleDeployTypecheck(req, res);
  if (method === 'POST' && p === '/api/deploy/install')  return handleDeployInstall(req, res);
  if (method === 'POST' && p === '/api/deploy/run')      return handleDeployRun(req, res);
  if (method === 'POST' && p === '/api/deploy/audit')    return handleDeployAudit(req, res);

  // Scheduled tasks / utility actions
  if (method === 'GET'  && p === '/api/tasks')            return handleTasks(req, res);
  const taskAct = p.match(/^\/api\/tasks\/([^/]+)\/(run|stop|enable|disable)$/);
  if (method === 'POST' && taskAct)                       return handleTaskAction(req, res, taskAct[1], taskAct[2]);
  if (method === 'GET'  && p === '/api/system/utilities') return handleSystemUtilities(req, res);
  const utilityAct = p.match(/^\/api\/system\/actions\/([a-z0-9-]+)$/);
  if (method === 'POST' && utilityAct)                    return handleUtilityAction(req, res, utilityAct[1]);

  // Logs
  if (method === 'GET'  && p === '/api/logs')            return handleListLogs(req, res);
  const logStream = p.match(/^\/api\/logs\/([a-z0-9-]+)\/stream$/);
  if (method === 'GET' && logStream)                     return handleLogStream(req, res, logStream[1]);
  const logMatch = p.match(/^\/api\/logs\/([a-z0-9-]+)$/);
  if (method === 'GET'    && logMatch)                   return handleGetLog(req, res, logMatch[1]);
  if (method === 'DELETE' && logMatch) {
    const lp = resolveLogPath(logMatch[1]);
    if (!lp || !['nssm', 'server'].includes(logMatch[1])) return json(res, 400, { error: 'Can only clear server/nssm logs' });
    try { fs.writeFileSync(lp, '', 'utf8'); json(res, 200, { ok: true }); }
    catch (e) { json(res, 500, { error: e.message }); }
    return;
  }

  // Database
  if (method === 'GET'  && p === '/api/db/status')       return handleDbStatus(req, res);
  if (method === 'POST' && p === '/api/db/backup')       return handleDbBackup(req, res);
  if (method === 'GET'  && p === '/api/db/backups')      return handleDbBackups(req, res);
  if (method === 'GET'  && p === '/api/db/utilities')    return handleDbUtilities(req, res);

  // Processes
  if (method === 'GET' && p === '/api/processes')        return handleProcesses(req, res);
  const procKill = p.match(/^\/api\/processes\/(\d+)$/);
  if (method === 'DELETE' && procKill)                   return handleKillProcess(req, res, procKill[1]);

  // System / Tunnel
  if (method === 'GET' && p === '/api/system')           return handleSystem(req, res);
  if (method === 'GET' && p === '/api/tunnel')           return handleTunnel(req, res);

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[panel] ✓ Flight-Points Control Panel on http://0.0.0.0:${PORT}`);
  console.log(`[panel]   Project : ${ROOT}`);
  console.log(`[panel]   API port: ${API_PORT}`);
  console.log(`[panel]   Logs    : ${LOGS_ROOT}`);
});

process.on('uncaughtException',   err    => console.error('[panel] Uncaught exception:', err));
process.on('unhandledRejection',  reason => console.error('[panel] Unhandled rejection:', reason));
