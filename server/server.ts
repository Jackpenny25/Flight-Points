import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
// Wrap ipKeyGenerator to satisfy keyGenerator's (req, res) => string signature
const ipKeyGen = (req: import('express').Request) => ipKeyGenerator(req.ip ?? '');
import { query } from './db';

// --- Types ---
import type { Request, Response, NextFunction } from 'express';

type PermissionTabKey =
  | 'leaderboards'
  | 'rewards'
  | 'points'
  | 'attendance'
  | 'cadets'
  | 'reports'
  | 'integrity'
  | 'tickets'
  | 'admin'
  | 'signups'
  | 'presentation'
  | 'mypoints'
  | 'myattendance';

type PermissionActionKey =
  | 'givePoints'
  | 'editPoints'
  | 'deletePoints'
  | 'markAttendance'
  | 'editAttendance'
  | 'deleteAttendanceSessions'
  | 'manageCadets'
  | 'manageAccounts'
  | 'unlockAdmin';

type PermissionTabs = Record<PermissionTabKey, boolean>;
type PermissionActions = Record<PermissionActionKey, boolean>;

interface StoredPermissionOverrides {
  tabs?: Partial<Record<PermissionTabKey, boolean>>;
  actions?: Partial<Record<PermissionActionKey, boolean>>;
}

interface EffectivePermissions {
  tabs: PermissionTabs;
  actions: PermissionActions;
}

const PERMISSION_TAB_KEYS: PermissionTabKey[] = [
  'leaderboards',
  'rewards',
  'points',
  'attendance',
  'cadets',
  'reports',
  'integrity',
  'tickets',
  'admin',
  'signups',
  'presentation',
  'mypoints',
  'myattendance',
];

const PERMISSION_ACTION_KEYS: PermissionActionKey[] = [
  'givePoints',
  'editPoints',
  'deletePoints',
  'markAttendance',
  'editAttendance',
  'deleteAttendanceSessions',
  'manageCadets',
  'manageAccounts',
  'unlockAdmin',
];

const ROLE_PERMISSION_DEFAULTS: Record<string, EffectivePermissions> = {
  snco: {
    tabs: {
      leaderboards: true,
      rewards: true,
      points: true,
      attendance: true,
      cadets: true,
      reports: true,
      integrity: true,
      tickets: true,
      admin: true,
      signups: true,
      presentation: true,
      mypoints: false,
      myattendance: false,
    },
    actions: {
      givePoints: true,
      editPoints: true,
      deletePoints: true,
      markAttendance: true,
      editAttendance: true,
      deleteAttendanceSessions: true,
      manageCadets: true,
      manageAccounts: true,
      unlockAdmin: true,
    },
  },
  admin: {
    tabs: {
      leaderboards: true,
      rewards: true,
      points: true,
      attendance: true,
      cadets: true,
      reports: true,
      integrity: true,
      tickets: true,
      admin: true,
      signups: true,
      presentation: true,
      mypoints: false,
      myattendance: false,
    },
    actions: {
      givePoints: true,
      editPoints: true,
      deletePoints: true,
      markAttendance: true,
      editAttendance: true,
      deleteAttendanceSessions: true,
      manageCadets: true,
      manageAccounts: true,
      unlockAdmin: true,
    },
  },
  pointgiver: {
    tabs: {
      leaderboards: true,
      rewards: true,
      points: true,
      attendance: true,
      cadets: false,
      reports: false,
      integrity: false,
      tickets: false,
      admin: false,
      signups: false,
      presentation: false,
      mypoints: false,
      myattendance: false,
    },
    actions: {
      givePoints: true,
      editPoints: false,
      deletePoints: false,
      markAttendance: true,
      editAttendance: true,
      deleteAttendanceSessions: false,
      manageCadets: false,
      manageAccounts: false,
      unlockAdmin: false,
    },
  },
  staff: {
    tabs: {
      leaderboards: true,
      rewards: true,
      points: true,
      attendance: false,
      cadets: false,
      reports: false,
      integrity: false,
      tickets: false,
      admin: false,
      signups: false,
      presentation: false,
      mypoints: false,
      myattendance: false,
    },
    actions: {
      givePoints: true,
      editPoints: false,
      deletePoints: false,
      markAttendance: false,
      editAttendance: false,
      deleteAttendanceSessions: false,
      manageCadets: false,
      manageAccounts: false,
      unlockAdmin: false,
    },
  },
  cadet: {
    tabs: {
      leaderboards: true,
      rewards: true,
      points: false,
      attendance: false,
      cadets: false,
      reports: false,
      integrity: false,
      tickets: true,
      admin: false,
      signups: false,
      presentation: false,
      mypoints: true,
      myattendance: true,
    },
    actions: {
      givePoints: false,
      editPoints: false,
      deletePoints: false,
      markAttendance: false,
      editAttendance: false,
      deleteAttendanceSessions: false,
      manageCadets: false,
      manageAccounts: false,
      unlockAdmin: false,
    },
  },
  presentation: {
    tabs: {
      leaderboards: false,
      rewards: false,
      points: false,
      attendance: false,
      cadets: false,
      reports: false,
      integrity: false,
      tickets: false,
      admin: false,
      signups: false,
      presentation: true,
      mypoints: false,
      myattendance: false,
    },
    actions: {
      givePoints: false,
      editPoints: false,
      deletePoints: false,
      markAttendance: false,
      editAttendance: false,
      deleteAttendanceSessions: false,
      manageCadets: false,
      manageAccounts: false,
      unlockAdmin: false,
    },
  },
};

function clonePermissions(input: EffectivePermissions): EffectivePermissions {
  return {
    tabs: { ...input.tabs },
    actions: { ...input.actions },
  };
}

function sanitizePermissionOverrides(raw: any): StoredPermissionOverrides {
  const output: StoredPermissionOverrides = {};
  if (!raw || typeof raw !== 'object') return output;

  if (raw.tabs && typeof raw.tabs === 'object') {
    output.tabs = {};
    for (const key of PERMISSION_TAB_KEYS) {
      if (typeof raw.tabs[key] === 'boolean') {
        output.tabs[key] = raw.tabs[key];
      }
    }
  }

  if (raw.actions && typeof raw.actions === 'object') {
    output.actions = {};
    for (const key of PERMISSION_ACTION_KEYS) {
      if (typeof raw.actions[key] === 'boolean') {
        output.actions[key] = raw.actions[key];
      }
    }
  }

  return output;
}

function sanitizeFullPermissions(raw: any): EffectivePermissions | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.tabs || typeof raw.tabs !== 'object') return null;
  if (!raw.actions || typeof raw.actions !== 'object') return null;
  const tabs = {} as PermissionTabs;
  const actions = {} as PermissionActions;
  for (const key of PERMISSION_TAB_KEYS) {
    tabs[key] = raw.tabs[key] === true;
  }
  for (const key of PERMISSION_ACTION_KEYS) {
    actions[key] = raw.actions[key] === true;
  }
  return { tabs, actions };
}

// In-memory cache for DB-stored role defaults
let roleDefaultsCache: Record<string, EffectivePermissions> | null = null;

function getRoleDefaultPermissions(role: string): EffectivePermissions {
  const normalized = String(role || '').toLowerCase();
  if (roleDefaultsCache) {
    return clonePermissions(roleDefaultsCache[normalized] || roleDefaultsCache['cadet'] || ROLE_PERMISSION_DEFAULTS.cadet);
  }
  return clonePermissions(ROLE_PERMISSION_DEFAULTS[normalized] || ROLE_PERMISSION_DEFAULTS.cadet);
}

function getEffectivePermissions(role: string, overridesRaw: any): EffectivePermissions {
  const effective = getRoleDefaultPermissions(role);
  const overrides = sanitizePermissionOverrides(overridesRaw);

  if (overrides.tabs) {
    for (const key of PERMISSION_TAB_KEYS) {
      if (typeof overrides.tabs[key] === 'boolean') {
        effective.tabs[key] = overrides.tabs[key] as boolean;
      }
    }
  }

  if (overrides.actions) {
    for (const key of PERMISSION_ACTION_KEYS) {
      if (typeof overrides.actions[key] === 'boolean') {
        effective.actions[key] = overrides.actions[key] as boolean;
      }
    }
  }

  return effective;
}

interface UserJwtPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: EffectivePermissions;
  iat?: number;
  exp?: number;
}
interface AuthRequest extends Request {
  user?: UserJwtPayload;
}
interface LoginRequestBody {
  email: string;
  password: string;
}
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const _envFilePath = path.join(projectRoot, '.env.local');
const _envFileExists = fs.existsSync(_envFilePath);
console.log(`[startup] projectRoot: ${projectRoot}`);
console.log(`[startup] .env.local: ${_envFilePath} (exists: ${_envFileExists})`);
dotenv.config({ path: _envFilePath, override: true });

// Catch unhandled rejections so the process doesn't silently die mid-startup
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled Rejection (non-fatal):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught Exception (process will exit):', err);
  process.exit(1);
});

// ========== CONFIGURABLE CONSTANTS ==========
// Points awarded to each cadet marked 'present' during attendance
const ATTENDANCE_POINTS = 2;

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Trust proxy (Cloudflare) - trust only first hop
app.set('trust proxy', 1);

const DATA_DIR = path.join(__dirname, '../data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DEFAULT_CENTRAL_LOG_ROOT = 'C:\\inetpub\\wwwroot\\Flight-Points\\Logs';
const LOCAL_LOG_ROOT = path.join(projectRoot, 'Logs');

function resolveServerLogDir() {
  const preferredRoot = process.env.LOG_ROOT || DEFAULT_CENTRAL_LOG_ROOT;
  const preferredServerDir = path.join(preferredRoot, 'Server');
  try {
    if (!fs.existsSync(preferredServerDir)) {
      fs.mkdirSync(preferredServerDir, { recursive: true });
    }
    return preferredServerDir;
  } catch (error) {
    const fallbackServerDir = path.join(LOCAL_LOG_ROOT, 'Server');
    try {
      if (!fs.existsSync(fallbackServerDir)) {
        fs.mkdirSync(fallbackServerDir, { recursive: true });
      }
      console.warn(`Log root '${preferredRoot}' is not writable. Falling back to '${LOCAL_LOG_ROOT}'.`);
      return fallbackServerDir;
    } catch (fallbackError) {
      console.error('Unable to create either preferred or fallback server log directories.', error, fallbackError);
      return preferredServerDir;
    }
  }
}

const SERVER_LOG_DIR = resolveServerLogDir();
const SERVER_ERROR_LOG_FILE = path.join(SERVER_LOG_DIR, `server-errors-${new Date().toISOString().slice(0, 10)}.log`);
// Ensure directories exist
[DATA_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});
// Configure multer for file uploads with security restrictions
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain',
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Use a random name to prevent path-traversal and filename collisions
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`File type '${file.mimetype}' is not allowed. Accepted: JPEG, PNG, GIF, WebP, PDF, TXT.`));
    }
    cb(null, true);
  },
});

// Rate limiters
// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGen // Properly handles IPv6 addresses with Cloudflare proxy
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Too many login attempts, please try again later.' },
  skipSuccessfulRequests: true,
  keyGenerator: ipKeyGen // Properly handles IPv6 addresses
});

// Rate limiter for admin PIN verification (brute-force protection)
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 attempts per 15 minutes
  message: { error: 'Too many PIN attempts, please try again later.' },
  skipSuccessfulRequests: false,
  keyGenerator: ipKeyGen,
});

// Rate limiter for ticket creation
const ticketLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many tickets submitted, please try again later.' },
  keyGenerator: ipKeyGen,
});

// Rate limiter for points awarding
const pointsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: { error: 'Too many points awarded, please try again later.' },
  keyGenerator: ipKeyGen,
});

// Rate limiter for file uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many file uploads, please try again later.' },
  keyGenerator: ipKeyGen,
});

// ========== ACCOUNT LOCKOUT / PROGRESSIVE DELAY ==========
interface LoginAttemptRecord {
  failures: number;
  lastFailure: number;
  lockedUntil: number;
}
const loginAttempts = new Map<string, LoginAttemptRecord>();
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_ATTEMPT_WINDOW_MS = 60 * 60 * 1000;   // 1 hour — failures reset after this

function getLoginAttempt(key: string): LoginAttemptRecord {
  const existing = loginAttempts.get(key);
  if (!existing) return { failures: 0, lastFailure: 0, lockedUntil: 0 };
  // Reset if window expired
  if (Date.now() - existing.lastFailure > LOGIN_ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(key);
    return { failures: 0, lastFailure: 0, lockedUntil: 0 };
  }
  return existing;
}

function recordLoginFailure(key: string): { locked: boolean; retryAfterMs: number } {
  const record = getLoginAttempt(key);
  record.failures++;
  record.lastFailure = Date.now();
  if (record.failures >= LOGIN_MAX_FAILURES) {
    record.lockedUntil = Date.now() + LOGIN_LOCKOUT_DURATION_MS;
    loginAttempts.set(key, record);
    return { locked: true, retryAfterMs: LOGIN_LOCKOUT_DURATION_MS };
  }
  // Progressive delay: 0s, 1s, 2s, 4s before lockout
  const delayMs = Math.min(Math.pow(2, record.failures - 1) * 1000, 8000);
  loginAttempts.set(key, record);
  return { locked: false, retryAfterMs: delayMs };
}

function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}

function isAccountLocked(key: string): { locked: boolean; retryAfterMs: number } {
  const record = getLoginAttempt(key);
  if (record.lockedUntil > Date.now()) {
    return { locked: true, retryAfterMs: record.lockedUntil - Date.now() };
  }
  // Unlock expired
  if (record.lockedUntil > 0 && record.lockedUntil <= Date.now()) {
    loginAttempts.delete(key);
  }
  return { locked: false, retryAfterMs: 0 };
}

// Security headers with Content Security Policy
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Allow Cloudflare Web Analytics beacon script and its inline bootstrap hash.
      scriptSrc: [
        "'self'",
        'https://static.cloudflareinsights.com',
        "'sha256-01FLQSjuSDH2Uy9763XUnLLdevloYBzKmIAhPOIIpPk='",
      ],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: [
        "'self'",
        'https://flightpoints.uk',
        'https://api.flightpoints.uk',
        'https://cloudflareinsights.com',
      ],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Middleware
// Lock CORS to exact allowed origins (no wildcards)
const ALLOWED_ORIGINS = [
  'https://flightpoints.uk',
  'https://api.flightpoints.uk',
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:3001'] : []),
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));

// Serve static assets BEFORE CORS middleware — static files are public and don't
// need cross-origin protection. This also prevents spurious CORS errors when
// something accesses localhost:3001 directly (e.g. health checks, system monitor).
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, '../dist')));

app.use('/api/', apiLimiter);

// JWT secret — refuse to start with the insecure default
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'changeme') {
  console.error('FATAL: JWT_SECRET is not set or is the insecure default.');
  console.error(`  .env.local path tried : ${_envFilePath}`);
  console.error(`  .env.local file found : ${_envFileExists}`);
  console.error(`  NODE_ENV              : ${process.env.NODE_ENV ?? '(not set)'}`);
  console.error(`  CWD                   : ${process.cwd()}`);
  console.error('Action: set a strong JWT_SECRET in .env.local and restart the service.');
  process.exit(1);
}

// ========== EMAIL ALERTING (FOR LIMITS AND ERRORS) ==========
function getSmtpConfig() {
  return {
    to: process.env.SMTP_TO || '',
    from: process.env.SMTP_FROM || '',
    server: process.env.SMTP_SERVER || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  };
}

function isEmailConfigured(): boolean {
  const cfg = getSmtpConfig();
  return !!(cfg.to && cfg.from && cfg.server);
}

