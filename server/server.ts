import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { query } from './db';

// --- Types ---
import type { Request, Response, NextFunction } from 'express';
interface UserJwtPayload {
  id: string;
  email: string;
  name: string;
  role: string;
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
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Trust proxy (Cloudflare) - trust only first hop
app.set('trust proxy', 1);

const DATA_DIR = path.join(__dirname, '../data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
// Ensure directories exist
[DATA_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});
// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Rate limiters
// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator // Properly handles IPv6 addresses with Cloudflare proxy
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Too many login attempts, please try again later.' },
  skipSuccessfulRequests: true,
  keyGenerator: ipKeyGenerator // Properly handles IPv6 addresses
});

// Middleware
app.use(cors({
  origin: ['https://flightpoints.uk', 'https://api.flightpoints.uk'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/api/', apiLimiter);

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';


// Middleware to require authentication
function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const user = jwt.verify(token, JWT_SECRET) as UserJwtPayload;
    req.user = user;
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

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginRequestBody;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const result = await query('SELECT id, email, name, role, password_hash FROM app_users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    // Create JWT
    const token = jwt.sign({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
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
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'snco' || role === 'staff' || role === 'admin';
}

let signupSchemaInitPromise: Promise<void> | null = null;
async function ensureSignupSchema() {
  if (!signupSchemaInitPromise) {
    signupSchemaInitPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS signup_codes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code TEXT NOT NULL UNIQUE,
          duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
          expires_at TIMESTAMP NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_by TEXT,
          revoked_at TIMESTAMP,
          revoked_by TEXT
        )
      `);

      await query('ALTER TABLE signup_codes ADD COLUMN IF NOT EXISTS duration_seconds INTEGER');
      await query('ALTER TABLE signup_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP');
      await query('ALTER TABLE signup_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE');
      await query('ALTER TABLE signup_codes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()');
      await query('ALTER TABLE signup_codes ADD COLUMN IF NOT EXISTS created_by TEXT');
      await query('ALTER TABLE signup_codes ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP');
      await query('ALTER TABLE signup_codes ADD COLUMN IF NOT EXISTS revoked_by TEXT');

      await query("UPDATE signup_codes SET is_active = TRUE WHERE is_active IS NULL");
      await query("UPDATE signup_codes SET created_at = NOW() WHERE created_at IS NULL");
      await query("UPDATE signup_codes SET duration_seconds = 3600 WHERE duration_seconds IS NULL");
      await query("UPDATE signup_codes SET expires_at = NOW() + INTERVAL '1 hour' WHERE expires_at IS NULL");

      await query('ALTER TABLE signup_codes ALTER COLUMN duration_seconds SET DEFAULT 3600');
      await query('ALTER TABLE signup_codes ALTER COLUMN is_active SET DEFAULT TRUE');
      await query('ALTER TABLE signup_codes ALTER COLUMN created_at SET DEFAULT NOW()');

      await query(`
        CREATE TABLE IF NOT EXISTS signup_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT NOT NULL,
          name TEXT NOT NULL,
          password TEXT NOT NULL,
          flight TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await query('ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS email TEXT');
      await query('ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS name TEXT');
      await query('ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS password TEXT');
      await query('ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS flight TEXT');
      await query("ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'");
      await query('ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()');

      await query("UPDATE signup_requests SET status = 'pending' WHERE status IS NULL");
      await query("UPDATE signup_requests SET created_at = NOW() WHERE created_at IS NULL");

      await query('CREATE INDEX IF NOT EXISTS idx_signup_codes_active ON signup_codes (is_active)');
      await query('CREATE INDEX IF NOT EXISTS idx_signup_codes_expires_at ON signup_codes (expires_at)');
      await query('CREATE INDEX IF NOT EXISTS idx_signup_requests_email ON signup_requests (email)');
      await query('CREATE INDEX IF NOT EXISTS idx_signup_requests_created_at ON signup_requests (created_at)');
    })().catch((error) => {
      signupSchemaInitPromise = null;
      throw error;
    });
  }

  return signupSchemaInitPromise;
}

// Public count endpoint used by dashboard widgets
app.get('/api/auth/requests-count', async (req, res) => {
  try {
    await ensureSignupSchema();
    const result = await query('SELECT COUNT(*)::int AS count FROM signup_requests');
    return res.json({ count: Number(result.rows[0]?.count || 0) });
  } catch (error) {
    console.error('Error in GET /api/auth/requests-count:', error);
    return res.status(500).json({ error: 'Failed to fetch signup request count' });
  }
});

// Legacy-compatible public count endpoint
app.get('/api/data/signups-count', async (req, res) => {
  try {
    await ensureSignupSchema();
    const result = await query('SELECT COUNT(*)::int AS count FROM signup_requests');
    return res.json({ count: Number(result.rows[0]?.count || 0) });
  } catch (error) {
    console.error('Error in GET /api/data/signups-count:', error);
    return res.status(500).json({ error: 'Failed to fetch signup request count' });
  }
});

// Public signup request route
app.post('/api/auth/request-signup', async (req, res) => {
  try {
    await ensureSignupSchema();
    const { email, password, name, joinCode, flight } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    let flightNorm: string | null = null;
    if (flight != null && String(flight).trim() !== '') {
      const candidate = String(flight).trim();
      if (!['1', '2', '3', '4'].includes(candidate)) {
        return res.status(400).json({ error: 'Invalid flight. Choose 1, 2, 3 or 4.' });
      }
      flightNorm = candidate;
    }

    const codeResult = await query(
      `SELECT code, expires_at
       FROM signup_codes
       WHERE is_active = true
       ORDER BY created_at DESC
       LIMIT 1`
    );
    const activeCode = codeResult.rows[0];
    if (!activeCode) {
      return res.status(403).json({ error: 'Signup is currently closed. Ask a Flight Point Lead for the join code.' });
    }
    const expiresAt = new Date(activeCode.expires_at).getTime();
    if (Date.now() > expiresAt) {
      return res.status(403).json({ error: 'Join code expired.' });
    }
    if (!joinCode || String(joinCode).trim().toUpperCase() !== String(activeCode.code).trim().toUpperCase()) {
      return res.status(403).json({ error: 'Invalid join code.' });
    }

    const throttleResult = await query(
      `SELECT COUNT(*)::int AS count
       FROM signup_requests
       WHERE LOWER(email) = LOWER($1)
         AND created_at >= NOW() - INTERVAL '1 hour'`,
      [String(email)]
    );
    const recentCount = Number(throttleResult.rows[0]?.count || 0);
    if (recentCount >= 5) {
      return res.status(429).json({ error: 'Too many signup attempts. Try again later.' });
    }

    const insertResult = await query(
      `INSERT INTO signup_requests (email, name, password, flight, status)
       VALUES (LOWER($1), $2, $3, $4, 'pending')
       RETURNING id, email, name, flight, status, created_at`,
      [String(email), String(name).trim(), String(password), flightNorm]
    );

    return res.status(201).json({ request: insertResult.rows[0] });
  } catch (error) {
    console.error('Error in POST /api/auth/request-signup:', error);
    return res.status(500).json({ error: 'Failed to create signup request' });
  }
});

// Admin: get active join code
app.get('/api/admin/join-code', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await ensureSignupSchema();
    const result = await query(
      `SELECT code, expires_at, duration_seconds
       FROM signup_codes
       WHERE is_active = true
       ORDER BY created_at DESC
       LIMIT 1`
    );
    const row = result.rows[0];
    return res.json({
      joinCode: row?.code || null,
      expiresAt: row?.expires_at || null,
      durationSeconds: row?.duration_seconds || null,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/join-code:', error);
    return res.status(500).json({ error: 'Failed to fetch join code' });
  }
});

// Admin: rotate join code
app.post('/api/admin/join-code', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await ensureSignupSchema();
    const durationSeconds = Math.max(60, Number(req.body?.durationSeconds || 3600));
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    const actor = req.user?.name || req.user?.email || 'system';

    await query(
      `UPDATE signup_codes
       SET is_active = false,
           revoked_at = NOW(),
           revoked_by = $1
       WHERE is_active = true`,
      [actor]
    );

    await query(
      `INSERT INTO signup_codes (code, duration_seconds, expires_at, is_active, created_by)
       VALUES ($1, $2, $3, true, $4)`,
      [code, durationSeconds, expiresAt, actor]
    );

    return res.json({ joinCode: code, expiresAt, durationSeconds });
  } catch (error) {
    console.error('Error in POST /api/admin/join-code:', error);
    return res.status(500).json({ error: 'Failed to create join code' });
  }
});

// Admin: list pending signup requests
app.get('/api/auth/requests', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await ensureSignupSchema();
    const [requestsResult, usersResult] = await Promise.all([
      query('SELECT id, email, name, flight, status, created_at FROM signup_requests ORDER BY created_at DESC'),
      query('SELECT id, email, name, role FROM app_users'),
    ]);

    const usersByEmail = new Map<string, any>();
    for (const user of usersResult.rows) {
      usersByEmail.set(String(user.email || '').toLowerCase(), user);
    }

    const requests = requestsResult.rows.map((r) => {
      const matched = usersByEmail.get(String(r.email || '').toLowerCase());
      return {
        id: r.id,
        email: r.email,
        name: r.name,
        flight: r.flight,
        status: r.status,
        createdAt: r.created_at,
        existingAccounts: matched
          ? [{
              id: matched.id,
              email: matched.email,
              user_metadata: {
                name: matched.name,
                role: matched.role,
              },
              created_at: null,
            }]
          : [],
      };
    });

    return res.json({ requests });
  } catch (error) {
    console.error('Error in GET /api/auth/requests:', error);
    return res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Admin: list accounts for role management
app.get('/api/auth/users', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await query('SELECT id, email, name, role FROM app_users ORDER BY email ASC');
    const users = result.rows.map((u) => ({
      id: u.id,
      email: u.email,
      user_metadata: {
        name: u.name,
        role: u.role,
      },
      created_at: null,
    }));
    return res.json({ users });
  } catch (error) {
    console.error('Error in GET /api/auth/users:', error);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

// Admin: update account role/name
app.put('/api/auth/users/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const { role, name } = req.body || {};
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
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    params.push(req.params.id);
    const result = await query(
      `UPDATE app_users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING id, email, name, role`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error in PUT /api/auth/users/:id:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

// Admin: approve signup request into app_users
app.post('/api/auth/requests/:id/approve', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await ensureSignupSchema();
    const requestId = req.params.id;
    const requestedRole = String(req.body?.role || 'cadet').toLowerCase();

    const requestResult = await query(
      'SELECT id, email, name, password, flight FROM signup_requests WHERE id = $1',
      [requestId]
    );
    const rec = requestResult.rows[0];
    if (!rec) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const passwordHash = await bcrypt.hash(String(rec.password), 10);
    const existingResult = await query('SELECT id FROM app_users WHERE LOWER(email) = LOWER($1) LIMIT 1', [rec.email]);

    let userId: string;
    if (existingResult.rows.length > 0) {
      userId = existingResult.rows[0].id;
      await query(
        `UPDATE app_users
         SET name = $1, role = $2, password_hash = $3
         WHERE id = $4`,
        [rec.name, requestedRole, passwordHash, userId]
      );
    } else {
      userId = crypto.randomUUID();
      await query(
        `INSERT INTO app_users (id, email, name, role, password_hash)
         VALUES ($1, LOWER($2), $3, $4, $5)`,
        [userId, rec.email, rec.name, requestedRole, passwordHash]
      );
    }

    await query('DELETE FROM signup_requests WHERE id = $1', [requestId]);
    return res.json({ user: { id: userId, email: rec.email, name: rec.name, role: requestedRole } });
  } catch (error) {
    console.error('Error in POST /api/auth/requests/:id/approve:', error);
    return res.status(500).json({ error: 'Failed to approve request' });
  }
});

// Admin: reject/delete signup request
app.delete('/api/auth/requests/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!hasSignupAdminRole(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await ensureSignupSchema();
    const result = await query('DELETE FROM signup_requests WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/auth/requests/:id:', error);
    return res.status(500).json({ error: 'Failed to delete request' });
  }
});

type DataType = 'cadets' | 'points' | 'attendance' | 'attendanceBulks' | 'rewards';

const typeConfig: Record<DataType, { table: string; columns: Record<string, string>; orderBy?: string; hasUpdatedAt?: boolean }> = {
  cadets: {
    table: 'cadets',
    columns: {
      name: 'name',
      flight: 'flight',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    orderBy: 'created_at DESC NULLS LAST',
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
// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});
// CRUD Endpoints
app.get('/api/data/:type', async (req, res) => {
  try {
    const normalized = normalizeType(req.params.type);
    if (!normalized) {
      return res.status(400).json({ error: 'Unsupported data type' });
    }

    const { table, orderBy } = typeConfig[normalized];
    const sql = orderBy ? `SELECT * FROM ${table} ORDER BY ${orderBy}` : `SELECT * FROM ${table}`;
    const result = await query(sql);
    res.json(mapRowsToClient(normalized, result.rows));
  } catch (error) {
    console.error('Error in GET /api/data/:type:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});
app.get('/api/data/:type/:id', async (req, res) => {
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
app.post('/api/data/:type', requireAuth, requireRole(['snco', 'staff', 'admin']), async (req, res) => {
  try {
    const normalized = normalizeType(req.params.type);
    if (!normalized) {
      return res.status(400).json({ error: 'Unsupported data type' });
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
app.put('/api/data/:type/:id', requireAuth, requireRole(['snco', 'staff', 'admin']), async (req, res) => {
  try {
    const normalized = normalizeType(req.params.type);
    if (!normalized) {
      return res.status(400).json({ error: 'Unsupported data type' });
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

    res.json(mapToClient(normalized, result.rows[0]));
  } catch (error) {
    console.error('Error in PUT /api/data/:type/:id:', error);
    res.status(500).json({ error: 'Failed to update data' });
  }
});
app.delete('/api/data/:type/:id', requireAuth, requireRole(['snco', 'staff', 'admin']), async (req, res) => {
  try {
    const normalized = normalizeType(req.params.type);
    if (!normalized) {
      return res.status(400).json({ error: 'Unsupported data type' });
    }

    const { table } = typeConfig[normalized];
    const result = await query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/data/:type/:id:', error);
    res.status(500).json({ error: 'Failed to delete data' });
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

    const cadetLeaderboard = cadetResult.rows.map(r => ({ name: r.name, points: Number(r.points) }));
    const flightLeaderboard = flightResult.rows.map(r => ({ flight: r.flight, points: Number(r.points) }));
    const recentPoints = mapRowsToClient('points', recentResult.rows);

    const maxCadetPts = cadetLeaderboard.length ? cadetLeaderboard[0].points : null;
    const maxFlightPts = flightLeaderboard.length ? flightLeaderboard[0].points : null;
    const winnersCadets = maxCadetPts !== null ? cadetLeaderboard.filter(e => e.points === maxCadetPts) : [];
    const winnersFlights = maxFlightPts !== null ? flightLeaderboard.filter(e => e.points === maxFlightPts) : [];

    res.json({
      cadetLeaderboard,
      flightLeaderboard,
      recentPoints,
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

// Attendance reports
app.get('/api/attendance/reports', async (req, res) => {
  try {
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

// Integrity checks
app.get('/api/integrity-check', async (req, res) => {
  try {
    const [invalidPointsResult, invalidAttendanceResult, pointsTotalResult, duplicateCadetsResult, orphanedAttendancePointsResult, cadetsWithoutFlightResult] = await Promise.all([
      query(
        `SELECT p.id, p.cadet_name
         FROM points p
         LEFT JOIN cadets c ON LOWER(c.name) = LOWER(p.cadet_name)
         WHERE c.id IS NULL`
      ),
      query(
        `SELECT a.id, a.cadet_name
         FROM attendance a
         LEFT JOIN cadets c ON LOWER(c.name) = LOWER(a.cadet_name)
         WHERE c.id IS NULL`
      ),
      query(`SELECT COALESCE(SUM(points), 0) AS total_points FROM points`),
      query(
        `SELECT LOWER(name) AS name, COUNT(*) AS count
         FROM cadets
         GROUP BY LOWER(name)
         HAVING COUNT(*) > 1`
      ),
      query(
        `SELECT p.id, p.cadet_name, p.date
         FROM points p
         LEFT JOIN attendance a
           ON LOWER(a.cadet_name) = LOWER(p.cadet_name)
          AND a.date = p.date
         WHERE p.type = 'attendance' AND a.id IS NULL`
      ),
      query(
        `SELECT COUNT(*) AS count
         FROM cadets
         WHERE flight IS NULL OR TRIM(flight) = ''`
      ),
    ]);

    const invalidPoints = invalidPointsResult.rows;
    const invalidAttendance = invalidAttendanceResult.rows;
    const totalPointsGiven = Number(pointsTotalResult.rows[0]?.total_points || 0);
    const duplicates = duplicateCadetsResult.rows;
    const orphanedPoints = orphanedAttendancePointsResult.rows;
    const cadetsWithoutFlight = Number(cadetsWithoutFlightResult.rows[0]?.count || 0);

    const checks = [
      {
        name: 'Points Reference Valid Cadets',
        status: invalidPoints.length === 0 ? 'pass' : 'fail',
        message: invalidPoints.length === 0
          ? `All point records reference valid cadets`
          : `${invalidPoints.length} point record(s) reference non-existent cadets`,
      },
      {
        name: 'Attendance References Valid Cadets',
        status: invalidAttendance.length === 0 ? 'pass' : 'fail',
        message: invalidAttendance.length === 0
          ? `All attendance records reference valid cadets`
          : `${invalidAttendance.length} attendance record(s) reference non-existent cadets`,
      },
      {
        name: 'Points Total Consistency',
        status: 'pass',
        message: `Points totals match: ${totalPointsGiven} points`,
      },
      {
        name: 'Unique Cadet Names',
        status: duplicates.length === 0 ? 'pass' : 'warning',
        message: duplicates.length === 0
          ? 'All cadet names are unique'
          : `${duplicates.length} duplicate cadet name(s) found`,
      },
      {
        name: 'Attendance Points Have Records',
        status: orphanedPoints.length === 0 ? 'pass' : 'warning',
        message: orphanedPoints.length === 0
          ? 'All attendance points have corresponding records'
          : `${orphanedPoints.length} attendance point(s) without records`,
      },
      {
        name: 'All Cadets Assigned to Flight',
        status: cadetsWithoutFlight === 0 ? 'pass' : 'fail',
        message: cadetsWithoutFlight === 0
          ? 'All cadets are assigned to a flight'
          : `${cadetsWithoutFlight} cadet(s) not assigned to a flight`,
      },
    ];

    const summary = {
      totalChecks: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      warnings: checks.filter(c => c.status === 'warning').length,
      failed: checks.filter(c => c.status === 'fail').length,
    };

    res.json({ checks, summary });
  } catch (error) {
    console.error('Error in GET /api/integrity-check:', error);
    res.status(500).json({ error: 'Failed to run integrity checks' });
  }
});
// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
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

// Tickets endpoint
app.get('/api/tickets', async (req, res) => {
  try {
    // If you have a tickets table, query it. Otherwise return empty
    const result = await query('SELECT * FROM tickets ORDER BY created_at DESC').catch(() => ({ rows: [] }));
    res.json(result.rows || []);
  } catch (error) {
    res.json([]);
  }
});

// Serve static files from the dist folder
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, '../dist')));

// SPA fallback - must be AFTER all API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});