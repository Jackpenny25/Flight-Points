'use strict';
// ============================================================
// Flight-Points Control Panel Server
// Standalone Node.js (no npm install required — built-ins only)
// Runs on PANEL_PORT (default 4000) as a separate NSSM service.
// ============================================================

const http    = require('http');
const https   = require('https');
const { exec, execSync } = require('child_process');
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

const TOOL_CANDIDATES = {
  git: [
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
    'C:\\Program Files (x86)\\Git\\bin\\git.exe',
    // User-level Git for Windows installs
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'cmd', 'git.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'bin', 'git.exe'),
    // Scoop
    path.join(os.homedir(), 'scoop', 'apps', 'git', 'current', 'cmd', 'git.exe'),
    // Chocolatey
    'C:\\ProgramData\\chocolatey\\bin\\git.exe',
    'C:\\tools\\Git\\cmd\\git.exe',
  ],
  node: [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
    path.join(os.homedir(), 'AppData', 'Roaming', 'nvm', 'current', 'node.exe'),
    path.join(os.homedir(), 'scoop', 'apps', 'nodejs', 'current', 'node.exe'),
  ],
  npm: [
    'C:\\Program Files\\nodejs\\npm.cmd',
    'C:\\Program Files (x86)\\nodejs\\npm.cmd',
    path.join(os.homedir(), 'AppData', 'Roaming', 'nvm', 'current', 'npm.cmd'),
    path.join(os.homedir(), 'scoop', 'apps', 'nodejs', 'current', 'npm.cmd'),
  ],
  npx: [
    'C:\\Program Files\\nodejs\\npx.cmd',
    'C:\\Program Files (x86)\\nodejs\\npx.cmd',
    path.join(os.homedir(), 'AppData', 'Roaming', 'nvm', 'current', 'npx.cmd'),
    path.join(os.homedir(), 'scoop', 'apps', 'nodejs', 'current', 'npx.cmd'),
  ],
};