async function sendAlertEmail(subject: string, body: string): Promise<void> {
  if (!isEmailConfigured()) {
    console.log('[Email] Alerting not configured. Skipping email.');
    return;
  }
  try {
    const nodemailer = await import('nodemailer');
    const cfg = getSmtpConfig();
    const transporter = nodemailer.default.createTransport({
      host: cfg.server,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    await transporter.sendMail({
      from: cfg.from,
      to: cfg.to,
      subject,
      text: body,
    });
    console.log(`[Email] Alert sent: "${subject}"`);
  } catch (err) {
    console.error('[Email] Failed to send alert:', err);
  }
}

// ========== USAGE RATE LIMITING (ATTENDANCE & POINTS) ==========
interface UsageTracker {
  [userId: string]: {
    attendanceBulk: { count: number; date: string };
    points: { totalPoints: number; date: string };
  };
}

const usageTracker: UsageTracker = {};

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getUserUsage(userId: string) {
  if (!usageTracker[userId]) {
    usageTracker[userId] = {
      attendanceBulk: { count: 0, date: getToday() },
      points: { totalPoints: 0, date: getToday() },
    };
  }
  const usage = usageTracker[userId];
  // Reset if date changed
  const today = getToday();
  if (usage.attendanceBulk.date !== today) {
    usage.attendanceBulk = { count: 0, date: today };
  }
  if (usage.points.date !== today) {
    usage.points = { totalPoints: 0, date: today };
  }
  return usage;
}

function checkAttendanceLimit(user: UserJwtPayload): { allowed: boolean; message?: string; remaining?: number } {
  if (!hasActionPermission(user, 'markAttendance')) {
    return { allowed: false, message: 'You do not have permission to submit attendance' };
  }

  const role = (user.role || '').toLowerCase();

  const usage = getUserUsage(user.id);
  const maxReports = role === 'snco' || role === 'admin' ? 5 : 1;
  const current = usage.attendanceBulk.count;

  if (current >= maxReports) {
    return {
      allowed: false,
      message: `Attendance limit reached. You have submitted ${current}/${maxReports} reports today.`,
    };
  }

  return {
    allowed: true,
    remaining: maxReports - current - 1,
  };
}

function checkPointsLimit(user: UserJwtPayload, pointsValue: number): { allowed: boolean; message?: string } {
  if (!hasActionPermission(user, 'givePoints')) {
    return { allowed: false, message: 'You do not have permission to give points' };
  }

  const role = (user.role || '').toLowerCase();

  if (!Number.isFinite(pointsValue)) {
    return { allowed: false, message: 'Points value must be a valid number' };
  }

  const maxPointsPerEntry = role === 'snco' || role === 'admin' ? 30 : 20;

  if (Math.abs(pointsValue) > maxPointsPerEntry) {
    return {
      allowed: false,
      message: `Points limit exceeded. You can give a maximum of ${maxPointsPerEntry} points in a single entry.`,
    };
  }

  return { allowed: true };
}

function incrementAttendanceCount(userId: string): void {
  const usage = getUserUsage(userId);
  usage.attendanceBulk.count++;
}

async function notifyAdminOfLimitReached(
  user: UserJwtPayload,
  limitType: 'attendance' | 'points',
  details: string
): Promise<void> {
  const subject = `[Flight-Points] User limit reached - ${limitType}`;
  const body = `
User: ${user.name} (${user.email})
Role: ${user.role}
Limit Type: ${limitType}
Details: ${details}
Time: ${new Date().toISOString()}
`;
  await sendAlertEmail(subject, body);
}

// Middleware to catch unhandled errors and send alerts
function globalErrorHandler(
  err: any,
  req: express.Request,
  res: express.Response,
  next: NextFunction
): void {
  console.error('[Error]', err?.message || err);
  
  // Don't alert on client errors; only on server errors (5xx)
  if (res.statusCode >= 500) {
    const errorBody = `
ERROR ALERT
Server: ${req.hostname}
Path: ${req.method} ${req.path}
Error: ${err?.message || String(err)}
Stack: ${err?.stack || 'No stack trace'}
Time: ${new Date().toISOString()}
`;
    sendAlertEmail('[Flight-Points] Server Error Alert', errorBody).catch(e => console.error('Failed to send error alert:', e));
  }

  res.status(res.statusCode >= 400 ? res.statusCode : 500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { detail: err?.message }),
  });
}

// Middleware to require authentication
async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const tokenUser = jwt.verify(token, JWT_SECRET) as UserJwtPayload;

    let effectiveRole = tokenUser.role;
    let effectivePermissions = getEffectivePermissions(tokenUser.role, tokenUser.permissions);

    try {
      const latest = await query(
        'SELECT role, permissions FROM app_users WHERE id = $1 LIMIT 1',
        [tokenUser.id]
      );
      if (latest.rows.length > 0) {
        effectiveRole = latest.rows[0].role || effectiveRole;
        effectivePermissions = getEffectivePermissions(effectiveRole, latest.rows[0].permissions);
      }
    } catch {
      // If lookup fails, continue with token role/permissions so auth remains available.
    }

    req.user = {
      ...tokenUser,
      role: effectiveRole,
      permissions: effectivePermissions,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Middleware to require specific roles
function requireRole(allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

function hasActionPermission(user: UserJwtPayload | undefined, action: PermissionActionKey): boolean {
  if (!user) return false;
  const effective = user.permissions || getEffectivePermissions(user.role, null);
  return effective.actions[action] === true;
}

function hasTabPermission(user: UserJwtPayload | undefined, tab: PermissionTabKey): boolean {
  if (!user) return false;
  const effective = user.permissions || getEffectivePermissions(user.role, null);
  return effective.tabs[tab] === true;
}

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginRequestBody;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Account lockout check (keyed by email to prevent brute-force per account)
  const lockoutKey = String(email).trim().toLowerCase();
  const lockStatus = isAccountLocked(lockoutKey);
  if (lockStatus.locked) {
    const retryMinutes = Math.ceil(lockStatus.retryAfterMs / 60000);
    return res.status(429).json({
      error: `Account temporarily locked due to too many failed attempts. Try again in ${retryMinutes} minute(s).`,
      retryAfterMs: lockStatus.retryAfterMs,
    });
  }

  try {
    const result = await query('SELECT id, email, name, role, password_hash, permissions FROM app_users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      const failResult = recordLoginFailure(lockoutKey);
      if (failResult.locked) {
        return res.status(429).json({
          error: `Too many failed attempts. Account locked for 15 minutes.`,
          retryAfterMs: failResult.retryAfterMs,
        });
      }
      // Progressive delay
      if (failResult.retryAfterMs > 0) {
        await new Promise(resolve => setTimeout(resolve, failResult.retryAfterMs));
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const failResult = recordLoginFailure(lockoutKey);
      if (failResult.locked) {
        return res.status(429).json({
          error: `Too many failed attempts. Account locked for 15 minutes.`,
          retryAfterMs: failResult.retryAfterMs,
        });
      }
      // Progressive delay
      if (failResult.retryAfterMs > 0) {
        await new Promise(resolve => setTimeout(resolve, failResult.retryAfterMs));
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Successful login — clear failure record
    clearLoginFailures(lockoutKey);

    // Look up linked cadet to get flight info
    let cadetId: string | null = null;
    let userFlight: string | null = null;
    try {
      const cadetResult = await query(
        `SELECT c.id, c.flight FROM cadets c
         INNER JOIN app_users u ON u.cadet_id = c.id
         WHERE u.id = $1`,
        [user.id]
      );
      if (cadetResult.rows.length > 0) {
        cadetId = cadetResult.rows[0].id;
        userFlight = cadetResult.rows[0].flight;
      }
    } catch (e) {
      // cadet_id column may not exist yet — skip
    }

    const effectivePermissions = getEffectivePermissions(user.role, user.permissions);

    // Create JWT
    const token = jwt.sign({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: effectivePermissions,
      cadetId: cadetId || undefined,
      cadetName: cadetId ? user.name : undefined,
      flight: userFlight || undefined,
    }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req: Request, res: Response) => {
  // JWT is client-side, so just return success
  res.json({ success: true });
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

function hasSignupAdminRole(user?: UserJwtPayload) {
  return hasActionPermission(user, 'manageAccounts');
}

function hasAdminPinRole(user?: UserJwtPayload) {
  return hasActionPermission(user, 'unlockAdmin');
}

// ========== ADMIN ACCOUNT CREATION HELPERS ==========

const PASSWORD_WORDS = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
  'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
  'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey',
  'Xray', 'Yankee', 'Zulu', 'Eagle', 'Falcon', 'Hawk', 'Storm', 'Thunder',
  'Phoenix', 'Viper', 'Cobra', 'Tiger', 'Mustang', 'Raptor', 'Shadow',
  'Arrow', 'Blaze', 'Comet', 'Dagger', 'Flare', 'Granite', 'Horizon',
  'Iron', 'Javelin', 'Kodiak', 'Lance', 'Meteor', 'Noble', 'Onyx',
  'Patriot', 'Quartz', 'Rocket', 'Sabre', 'Titan', 'Unity', 'Valor',
  'Warrior', 'Zenith', 'Bolt', 'Crest', 'Dawn', 'Ember', 'Frost',
  'Gale', 'Haven', 'Ivory', 'Jade', 'Kindle', 'Lunar', 'Marvel',
  'Nimbus', 'Orbit', 'Pulse', 'Ridge', 'Spark', 'Trail', 'Ultra',
  'Venture', 'Willow', 'Apex', 'Bridge', 'Canyon', 'Drift', 'Fleet',
  'Guard', 'Herald', 'Impact', 'Jetstream', 'Keystone', 'Legend', 'Mirage',
  'Nexus', 'Outpost', 'Pinnacle', 'Quest', 'Ranger', 'Sentinel', 'Trident',
];

function generatePassword(): string {
  const shortWords = PASSWORD_WORDS.filter((w) => w.length <= 5);
  const sourceWords = shortWords.length >= 2 ? shortWords : PASSWORD_WORDS;

  const w1 = sourceWords[Math.floor(Math.random() * sourceWords.length)];
  let w2 = sourceWords[Math.floor(Math.random() * sourceWords.length)];
  // Avoid same word twice
  while (w2 === w1) {
    w2 = sourceWords[Math.floor(Math.random() * sourceWords.length)];
  }
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${w1}${w2}${num}`;
}

function generateUsername(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s.-]/g, '') // strip special chars
    .replace(/\s+/g, '.')          // spaces to dots
    .replace(/\.{2,}/g, '.')       // collapse dots
    .replace(/^\.+|\.+$/g, '')     // trim dots
    .slice(0, 30);                 // max 30 chars
}

// Ensure role defaults table exists
let roleDefaultsSchemaPromise: Promise<void> | null = null;
async function ensureRoleDefaultsSchema() {
  if (!roleDefaultsSchemaPromise) {
    roleDefaultsSchemaPromise = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS role_permission_defaults (
        role TEXT PRIMARY KEY,
        permissions JSONB NOT NULL
      )`);
    })().catch((error) => {
      roleDefaultsSchemaPromise = null;
      throw error;
    });
  }
  return roleDefaultsSchemaPromise;
}

async function loadRoleDefaults(): Promise<Record<string, EffectivePermissions>> {
  await ensureRoleDefaultsSchema();
  const result = await query('SELECT role, permissions FROM role_permission_defaults');
  const cache: Record<string, EffectivePermissions> = {};
  // Seed with hardcoded defaults for all known roles
  for (const [role, defaults] of Object.entries(ROLE_PERMISSION_DEFAULTS)) {
    cache[role] = clonePermissions(defaults);
  }
  // Override with DB-stored values
  for (const row of result.rows) {
    const perms = sanitizeFullPermissions(row.permissions);
    if (perms) cache[row.role] = perms;
  }
  roleDefaultsCache = cache;
  return cache;
}

// Ensure admin account columns exist
let adminSchemaInitPromise: Promise<void> | null = null;
async function ensureAdminAccountSchema() {
  if (!adminSchemaInitPromise) {
    adminSchemaInitPromise = (async () => {
      await query('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS created_by TEXT');
      await query('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cadet_id UUID REFERENCES cadets(id) ON DELETE SET NULL');
      await query('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS permissions JSONB');
      await query('CREATE INDEX IF NOT EXISTS idx_app_users_cadet_id ON app_users (cadet_id)');
    })().catch((error) => {
      adminSchemaInitPromise = null;
      throw error;
    });
  }
  return adminSchemaInitPromise;
}

// POST /api/auth/lookup-email — resolve username to email for login
app.post('/api/auth/lookup-email', async (req: Request, res: Response) => {
  try {
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const usernameStr = String(username).trim().toLowerCase();

    // Try matching by email prefix (username@flightpoints.local) or exact email or name
    const result = await query(
      `SELECT email FROM app_users
       WHERE LOWER(SPLIT_PART(email, '@', 1)) = $1
          OR LOWER(email) = $1
          OR LOWER(name) = $1
       LIMIT 1`,
      [usernameStr]
    );

    // Return a normalized login email shape even when no row exists to reduce
    // account enumeration via distinct responses.
    const fallbackEmail = usernameStr.includes('@') ? usernameStr : `${usernameStr}@flightpoints.local`;
    const resolvedEmail = result.rows.length > 0 ? String(result.rows[0].email || fallbackEmail) : fallbackEmail;
    return res.json({ email: resolvedEmail });
  } catch (error) {
    console.error('Error in POST /api/auth/lookup-email:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin: list accounts for management
app.get('/api/auth/users', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await ensureAdminAccountSchema();
    const result = await query('SELECT id, email, name, role, cadet_id, created_by, created_at, permissions FROM app_users ORDER BY name ASC');
    const users = result.rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      permissions: getEffectivePermissions(u.role, u.permissions),
      cadetId: u.cadet_id,
      createdBy: u.created_by,
      createdAt: u.created_at,
      // Extract username (part before @)
      username: u.email.includes('@') ? u.email.split('@')[0] : u.email,
    }));
    return res.json({ users });
  } catch (error) {
    console.error('Error in GET /api/auth/users:', error);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

// Admin: update account role
app.put('/api/auth/users/:id', requireAuth, requireAdminSafeguard, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const { role, name, username, permissions } = req.body || {};
    const updates: string[] = [];
    const params: any[] = [];

    if (role !== undefined) {
      params.push(String(role).toLowerCase());
      updates.push(`role = $${params.length}`);
    }
    if (name !== undefined) {
      params.push(String(name));
      updates.push(`name = $${params.length}`);
    }
    if (username !== undefined) {
      // Validate and check for collisions
      const cleanUsername = String(username).trim().toLowerCase()
        .replace(/[^a-z0-9.\-]/g, '')
        .replace(/\.{2,}/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 30);
      if (!cleanUsername) {
        return res.status(400).json({ error: 'Invalid username' });
      }
      const newEmail = `${cleanUsername}@flightpoints.local`;
      // Check collision
      const collision = await query(
        'SELECT id FROM app_users WHERE LOWER(email) = LOWER($1) AND id != $2 LIMIT 1',
        [newEmail, req.params.id]
      );
      if (collision.rows.length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      params.push(newEmail);
      updates.push(`email = $${params.length}`);
    }
    if (permissions !== undefined) {
      const cleanPermissions = sanitizePermissionOverrides(permissions);
      params.push(JSON.stringify(cleanPermissions));
      updates.push(`permissions = $${params.length}::jsonb`);
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    params.push(req.params.id);
    const result = await query(
      `UPDATE app_users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING id, email, name, role, permissions`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    return res.json({
      user: {
        ...user,
        permissions: getEffectivePermissions(user.role, user.permissions),
        username: user.email.includes('@') ? user.email.split('@')[0] : user.email,
      },
    });
  } catch (error) {
    console.error('Error in PUT /api/auth/users/:id:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

// Admin: delete account
app.delete('/api/auth/users/:id', requireAuth, requireAdminSafeguard, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    // Prevent deleting yourself
    if (req.params.id === req.user?.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const result = await query('DELETE FROM app_users WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/auth/users/:id:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/role-defaults — return current effective defaults for all roles
app.get('/api/role-defaults', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const defaults = await loadRoleDefaults();
    return res.json(defaults);
  } catch (error) {
    console.error('Error in GET /api/role-defaults:', error);
    return res.status(500).json({ error: 'Failed to load role defaults' });
  }
});

// PUT /api/role-defaults/:role — update defaults for a specific role
app.put('/api/role-defaults/:role', requireAuth, requireAdminSafeguard, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { role } = req.params;
  const validRoles = Object.keys(ROLE_PERMISSION_DEFAULTS);
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }
  try {
    const perms = sanitizeFullPermissions(req.body);
    if (!perms) {
      return res.status(400).json({ error: 'Invalid permissions payload — expected { tabs: {...}, actions: {...} }' });
    }
    await ensureRoleDefaultsSchema();
    await query(
      `INSERT INTO role_permission_defaults (role, permissions) VALUES ($1, $2)
       ON CONFLICT (role) DO UPDATE SET permissions = EXCLUDED.permissions`,
      [role, JSON.stringify(perms)]
    );
    roleDefaultsCache = null; // bust cache
    return res.json({ success: true, role, permissions: perms });
  } catch (error) {
    console.error('Error in PUT /api/role-defaults/:role:', error);
    return res.status(500).json({ error: 'Failed to update role defaults' });
  }
});

// Admin: create account for a cadet
app.post('/api/admin/create-account', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await ensureAdminAccountSchema();
    const { cadetId, role: requestedRole } = req.body || {};
    if (!cadetId) {
      return res.status(400).json({ error: 'cadetId is required' });
    }

    // 1. Look up cadet
    const cadetResult = await query('SELECT id, name, flight, rank FROM cadets WHERE id = $1', [cadetId]);
    if (cadetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cadet not found' });
    }
    const cadet = cadetResult.rows[0];

    // 2. Check if account already exists for this cadet
    const existingResult = await query('SELECT id, email FROM app_users WHERE cadet_id = $1 LIMIT 1', [cadetId]);
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      const existingUsername = existing.email.includes('@') ? existing.email.split('@')[0] : existing.email;
      return res.status(409).json({
        error: 'This cadet already has an account',
        username: existingUsername,
      });
    }

    // 3. Generate username
    let baseUsername = generateUsername(cadet.name);
    if (!baseUsername) baseUsername = 'user';
    let username = baseUsername;
    let suffix = 2;

    // Check for collisions
    while (true) {
      const collision = await query(
        'SELECT id FROM app_users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [`${username}@flightpoints.local`]
      );
      if (collision.rows.length === 0) break;
      username = `${baseUsername}${suffix}`;
      suffix++;
      if (suffix > 100) {
        return res.status(500).json({ error: 'Could not generate unique username' });
      }
    }

    // 4. Generate password
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);

    // 5. Determine role
    const role = String(requestedRole || (cadet.flight === 'hq' ? 'staff' : 'cadet')).toLowerCase();

    // 6. Insert into app_users
    const userId = crypto.randomUUID();
    const email = `${username}@flightpoints.local`;
    const createdBy = req.user?.name || req.user?.email || 'admin';

    await query(
      `INSERT INTO app_users (id, email, name, role, password_hash, cadet_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, email, cadet.name, role, passwordHash, cadetId, createdBy]
    );

    return res.status(201).json({
      account: {
        id: userId,
        username,
        password,
        name: cadet.name,
        role,
        flight: cadet.flight,
      },
    });
  } catch (error) {
    console.error('Error in POST /api/admin/create-account:', error);
    return res.status(500).json({ error: 'Failed to create account' });
  }
});

// Admin: reset account password
app.post('/api/admin/reset-account-password', requireAuth, requireAdminSafeguard, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const userResult = await query('SELECT id, email, name FROM app_users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);

    await query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);

    const username = user.email.includes('@') ? user.email.split('@')[0] : user.email;
    return res.json({ username, password, name: user.name });
  } catch (error) {
    console.error('Error in POST /api/admin/reset-account-password:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

type DataType = 'cadets' | 'points' | 'attendance' | 'attendanceBulks' | 'rewards';

const typeConfig: Record<DataType, { table: string; columns: Record<string, string>; orderBy?: string; hasUpdatedAt?: boolean }> = {
  cadets: {
    table: 'cadets',
    columns: {
      name: 'name',
      flight: 'flight',
      rank: 'rank',
      isNco: 'is_nco',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    orderBy: 'name ASC',
    hasUpdatedAt: true,
  },
  points: {
    table: 'points',
    columns: {
      cadetName: 'cadet_name',
      date: 'date',
      flight: 'flight',
      reason: 'reason',
      points: 'points',
      type: 'type',
      givenBy: 'given_by',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    orderBy: 'date DESC NULLS LAST',
    hasUpdatedAt: true,
  },
  attendance: {
    table: 'attendance',
    columns: {
      cadetName: 'cadet_name',
      date: 'date',
      flight: 'flight',
      status: 'status',
      submittedBy: 'submitted_by',
      bulkId: 'bulk_id',
      createdAt: 'created_at',
    },
    orderBy: 'date DESC NULLS LAST',
  },
  attendanceBulks: {
    table: 'attendance_bulks',
    columns: {
      date: 'date',
      flightFilter: 'flight_filter',
      totalRecords: 'total_records',
      totalPresent: 'total_present',
      submittedBy: 'submitted_by',
      createdAt: 'created_at',
    },
    orderBy: 'created_at DESC NULLS LAST',
  },
  rewards: {
    table: 'rewards',
    columns: {
      title: 'title',
      howToWin: 'how_to_win',
      prize: 'prize',
      endsAt: 'ends_at',
      winnerName: 'winner_name',
      status: 'status',
      createdBy: 'created_by',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    orderBy: 'created_at DESC NULLS LAST',
    hasUpdatedAt: true,
  },
};

const typeAliases: Record<string, DataType> = {
  cadets: 'cadets',
  points: 'points',
  attendance: 'attendance',
  attendancebulks: 'attendanceBulks',
  attendance_bulks: 'attendanceBulks',
  rewards: 'rewards',
};

function normalizeType(type: string): DataType | null {
  return typeAliases[type.toLowerCase()] || null;
}

function mapToDb(type: DataType, body: Record<string, any>) {
  const { columns } = typeConfig[type];
  const mapped: Record<string, any> = {};

  for (const [clientKey, dbKey] of Object.entries(columns)) {
    if (body[clientKey] !== undefined) mapped[dbKey] = body[clientKey];
    if (body[dbKey] !== undefined) mapped[dbKey] = body[dbKey];
  }

  return mapped;
}

function mapToClient(type: DataType, row: Record<string, any>) {
  const { columns } = typeConfig[type];
  const reverse: Record<string, string> = {};

  for (const [clientKey, dbKey] of Object.entries(columns)) {
    reverse[dbKey] = clientKey;
  }

  const mapped: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[reverse[key] || key] = value;
  }
  return mapped;
}

function mapRowsToClient(type: DataType, rows: Record<string, any>[]) {
  return rows.map(row => mapToClient(type, row));
}

// ========== PIN MANAGEMENT ENDPOINTS ==========

const ADMIN_TOTP_SECRET = String(process.env.ADMIN_TOTP_SECRET || '').trim();
const ADMIN_SAFEGUARD_TTL_SECONDS = 10 * 60;

function getConfiguredAdminPin() {
  // Only read from server-side env — never fall back to VITE_ prefixed vars which may leak to the client bundle
  const configuredPin = String(process.env.ADMIN_PIN || '').trim();
  return configuredPin;
}

function base32Decode(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of secret.toUpperCase().replace(/=/g, '')) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

function generateTotpCodes(secret: string) {
  if (!secret) return [] as string[];
  const key = base32Decode(secret);
  const currentCounter = Math.floor(Date.now() / 1000 / 30);
  const codes: string[] = [];

  for (let offset = -1; offset <= 1; offset++) {
    let counter = currentCounter + offset;
    const buffer = Buffer.alloc(8);
    for (let index = 7; index >= 0; index--) {
      buffer[index] = counter & 0xff;
      counter >>>= 8;
    }
    const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
    const truncationOffset = hmac[hmac.length - 1] & 0x0f;
    const code = (((hmac[truncationOffset] & 0x7f) << 24)
      | ((hmac[truncationOffset + 1] & 0xff) << 16)
      | ((hmac[truncationOffset + 2] & 0xff) << 8)
      | (hmac[truncationOffset + 3] & 0xff)) % 1000000;
    codes.push(code.toString().padStart(6, '0'));
  }

  return codes;
}

function createAdminSafeguardToken(user: UserJwtPayload, method: 'pin' | 'totp') {
  return jwt.sign(
    {
      purpose: 'admin-safeguard',
      sub: user.id,
      role: user.role,
      method,
    },
    JWT_SECRET,
    { expiresIn: ADMIN_SAFEGUARD_TTL_SECONDS },
  );
}

function requireAdminSafeguard(req: AuthRequest, res: Response, next: NextFunction) {
  const safeguardToken = String(req.header('X-Admin-Safeguard') || '').trim();
  if (!safeguardToken) {
    return res.status(403).json({ error: 'Admin safeguard verification required for this action' });
  }

  try {
    const payload = jwt.verify(safeguardToken, JWT_SECRET) as jwt.JwtPayload;
    if (payload?.purpose !== 'admin-safeguard' || payload?.sub !== req.user?.id) {
      return res.status(403).json({ error: 'Invalid admin safeguard token' });
    }
    return next();
  } catch {
    return res.status(403).json({ error: 'Admin safeguard token expired or invalid' });
  }
}

// GET /api/admin/pin-status - Get current user's PIN status
app.get('/api/admin/pin-status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    if (!hasAdminPinRole(req.user)) {
      return res.status(403).json({ error: 'Only Flight Point Leads can use admin PIN actions' });
    }

    const configuredPin = getConfiguredAdminPin();
    res.json({
      is_default: false,
      last_changed: null,
      has_pin: /^\d{6}$/.test(configuredPin),
      totp_enabled: !!ADMIN_TOTP_SECRET,
      safeguard_ttl_seconds: ADMIN_SAFEGUARD_TTL_SECONDS,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/pin-status:', error);
    res.status(500).json({ error: 'Failed to fetch PIN status' });
  }
});

// POST /api/admin/verify-pin - Verify a PIN (rate-limited to prevent brute force)
app.post('/api/admin/verify-pin', pinLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!hasAdminPinRole(req.user)) {
      return res.status(403).json({ error: 'Only Flight Point Leads can verify admin PIN' });
    }

    const { pin, code, totp } = req.body || {};
    const rawCode = String(code || totp || pin || '').trim();
    if (!rawCode) {
      return res.status(400).json({ error: 'Admin PIN or authenticator code is required' });
    }

    const configuredPin = getConfiguredAdminPin();
    if (!/^\d{6}$/.test(configuredPin)) {
      return res.status(500).json({ error: 'Admin PIN is not configured correctly. Set a 6-digit ADMIN_PIN in .env.local.' });
    }

    if (!/^\d{6}$/.test(rawCode)) {
      return res.status(400).json({ error: 'Code must be 6 digits' });
    }

    const totpValid = !!ADMIN_TOTP_SECRET && generateTotpCodes(ADMIN_TOTP_SECRET).includes(rawCode);
    const pinValid = rawCode === configuredPin;

    if (!pinValid && !totpValid) {
      return res.status(401).json({ error: ADMIN_TOTP_SECRET ? 'Incorrect PIN or authenticator code' : 'Incorrect PIN' });
    }

    const method: 'pin' | 'totp' = totpValid ? 'totp' : 'pin';
    res.json({
      success: true,
      method,
      safeguardToken: createAdminSafeguardToken(req.user!, method),
      expiresInSeconds: ADMIN_SAFEGUARD_TTL_SECONDS,
      totpEnabled: !!ADMIN_TOTP_SECRET,
    });
  } catch (error) {
    console.error('Error in POST /api/admin/verify-pin:', error);
    res.status(500).json({ error: 'Failed to verify PIN' });
  }
});

// POST /api/admin/change-pin - Change user's PIN
app.post('/api/admin/change-pin', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!hasAdminPinRole(req.user)) {
      return res.status(403).json({ error: 'Only Flight Point Leads can change admin PIN' });
    }

    res.status(400).json({
      error: 'Admin PIN is managed in .env.local. Update ADMIN_PIN to a new 6-digit value and restart the server.',
    });
  } catch (error) {
    console.error('Error in POST /api/admin/change-pin:', error);
    res.status(500).json({ error: 'Failed to change PIN' });
  }
});

// POST /api/admin/reset-pin - Reset a user's PIN (admin only)
app.post('/api/admin/reset-pin', requireAuth, requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  try {
    res.status(400).json({
      error: 'Admin PIN is managed in .env.local. Set ADMIN_PIN to a 6-digit value and restart the server.',
    });
  } catch (error) {
    console.error('Error in POST /api/admin/reset-pin:', error);
    res.status(500).json({ error: 'Failed to reset PIN' });
  }
});

// ========== TICKETS ENDPOINTS ==========

// GET /api/tickets/count - Get count of tickets
app.get('/api/tickets/count', async (req: Request, res: Response) => {
  try {
    const result = await query(`SELECT COUNT(*)::int AS count FROM tickets`).catch(() => ({ rows: [{ count: 0 }] }));
    res.json({ count: Number(result.rows[0]?.count || 0) });
  } catch (error) {
    console.error('Error in GET /api/tickets/count:', error);
    res.json({ count: 0 });
  }
});

// GET /api/integrity-check/count - Get count of integrity issues (failures and warnings)
app.get('/api/integrity-check/count', async (req: Request, res: Response) => {
  try {
    const checks: Array<{ name: string; category: string; status: string; message: string; details?: string }> = [];
    const add = (category: string, name: string, status: 'pass' | 'warning' | 'fail', message: string, details?: string) => {
      checks.push({ category, name, status, message, ...(details ? { details } : {}) });
    };

    // Run all integrity checks (abbreviated version, focusing on count)
    const [
      invalidPointsCadets,
      invalidAttendanceCadets,
      invalidRewardWinners,
      invalidUserCadetLinks,
      duplicateUserEmails,
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM points p LEFT JOIN cadets c ON LOWER(c.name) = LOWER(p.cadet_name) WHERE c.id IS NULL`),
      query(`SELECT COUNT(*)::int AS count FROM attendance a LEFT JOIN cadets c ON LOWER(c.name) = LOWER(a.cadet_name) WHERE c.id IS NULL`),
      query(`SELECT COUNT(*)::int AS count FROM rewards r WHERE r.winner_name IS NOT NULL AND r.winner_name != '' AND NOT EXISTS (SELECT 1 FROM cadets c WHERE LOWER(c.name) = LOWER(r.winner_name))`).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM app_users u WHERE u.cadet_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cadets c WHERE c.id = u.cadet_id)`).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM app_users GROUP BY email HAVING COUNT(*) > 1`).catch(() => ({ rows: [] })),
    ]);

    // Add checks
    if (invalidPointsCadets.rows[0]?.count > 0) add('Referential Integrity', 'Points → Cadets', 'fail', `${invalidPointsCadets.rows[0].count} point(s) reference non-existent cadets`);
    if (invalidAttendanceCadets.rows[0]?.count > 0) add('Referential Integrity', 'Attendance → Cadets', 'fail', `${invalidAttendanceCadets.rows[0].count} attendance record(s) reference non-existent cadets`);
    if (invalidRewardWinners.rows[0]?.count > 0) add('Referential Integrity', 'Reward Winners → Cadets', 'warning', `${invalidRewardWinners.rows[0].count} reward(s) have invalid winners`);
    if (invalidUserCadetLinks.rows[0]?.count > 0) add('Referential Integrity', 'User Accounts → Cadets', 'fail', `${invalidUserCadetLinks.rows[0].count} user(s) linked to non-existent cadets`);
    if (duplicateUserEmails.rows.length > 0) add('Accounts', 'Duplicate User Emails', 'fail', `${duplicateUserEmails.rows.length} duplicate email(s) found`);

    // Check deploy status for failures
    try {
      const deployStatusPath = path.join(projectRoot, 'data', 'deploy-status.json');
      if (fs.existsSync(deployStatusPath)) {
        const deployData = JSON.parse(fs.readFileSync(deployStatusPath, 'utf-8'));
        if (deployData.status === 'failed') {
          add('Deployment', 'Last Deploy Failed', 'fail', deployData.message || 'Auto-deploy failed', deployData.error || undefined);
        }
      }
    } catch (e) {
      // Ignore deploy status read errors
    }

    // Count failures and warnings
    const failCount = checks.filter(c => c.status === 'fail').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;
    const totalCount = failCount + warningCount;

    res.json({ count: totalCount, failures: failCount, warnings: warningCount });
  } catch (error) {
    console.error('Error in GET /api/integrity-check/count:', error);
    res.json({ count: 0, failures: 0, warnings: 0 });
  }
});

