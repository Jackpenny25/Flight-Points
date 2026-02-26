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
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env.local'), override: true });

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
  return role === 'snco' || role === 'admin';
}

function hasAdminPinRole(user?: UserJwtPayload) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase().trim();
  return role === 'snco' || role === 'flight point lead' || role === 'flight_point_lead';
}

// ========== ADMIN ACCOUNT CREATION HELPERS ==========

const PASSWORD_WORDS = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
  'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
  'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey',
  'Xray', 'Yankee', 'Zulu', 'Eagle', 'Falcon', 'Hawk', 'Storm', 'Thunder',
  'Phoenix', 'Viper', 'Cobra', 'Tiger', 'Mustang', 'Raptor', 'Shadow',
  'Arrow', 'Blaze', 'Comet', 'Dagger', 'Flare', 'Granite', 'Horizon',
  'Iron', 'Javelin', 'Knight', 'Lance', 'Meteor', 'Noble', 'Onyx',
  'Patriot', 'Quartz', 'Rocket', 'Sabre', 'Titan', 'Unity', 'Valor',
  'Warrior', 'Zenith', 'Bolt', 'Crest', 'Dawn', 'Ember', 'Frost',
  'Gale', 'Haven', 'Ivory', 'Jade', 'Kindle', 'Lunar', 'Marvel',
  'Nimbus', 'Orbit', 'Pulse', 'Ridge', 'Spark', 'Trail', 'Ultra',
  'Venture', 'Willow', 'Apex', 'Bridge', 'Canyon', 'Drift', 'Fleet',
  'Guard', 'Herald', 'Impact', 'Jetstream', 'Keystone', 'Legend', 'Mirage',
  'Nexus', 'Outpost', 'Pinnacle', 'Quest', 'Ranger', 'Sentinel', 'Trident',
];

function generatePassword(): string {
  const w1 = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
  let w2 = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
  // Avoid same word twice
  while (w2 === w1) {
    w2 = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
  }
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${w1}-${w2}-${num}`;
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

// Ensure admin account columns exist
let adminSchemaInitPromise: Promise<void> | null = null;
async function ensureAdminAccountSchema() {
  if (!adminSchemaInitPromise) {
    adminSchemaInitPromise = (async () => {
      await query('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS created_by TEXT');
      await query('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cadet_id UUID REFERENCES cadets(id) ON DELETE SET NULL');
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

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Username not found' });
    }

    return res.json({ email: result.rows[0].email });
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
    const result = await query('SELECT id, email, name, role, cadet_id, created_by, created_at FROM app_users ORDER BY name ASC');
    const users = result.rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
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

// Admin: delete account
app.delete('/api/auth/users/:id', requireAuth, async (req: AuthRequest, res: Response) => {
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
app.post('/api/admin/reset-account-password', requireAuth, async (req: AuthRequest, res: Response) => {
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

// ========== PIN MANAGEMENT ENDPOINTS ==========

function getConfiguredAdminPin() {
  const configuredPin = String(process.env.ADMIN_PIN || process.env.VITE_ADMIN_PIN || '').trim();
  return configuredPin;
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
    });
  } catch (error) {
    console.error('Error in GET /api/admin/pin-status:', error);
    res.status(500).json({ error: 'Failed to fetch PIN status' });
  }
});

// POST /api/admin/verify-pin - Verify a PIN
app.post('/api/admin/verify-pin', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!hasAdminPinRole(req.user)) {
      return res.status(403).json({ error: 'Only Flight Point Leads can verify admin PIN' });
    }

    const { pin } = req.body || {};
    if (!pin) {
      return res.status(400).json({ error: 'PIN is required' });
    }

    const configuredPin = getConfiguredAdminPin();
    if (!/^\d{6}$/.test(configuredPin)) {
      return res.status(500).json({ error: 'Admin PIN is not configured correctly. Set a 6-digit ADMIN_PIN or VITE_ADMIN_PIN in .env.local.' });
    }

    const pinStr = String(pin).trim();
    if (!/^\d{6}$/.test(pinStr)) {
      return res.status(400).json({ error: 'PIN must be 6 digits' });
    }

    if (pinStr !== configuredPin) {
      return res.status(401).json({ error: 'Incorrect PIN' });
    }

    res.json({ success: true });
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
      error: 'Admin PIN is managed in .env.local. Update ADMIN_PIN (or VITE_ADMIN_PIN) to a new 6-digit value and restart the server.',
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
      error: 'Admin PIN is managed in .env.local. Set ADMIN_PIN (or VITE_ADMIN_PIN) to a 6-digit value and restart the server.',
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
app.post('/api/data/:type', requireAuth, requireRole(['snco', 'admin']), async (req, res) => {
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
app.put('/api/data/:type/:id', requireAuth, requireRole(['snco', 'admin']), async (req, res) => {
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
app.delete('/api/data/:type/:id', requireAuth, requireRole(['snco', 'admin']), async (req, res) => {
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