const RESOLVED_TOOLS = Object.fromEntries(
  Object.entries(TOOL_CANDIDATES).map(([name, paths]) => {
    const found = paths.find(p => fs.existsSync(p)) || null;
    if (found) return [name, found];
    // Dynamic fallback: use where.exe to find tools in the current PATH
    try {
      const w = execSync(`where.exe ${name}`, { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const first = (w || '').split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0 && fs.existsSync(l));
      if (first) return [name, first];
    } catch { /* not in PATH — fall through */ }
    return [name, null];
  })
);
// Log resolved tools at startup to help diagnose PATH issues under NSSM
console.log('[panel] Tool resolution:', Object.entries(RESOLVED_TOOLS).map(([k, v]) => `${k}=${v || 'NOT FOUND'}`).join(', '));

const EXTRA_PATH_DIRS = Array.from(new Set([
  ...Object.values(RESOLVED_TOOLS).filter(Boolean).map(p => path.dirname(p)),
  'C:\\Program Files\\Git\\cmd',
  'C:\\Program Files\\nodejs',
  'C:\\Windows\\System32',
]));

const PANEL_EXEC_ENV = {
  ...process.env,
  PATH: `${EXTRA_PATH_DIRS.join(';')};${process.env.PATH || ''}`,
};

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

const COMMAND_MAX_TIMEOUT_MS = 10 * 60 * 1000;
const COMMAND_DEFAULT_TIMEOUT_MS = 90 * 1000;
const COMMAND_LIBRARY = [
  {
    id: 'services-core',
    title: 'Service Controls',
    description: 'Start/stop/restart and inspect core services.',
    commands: [
      { id: 'svc-status', name: 'Service Status Snapshot', shell: 'powershell', command: "Get-Service flight-points, flight-points-tunnel, flight-points-panel | Select-Object Name,Status,StartType | Format-Table -Auto", tags: ['service', 'status'] },
      { id: 'svc-restart-api', name: 'Restart API Service', shell: 'powershell', requiresElevation: true, command: "Restart-Service -Name 'flight-points' -Force", tags: ['service', 'api', 'restart'] },
      { id: 'svc-restart-tunnel', name: 'Restart Tunnel Service', shell: 'powershell', requiresElevation: true, command: "Restart-Service -Name 'flight-points-tunnel' -Force", tags: ['service', 'tunnel', 'restart'] },
      { id: 'svc-restart-panel', name: 'Restart Panel Service', shell: 'powershell', requiresElevation: true, command: "Restart-Service -Name 'flight-points-panel' -Force", tags: ['service', 'panel', 'restart'] },
      { id: 'svc-tail-api', name: 'Tail API NSSM Log (last 80)', shell: 'powershell', command: "Get-Content 'C:\\inetpub\\wwwroot\\Flight-Points\\Logs\\Server\\nssm-stdout.log' -Tail 80", tags: ['log', 'api'] },
      { id: 'svc-tail-tunnel', name: 'Tail Tunnel Log (last 80)', shell: 'powershell', command: "Get-Content 'C:\\inetpub\\wwwroot\\Flight-Points\\Logs\\Tunnel\\tunnel.log' -Tail 80", tags: ['log', 'tunnel'] },
    ]
  },
  {
    id: 'deploy-git',
    title: 'Deploy and Git',
    description: 'Run common deploy checks and repository commands.',
    commands: [
      { id: 'git-branch', name: 'Current Branch + Last Commit', shell: 'powershell', command: `${cmd('git', 'rev-parse --abbrev-ref HEAD')} ; ${cmd('git', 'log -1 --oneline')}`, tags: ['git'] },
      { id: 'git-status', name: 'Git Status (short)', shell: 'powershell', command: cmd('git', 'status --short --branch'), tags: ['git'] },
      { id: 'git-fetch', name: 'Git Fetch Prune Origin', shell: 'powershell', command: cmd('git', 'fetch --prune origin'), tags: ['git', 'deploy'] },
      { id: 'git-pull-main', name: 'Git Pull main (ff-only)', shell: 'powershell', command: cmd('git', 'pull --ff-only origin main'), tags: ['git', 'deploy'] },
      { id: 'npm-install', name: 'npm install', shell: 'powershell', command: cmd('npm', 'install'), tags: ['npm', 'deploy'] },
      { id: 'npm-build', name: 'npm run build', shell: 'powershell', command: cmd('npm', 'run build'), tags: ['npm', 'build'] },
      { id: 'tsc-noemit', name: 'TypeScript Check', shell: 'powershell', command: cmd('npx', 'tsc --noEmit'), tags: ['typescript', 'build'] },
      { id: 'deploy-runonce', name: 'Run auto-deploy.ps1 -RunOnce', shell: 'powershell', command: "Set-Location '" + ROOT + "'; & '.\\auto-deploy.ps1' -RunOnce", tags: ['deploy'] },
    ]
  },
  {
    id: 'health-network',
    title: 'Health and Network',
    description: 'Quick diagnostics for API, ports, process state, and tunnel.',
    commands: [
      { id: 'health-local', name: 'Local API Health', shell: 'powershell', command: "Invoke-RestMethod -Uri 'http://localhost:3001/api/health' -Method Get | ConvertTo-Json -Depth 6", tags: ['health', 'api'] },
      { id: 'health-public', name: 'Public API Health', shell: 'powershell', command: "Invoke-WebRequest -Uri 'https://api.flightpoints.uk/api/health' -UseBasicParsing -TimeoutSec 12 | Select-Object StatusCode,StatusDescription", tags: ['health', 'public'] },
      { id: 'port-check', name: 'Port Check 3001/4000/5432/6543', shell: 'powershell', command: "3001,4000,5432,6543 | ForEach-Object { [PSCustomObject]@{Port=$_;Open=(Test-NetConnection localhost -Port $_ -InformationLevel Quiet -WarningAction SilentlyContinue)} } | Format-Table -Auto", tags: ['network', 'ports'] },
      { id: 'proc-node-cloudflared', name: 'Node + Cloudflared Processes', shell: 'powershell', command: "Get-Process -Name node,cloudflared,cloudflared-windows-amd64 -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,CPU,@{N='MemMB';E={[Math]::Round($_.WorkingSet/1MB,1)}},StartTime | Format-Table -Auto", tags: ['process'] },
      { id: 'task-snapshot', name: 'Scheduled Task Snapshot', shell: 'powershell', command: "Get-ScheduledTask -TaskName 'Flight-Points_Server_Tunnel','FlightPoints-AutoDeploy','FlightPoints-Weekly-Backup' -ErrorAction SilentlyContinue | Select-Object TaskName,State,@{N='Enabled';E={$_.Settings.Enabled}} | Format-Table -Auto", tags: ['task', 'scheduler'] },
      { id: 'ip-config', name: 'IPv4 Interfaces', shell: 'powershell', command: "Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^169\\.254' -and $_.InterfaceAlias -notmatch '^Loopback' } | Select-Object InterfaceAlias,IPAddress | Format-Table -Auto", tags: ['network'] },
      { id: 'dns-api', name: 'DNS Resolve api.flightpoints.uk', shell: 'powershell', command: "Resolve-DnsName api.flightpoints.uk | Select-Object Name,Type,IPAddress | Format-Table -Auto", tags: ['dns', 'network'] },
    ]
  },
  {
    id: 'logs-events',
    title: 'Logs and Events',
    description: 'Read server logs and recent service-related event log entries.',
    commands: [
      { id: 'logs-server-recent', name: 'Recent Server Logs (20)', shell: 'powershell', command: "Get-ChildItem 'C:\\inetpub\\wwwroot\\Flight-Points\\Logs\\Server' -Filter *.log -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 20 Name,LastWriteTime,Length | Format-Table -Auto", tags: ['logs'] },
      { id: 'logs-tunnel-recent', name: 'Recent Tunnel Logs (20)', shell: 'powershell', command: "Get-ChildItem 'C:\\inetpub\\wwwroot\\Flight-Points\\Logs\\Tunnel' -Filter *.log -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 20 Name,LastWriteTime,Length | Format-Table -Auto", tags: ['logs'] },
      { id: 'event-api', name: 'Event Log for API Service', shell: 'powershell', command: "Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Service Control Manager';Id=7034,7036} -MaxEvents 50 | Where-Object { $_.Message -match 'flight-points' } | Select-Object TimeCreated,Id,LevelDisplayName,Message | Format-Table -Wrap", tags: ['events', 'api'] },
      { id: 'event-tunnel', name: 'Event Log for Tunnel Service', shell: 'powershell', command: "Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Service Control Manager';Id=7034,7036} -MaxEvents 50 | Where-Object { $_.Message -match 'flight-points-tunnel' } | Select-Object TimeCreated,Id,LevelDisplayName,Message | Format-Table -Wrap", tags: ['events', 'tunnel'] },
      { id: 'errors-today', name: 'Server Error Logs (Today)', shell: 'powershell', command: "Get-ChildItem 'C:\\inetpub\\wwwroot\\Flight-Points\\Logs\\Server' -Filter 'server-errors-*.log' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime.Date -eq (Get-Date).Date } | Select-Object Name,LastWriteTime,Length | Format-Table -Auto", tags: ['errors', 'logs'] },
    ]
  },
  {
    id: 'sql-helpers',
    title: 'SQL Helpers (Editable)',
    description: 'Ready-made SQL queries. These run directly against the database via psql.',
    commands: [
      { id: 'sql-top-cadets', name: 'Top 20 Cadets by Points', shell: 'powershell', type: 'sql', command: "SELECT c.name, c.flight, COALESCE(SUM(p.points),0) AS total_points\nFROM cadets c\nLEFT JOIN points p ON LOWER(p.cadet_name) = LOWER(c.name)\nGROUP BY c.id, c.name, c.flight\nORDER BY total_points DESC\nLIMIT 20;", tags: ['sql', 'leaderboard'] },
      { id: 'sql-recent-points', name: 'Recent Points (50)', shell: 'powershell', type: 'sql', command: "SELECT id, cadet_name, points, reason, given_by, created_at\nFROM points\nORDER BY created_at DESC\nLIMIT 50;", tags: ['sql', 'points'] },
      { id: 'sql-attendance-week', name: 'Attendance Summary Last 7 Days', shell: 'powershell', type: 'sql', command: "SELECT cadet_name, status, COUNT(*) AS count_entries\nFROM attendance\nWHERE date >= CURRENT_DATE - INTERVAL '7 days'\nGROUP BY cadet_name, status\nORDER BY cadet_name, status;", tags: ['sql', 'attendance'] },
      { id: 'sql-orphans', name: 'Orphaned Point Rows', shell: 'powershell', type: 'sql', command: "SELECT p.id, p.cadet_name, p.created_at\nFROM points p\nLEFT JOIN cadets c ON LOWER(c.name) = LOWER(p.cadet_name)\nWHERE c.id IS NULL\nORDER BY p.created_at DESC;", tags: ['sql', 'integrity'] },
      { id: 'sql-users-role', name: 'Accounts by Role', shell: 'powershell', type: 'sql', command: "SELECT role, COUNT(*) AS users\nFROM app_users\nGROUP BY role\nORDER BY role;", tags: ['sql', 'accounts'] },
      { id: 'sql-revision-recent', name: 'Recent Revision History', shell: 'powershell', type: 'sql', command: "SELECT record_type, record_id, action, changed_by, changed_by_role, changed_at\nFROM revision_history\nORDER BY changed_at DESC\nLIMIT 100;", tags: ['sql', 'audit'] },
      { id: 'sql-db-size', name: 'Database/Table Size', shell: 'powershell', type: 'sql', command: "SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS total_size\nFROM pg_catalog.pg_statio_user_tables\nORDER BY pg_total_relation_size(relid) DESC;", tags: ['sql', 'database'] },
    ]
  },
  {
    id: 'ops-toolbox',
    title: 'Ops Toolbox',
    description: 'General maintenance and recovery commands.',
    commands: [
      { id: 'disk-space', name: 'Disk Space Summary', shell: 'powershell', command: "Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{N='UsedGB';E={[math]::Round($_.Used/1GB,2)}},@{N='FreeGB';E={[math]::Round($_.Free/1GB,2)}} | Format-Table -Auto", tags: ['disk'] },
      { id: 'memory-load', name: 'Memory Snapshot', shell: 'powershell', command: "$os = Get-CimInstance Win32_OperatingSystem; [PSCustomObject]@{TotalGB=[math]::Round($os.TotalVisibleMemorySize/1MB,2);FreeGB=[math]::Round($os.FreePhysicalMemory/1MB,2)} | Format-List", tags: ['memory'] },
      { id: 'cpu-load', name: 'CPU Load (5 samples)', shell: 'powershell', command: "Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 5 | Select-Object -ExpandProperty CounterSamples | Select-Object TimeStamp,CookedValue | Format-Table -Auto", tags: ['cpu'] },
      { id: 'restart-iis', name: 'Restart IIS (if used)', shell: 'powershell', requiresElevation: true, command: "iisreset", tags: ['iis', 'web'] },
      { id: 'firewall-ports', name: 'Firewall Rules for App Ports', shell: 'powershell', command: "Get-NetFirewallRule -Enabled True -Direction Inbound | Get-NetFirewallPortFilter | Where-Object { $_.LocalPort -in 3001,4000,5432,6543 } | Format-Table -Auto", tags: ['firewall'] },
      { id: 'cloudflared-version', name: 'cloudflared Version', shell: 'powershell', command: "cloudflared --version", tags: ['cloudflare', 'tunnel'] },
      { id: 'node-version', name: 'Node/NPM Versions', shell: 'powershell', command: "node -v; npm -v", tags: ['node'] },
      { id: 'whoami-priv', name: 'WhoAmI + Privileges', shell: 'powershell', command: "whoami; whoami /groups", tags: ['security'] },
      { id: 'reboot-host', name: 'Reboot Server (DANGEROUS)', shell: 'powershell', requiresElevation: true, command: "Restart-Computer -Force", tags: ['danger', 'reboot'] },
    ]
  }
];

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

function cmd(tool, args = '') {
  const resolved = RESOLVED_TOOLS[tool];
  const exe = resolved ? `"${resolved}"` : tool;
  return `${exe}${args ? ` ${args}` : ''}`;
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

// ─── Dual-TOTP Challenge Store ───────────────────────────────────────────────
// challenge token -> { codeHash, createdAt }  —  expires after 2 minutes
const dualTotpChallenges = new Map();
function createDualTotpChallenge(code) {
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const token = crypto.randomBytes(32).toString('hex');
  dualTotpChallenges.set(token, { codeHash, createdAt: Date.now() });
  // Prune stale challenges
  for (const [k, v] of dualTotpChallenges) {
    if (Date.now() - v.createdAt > 3 * 60 * 1000) dualTotpChallenges.delete(k);
  }
  return token;
}
function validateDualTotpChallenge(challengeToken, secondCode) {
  const challenge = dualTotpChallenges.get(challengeToken);
  if (!challenge) return { ok: false, error: 'Challenge expired or invalid. Please restart from step 1.' };
  if (Date.now() - challenge.createdAt > 2 * 60 * 1000) {
    dualTotpChallenges.delete(challengeToken);
    return { ok: false, error: 'Challenge expired. Please restart from step 1.' };
  }
  const tokens = generateTotp(PANEL_TOTP_SECRET) || [];
  if (!tokens.includes(secondCode)) return { ok: false, error: 'Incorrect authenticator code.' };
  const secondHash = crypto.createHash('sha256').update(secondCode).digest('hex');
  if (secondHash === challenge.codeHash) return { ok: false, error: 'Second code must be different from the first. Wait for your authenticator to show a new code.' };
  dualTotpChallenges.delete(challengeToken);
  return { ok: true };
}

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
    exec(cmd, { timeout, windowsHide: true, cwd: ROOT, maxBuffer: 5 * 1024 * 1024, env: PANEL_EXEC_ENV },
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
      { timeout, windowsHide: true, cwd: ROOT, maxBuffer: 5 * 1024 * 1024, env: PANEL_EXEC_ENV },
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

function isElevationRequiredDenied(requested) {
  return !!requested;
}

async function checkIsElevated() {
  const result = await ps(`
    try {
      $id = [Security.Principal.WindowsIdentity]::GetCurrent()
      $pr = New-Object Security.Principal.WindowsPrincipal($id)
      if ($pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'true' } else { 'false' }
    } catch { 'false' }
  `, 12000);
  return (result.out || '').trim().toLowerCase() === 'true';
}

function commandPreviewText(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 180);
}

async function runPanelPowerShell(command, timeoutMs) {
  const safeTimeout = Math.max(1000, Math.min(parseInt(timeoutMs, 10) || COMMAND_DEFAULT_TIMEOUT_MS, COMMAND_MAX_TIMEOUT_MS));
  const start = Date.now();
  const result = await ps(command, safeTimeout);
  return {
    ok: result.ok,
    code: result.code,
    durationMs: Date.now() - start,
    timeoutMs: safeTimeout,
    stdout: result.out || '',
    stderr: result.err || '',
    output: [result.out, result.err].filter(Boolean).join('\n') || '(no output)'
  };
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
    $p = Get-Process -Name cloudflared,cloudflared-windows-amd64 -EA SilentlyContinue | Select-Object -First 1
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
    shell(cmd('git', 'rev-parse --abbrev-ref HEAD')),
    shell(cmd('git', 'log -1 --format="%h||%s||%ai"')),
    getServicesMap(),
    getTunnelSummary()
  ]);
  const [behind, localMods] = await Promise.all([
    shell(`${cmd('git', 'rev-list --count HEAD..@{u}')} 2>nul`),
    shell(cmd('git', 'status --porcelain'))
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
    foreach ($n in @('flight-points','flight-points-tunnel','flight-points-panel')) {
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
    foreach ($n in @('flight-points','flight-points-tunnel','flight-points-panel')) {
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
        $list += [PSCustomObject]@{ Key=$key; Name=$name; State='NotFound'; Enabled=$false; LastRunTime=''; NextRunTime=''; LastTaskResult=$null; Error=$_.Exception.Message }
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

async function handleCommandCatalog(req, res) {
  json(res, 200, {
    shell: 'powershell',
    defaultTimeoutMs: COMMAND_DEFAULT_TIMEOUT_MS,
    maxTimeoutMs: COMMAND_MAX_TIMEOUT_MS,
    sections: COMMAND_LIBRARY,
    notes: [
      'Commands run on the server host where the panel service is running.',
      'Commands marked requiresElevation=true need the panel service to run under an elevated account.',
      'SQL helper blocks are templates: edit before running in psql or DBeaver as needed.'
    ]
  });
}

async function handleCommandRun(req, res, body) {
  const requestedShell = String(body.shell || 'powershell').toLowerCase();
  const rawCommand = String(body.command || '');
  const isSql = body.type === 'sql';
  const requiresElevation = !!body.requiresElevation;
  if (requestedShell !== 'powershell') return json(res, 400, { error: 'Only powershell shell is supported in panel command runner.' });
  if (!rawCommand.trim()) return json(res, 400, { error: 'Command is required.' });
  if (rawCommand.length > 12000) return json(res, 400, { error: 'Command is too long (max 12000 chars).' });

  if (isElevationRequiredDenied(requiresElevation)) {
    const elevated = await checkIsElevated();
    if (!elevated) {
      return json(res, 403, {
        error: 'This command requires elevation, but the panel service account is not running as Administrator.',
        hint: 'Run panel service with an elevated account (for example LocalSystem) or use a non-elevated command.'
      });
    }
  }

  // If this is a SQL command, route through psql
  if (isSql) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return json(res, 500, { error: 'DATABASE_URL is not configured on the panel server.' });
    const psqlPaths = [
      'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe',
    ];
    const psqlExe = firstExistingPath(psqlPaths);
    if (!psqlExe) return json(res, 500, { error: 'psql not found on the server. Install PostgreSQL client tools or run manually via DBeaver.' });

    // Write SQL to temp file and execute via psql to avoid shell-escaping issues
    const tmpSql = path.join(os.tmpdir(), `fp_panel_sql_${crypto.randomBytes(6).toString('hex')}.sql`);
    fs.writeFileSync(tmpSql, rawCommand, 'utf8');
    const start = Date.now();
    const result = await shell(`"${psqlExe}" "${dbUrl}" -f "${tmpSql}" 2>&1`, body.timeoutMs || 30000);
    fs.unlink(tmpSql, () => {});
    const out = {
      ok: result.ok,
      code: result.code,
      durationMs: Date.now() - start,
      timeoutMs: body.timeoutMs || 30000,
      stdout: result.out || '',
      stderr: result.err || '',
      output: [result.out, result.err].filter(Boolean).join('\n') || '(no output)'
    };
    appendDiagnosticLog('panel_sql_run', { ok: out.ok, code: out.code, durationMs: out.durationMs, preview: commandPreviewText(rawCommand) });
    return json(res, 200, out);
  }

  const result = await runPanelPowerShell(rawCommand, body.timeoutMs);
  appendDiagnosticLog('panel_command_run', {
    ok: result.ok,
    code: result.code,
    durationMs: result.durationMs,
    requiresElevation,
    preview: commandPreviewText(rawCommand)
  });
  json(res, 200, result);
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
    shell(cmd('git', 'rev-parse --abbrev-ref HEAD')),
    shell(cmd('git', 'log -1 --format="%H||%h||%s||%ai||%an"')),
    shell(cmd('git', 'status --porcelain')),
    shell(cmd('git', 'rev-list --left-right --count HEAD...@{u}') + ' 2>nul')
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
  const result = await shell(cmd('git', 'log -30 --format="%h||%s||%an||%ar||%ai"'));
  const entries = (result.ok ? result.out.split('\n').filter(Boolean) : []).map(l => {
    const [hash, msg, author, rel, abs] = l.split('||');
    return { hash, msg: msg||'', author: author||'', relative: rel||'', date: abs||'' };
  });
  json(res, 200, entries);
}

// POST /api/git/fetch
async function handleGitFetch(req, res) {
  const result = await shell(cmd('git', 'fetch --prune origin') + ' 2>&1', 60000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') || 'Fetch complete (nothing new)' });
}

// POST /api/git/pull
async function handleGitPull(req, res) {
  // Reset local changes (e.g. dist/index.html) before pulling, same as auto-deploy.ps1
  const reset = await shell(cmd('git', 'reset --hard') + ' 2>&1', 30000);
  const pull = await shell(cmd('git', 'pull --ff-only origin main') + ' 2>&1', 90000);
  const output = [reset.out, reset.err, pull.out, pull.err].filter(Boolean).join('\n');
  json(res, 200, { ok: pull.ok, output });
}

// POST /api/deploy/build
async function handleDeployBuild(req, res) {
  const result = await shell(cmd('npm', 'run build') + ' 2>&1', 180000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') });
}

// POST /api/deploy/typecheck
async function handleDeployTypecheck(req, res) {
  const result = await shell(cmd('npx', 'tsc --noEmit') + ' 2>&1', 90000);
  json(res, 200, { ok: result.ok, output: [result.out, result.err].filter(Boolean).join('\n') || 'TypeScript check passed with no errors' });
}

// POST /api/deploy/install
async function handleDeployInstall(req, res) {
  const result = await shell(cmd('npm', 'install') + ' 2>&1', 180000);
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
  const result = await shell(cmd('npm', 'audit --omit=dev') + ' 2>&1', 60000);
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

// ─── Dual-TOTP & Data Reset ──────────────────────────────────────────────────

// POST /api/dual-totp/step1 — validate first code, return challenge token
async function handleDualTotpStep1(req, res, body) {
  const code = String(body.code || '').trim();
  if (!/^\d{6}$/.test(code)) return json(res, 400, { error: 'A 6-digit authenticator code is required.' });
  const tokens = generateTotp(PANEL_TOTP_SECRET) || [];
  if (!tokens.includes(code)) return json(res, 401, { error: 'Incorrect authenticator code.' });
  const challengeToken = createDualTotpChallenge(code);
  json(res, 200, { success: true, challengeToken });
}

// POST /api/dual-totp/step2 — validate second (different) code
async function handleDualTotpStep2(req, res, body) {
  const code = String(body.code || '').trim();
  const challengeToken = String(body.challengeToken || '').trim();
  if (!/^\d{6}$/.test(code)) return json(res, 400, { error: 'A 6-digit authenticator code is required.' });
  if (!challengeToken) return json(res, 400, { error: 'Challenge token from step 1 is required.' });
  const result = validateDualTotpChallenge(challengeToken, code);
  if (!result.ok) return json(res, result.error.includes('expired') ? 403 : 400, { error: result.error });
  json(res, 200, { success: true });
}

// POST /api/db/reset-data — delete points, attendance, attendance_bulks (NOT cadets, accounts, rewards)
async function handleDbResetData(req, res, body) {
  // Dual-TOTP must already be verified by frontend (step1+step2)
  const code = String(body.code || '').trim();
  const challengeToken = String(body.challengeToken || '').trim();
  if (!/^\d{6}$/.test(code)) return json(res, 400, { error: 'Final authenticator code is required.' });
  if (!challengeToken) return json(res, 400, { error: 'Challenge token is required.' });
  const vr = validateDualTotpChallenge(challengeToken, code);
  if (!vr.ok) return json(res, 403, { error: vr.error });

  // Tables to truncate — does NOT touch cadets, app_users, rewards, or reward_suggestions
  const tables = ['points', 'attendance', 'attendance_bulks', 'revision_history'];
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return json(res, 500, { error: 'DATABASE_URL is not configured.' });

  // Find psql to execute SQL
  const psqlPaths = [
    'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe',
  ];
  const psqlExe = firstExistingPath(psqlPaths);

  const truncateSql = tables.map(t => `TRUNCATE TABLE ${t} CASCADE`).join('; ') + ';';

  if (psqlExe) {
    // Use psql directly
    const result = await shell(`"${psqlExe}" "${dbUrl}" -c "${truncateSql}" 2>&1`, 30000);
    appendDiagnosticLog('db_reset_data', { ok: result.ok, tables, method: 'psql', output: result.out || result.err });
    if (!result.ok) return json(res, 500, { error: 'SQL execution failed.', output: [result.out, result.err].filter(Boolean).join('\n') });
    return json(res, 200, { ok: true, tables, output: result.out || 'OK' });
  }

  // Fallback: use Node.js and the main API's health endpoint to check, then run via powershell psql if available
  const fallback = await ps(`
    try {
      $env:PGPASSWORD = ''
      $sql = "${truncateSql.replace(/"/g, '`"')}"
      Write-Output "SQL: $sql"
      Write-Output "ERROR: psql not found. Run manually: psql $env:DATABASE_URL -c '$sql'"
    } catch {
      Write-Output ("ERROR: " + $_.Exception.Message)
    }
  `, 15000);
  return json(res, 500, {
    error: 'psql not found on the server. Run the SQL manually.',
    sql: truncateSql,
    output: fallback.out || fallback.err
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
    shell(cmd('node', '--version')),
    shell(cmd('git', '--version'))
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

  // Command center
  if (method === 'GET'  && p === '/api/commands/catalog') return handleCommandCatalog(req, res);
  if (method === 'POST' && p === '/api/commands/run')     return handleCommandRun(req, res, body);

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

  // Dual-TOTP & Data Reset
  if (method === 'POST' && p === '/api/dual-totp/step1')   return handleDualTotpStep1(req, res, body);
  if (method === 'POST' && p === '/api/dual-totp/step2')   return handleDualTotpStep2(req, res, body);
  if (method === 'POST' && p === '/api/db/reset-data')     return handleDbResetData(req, res, body);

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