// GET /api/rewards/active-count - Get count of active (unclaimed) rewards
app.get('/api/rewards/active-count', async (req: Request, res: Response) => {
  try {
    await ensureRewardsSchema();
    const now = new Date().toISOString();
    const result = await query(
      `SELECT COUNT(*)::int AS count FROM rewards WHERE (status IS NULL OR status = 'active') AND ends_at > $1`,
      [now]
    ).catch(() => ({ rows: [{ count: 0 }] }));
    res.json({ count: Number(result.rows[0]?.count || 0) });
  } catch (error) {
    console.error('Error in GET /api/rewards/active-count:', error);
    res.json({ count: 0 });
  }
});

// GET /api/points/recent-count - Get count of recently added points (last 24 hours)
app.get('/api/points/recent-count', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user || !hasActionPermission(user, 'givePoints')) {
      return res.json({ count: 0 });
    }
    
    // Get non-attendance points added in the last 24 hours that weren't added by the current user
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const currentUserName = String(user.name || '').trim();
    const currentUserEmail = String(user.email || '').trim();
    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM points
       WHERE created_at > $1
         AND (type IS NULL OR LOWER(type) <> 'attendance')
         AND COALESCE(LOWER(TRIM(given_by)), '') NOT IN (LOWER($2), LOWER($3))`,
      [oneDayAgo, currentUserName, currentUserEmail]
    ).catch(() => ({ rows: [{ count: 0 }] }));
    res.json({ count: Number(result.rows[0]?.count || 0) });
  } catch (error) {
    console.error('Error in GET /api/points/recent-count:', error);
    res.json({ count: 0 });
  }
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// ========== HEALTH CHECK ENDPOINT ==========
// Checks: server is up, database is reachable, disk has space
app.get('/api/health', async (req, res) => {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    const dbResult = await query('SELECT 1 AS alive');
    checks.db = { ok: dbResult.rows.length > 0, detail: 'PostgreSQL reachable' };
  } catch (err: any) {
    checks.db = { ok: false, detail: err?.message || 'DB unreachable' };
  }

  try {
    const testFile = path.join(DATA_DIR, '.health-check-' + Date.now());
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    checks.disk = { ok: true, detail: 'Data directory writable' };
  } catch (err: any) {
    checks.disk = { ok: false, detail: err?.message || 'Disk write failed' };
  }

  checks.uptime = { ok: true, detail: `${Math.floor(process.uptime())}s` };

  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  checks.memory = { ok: heapUsedMB < 512, detail: `${heapUsedMB}MB / ${heapTotalMB}MB heap` };

  const allOk = Object.values(checks).every((check) => check.ok);
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'healthy' : 'unhealthy', checks });
});

// ========== REVISION HISTORY ==========
// Auto-create revision_history table on startup
let revisionSchemaReady: Promise<void> | null = null;
async function ensureRevisionHistorySchema() {
  if (!revisionSchemaReady) {
    revisionSchemaReady = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS revision_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          record_type VARCHAR NOT NULL,
          record_id UUID NOT NULL,
          action VARCHAR NOT NULL,
          changed_by VARCHAR NOT NULL,
          changed_by_role VARCHAR,
          changed_at TIMESTAMP DEFAULT NOW(),
          changed_fields JSONB,
          change_summary TEXT,
          before_data JSONB,
          after_data JSONB
        )
      `);
      await query('ALTER TABLE revision_history ADD COLUMN IF NOT EXISTS changed_by_role VARCHAR');
      await query('ALTER TABLE revision_history ADD COLUMN IF NOT EXISTS changed_fields JSONB');
      await query('ALTER TABLE revision_history ADD COLUMN IF NOT EXISTS change_summary TEXT');
      await query('CREATE INDEX IF NOT EXISTS idx_revision_history_record ON revision_history (record_type, record_id)');
      await query('CREATE INDEX IF NOT EXISTS idx_revision_history_changed_at ON revision_history (changed_at DESC)');

      const existingRows = await query(
        `SELECT id, action, before_data, after_data, changed_by_role, changed_fields, change_summary
         FROM revision_history
         WHERE changed_by_role IS NULL OR changed_fields IS NULL OR change_summary IS NULL`
      );

      for (const row of existingRows.rows) {
        const details = buildRevisionDetails(row.action, row.before_data, row.after_data);
        await query(
          `UPDATE revision_history
           SET changed_by_role = COALESCE(changed_by_role, $2),
               changed_fields = COALESCE(changed_fields, $3::jsonb),
               change_summary = COALESCE(change_summary, $4)
           WHERE id = $1`,
          [
            row.id,
            'unknown',
            JSON.stringify(details.changedFields),
            details.summary,
          ]
        );
      }
    })().catch(err => { revisionSchemaReady = null; throw err; });
  }
  return revisionSchemaReady;
}

function normalizeRevisionValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'empty';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildRevisionDetails(
  action: 'create' | 'update' | 'delete',
  beforeData: Record<string, any> | null,
  afterData: Record<string, any> | null,
): { changedFields: string[]; summary: string } {
  const beforeObject = beforeData && typeof beforeData === 'object' ? beforeData : {};
  const afterObject = afterData && typeof afterData === 'object' ? afterData : {};
  const keys = Array.from(new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)])).sort();
  const changedFields = keys.filter((key) => {
    const beforeValue = beforeObject[key];
    const afterValue = afterObject[key];
    return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
  });

  if (action === 'create') {
    const listed = changedFields.slice(0, 5).join(', ');
    const extra = changedFields.length > 5 ? ` +${changedFields.length - 5} more` : '';
    return {
      changedFields,
      summary: changedFields.length > 0 ? `Created record with fields: ${listed}${extra}` : 'Created record',
    };
  }

  if (action === 'delete') {
    const listed = changedFields.slice(0, 5).join(', ');
    const extra = changedFields.length > 5 ? ` +${changedFields.length - 5} more` : '';
    return {
      changedFields,
      summary: changedFields.length > 0 ? `Deleted record. Previous fields: ${listed}${extra}` : 'Deleted record',
    };
  }

  const fieldSummaries = changedFields.slice(0, 3).map((key) => {
    const beforeValue = normalizeRevisionValue(beforeObject[key]);
    const afterValue = normalizeRevisionValue(afterObject[key]);
    return `${key}: ${beforeValue} -> ${afterValue}`;
  });
  const extra = changedFields.length > 3 ? ` +${changedFields.length - 3} more field(s)` : '';

  return {
    changedFields,
    summary: fieldSummaries.length > 0 ? `${fieldSummaries.join('; ')}${extra}` : 'Updated record with no detected field differences',
  };
}

async function recordRevision(
  recordType: string,
  recordId: string,
  action: 'create' | 'update' | 'delete',
  changedBy: string,
  changedByRole: string,
  beforeData: any | null,
  afterData: any | null,
): Promise<void> {
  try {
    await ensureRevisionHistorySchema();
    const details = buildRevisionDetails(action, beforeData, afterData);
    await query(
      `INSERT INTO revision_history (id, record_type, record_id, action, changed_by, changed_by_role, changed_fields, change_summary, before_data, after_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
      [
        crypto.randomUUID(),
        recordType,
        recordId,
        action,
        changedBy,
        changedByRole,
        JSON.stringify(details.changedFields),
        details.summary,
        beforeData ? JSON.stringify(beforeData) : null,
        afterData ? JSON.stringify(afterData) : null,
      ]
    );
  } catch (err) {
    console.error('[RevisionHistory] Failed to record revision:', err);
  }
}

// GET /api/revision-history/:type/:id — get revision history for a record (admin only)
app.get('/api/revision-history/:type/:id', requireAuth, requireRole(['snco', 'admin']), async (req, res) => {
  try {
    await ensureRevisionHistorySchema();
    const result = await query(
      `SELECT * FROM revision_history WHERE record_type = $1 AND record_id = $2 ORDER BY changed_at DESC LIMIT 50`,
      [req.params.type, req.params.id]
    );
    res.json(result.rows.map(r => ({
      id: r.id,
      recordType: r.record_type,
      recordId: r.record_id,
      action: r.action,
      changedBy: r.changed_by,
      changedByRole: r.changed_by_role,
      changedAt: r.changed_at,
      changedFields: r.changed_fields,
      changeSummary: r.change_summary,
      beforeData: r.before_data,
      afterData: r.after_data,
    })));
  } catch (error) {
    console.error('Error in GET /api/revision-history:', error);
    res.status(500).json({ error: 'Failed to fetch revision history' });
  }
});
// CRUD Endpoints — all data reads now require authentication
app.get('/api/data/:type', requireAuth, async (req: AuthRequest, res) => {
  try {
    const normalized = normalizeType(req.params.type);
    if (!normalized) {
      return res.status(400).json({ error: 'Unsupported data type' });
    }

    // Ensure rewards schema columns exist before reading
    if (normalized === 'rewards') {
      await ensureRewardsSchema();
    }

    const { table, orderBy } = typeConfig[normalized];

    // Cadets can only see their own attendance records
    if (normalized === 'attendance' && req.user?.role === 'cadet' && req.user?.name) {
      const sql = `SELECT * FROM ${table} WHERE LOWER(cadet_name) = LOWER($1)${orderBy ? ` ORDER BY ${orderBy}` : ''}`;
      const result = await query(sql, [req.user.name]);
      return res.json(mapRowsToClient(normalized, result.rows));
    }

    const sql = orderBy ? `SELECT * FROM ${table} ORDER BY ${orderBy}` : `SELECT * FROM ${table}`;
    const result = await query(sql);
    res.json(mapRowsToClient(normalized, result.rows));
  } catch (error) {
    console.error('Error in GET /api/data/:type:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});
app.get('/api/data/:type/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const normalized = normalizeType(req.params.type);
    if (!normalized) {
      return res.status(400).json({ error: 'Unsupported data type' });
    }

    const { table } = typeConfig[normalized];
    const result = await query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(mapToClient(normalized, result.rows[0]));
  } catch (error) {
    console.error('Error in GET /api/data/:type/:id:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});
app.post('/api/data/:type', requireAuth, async (req: AuthRequest, res) => {
  try {
    const normalized = normalizeType(req.params.type);
    if (!normalized) {
      return res.status(400).json({ error: 'Unsupported data type' });
    }

    if (normalized === 'points') {
      if (!hasActionPermission(req.user, 'givePoints')) {
        return res.status(403).json({ error: 'You do not have permission to create points' });
      }
    } else if (normalized === 'attendance') {
      if (!hasActionPermission(req.user, 'markAttendance')) {
        return res.status(403).json({ error: 'You do not have permission to create attendance' });
      }
    } else if (!hasActionPermission(req.user, 'manageCadets')) {
      return res.status(403).json({ error: 'You do not have permission to create this record type' });
    }

    // Block giving points to NCOs via the generic endpoint too
    if (normalized === 'points') {
      const cadetName = req.body?.cadetName || req.body?.cadet_name;
      if (cadetName) {
        const ncoCheck = await query(
          'SELECT is_nco, flight FROM cadets WHERE LOWER(name) = LOWER($1) LIMIT 1',
          [cadetName]
        );
        if (ncoCheck.rows.length > 0 && ncoCheck.rows[0].is_nco === true) {
          return res.status(403).json({ error: `${cadetName} is an NCO and cannot receive points` });
        }
        if (ncoCheck.rows.length > 0 && ncoCheck.rows[0].flight === 'hq') {
          return res.status(403).json({ error: `${cadetName} is Staff/HQ and cannot receive points` });
        }
      }
    }

    const { table } = typeConfig[normalized];
    const data = mapToDb(normalized, req.body || {});
    data.id = data.id || crypto.randomUUID();

    const columns = Object.keys(data);
    if (columns.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }

    const values = columns.map((_, idx) => `$${idx + 1}`);
    const result = await query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')}) RETURNING *`,
      columns.map(col => data[col])
    );

    res.status(201).json(mapToClient(normalized, result.rows[0]));
  } catch (error) {
    console.error('Error in POST /api/data/:type:', error);
    res.status(500).json({ error: 'Failed to create data' });
  }
});
app.put('/api/data/:type/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const normalized = normalizeType(req.params.type);
    if (!normalized) {
      return res.status(400).json({ error: 'Unsupported data type' });
    }

    if (normalized === 'points') {
      if (!hasActionPermission(req.user, 'editPoints')) {
        return res.status(403).json({ error: 'You do not have permission to edit points' });
      }
    } else if (normalized === 'attendance') {
      if (!hasActionPermission(req.user, 'editAttendance')) {
        return res.status(403).json({ error: 'You do not have permission to edit attendance' });
      }
    } else if (!hasActionPermission(req.user, 'manageCadets')) {
      return res.status(403).json({ error: 'You do not have permission to edit this record type' });
    }

    // Ensure rewards schema columns exist before updating
    if (normalized === 'rewards') {
      await ensureRewardsSchema();
    }

    const { table, hasUpdatedAt } = typeConfig[normalized];
    const data = mapToDb(normalized, req.body || {});

    if (hasUpdatedAt && data.updated_at === undefined) {
      data.updated_at = new Date().toISOString();
    }

    const columns = Object.keys(data);
    if (columns.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }

    // Capture before state for revision history
    const beforeResult = await query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
    const beforeData = beforeResult.rows.length > 0 ? beforeResult.rows[0] : null;

    const updates = columns.map((col, idx) => `${col} = $${idx + 1}`);
    const params = columns.map(col => data[col]);
    params.push(req.params.id);

    const result = await query(
      `UPDATE ${table} SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Record revision history for tracked types
    if (['points', 'attendance', 'cadets', 'rewards'].includes(normalized)) {
      await recordRevision(normalized, req.params.id, 'update', req.user?.name || 'unknown', req.user?.role || 'unknown', beforeData, result.rows[0]);
    }

    res.json(mapToClient(normalized, result.rows[0]));
  } catch (error) {
    console.error('Error in PUT /api/data/:type/:id:', error);
    res.status(500).json({ error: 'Failed to update data' });
  }
});
app.delete('/api/data/:type/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const normalized = normalizeType(req.params.type);
    if (!normalized) {
      return res.status(400).json({ error: 'Unsupported data type' });
    }

    if (normalized === 'points') {
      if (!hasActionPermission(req.user, 'deletePoints')) {
        return res.status(403).json({ error: 'You do not have permission to delete points' });
      }
    } else if (normalized === 'attendance') {
      if (!hasActionPermission(req.user, 'deleteAttendanceSessions')) {
        return res.status(403).json({ error: 'You do not have permission to delete attendance' });
      }
    } else if (!hasActionPermission(req.user, 'manageCadets')) {
      return res.status(403).json({ error: 'You do not have permission to delete this record type' });
    }

    const { table } = typeConfig[normalized];

    // Capture before state for revision history
    const beforeResult = await query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
    const beforeData = beforeResult.rows.length > 0 ? beforeResult.rows[0] : null;

    const result = await query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Record revision history for tracked types
    if (['points', 'attendance', 'cadets', 'rewards'].includes(normalized)) {
      await recordRevision(normalized, req.params.id, 'delete', req.user?.name || 'unknown', req.user?.role || 'unknown', beforeData, null);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/data/:type/:id:', error);
    res.status(500).json({ error: 'Failed to delete data' });
  }
});

// ========== DEDICATED POINTS ENDPOINT (allows pointgiver/staff/snco) ==========
app.post('/api/points', pointsLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  if (!hasActionPermission(req.user, 'givePoints')) {
    return res.status(403).json({ error: 'You do not have permission to give points' });
  }
  const userRole = (req.user?.role || '').toLowerCase();

  try {
    const { cadetName, flight, points: pointsValue, reason, type, date, givenBy } = req.body || {};
    if (!cadetName || pointsValue === undefined || !reason) {
      return res.status(400).json({ error: 'cadetName, points, and reason are required' });
    }

    const numericPoints = parseFloat(pointsValue);

    // Check points limit
    const pointsLimitCheck = checkPointsLimit(req.user!, numericPoints);
    if (!pointsLimitCheck.allowed) {
      // Notify admin
      await notifyAdminOfLimitReached(req.user!, 'points', `${req.user?.name} tried to give ${pointsValue} points but exceeded per-entry limit`);
      return res.status(429).json({ error: pointsLimitCheck.message });
    }

    // Block giving points to NCOs
    const ncoCheck = await query(
      'SELECT is_nco, flight FROM cadets WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [cadetName]
    );
    if (ncoCheck.rows.length > 0 && ncoCheck.rows[0].is_nco === true) {
      return res.status(403).json({ error: `${cadetName} is an NCO and cannot receive points` });
    }
    if (ncoCheck.rows.length > 0 && ncoCheck.rows[0].flight === 'hq') {
      return res.status(403).json({ error: `${cadetName} is Staff/HQ and cannot receive points` });
    }

    // For pointgivers, enforce flight restriction
    if (userRole === 'pointgiver') {
      // Look up the user's flight via their cadet_id
      let userFlight: string | null = null;
      try {
        const cadetResult = await query(
          `SELECT c.flight FROM cadets c
           INNER JOIN app_users u ON u.cadet_id = c.id
           WHERE u.id = $1`,
          [req.user!.id]
        );
        if (cadetResult.rows.length > 0) {
          userFlight = cadetResult.rows[0].flight;
        }
      } catch (e) {
        // If cadet_id column doesn't exist yet, skip restriction
      }

      if (userFlight) {
        // Look up the target cadet's flight
        const targetResult = await query(
          'SELECT flight FROM cadets WHERE LOWER(name) = LOWER($1) LIMIT 1',
          [cadetName]
        );
        if (targetResult.rows.length > 0) {
          const targetFlight = targetResult.rows[0].flight;
          if (targetFlight !== userFlight) {
            return res.status(403).json({
              error: `You can only give points to cadets in your flight (${userFlight})`,
            });
          }
        }
      }
    }

    const id = crypto.randomUUID();
    const result = await query(
      `INSERT INTO points (id, cadet_name, date, flight, reason, points, type, given_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        id,
        cadetName,
        date || new Date().toISOString(),
        flight || '',
        reason,
        numericPoints,
        type || 'general',
        givenBy || req.user?.name || 'unknown',
      ]
    );

    const row = result.rows[0];

    await recordRevision('points', id, 'create', req.user?.name || 'unknown', req.user?.role || 'unknown', null, row);

    res.status(201).json({
      id: row.id,
      cadetName: row.cadet_name,
      date: row.date,
      flight: row.flight,
      reason: row.reason,
      points: row.points,
      type: row.type,
      givenBy: row.given_by,
    });
  } catch (error) {
    console.error('Error in POST /api/points:', error);
    res.status(500).json({ error: 'Failed to create point' });
  }
});

// Presentation stats — extra data for competitive slides
app.get('/api/presentation-stats', async (req, res) => {
  try {
    // 1) Rising Stars — top gainers this week (last 7 days)
    const risingResult = await query(
      `SELECT cadet_name AS name,
              COALESCE(
                (SELECT c.flight FROM cadets c WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(points.cadet_name)) LIMIT 1),
                MAX(flight)
              ) AS flight,
              COALESCE(SUM(points), 0) AS week_points
       FROM points
       WHERE date >= NOW() - INTERVAL '7 days'
         AND (type IS NULL OR type <> 'attendance')
       GROUP BY cadet_name
       ORDER BY week_points DESC
       LIMIT 10`
    );

    // 1b) Rising Cadets — top earners this calendar month
    const risingMonthResult = await query(
      `SELECT cadet_name AS name,
              COALESCE(
                (SELECT c.flight FROM cadets c WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(points.cadet_name)) LIMIT 1),
                MAX(flight)
              ) AS flight,
              COALESCE(SUM(points), 0) AS month_points
       FROM points
       WHERE date >= DATE_TRUNC('month', NOW())
         AND (type IS NULL OR type <> 'attendance')
       GROUP BY cadet_name
       ORDER BY month_points DESC
       LIMIT 10`
    );

    // 2) Weekly comparison — flight totals this week vs last week
    const thisWeekFlights = await query(
      `SELECT flight, COALESCE(SUM(points), 0) AS points
       FROM points
       WHERE date >= NOW() - INTERVAL '7 days'
         AND (type IS NULL OR type <> 'attendance')
       GROUP BY flight`
    );
    const lastWeekFlights = await query(
      `SELECT flight, COALESCE(SUM(points), 0) AS points
       FROM points
       WHERE date >= NOW() - INTERVAL '14 days'
         AND date < NOW() - INTERVAL '7 days'
         AND (type IS NULL OR type <> 'attendance')
       GROUP BY flight`
    );

    // 3) Attendance streaks — consecutive 'present' records per cadet
    const streakResult = await query(
      `SELECT cadet_name, date, status
       FROM attendance
       ORDER BY cadet_name, date DESC`
    );

    // Build streaks from consecutive 'present' records
    const streaks: { name: string; streak: number }[] = [];
    let currentName = '';
    let currentStreak = 0;
    let streakBroken = false;
    for (const row of streakResult.rows) {
      if (row.cadet_name !== currentName) {
        if (currentName && currentStreak > 0) {
          streaks.push({ name: currentName, streak: currentStreak });
        }
        currentName = row.cadet_name;
        currentStreak = 0;
        streakBroken = false;
      }
      if (!streakBroken) {
        if (row.status === 'present') {
          currentStreak++;
        } else {
          streakBroken = true;
        }
      }
    }
    if (currentName && currentStreak > 0) {
      streaks.push({ name: currentName, streak: currentStreak });
    }
    streaks.sort((a, b) => b.streak - a.streak);

    // 4) Flight of the month — which flight had the most points each calendar month
    const monthlyResult = await query(
      `SELECT TO_CHAR(date, 'YYYY-MM') AS month,
              flight,
              COALESCE(SUM(points), 0) AS points
       FROM points
       WHERE date IS NOT NULL
         AND (type IS NULL OR type <> 'attendance')
       GROUP BY month, flight
       ORDER BY month DESC, points DESC`
    );
    // Pick winner per month
    const monthWinners: { month: string; flight: string; points: number }[] = [];
    const seenMonths = new Set<string>();
    for (const row of monthlyResult.rows) {
      if (!seenMonths.has(row.month)) {
        seenMonths.add(row.month);
        monthWinners.push({
          month: row.month,
          flight: row.flight,
          points: Number(row.points),
        });
      }
    }

    res.json({
      risingStars: risingResult.rows.map(r => ({
        name: r.name,
        flight: r.flight || '',
        weekPoints: Number(r.week_points),
      })),
      risingCadets: risingMonthResult.rows.map(r => ({
        name: r.name,
        flight: r.flight || '',
        monthPoints: Number(r.month_points),
      })),
      thisWeekFlights: thisWeekFlights.rows.map(r => ({
        flight: r.flight,
        points: Number(r.points),
      })),
      lastWeekFlights: lastWeekFlights.rows.map(r => ({
        flight: r.flight,
        points: Number(r.points),
      })),
      attendanceStreaks: streaks.slice(0, 10),
      flightOfTheMonth: monthWinners.slice(0, 6),
    });
  } catch (error) {
    console.error('Error in GET /api/presentation-stats:', error);
    res.status(500).json({ error: 'Failed to fetch presentation stats' });
  }
});

// Leaderboards
app.get('/api/leaderboards', async (req, res) => {
  try {
    const cadetResult = await query(
      `SELECT cadet_name AS name, COALESCE(SUM(points), 0) AS points
       FROM points
       GROUP BY cadet_name
       ORDER BY points DESC`
    );

    const flightResult = await query(
      `SELECT flight, COALESCE(SUM(points), 0) AS points
       FROM points
       GROUP BY flight
       ORDER BY points DESC`
    );

    const recentResult = await query(
      `SELECT * FROM points
       WHERE type IS NULL OR type <> 'attendance'
       ORDER BY date DESC NULLS LAST
       LIMIT 20`
    );

    // Detailed per-cadet breakdown: flight points vs attendance points
    const detailedResult = await query(
      `SELECT
         cadet_name AS name,
         COALESCE(
           (SELECT c.flight FROM cadets c WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(points.cadet_name)) LIMIT 1),
           MAX(flight)
         ) AS flight,
         COALESCE(SUM(CASE WHEN type IS NULL OR type <> 'attendance' THEN points ELSE 0 END), 0) AS flight_points,
         COALESCE(SUM(CASE WHEN type = 'attendance' THEN points ELSE 0 END), 0) AS attendance_points,
         COALESCE(SUM(points), 0) AS total_points
       FROM points
       GROUP BY cadet_name
       ORDER BY total_points DESC`
    );

    const cadetLeaderboard = cadetResult.rows.map(r => ({ name: r.name, points: Number(r.points) }));
    const flightLeaderboard = flightResult.rows.map(r => ({ flight: r.flight, points: Number(r.points) }));
    const recentPoints = mapRowsToClient('points', recentResult.rows);
    const detailedLeaderboard = detailedResult.rows.map(r => ({
      name: r.name,
      flight: r.flight || '',
      flightPoints: Number(r.flight_points),
      attendancePoints: Number(r.attendance_points),
      totalPoints: Number(r.total_points),
    }));

    const maxCadetPts = cadetLeaderboard.length ? cadetLeaderboard[0].points : null;
    const maxFlightPts = flightLeaderboard.length ? flightLeaderboard[0].points : null;
    const winnersCadets = maxCadetPts !== null ? cadetLeaderboard.filter(e => e.points === maxCadetPts) : [];
    const winnersFlights = maxFlightPts !== null ? flightLeaderboard.filter(e => e.points === maxFlightPts) : [];

    res.json({
      cadetLeaderboard,
      flightLeaderboard,
      recentPoints,
      detailedLeaderboard,
      winningCadet: cadetLeaderboard[0] || null,
      winningFlight: flightLeaderboard[0] || null,
      winnersCadets,
      winnersFlights,
    });
  } catch (error) {
    console.error('Error in GET /api/leaderboards:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboards' });
  }
});

// ========== ATTENDANCE BULK ENDPOINTS ==========

// GET /api/attendance/bulks — list recent bulk sessions
app.get('/api/attendance/bulks', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM attendance_bulks ORDER BY created_at DESC LIMIT 30');
    res.json(result.rows.map(row => ({
      id: row.id,
      date: row.date,
      flightFilter: row.flight_filter,
      totalRecords: Number(row.total_records),
      totalPresent: Number(row.total_present),
      submittedBy: row.submitted_by,
      createdAt: row.created_at,
    })));
  } catch (error) {
    console.error('Error in GET /api/attendance/bulks:', error);
    res.status(500).json({ error: 'Failed to fetch bulk attendance sessions' });
  }
});

// GET /api/attendance/bulk/:id/records — list records for a bulk session
app.get('/api/attendance/bulk/:id/records', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM attendance
       WHERE bulk_id = $1
       ORDER BY flight ASC, cadet_name ASC, created_at ASC`,
      [id]
    );

    res.json(result.rows.map(row => ({
      id: row.id,
      cadetName: row.cadet_name,
      date: row.date,
      flight: row.flight,
      status: row.status,
      submittedBy: row.submitted_by,
      bulkId: row.bulk_id,
      createdAt: row.created_at,
    })));
  } catch (error) {
    console.error('Error in GET /api/attendance/bulk/:id/records:', error);
    res.status(500).json({ error: 'Failed to fetch bulk attendance records' });
  }
});

// PUT /api/attendance/:id/status — update a saved attendance status and sync attendance points
app.put('/api/attendance/:id/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!hasActionPermission(req.user, 'editAttendance')) {
      return res.status(403).json({ error: 'You do not have permission to edit attendance' });
    }

    const { id } = req.params;
    const status = String(req.body?.status || '').toLowerCase();

    if (status !== 'present' && status !== 'absent') {
      return res.status(400).json({ error: 'status must be present or absent' });
    }

    const existingResult = await query(
      `SELECT id, cadet_name, date, flight, status, bulk_id
       FROM attendance
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    const existing = existingResult.rows[0];

    const updatedResult = await query(
      `UPDATE attendance
       SET status = $1
       WHERE id = $2
       RETURNING id, cadet_name, date, flight, status, submitted_by, bulk_id, created_at`,
      [status, id]
    );

    const updated = updatedResult.rows[0];

    // Record attendance status change in revision history
    await recordRevision('attendance', id, 'update', req.user?.name || 'unknown', req.user?.role || 'unknown',
      { status: existing.status, cadet_name: existing.cadet_name, date: existing.date },
      { status: updated.status, cadet_name: updated.cadet_name, date: updated.date }
    );

    if (ATTENDANCE_POINTS > 0) {
      if (status === 'present') {
        const cadetCheck = await query(
          'SELECT is_nco, flight FROM cadets WHERE LOWER(name) = LOWER($1) LIMIT 1',
          [existing.cadet_name]
        );
        const isIneligible =
          cadetCheck.rows.length > 0 &&
          (cadetCheck.rows[0].is_nco === true || String(cadetCheck.rows[0].flight || '').toLowerCase() === 'hq');

        if (!isIneligible) {
          const existingPoint = await query(
            `SELECT id FROM points
             WHERE LOWER(cadet_name) = LOWER($1)
               AND DATE(date) = DATE($2)
               AND type = 'attendance'
             LIMIT 1`,
            [existing.cadet_name, existing.date]
          );

          if (existingPoint.rows.length === 0) {
            await query(
              `INSERT INTO points (id, cadet_name, date, flight, reason, points, type, given_by, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
              [
                crypto.randomUUID(),
                existing.cadet_name,
                existing.date,
                existing.flight,
                'Attendance',
                ATTENDANCE_POINTS,
                'attendance',
                req.user?.name || 'attendance-edit',
              ]
            );
          }
        }
      } else {
        const anyPresentSameDay = await query(
          `SELECT id FROM attendance
           WHERE LOWER(cadet_name) = LOWER($1)
             AND DATE(date) = DATE($2)
             AND status = 'present'
           LIMIT 1`,
          [existing.cadet_name, existing.date]
        );

        if (anyPresentSameDay.rows.length === 0) {
          await query(
            `DELETE FROM points
             WHERE LOWER(cadet_name) = LOWER($1)
               AND DATE(date) = DATE($2)
               AND type = 'attendance'`,
            [existing.cadet_name, existing.date]
          );
        }
      }
    }

    let bulkTotalPresent: number | null = null;
    if (existing.bulk_id) {
      const countResult = await query(
        `SELECT COUNT(*)::int AS total_present
         FROM attendance
         WHERE bulk_id = $1 AND status = 'present'`,
        [existing.bulk_id]
      );
      bulkTotalPresent = Number(countResult.rows[0]?.total_present || 0);
      await query(
        `UPDATE attendance_bulks
         SET total_present = $1
         WHERE id = $2`,
        [bulkTotalPresent, existing.bulk_id]
      );
    }

    res.json({
      record: {
        id: updated.id,
        cadetName: updated.cadet_name,
        date: updated.date,
        flight: updated.flight,
        status: updated.status,
        submittedBy: updated.submitted_by,
        bulkId: updated.bulk_id,
        createdAt: updated.created_at,
      },
      bulkTotalPresent,
    });
  } catch (error) {
    console.error('Error in PUT /api/attendance/:id/status:', error);
    res.status(500).json({ error: 'Failed to update attendance status' });
  }
});

// POST /api/attendance/bulk — create a bulk attendance session with individual records
app.post('/api/attendance/bulk', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!hasActionPermission(req.user, 'markAttendance')) {
      return res.status(403).json({ error: 'You do not have permission to submit attendance' });
    }

    const { entries, date, flightFilter } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array is required' });
    }

    // Check attendance limit
    const attendanceLimitCheck = checkAttendanceLimit(req.user!);
    if (!attendanceLimitCheck.allowed) {
      // Notify admin
      await notifyAdminOfLimitReached(req.user!, 'attendance', `${req.user?.name} tried to submit attendance but hit daily limit`);
      return res.status(429).json({ error: attendanceLimitCheck.message });
    }

    const user = (req as any).user;
    const submittedBy = user?.name || 'unknown';
    const totalPresent = entries.filter((e: any) => e.status === 'present').length;

    // Create the bulk session record
    const bulkId = crypto.randomUUID();
    await query(
      `INSERT INTO attendance_bulks (id, date, flight_filter, total_records, total_present, submitted_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [bulkId, date || new Date().toISOString(), flightFilter || 'all', entries.length, totalPresent, submittedBy]
    );

    // Insert all individual attendance records linked to this bulk
    for (const entry of entries) {
      const recordId = crypto.randomUUID();
      await query(
        `INSERT INTO attendance (id, cadet_name, date, flight, status, submitted_by, bulk_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [recordId, entry.cadetName, entry.date || date, entry.flight, entry.status || 'absent', submittedBy, bulkId]
      );
    }

    // Award attendance points to present cadets (skip NCOs and HQ/Staff)
    let pointsAwarded = 0;
    const pointErrors: string[] = [];
    if (ATTENDANCE_POINTS > 0) {
      const presentEntries = entries.filter((e: any) => e.status === 'present');
      for (const entry of presentEntries) {
        try {
          // Check if cadet is NCO or HQ — they can't receive points
          const cadetCheck = await query(
            'SELECT is_nco, flight FROM cadets WHERE LOWER(name) = LOWER($1) LIMIT 1',
            [entry.cadetName]
          );
          if (cadetCheck.rows.length > 0) {
            const { is_nco, flight: cadetFlight } = cadetCheck.rows[0];
            if (is_nco || (cadetFlight && cadetFlight.toLowerCase() === 'hq')) {
              continue; // Skip NCOs and HQ cadets
            }
          }
          const pointId = crypto.randomUUID();
          await query(
            `INSERT INTO points (id, cadet_name, date, flight, reason, points, type, given_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
            [pointId, entry.cadetName, entry.date || date, entry.flight, 'Attendance', ATTENDANCE_POINTS, 'attendance', submittedBy]
          );
          pointsAwarded++;
        } catch (pointErr: any) {
          const errMsg = pointErr?.message || String(pointErr);
          console.error(`Failed to award attendance point to ${entry.cadetName}:`, errMsg);
          pointErrors.push(`${entry.cadetName}: ${errMsg}`);
        }
      }
    }

    // Increment usage counter for attendance
    incrementAttendanceCount(req.user!.id);

    res.status(201).json({
      id: bulkId,
      totalRecords: entries.length,
      totalPresent,
      pointsAwarded,
      pointErrors: pointErrors.length > 0 ? pointErrors : undefined,
      message: `Saved ${entries.length} attendance records, awarded ${pointsAwarded} x ${ATTENDANCE_POINTS}pt`,
    });
  } catch (error) {
    console.error('Error in POST /api/attendance/bulk:', error);
    res.status(500).json({ error: 'Failed to save bulk attendance' });
  }
});

// DELETE /api/attendance/bulk/:id — delete a bulk session and its records
app.delete('/api/attendance/bulk/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!hasActionPermission(req.user, 'deleteAttendanceSessions')) {
      return res.status(403).json({ error: 'You do not have permission to delete attendance sessions' });
    }

    const { id } = req.params;
    await query('DELETE FROM attendance WHERE bulk_id = $1', [id]);
    await query('DELETE FROM attendance_bulks WHERE id = $1', [id]);
    res.json({ message: 'Bulk attendance session deleted' });
  } catch (error) {
    console.error('Error in DELETE /api/attendance/bulk/:id:', error);
    res.status(500).json({ error: 'Failed to delete bulk attendance session' });
  }
});

// Attendance reports
app.get('/api/attendance/reports', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userRole = (req as any).user?.role;
    const userName = (req as any).user?.name;

    // Cadets should not access full attendance reports
    if (userRole === 'cadet') {
      return res.status(403).json({ error: 'Cadets cannot view full attendance reports' });
    }

    const summaryResult = await query(
      `SELECT cadet_name,
              flight,
              COUNT(*) AS total_records,
              SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS total_present,
              SUM(CASE WHEN status = 'authorised_absence' THEN 1 ELSE 0 END) AS total_authorised_absence,
              SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS total_absent
       FROM attendance
       GROUP BY cadet_name, flight`
    );

    const summary = summaryResult.rows.map(row => {
      const totalRecords = Number(row.total_records);
      const totalPresent = Number(row.total_present);
      const totalAuthorisedAbsence = Number(row.total_authorised_absence);
      const totalAbsent = Number(row.total_absent);
      return {
        cadetName: row.cadet_name,
        flight: row.flight,
        totalRecords,
        totalPresent,
        totalAuthorisedAbsence,
        totalAbsent,
        attendanceRate: totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0,
      };
    });

    const stats = {
      totalPresent: summary.reduce((s, r) => s + r.totalPresent, 0),
      totalAuthorisedAbsence: summary.reduce((s, r) => s + r.totalAuthorisedAbsence, 0),
      totalAbsent: summary.reduce((s, r) => s + r.totalAbsent, 0),
      averageAttendanceRate: summary.length > 0 ? Math.round(summary.reduce((s, r) => s + r.attendanceRate, 0) / summary.length) : 0,
    };

    res.json({ summary, stats });
  } catch (error) {
    console.error('Error in GET /api/attendance/reports:', error);
    res.status(500).json({ error: 'Failed to fetch attendance reports' });
  }
});

// ========== COMPREHENSIVE INTEGRITY CHECKS ==========
app.get('/api/integrity-check', async (req, res) => {
  try {
    const checks: Array<{ name: string; category: string; status: string; message: string; details?: string }> = [];

    // Helper to add a check result
    const add = (category: string, name: string, status: 'pass' | 'warning' | 'fail', message: string, details?: string) => {
      checks.push({ category, name, status, message, ...(details ? { details } : {}) });
    };

    // ═══════════════════════════════════════════════════
    // CATEGORY 1: REFERENTIAL INTEGRITY
    // ═══════════════════════════════════════════════════

    const [
      invalidPointsCadets,
      invalidAttendanceCadets,
      invalidAttendanceBulkIds,
      invalidRewardWinners,
      invalidUserCadetLinks,
      invalidVoteSuggestionLinks,
    ] = await Promise.all([
      query(`SELECT p.id, p.cadet_name FROM points p LEFT JOIN cadets c ON LOWER(c.name) = LOWER(p.cadet_name) WHERE c.id IS NULL`),
      query(`SELECT a.id, a.cadet_name FROM attendance a LEFT JOIN cadets c ON LOWER(c.name) = LOWER(a.cadet_name) WHERE c.id IS NULL`),
      query(`SELECT a.id, a.bulk_id FROM attendance a WHERE a.bulk_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM attendance_bulks b WHERE b.id = a.bulk_id)`),
      query(`SELECT r.id, r.title, r.winner_name FROM rewards r WHERE r.winner_name IS NOT NULL AND r.winner_name != '' AND NOT EXISTS (SELECT 1 FROM cadets c WHERE LOWER(c.name) = LOWER(r.winner_name))`).catch(() => ({ rows: [] })),
      query(`SELECT u.id, u.name, u.cadet_id FROM app_users u WHERE u.cadet_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cadets c WHERE c.id = u.cadet_id)`).catch(() => ({ rows: [] })),
      query(`SELECT rv.id, rv.suggestion_id FROM reward_votes rv WHERE NOT EXISTS (SELECT 1 FROM reward_suggestions rs WHERE rs.id = rv.suggestion_id)`).catch(() => ({ rows: [] })),
    ]);

    add('Referential Integrity', 'Points → Cadets',
      invalidPointsCadets.rows.length === 0 ? 'pass' : 'fail',
      invalidPointsCadets.rows.length === 0 ? 'All point records reference valid cadets' : `${invalidPointsCadets.rows.length} point(s) reference non-existent cadets`,
      invalidPointsCadets.rows.length > 0 ? invalidPointsCadets.rows.slice(0, 10).map((r: any) => r.cadet_name).join(', ') : undefined
    );

    add('Referential Integrity', 'Attendance → Cadets',
      invalidAttendanceCadets.rows.length === 0 ? 'pass' : 'fail',
      invalidAttendanceCadets.rows.length === 0 ? 'All attendance records reference valid cadets' : `${invalidAttendanceCadets.rows.length} attendance record(s) reference non-existent cadets`,
      invalidAttendanceCadets.rows.length > 0 ? invalidAttendanceCadets.rows.slice(0, 10).map((r: any) => r.cadet_name).join(', ') : undefined
    );

    add('Referential Integrity', 'Attendance → Bulk Records',
      invalidAttendanceBulkIds.rows.length === 0 ? 'pass' : 'warning',
      invalidAttendanceBulkIds.rows.length === 0 ? 'All attendance bulk_id references are valid' : `${invalidAttendanceBulkIds.rows.length} attendance record(s) reference missing bulk records`
    );

    add('Referential Integrity', 'Reward Winners → Cadets',
      invalidRewardWinners.rows.length === 0 ? 'pass' : 'warning',
      invalidRewardWinners.rows.length === 0 ? 'All reward winners are valid cadets' : `${invalidRewardWinners.rows.length} reward(s) have winners not in cadets table`,
      invalidRewardWinners.rows.length > 0 ? invalidRewardWinners.rows.slice(0, 5).map((r: any) => `"${r.title}" → ${r.winner_name}`).join(', ') : undefined
    );

    add('Referential Integrity', 'User Accounts → Cadets',
      invalidUserCadetLinks.rows.length === 0 ? 'pass' : 'fail',
      invalidUserCadetLinks.rows.length === 0 ? 'All user account cadet links are valid' : `${invalidUserCadetLinks.rows.length} user(s) linked to non-existent cadets`,
      invalidUserCadetLinks.rows.length > 0 ? invalidUserCadetLinks.rows.slice(0, 5).map((r: any) => r.name).join(', ') : undefined
    );

    add('Referential Integrity', 'Votes → Suggestions',
      invalidVoteSuggestionLinks.rows.length === 0 ? 'pass' : 'warning',
      invalidVoteSuggestionLinks.rows.length === 0 ? 'All votes reference valid suggestions' : `${invalidVoteSuggestionLinks.rows.length} orphaned vote(s) found`
    );

    // ═══════════════════════════════════════════════════
    // CATEGORY 2: DUPLICATES & UNIQUENESS
    // ═══════════════════════════════════════════════════

    const [
      duplicateCadets,
      duplicateUserEmails,
      duplicatePointRecords,
      duplicateAttendanceSameDay,
    ] = await Promise.all([
      query(`SELECT LOWER(name) AS name, COUNT(*) AS count FROM cadets GROUP BY LOWER(name) HAVING COUNT(*) > 1`),
      query(`SELECT LOWER(email) AS email, COUNT(*) AS count FROM app_users GROUP BY LOWER(email) HAVING COUNT(*) > 1`).catch(() => ({ rows: [] })),
      query(`SELECT cadet_name, date, flight, reason, points, COUNT(*) AS count FROM points GROUP BY cadet_name, date, flight, reason, points HAVING COUNT(*) > 1`),
      query(`SELECT cadet_name, date, COUNT(*) AS count FROM attendance GROUP BY cadet_name, date HAVING COUNT(*) > 1`),
    ]);

    add('Duplicates', 'Unique Cadet Names',
      duplicateCadets.rows.length === 0 ? 'pass' : 'warning',
      duplicateCadets.rows.length === 0 ? 'All cadet names are unique' : `${duplicateCadets.rows.length} duplicate cadet name(s) found`,
      duplicateCadets.rows.length > 0 ? duplicateCadets.rows.map((r: any) => `${r.name} (×${r.count})`).join(', ') : undefined
    );

    add('Duplicates', 'Unique User Emails',
      duplicateUserEmails.rows.length === 0 ? 'pass' : 'fail',
      duplicateUserEmails.rows.length === 0 ? 'All user emails are unique' : `${duplicateUserEmails.rows.length} duplicate email(s) found`,
      duplicateUserEmails.rows.length > 0 ? duplicateUserEmails.rows.map((r: any) => r.email).join(', ') : undefined
    );

    add('Duplicates', 'Possible Duplicate Points (Info)',
      'pass',
      duplicatePointRecords.rows.length === 0 ? 'No exact duplicate point records found' : `${duplicatePointRecords.rows.length} set(s) of identical point records detected (allowed in some workflows)`,
      duplicatePointRecords.rows.length > 0 ? duplicatePointRecords.rows.slice(0, 5).map((r: any) => `${r.cadet_name} on ${r.date ? new Date(r.date).toLocaleDateString('en-GB') : 'unknown'} (×${r.count})`).join(', ') : undefined
    );

    add('Duplicates', 'Multiple Attendance Records Per Day (Info)',
      'pass',
      duplicateAttendanceSameDay.rows.length === 0 ? 'No multiple attendance records for same cadet/date' : `${duplicateAttendanceSameDay.rows.length} cadet(s) with multiple attendance records on same date (allowed)`,
      duplicateAttendanceSameDay.rows.length > 0 ? duplicateAttendanceSameDay.rows.slice(0, 5).map((r: any) => `${r.cadet_name} (×${r.count})`).join(', ') : undefined
    );

    // ═══════════════════════════════════════════════════
    // CATEGORY 3: DATA QUALITY
    // ═══════════════════════════════════════════════════

    const [
      cadetsNoFlight,
      cadetsEmptyName,
      pointsNoDate,
      pointsZeroValue,
      pointsNoReason,
      pointsNoGivenBy,
      attendanceInvalidStatus,
      rewardsNoTitle,
      rewardsExpiredStillActive,
      negativePoints,
      futurePoints,
      futureAttendance,
      pointsFlightMismatch,
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM cadets WHERE flight IS NULL OR TRIM(flight) = ''`),
      query(`SELECT COUNT(*)::int AS count FROM cadets WHERE name IS NULL OR TRIM(name) = ''`),
      query(`SELECT COUNT(*)::int AS count FROM points WHERE date IS NULL`),
      query(`SELECT COUNT(*)::int AS count FROM points WHERE points = 0`),
      query(`SELECT COUNT(*)::int AS count FROM points WHERE reason IS NULL OR TRIM(reason) = ''`),
      query(`SELECT COUNT(*)::int AS count FROM points WHERE given_by IS NULL OR TRIM(given_by) = ''`),
      query(`SELECT COUNT(*)::int AS count FROM attendance WHERE status IS NULL`),
      query(`SELECT COUNT(*)::int AS count FROM rewards WHERE title IS NULL OR TRIM(title) = ''`).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM rewards WHERE ends_at < NOW() AND (status IS NULL OR status = 'active')`).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM points WHERE points < 0`),
      query(`SELECT COUNT(*)::int AS count FROM points WHERE date > NOW() + INTERVAL '1 day'`),
      query(`SELECT COUNT(*)::int AS count FROM attendance WHERE date > NOW() + INTERVAL '1 day'`),
      query(`SELECT p.id, p.cadet_name, p.flight AS point_flight, c.flight AS cadet_flight FROM points p INNER JOIN cadets c ON LOWER(c.name) = LOWER(p.cadet_name) WHERE p.flight IS NOT NULL AND c.flight IS NOT NULL AND LOWER(p.flight) != LOWER(c.flight)`),
    ]);

    const noFlightCount = Number(cadetsNoFlight.rows[0]?.count || 0);
    add('Data Quality', 'All Cadets Have Flight',
      noFlightCount === 0 ? 'pass' : 'fail',
      noFlightCount === 0 ? 'All cadets assigned to a flight' : `${noFlightCount} cadet(s) missing flight assignment`
    );

    const emptyNameCount = Number(cadetsEmptyName.rows[0]?.count || 0);
    add('Data Quality', 'No Empty Cadet Names',
      emptyNameCount === 0 ? 'pass' : 'fail',
      emptyNameCount === 0 ? 'All cadets have names' : `${emptyNameCount} cadet(s) with empty names`
    );

    const noDateCount = Number(pointsNoDate.rows[0]?.count || 0);
    add('Data Quality', 'All Points Have Dates',
      noDateCount === 0 ? 'pass' : 'warning',
      noDateCount === 0 ? 'All point records have dates' : `${noDateCount} point(s) missing date`
    );

    const zeroCount = Number(pointsZeroValue.rows[0]?.count || 0);
    add('Data Quality', 'No Zero-Value Points',
      zeroCount === 0 ? 'pass' : 'warning',
      zeroCount === 0 ? 'No zero-value point records' : `${zeroCount} point(s) with zero value`
    );

    const noReasonCount = Number(pointsNoReason.rows[0]?.count || 0);
    add('Data Quality', 'All Points Have Reasons',
      noReasonCount === 0 ? 'pass' : 'warning',
      noReasonCount === 0 ? 'All point records have reasons' : `${noReasonCount} point(s) without a reason`
    );

    const noGivenByCount = Number(pointsNoGivenBy.rows[0]?.count || 0);
    add('Data Quality', 'All Points Have Given By',
      noGivenByCount === 0 ? 'pass' : 'warning',
      noGivenByCount === 0 ? 'All points recorded who gave them' : `${noGivenByCount} point(s) missing given_by`
    );

    const invalidStatusCount = Number(attendanceInvalidStatus.rows[0]?.count || 0);
    add('Data Quality', 'Valid Attendance Status',
      invalidStatusCount === 0 ? 'pass' : 'fail',
      invalidStatusCount === 0 ? 'All attendance records have valid status' : `${invalidStatusCount} attendance record(s) with null status`
    );

    const noTitleCount = Number(rewardsNoTitle.rows[0]?.count || 0);
    add('Data Quality', 'All Rewards Have Titles',
      noTitleCount === 0 ? 'pass' : 'fail',
      noTitleCount === 0 ? 'All rewards have titles' : `${noTitleCount} reward(s) missing title`
    );

    const expiredActiveCount = Number(rewardsExpiredStillActive.rows[0]?.count || 0);
    add('Data Quality', 'Expired Rewards Not Active',
      expiredActiveCount === 0 ? 'pass' : 'warning',
      expiredActiveCount === 0 ? 'No expired rewards still marked active' : `${expiredActiveCount} reward(s) past end date but still marked active`
    );

    const negCount = Number(negativePoints.rows[0]?.count || 0);
    add('Data Quality', 'No Negative Points',
      negCount === 0 ? 'pass' : 'warning',
      negCount === 0 ? 'No negative point values' : `${negCount} point record(s) with negative values`
    );

    const futurePointsCount = Number(futurePoints.rows[0]?.count || 0);
    add('Data Quality', 'No Future-Dated Points',
      futurePointsCount === 0 ? 'pass' : 'warning',
      futurePointsCount === 0 ? 'No points dated in the future' : `${futurePointsCount} point(s) dated in the future`
    );

    const futureAttCount = Number(futureAttendance.rows[0]?.count || 0);
    add('Data Quality', 'No Future-Dated Attendance',
      futureAttCount === 0 ? 'pass' : 'warning',
      futureAttCount === 0 ? 'No attendance records dated in the future' : `${futureAttCount} attendance record(s) dated in the future`
    );

    add('Data Quality', 'Points Flight Matches Cadet Flight',
      pointsFlightMismatch.rows.length === 0 ? 'pass' : 'warning',
      pointsFlightMismatch.rows.length === 0 ? 'All points have correct flight for cadet' : `${pointsFlightMismatch.rows.length} point(s) where flight doesn't match cadet's current flight`,
      pointsFlightMismatch.rows.length > 0 ? pointsFlightMismatch.rows.slice(0, 5).map((r: any) => `${r.cadet_name}: point says ${r.point_flight}, cadet is ${r.cadet_flight}`).join('; ') : undefined
    );

    // ═══════════════════════════════════════════════════
    // CATEGORY 4: ACCOUNT & AUTH INTEGRITY
    // ═══════════════════════════════════════════════════

    const [
      usersWithoutCadet,
      usersInvalidRole,
      usersNoPassword,
      usersInvalidEmail,
      multipleAccountsSameCadet,
      ncoWithNonCadetAccount,
    ] = await Promise.all([
      query(`SELECT u.id, u.name, u.role FROM app_users u WHERE u.cadet_id IS NULL AND u.role NOT IN ('snco', 'admin', 'staff', 'presentation')`).catch(() => ({ rows: [] })),
      query(`SELECT id, name, role FROM app_users WHERE role NOT IN ('snco', 'admin', 'staff', 'pointgiver', 'cadet', 'presentation')`).catch(() => ({ rows: [] })),
      query(`SELECT id, name FROM app_users WHERE password_hash IS NULL OR TRIM(password_hash) = ''`).catch(() => ({ rows: [] })),
      query(`SELECT id, name, email FROM app_users WHERE email IS NULL OR TRIM(email) = '' OR email NOT LIKE '%@%'`).catch(() => ({ rows: [] })),
      query(`SELECT cadet_id, COUNT(*)::int AS count FROM app_users WHERE cadet_id IS NOT NULL GROUP BY cadet_id HAVING COUNT(*) > 1`).catch(() => ({ rows: [] })),
      query(`SELECT u.id, u.name, u.role, c.is_nco FROM app_users u INNER JOIN cadets c ON u.cadet_id = c.id WHERE c.is_nco = true AND u.role = 'cadet'`).catch(() => ({ rows: [] })),
    ]);

    add('Accounts', 'Cadet/Pointgiver Accounts Linked',
      usersWithoutCadet.rows.length === 0 ? 'pass' : 'warning',
      usersWithoutCadet.rows.length === 0 ? 'All cadet/pointgiver accounts are linked to a cadet record' : `${usersWithoutCadet.rows.length} non-admin account(s) without cadet link`,
      usersWithoutCadet.rows.length > 0 ? usersWithoutCadet.rows.slice(0, 5).map((r: any) => `${r.name} (${r.role})`).join(', ') : undefined
    );

    add('Accounts', 'Valid User Roles',
      usersInvalidRole.rows.length === 0 ? 'pass' : 'fail',
      usersInvalidRole.rows.length === 0 ? 'All users have valid roles' : `${usersInvalidRole.rows.length} user(s) with invalid roles`,
      usersInvalidRole.rows.length > 0 ? usersInvalidRole.rows.slice(0, 5).map((r: any) => `${r.name}: "${r.role}"`).join(', ') : undefined
    );

    add('Accounts', 'All Users Have Passwords',
      usersNoPassword.rows.length === 0 ? 'pass' : 'fail',
      usersNoPassword.rows.length === 0 ? 'All users have password hashes' : `${usersNoPassword.rows.length} user(s) without password hash`
    );

    add('Accounts', 'Valid Email Format',
      usersInvalidEmail.rows.length === 0 ? 'pass' : 'fail',
      usersInvalidEmail.rows.length === 0 ? 'All user emails have valid format' : `${usersInvalidEmail.rows.length} user(s) with invalid email`,
      usersInvalidEmail.rows.length > 0 ? usersInvalidEmail.rows.slice(0, 5).map((r: any) => r.name).join(', ') : undefined
    );

    add('Accounts', 'No Duplicate Cadet Links',
      multipleAccountsSameCadet.rows.length === 0 ? 'pass' : 'fail',
      multipleAccountsSameCadet.rows.length === 0 ? 'Each cadet has at most one account' : `${multipleAccountsSameCadet.rows.length} cadet(s) linked to multiple accounts`
    );

    add('Accounts', 'NCO Role Consistency',
      ncoWithNonCadetAccount.rows.length === 0 ? 'pass' : 'warning',
      ncoWithNonCadetAccount.rows.length === 0 ? 'No NCOs with "cadet" role accounts' : `${ncoWithNonCadetAccount.rows.length} NCO(s) have "cadet" role — should they be pointgiver?`,
      ncoWithNonCadetAccount.rows.length > 0 ? ncoWithNonCadetAccount.rows.slice(0, 5).map((r: any) => r.name).join(', ') : undefined
    );

    // ═══════════════════════════════════════════════════
    // CATEGORY 5: POINTS BUSINESS RULES
    // ═══════════════════════════════════════════════════

    const [
      ncoWithPoints,
      hqWithPoints,
      orphanedAttendancePoints,
    ] = await Promise.all([
      query(`SELECT p.id, p.cadet_name, p.points FROM points p INNER JOIN cadets c ON LOWER(c.name) = LOWER(p.cadet_name) WHERE c.is_nco = true`).catch(() => ({ rows: [] })),
      query(`SELECT p.id, p.cadet_name, p.points FROM points p INNER JOIN cadets c ON LOWER(c.name) = LOWER(p.cadet_name) WHERE LOWER(c.flight) = 'hq'`).catch(() => ({ rows: [] })),
      query(`SELECT p.id, p.cadet_name, p.date FROM points p LEFT JOIN attendance a ON LOWER(a.cadet_name) = LOWER(p.cadet_name) AND a.date = p.date WHERE p.type = 'attendance' AND a.id IS NULL`),
    ]);

    add('Business Rules', 'NCOs Have No Points',
      ncoWithPoints.rows.length === 0 ? 'pass' : 'warning',
      ncoWithPoints.rows.length === 0 ? 'No NCOs have points (correct — NCOs cannot receive points)' : `${ncoWithPoints.rows.length} point record(s) exist for NCOs (may be pre-NCO status)`,
      ncoWithPoints.rows.length > 0 ? ncoWithPoints.rows.slice(0, 5).map((r: any) => r.cadet_name).join(', ') : undefined
    );

    add('Business Rules', 'HQ/Staff Have No Points',
      hqWithPoints.rows.length === 0 ? 'pass' : 'warning',
      hqWithPoints.rows.length === 0 ? 'No HQ/Staff cadets have points (correct)' : `${hqWithPoints.rows.length} point record(s) exist for HQ/Staff members`,
      hqWithPoints.rows.length > 0 ? hqWithPoints.rows.slice(0, 5).map((r: any) => r.cadet_name).join(', ') : undefined
    );

    add('Business Rules', 'Attendance Points Have Records',
      orphanedAttendancePoints.rows.length === 0 ? 'pass' : 'warning',
      orphanedAttendancePoints.rows.length === 0 ? 'All attendance-type points have matching attendance records' : `${orphanedAttendancePoints.rows.length} attendance point(s) with no matching attendance record`
    );

    // ═══════════════════════════════════════════════════
    // CATEGORY 6: REWARDS INTEGRITY
    // ═══════════════════════════════════════════════════

    const [
      claimedNoWinner,
      winnerNotClaimed,
      rewardsDuplicateTitle,
    ] = await Promise.all([
      query(`SELECT id, title FROM rewards WHERE status = 'claimed' AND (winner_name IS NULL OR TRIM(winner_name) = '')`).catch(() => ({ rows: [] })),
      query(`SELECT id, title, winner_name FROM rewards WHERE winner_name IS NOT NULL AND TRIM(winner_name) != '' AND (status IS NULL OR status != 'claimed')`).catch(() => ({ rows: [] })),
      query(`SELECT LOWER(title) AS title, COUNT(*)::int AS count FROM rewards WHERE status = 'active' OR status IS NULL GROUP BY LOWER(title) HAVING COUNT(*) > 1`).catch(() => ({ rows: [] })),
    ]);

    add('Rewards', 'Claimed Rewards Have Winners',
      claimedNoWinner.rows.length === 0 ? 'pass' : 'fail',
      claimedNoWinner.rows.length === 0 ? 'All claimed rewards have a winner set' : `${claimedNoWinner.rows.length} claimed reward(s) without a winner`,
      claimedNoWinner.rows.length > 0 ? claimedNoWinner.rows.slice(0, 5).map((r: any) => r.title).join(', ') : undefined
    );

    add('Rewards', 'Winners Marked as Claimed',
      winnerNotClaimed.rows.length === 0 ? 'pass' : 'warning',
      winnerNotClaimed.rows.length === 0 ? 'All rewards with winners are marked claimed' : `${winnerNotClaimed.rows.length} reward(s) have winners but aren't marked claimed`,
      winnerNotClaimed.rows.length > 0 ? winnerNotClaimed.rows.slice(0, 5).map((r: any) => `"${r.title}" → ${r.winner_name}`).join(', ') : undefined
    );

    add('Rewards', 'No Duplicate Active Rewards',
      rewardsDuplicateTitle.rows.length === 0 ? 'pass' : 'warning',
      rewardsDuplicateTitle.rows.length === 0 ? 'No duplicate active reward titles' : `${rewardsDuplicateTitle.rows.length} duplicate active reward title(s)`
    );

    // ═══════════════════════════════════════════════════
    // CATEGORY 7: ATTENDANCE INTEGRITY
    // ═══════════════════════════════════════════════════

    const [
      attendanceFlightMismatch,
      bulkTotalMismatch,
      attendanceNoDate,
    ] = await Promise.all([
      query(`SELECT a.id, a.cadet_name, a.flight AS att_flight, c.flight AS cadet_flight FROM attendance a INNER JOIN cadets c ON LOWER(c.name) = LOWER(a.cadet_name) WHERE a.flight IS NOT NULL AND c.flight IS NOT NULL AND LOWER(a.flight) != LOWER(c.flight)`),
      query(`SELECT b.id, b.total_records AS expected, (SELECT COUNT(*)::int FROM attendance a WHERE a.bulk_id = b.id) AS actual FROM attendance_bulks b WHERE b.total_records IS NOT NULL AND b.total_records != (SELECT COUNT(*)::int FROM attendance a WHERE a.bulk_id = b.id)`),
      query(`SELECT COUNT(*)::int AS count FROM attendance WHERE date IS NULL`),
    ]);

    add('Attendance', 'Flight Matches Cadet',
      attendanceFlightMismatch.rows.length === 0 ? 'pass' : 'warning',
      attendanceFlightMismatch.rows.length === 0 ? 'All attendance flights match cadet\'s current flight' : `${attendanceFlightMismatch.rows.length} attendance record(s) with mismatched flight`,
      attendanceFlightMismatch.rows.length > 0 ? attendanceFlightMismatch.rows.slice(0, 5).map((r: any) => `${r.cadet_name}: att=${r.att_flight}, cadet=${r.cadet_flight}`).join('; ') : undefined
    );

    add('Attendance', 'Bulk Record Counts Match',
      bulkTotalMismatch.rows.length === 0 ? 'pass' : 'warning',
      bulkTotalMismatch.rows.length === 0 ? 'All bulk attendance record counts match actual records' : `${bulkTotalMismatch.rows.length} bulk event(s) with mismatched record counts`,
      bulkTotalMismatch.rows.length > 0 ? bulkTotalMismatch.rows.slice(0, 5).map((r: any) => `Bulk ${r.id.slice(0,8)}: expected ${r.expected}, found ${r.actual}`).join('; ') : undefined
    );

    const noDateAttCount = Number(attendanceNoDate.rows[0]?.count || 0);
    add('Attendance', 'All Attendance Has Dates',
      noDateAttCount === 0 ? 'pass' : 'fail',
      noDateAttCount === 0 ? 'All attendance records have dates' : `${noDateAttCount} attendance record(s) missing date`
    );

    // ═══════════════════════════════════════════════════
    // CATEGORY 8: DATABASE STATISTICS
    // ═══════════════════════════════════════════════════

    const [
      totalCadets,
      totalPoints,
      totalAttendance,
      totalBulks,
      totalRewards,
      totalUsers,
      totalTickets,
      totalSuggestions,
      pointsSum,
      flightDistribution,
      roleDistribution,
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM cadets`),
      query(`SELECT COUNT(*)::int AS count FROM points`),
      query(`SELECT COUNT(*)::int AS count FROM attendance`),
      query(`SELECT COUNT(*)::int AS count FROM attendance_bulks`),
      query(`SELECT COUNT(*)::int AS count FROM rewards`).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM app_users`).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM tickets`).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM reward_suggestions`).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COALESCE(SUM(points), 0)::int AS total FROM points`),
      query(`SELECT flight, COUNT(*)::int AS count FROM cadets GROUP BY flight ORDER BY flight`),
      query(`SELECT role, COUNT(*)::int AS count FROM app_users GROUP BY role ORDER BY role`).catch(() => ({ rows: [] })),
    ]);

    const cadetCount = Number(totalCadets.rows[0]?.count || 0);
    const pointCount = Number(totalPoints.rows[0]?.count || 0);
    const attCount = Number(totalAttendance.rows[0]?.count || 0);
    const bulkCount = Number(totalBulks.rows[0]?.count || 0);
    const rewardCount = Number(totalRewards.rows[0]?.count || 0);
    const userCount = Number(totalUsers.rows[0]?.count || 0);
    const ticketCount = Number(totalTickets.rows[0]?.count || 0);
    const suggestionCount = Number(totalSuggestions.rows[0]?.count || 0);
    const pointTotal = Number(pointsSum.rows[0]?.total || 0);

    add('Statistics', 'Record Counts',
      'pass', 
      `Cadets: ${cadetCount} | Points: ${pointCount} (${pointTotal} total) | Attendance: ${attCount} | Bulks: ${bulkCount} | Rewards: ${rewardCount} | Users: ${userCount} | Tickets: ${ticketCount} | Suggestions: ${suggestionCount}`
    );

    add('Statistics', 'Flights Distribution',
      'pass',
      flightDistribution.rows.map((r: any) => `${r.flight || '(none)'}: ${r.count}`).join(' | ') || 'No cadets'
    );

    add('Statistics', 'Roles Distribution',
      'pass',
      roleDistribution.rows.map((r: any) => `${r.role}: ${r.count}`).join(' | ') || 'No users'
    );

    add('Statistics', 'Data Populated',
      cadetCount > 0 ? 'pass' : 'warning',
      cadetCount > 0 ? 'Database has cadet records' : 'No cadets in database — system has no data'
    );

    // ═══════════════════════════════════════════════════
    // DEPLOYMENT STATUS
    // ═══════════════════════════════════════════════════
    try {
      const deployStatusPath = path.join(projectRoot, 'data', 'deploy-status.json');
      if (fs.existsSync(deployStatusPath)) {
        const deployData = JSON.parse(fs.readFileSync(deployStatusPath, 'utf-8'));
        if (deployData.status === 'failed') {
          add('Deployment', 'Last Auto-Deploy',
            'fail',
            `Deploy failed at ${deployData.timestamp || 'unknown time'}: ${deployData.message || 'Unknown error'}`,
            deployData.error || undefined
          );
        } else if (deployData.status === 'success') {
          add('Deployment', 'Last Auto-Deploy',
            'pass',
            `Deploy succeeded at ${deployData.timestamp || 'unknown time'}${deployData.commit ? ` (${deployData.commit})` : ''}`
          );
        } else {
          add('Deployment', 'Last Auto-Deploy',
            'warning',
            `Deploy status unknown: ${deployData.message || 'No details'}`
          );
        }
      } else {
        add('Deployment', 'Last Auto-Deploy',
          'warning',
          'No deploy status file found. Auto-deploy may not have run yet.'
        );
      }
    } catch (e) {
      add('Deployment', 'Last Auto-Deploy',
        'warning',
        'Could not read deploy status file'
      );
    }

    // ═══════════════════════════════════════════════════
    // BUILD SUMMARY
    // ═══════════════════════════════════════════════════

    const summary = {
      totalChecks: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      warnings: checks.filter(c => c.status === 'warning').length,
      failed: checks.filter(c => c.status === 'fail').length,
      categories: Array.from(new Set(checks.map(c => c.category))),
    };

    res.json({ checks, summary });
  } catch (error) {
    console.error('Error in GET /api/integrity-check:', error);
    res.status(500).json({ error: 'Failed to run integrity checks' });
  }
});
// File upload endpoint — requires authentication, validates MIME type and size
app.post('/api/upload', uploadLimiter, requireAuth, (req: AuthRequest, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const fileUrl = `/uploads/${req.file.filename}`;
      console.log(`[Upload] ${req.user?.name || 'unknown'} uploaded ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`);
      res.json({ 
        success: true, 
        file: {
          url: fileUrl,
          filename: req.file.filename,
          originalname: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype
        }
      });
    } catch (error) {
      console.error('Error handling file upload:', error);
      res.status(500).json({ error: 'Failed to handle file upload' });
    }
  });
});

// Alias for ticket evidence uploads (matches client-side api.uploadTicketEvidence)
app.post('/api/upload/ticket-evidence', uploadLimiter, requireAuth, (req: AuthRequest, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const fileUrl = `/uploads/${req.file.filename}`;
      console.log(`[Upload/Evidence] ${req.user?.name || 'unknown'} uploaded ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`);
      res.json({ 
        success: true, 
        file: {
          url: fileUrl,
          filename: req.file.filename,
          originalname: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype
        }
      });
    } catch (error) {
      console.error('Error handling file upload:', error);
      res.status(500).json({ error: 'Failed to handle file upload' });
    }
  });
});

// ========== REWARD SUGGESTIONS & VOTING ENDPOINTS ==========

// Ensure rewards schema has winner_name, status, and suggestion tables
let rewardsSchemaInitPromise: Promise<void> | null = null;
async function ensureRewardsSchema() {
  if (!rewardsSchemaInitPromise) {
    rewardsSchemaInitPromise = (async () => {
      console.log('[ensureRewardsSchema] Initialising rewards schema...');
      await query('ALTER TABLE rewards ADD COLUMN IF NOT EXISTS winner_name VARCHAR');
      await query('ALTER TABLE rewards ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT \'active\'');
      await query(`CREATE TABLE IF NOT EXISTS reward_suggestions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR NOT NULL,
        description TEXT,
        suggested_by VARCHAR NOT NULL,
        suggested_by_name VARCHAR,
        suggested_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR DEFAULT 'pending',
        reviewed_at TIMESTAMP,
        reviewed_by VARCHAR
      )`);
      await query(`CREATE TABLE IF NOT EXISTS reward_votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        suggestion_id UUID NOT NULL REFERENCES reward_suggestions(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(suggestion_id, user_id)
      )`);
      // Drop the old vote_count column if it exists (we compute it via subquery now)
      await query('ALTER TABLE reward_suggestions DROP COLUMN IF EXISTS vote_count').catch(() => {});
      // Add status column if it doesn't exist
      await query('ALTER TABLE reward_suggestions ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT \'pending\'').catch(() => {});
      await query('ALTER TABLE reward_suggestions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP').catch(() => {});
      await query('ALTER TABLE reward_suggestions ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR').catch(() => {});
      await query('CREATE INDEX IF NOT EXISTS idx_reward_votes_suggestion_id ON reward_votes (suggestion_id)');
      await query('CREATE INDEX IF NOT EXISTS idx_reward_votes_user_id ON reward_votes (user_id)');
      await query('CREATE INDEX IF NOT EXISTS idx_reward_suggestions_status ON reward_suggestions (status)');
      console.log('[ensureRewardsSchema] Schema ready.');
    })().catch((error) => {
      console.error('[ensureRewardsSchema] Failed:', error?.message || error);
      rewardsSchemaInitPromise = null;
      throw error;
    });
  }
  return rewardsSchemaInitPromise;
}

// GET /api/reward-suggestions - List all suggestions ordered by votes
// SNOs see pending (for moderation) + approved suggestions; others only see approved
app.get('/api/reward-suggestions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureRewardsSchema();
    const isSNO = req.user?.role === 'snco';
    
    // SNOs see all statuses, others only see approved
    const statusFilter = isSNO 
      ? `(rs.status = 'pending' OR rs.status = 'approved')`
      : `rs.status = 'approved'`;
    
    const result = await query(
      `SELECT rs.id, rs.title, rs.description, rs.suggested_by, rs.suggested_by_name, rs.suggested_at,
        rs.status, rs.reviewed_at, rs.reviewed_by,
        (SELECT COUNT(*)::int FROM reward_votes rv WHERE rv.suggestion_id = rs.id) AS computed_vote_count
       FROM reward_suggestions rs
       WHERE ${statusFilter}
       ORDER BY CASE WHEN rs.status = 'pending' THEN 0 ELSE 1 END,
                computed_vote_count DESC, rs.suggested_at DESC`
    );
    
    // Also get the current user's votes
    const userId = req.user?.id || '';
    const votesResult = await query(
      'SELECT suggestion_id FROM reward_votes WHERE user_id = $1',
      [userId]
    );
    const userVotes = new Set(votesResult.rows.map((r: any) => r.suggestion_id));
    const suggestions = result.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      suggestedBy: row.suggested_by,
      suggestedByName: row.suggested_by_name,
      suggestedAt: row.suggested_at,
      status: row.status,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
      voteCount: Number(row.computed_vote_count || 0),
      hasVoted: userVotes.has(row.id),
    }));
    res.json(suggestions);
  } catch (error: any) {
    console.error('Error in GET /api/reward-suggestions:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// POST /api/reward-suggestions - Create a suggestion (any role except snco)
app.post('/api/reward-suggestions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureRewardsSchema();
    if (req.user?.role === 'snco') {
      return res.status(403).json({ error: 'Flight Point Leads create rewards directly, not suggestions.' });
    }
    const { title, description } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const id = crypto.randomUUID();
    const result = await query(
      `INSERT INTO reward_suggestions (id, title, description, suggested_by, suggested_by_name, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [id, String(title).trim(), String(description || '').trim() || null, req.user?.id || 'unknown', req.user?.name || 'Unknown']
    );
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      title: row.title,
      description: row.description,
      suggestedBy: row.suggested_by,
      suggestedByName: row.suggested_by_name,
      suggestedAt: row.suggested_at,
      status: row.status,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
      voteCount: 0,
      hasVoted: false,
    });
  } catch (error) {
    console.error('Error in POST /api/reward-suggestions:', error);
    res.status(500).json({ error: 'Failed to create suggestion' });
  }
});

// POST /api/reward-suggestions/:id/vote - Toggle vote on a suggestion
app.post('/api/reward-suggestions/:id/vote', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureRewardsSchema();
    const userId = req.user?.id || '';
    const suggestionId = req.params.id;
    // Check suggestion exists
    const check = await query('SELECT id FROM reward_suggestions WHERE id = $1', [suggestionId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    // Check if already voted
    const existing = await query(
      'SELECT id FROM reward_votes WHERE suggestion_id = $1 AND user_id = $2',
      [suggestionId, userId]
    );
    if (existing.rows.length > 0) {
      // Remove vote
      await query('DELETE FROM reward_votes WHERE suggestion_id = $1 AND user_id = $2', [suggestionId, userId]);
      const countResult = await query('SELECT COUNT(*)::int AS count FROM reward_votes WHERE suggestion_id = $1', [suggestionId]);
      res.json({ voted: false, voteCount: Number(countResult.rows[0].count) });
    } else {
      // Add vote
      await query(
        'INSERT INTO reward_votes (id, suggestion_id, user_id) VALUES ($1, $2, $3)',
        [crypto.randomUUID(), suggestionId, userId]
      );
      const countResult = await query('SELECT COUNT(*)::int AS count FROM reward_votes WHERE suggestion_id = $1', [suggestionId]);
      res.json({ voted: true, voteCount: Number(countResult.rows[0].count) });
    }
  } catch (error) {
    console.error('Error in POST /api/reward-suggestions/:id/vote:', error);
    res.status(500).json({ error: 'Failed to toggle vote' });
  }
});

// DELETE /api/reward-suggestions/:id - Delete a suggestion (snco or the person who suggested it)
app.delete('/api/reward-suggestions/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const suggestionId = req.params.id;
    const suggestion = await query('SELECT * FROM reward_suggestions WHERE id = $1', [suggestionId]);
    if (suggestion.rows.length === 0) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    // Allow delete by the suggester or by snco
    if (suggestion.rows[0].suggested_by !== req.user?.id && req.user?.role !== 'snco') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await query('DELETE FROM reward_suggestions WHERE id = $1', [suggestionId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/reward-suggestions/:id:', error);
    res.status(500).json({ error: 'Failed to delete suggestion' });
  }
});

// PUT /api/reward-suggestions/:id/moderate - Accept or reject a suggestion (SNCO only)
app.put('/api/reward-suggestions/:id/moderate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Only SNOs can moderate
    if (req.user?.role !== 'snco') {
      return res.status(403).json({ error: 'Only Flight Point Leads can moderate suggestions' });
    }
    
    await ensureRewardsSchema();
    const suggestionId = req.params.id;
    const { action } = req.body || {};
    
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
    }
    
    // Check suggestion exists
    const suggestion = await query('SELECT * FROM reward_suggestions WHERE id = $1', [suggestionId]);
    if (suggestion.rows.length === 0) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    
    if (action === 'reject') {
      // Delete the suggestion
      await query('DELETE FROM reward_suggestions WHERE id = $1', [suggestionId]);
      res.json({ success: true, action: 'rejected' });
    } else {
      // Approve the suggestion
      const result = await query(
        `UPDATE reward_suggestions 
         SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1 
         WHERE id = $2 
         RETURNING *`,
        [req.user?.id || 'unknown', suggestionId]
      );
      
      const row = result.rows[0];
      res.json({
        success: true,
        action: 'approved',
        suggestion: {
          id: row.id,
          title: row.title,
          description: row.description,
          suggestedBy: row.suggested_by,
          suggestedByName: row.suggested_by_name,
          suggestedAt: row.suggested_at,
          status: row.status,
          reviewedAt: row.reviewed_at,
          reviewedBy: row.reviewed_by,
        }
      });
    }
  } catch (error) {
    console.error('Error in PUT /api/reward-suggestions/:id/moderate:', error);
    res.status(500).json({ error: 'Failed to moderate suggestion' });
  }
});

// Notifications stub endpoint (no notifications table yet — return empty)
app.get('/api/notifications', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json([]);
});
app.post('/api/notifications/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json({ success: true });
});
app.post('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json({ success: true });
});

// My Points endpoint — returns points for a specific cadet
app.get('/api/my-points', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const cadetName = req.query.name as string;
    if (!cadetName) {
      return res.status(400).json({ error: 'Missing name parameter' });
    }
    const result = await query(
      'SELECT * FROM points WHERE LOWER(cadet_name) = LOWER($1) ORDER BY date DESC NULLS LAST',
      [cadetName]
    );
    const points = result.rows.map((row: any) => ({
      id: row.id,
      cadetName: row.cadet_name,
      date: row.date,
      flight: row.flight,
      reason: row.reason,
      points: row.points,
      type: row.type,
      givenBy: row.given_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    const total = points.reduce((sum: number, p: any) => sum + (Number(p.points) || 0), 0);
    res.json({ points, total });
  } catch (error) {
    console.error('Error in GET /api/my-points:', error);
    res.status(500).json({ error: 'Failed to fetch points' });
  }
});

// ========== TICKETS ENDPOINTS ==========

async function ensureTicketsSchema() {
  // Create table if it doesn't exist (safe on any DB)
  await query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR NOT NULL,
      description TEXT,
      created_by VARCHAR NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `).catch(() => {});
  // Add all optional columns safely
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_to VARCHAR`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'open'`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS priority VARCHAR DEFAULT 'medium'`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS type VARCHAR DEFAULT 'Request'`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS category VARCHAR DEFAULT 'Other'`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS evidence_url TEXT`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb`).catch(() => {});
  await query(`UPDATE tickets SET comments = '[]'::jsonb WHERE comments IS NULL`).catch(() => {});
}

function mapTicket(row: any) {
  return {
    id: row.id,
    type: row.type || 'Request',
    category: row.category || row.title || 'Other',
    description: row.description,
    evidenceUrl: row.evidence_url,
    createdBy: row.created_by,
    status: row.status || 'open',
    priority: row.priority || 'medium',
    comments: Array.isArray(row.comments) ? row.comments : (row.comments ? JSON.parse(row.comments) : []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/tickets/debug — check table schema
app.get('/api/tickets/debug', requireAuth, requireRole(['snco', 'admin']), async (req, res) => {
  try {
    const cols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tickets' ORDER BY ordinal_position`);
    const count = await query('SELECT COUNT(*) FROM tickets');
    res.json({ columns: cols.rows, rowCount: count.rows[0].count });
  } catch (e: any) {
    res.json({ error: e.message });
  }
});

// GET /api/tickets — admins see all, cadets see their own
app.get('/api/tickets', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureTicketsSchema();
    const user = req.user!;
    let result;
    if (user.role === 'cadet') {
      result = await query('SELECT * FROM tickets WHERE created_by = $1 ORDER BY created_at DESC', [user.name]);
    } else {
      result = await query('SELECT * FROM tickets ORDER BY created_at DESC');
    }
    res.json({ tickets: result.rows.map(mapTicket) });
  } catch (error: any) {
    console.error('Error in GET /api/tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets', detail: error?.message });
  }
});

// POST /api/tickets — any authenticated user can submit
app.post('/api/tickets', ticketLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureTicketsSchema();
    const user = req.user!;
    const { type, category, description, evidenceUrl } = req.body || {};
    if (!description?.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }
    const id = crypto.randomUUID();
    // Insert using only the guaranteed base columns (everything else has a DEFAULT or is nullable)
    await query(
      `INSERT INTO tickets (id, title, description, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [id, category || type || 'Ticket', description.trim(), user.name]
    );
    // Update extended columns (added by ensureTicketsSchema)
    await query(`UPDATE tickets SET type = $1, category = $2, evidence_url = $3 WHERE id = $4`,
      [type || 'Request', category || 'Other', evidenceUrl || null, id]
    ).catch(() => {});
    await query(`UPDATE tickets SET comments = '[]'::jsonb WHERE id = $1 AND comments IS NULL`, [id]).catch(() => {});
    const result = await query('SELECT * FROM tickets WHERE id = $1', [id]);
    res.status(201).json({ ticket: mapTicket(result.rows[0]) });
  } catch (error: any) {
    console.error('Error in POST /api/tickets:', error);
    res.status(500).json({ error: 'Failed to create ticket', detail: error?.message });
  }
});

// PUT /api/tickets/:id — approve / reject / comment
app.put('/api/tickets/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureTicketsSchema();
    const user = req.user!;
    const { id } = req.params;
    const { action, points, reason, comment } = req.body || {};

    const existing = await query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    const ticket = existing.rows[0];

    if (action === 'approve') {
      if (!['snco', 'admin', 'staff'].includes(user.role)) {
        return res.status(403).json({ error: 'Only admins can approve tickets' });
      }
      // Award points to the cadet if points provided
      if (points && Number(points) > 0) {
        const cadetResult = await query('SELECT flight FROM cadets WHERE LOWER(name) = LOWER($1) LIMIT 1', [ticket.created_by]);
        const flight = cadetResult.rows[0]?.flight || '';
        const pointId = crypto.randomUUID();
        await query(
          `INSERT INTO points (id, cadet_name, date, flight, reason, points, type, given_by, created_at, updated_at)
           VALUES ($1, $2, NOW(), $3, $4, $5, 'ticket', $6, NOW(), NOW())`,
          [pointId, ticket.created_by, flight, reason || `Ticket: ${ticket.category}`, Number(points), user.name]
        );
      }
      // Add a system comment
      const existingComments = Array.isArray(ticket.comments) ? ticket.comments : (ticket.comments ? JSON.parse(ticket.comments) : []);
      const newComment = { id: crypto.randomUUID(), author: user.name, text: `✅ Approved${points ? ` — ${points} points awarded` : ''}${reason ? `: ${reason}` : ''}`, createdAt: new Date().toISOString() };
      const updatedComments = [...existingComments, newComment];
      await query(
        `UPDATE tickets SET status = 'approved', updated_at = NOW(), comments = $1 WHERE id = $2`,
        [JSON.stringify(updatedComments), id]
      );
    } else if (action === 'reject') {
      if (!['snco', 'admin', 'staff'].includes(user.role)) {
        return res.status(403).json({ error: 'Only admins can reject tickets' });
      }
      const existingComments = Array.isArray(ticket.comments) ? ticket.comments : (ticket.comments ? JSON.parse(ticket.comments) : []);
      const newComment = { id: crypto.randomUUID(), author: user.name, text: `❌ Rejected${reason ? `: ${reason}` : ''}`, createdAt: new Date().toISOString() };
      const updatedComments = [...existingComments, newComment];
      await query(
        `UPDATE tickets SET status = 'rejected', updated_at = NOW(), comments = $1 WHERE id = $2`,
        [JSON.stringify(updatedComments), id]
      );
    } else if (action === 'comment') {
      if (!comment?.trim()) return res.status(400).json({ error: 'Comment text required' });
      const existingComments = Array.isArray(ticket.comments) ? ticket.comments : (ticket.comments ? JSON.parse(ticket.comments) : []);
      const newComment = { id: crypto.randomUUID(), author: user.name, text: comment.trim(), createdAt: new Date().toISOString() };
      const updatedComments = [...existingComments, newComment];
      await query(
        `UPDATE tickets SET updated_at = NOW(), comments = $1 WHERE id = $2`,
        [JSON.stringify(updatedComments), id]
      );
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const updated = await query('SELECT * FROM tickets WHERE id = $1', [id]);
    res.json({ ticket: mapTicket(updated.rows[0]) });
  } catch (error) {
    console.error('Error in PUT /api/tickets/:id:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// DELETE /api/tickets/:id
app.delete('/api/tickets/:id', requireAuth, requireRole(['snco', 'admin']), async (req, res) => {
  try {
    await query('DELETE FROM tickets WHERE id = $1', [req.params.id]);
    res.json({ message: 'Ticket deleted' });
  } catch (error) {
    console.error('Error in DELETE /api/tickets/:id:', error);
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
});

// ========== DEPLOY STATUS ENDPOINT ==========
const DEPLOY_STATUS_FILE = path.join(projectRoot, 'data', 'deploy-status.json');

app.get('/api/deploy-status', requireAuth, requireRole(['snco', 'admin']), async (req: AuthRequest, res: Response) => {
  try {
    if (!fs.existsSync(DEPLOY_STATUS_FILE)) {
      return res.json({ status: 'unknown', message: 'No deploy status file found. Auto-deploy may not have run yet.' });
    }
    const raw = fs.readFileSync(DEPLOY_STATUS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return res.json(data);
  } catch (error) {
    console.error('Error reading deploy status:', error);
    return res.json({ status: 'unknown', message: 'Failed to read deploy status' });
  }
});

// ========== ALERT TEST ENDPOINT (admin/snco only) ==========
// Triggers a controlled 500 error so email alert + server error log can be validated.
app.post('/api/test-error-alert', requireAuth, requireRole(['snco', 'admin']), (req: AuthRequest, _res: Response, next: NextFunction) => {
  const err: any = new Error(`Intentional test error triggered by ${req.user?.name || 'unknown'}`);
  err.statusCode = 500;
  next(err);
});

// SPA fallback - must be AFTER all API routes (static file serving moved above CORS middleware)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Global error handler - catches 5xx errors and notifies admins
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  const errorMsg = err.message || 'Internal Server Error';
  const stack = err.stack || '';
  const timestamp = new Date().toISOString();
  const endpoint = (req as any).path || req.url;
  const method = req.method;
  const user = (req as AuthRequest).user?.name || 'unknown';

  const errorLogEntry = [
    `[${timestamp}] ${statusCode} ${method} ${endpoint}`,
    `User: ${user}`,
    `IP: ${req.ip}`,
    `Error: ${errorMsg}`,
    `Stack:`,
    stack || '(no stack)',
    '---',
  ].join('\n');
  try {
    fs.appendFileSync(SERVER_ERROR_LOG_FILE, `${errorLogEntry}\n`);
  } catch (logErr) {
    console.error('Failed to write server error log file:', logErr);
  }

  // Log the error
  console.error(`[${timestamp}] Error (${statusCode}):`, errorMsg);
  if (stack) {
    console.error('Stack:', stack.split('\n').slice(0, 5).join('\n'));
  }

  // Send email alert for 5xx errors (skip CORS errors — caused by client/proxy behaviour, not server bugs)
  const isCorsError = errorMsg.includes('CORS') || errorMsg.includes('cross-origin');
  if (statusCode >= 500 && isEmailConfigured() && !isCorsError) {
    const emailBody = `
Website Error Alert
===================
Timestamp: ${timestamp}
Status: ${statusCode}
Error: ${errorMsg}
Endpoint: ${method} ${endpoint}
User: ${user}
IP: ${req.ip}

Stack Trace:
${stack.split('\n').slice(0, 10).join('\n')}
    `.trim();

    sendAlertEmail(`[Flight Points] Website Error: ${statusCode} ${errorMsg}`, emailBody).catch(e => {
      console.error('Failed to send error alert email:', e);
    });
  }

  // Return error response (don't expose stack to client in production)
  const clientMsg = process.env.NODE_ENV === 'production' 
    ? 'Internal server error. Admins have been notified.'
    : errorMsg;
  
  res.status(statusCode).json({ error: clientMsg });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Security: helmet enabled, auth enforced on data endpoints, upload restrictions active');
  // Warm up role defaults cache
  loadRoleDefaults().catch((err) => console.error('Failed to load role defaults cache:', err));
});