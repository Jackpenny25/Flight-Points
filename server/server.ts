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

    // Create JWT
    const token = jwt.sign({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      cadetId: cadetId || undefined,
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
    const { role, name, username } = req.body || {};
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

    const user = result.rows[0];
    return res.json({
      user: {
        ...user,
        username: user.email.includes('@') ? user.email.split('@')[0] : user.email,
      },
    });
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

    // Ensure rewards schema columns exist before reading
    if (normalized === 'rewards') {
      await ensureRewardsSchema();
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
app.put('/api/data/:type/:id', requireAuth, requireRole(['snco', 'admin']), async (req, res) => {
  try {
    const normalized = normalizeType(req.params.type);
    if (!normalized) {
      return res.status(400).json({ error: 'Unsupported data type' });
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

// ========== DEDICATED POINTS ENDPOINT (allows pointgiver/staff/snco) ==========
app.post('/api/points', requireAuth, async (req: AuthRequest, res: Response) => {
  const userRole = (req.user?.role || '').toLowerCase();
  const allowedRoles = ['snco', 'admin', 'staff', 'pointgiver'];
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({ error: 'You do not have permission to give points' });
  }

  try {
    const { cadetName, flight, points: pointsValue, reason, type, date, givenBy } = req.body || {};
    if (!cadetName || pointsValue === undefined || !reason) {
      return res.status(400).json({ error: 'cadetName, points, and reason are required' });
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
        parseFloat(pointsValue),
        type || 'general',
        givenBy || req.user?.name || 'unknown',
      ]
    );

    const row = result.rows[0];
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

    add('Duplicates', 'Possible Duplicate Points',
      duplicatePointRecords.rows.length === 0 ? 'pass' : 'warning',
      duplicatePointRecords.rows.length === 0 ? 'No exact duplicate point records found' : `${duplicatePointRecords.rows.length} set(s) of identical point records detected`,
      duplicatePointRecords.rows.length > 0 ? duplicatePointRecords.rows.slice(0, 5).map((r: any) => `${r.cadet_name} on ${r.date ? new Date(r.date).toLocaleDateString('en-GB') : 'unknown'} (×${r.count})`).join(', ') : undefined
    );

    add('Duplicates', 'Single Attendance Per Day',
      duplicateAttendanceSameDay.rows.length === 0 ? 'pass' : 'warning',
      duplicateAttendanceSameDay.rows.length === 0 ? 'No duplicate attendance records for same cadet/date' : `${duplicateAttendanceSameDay.rows.length} cadet(s) with multiple attendance records on same date`,
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
      cadetsWithoutAccount,
      usersInvalidRole,
      usersNoPassword,
      usersInvalidEmail,
      multipleAccountsSameCadet,
      ncoWithNonCadetAccount,
    ] = await Promise.all([
      query(`SELECT u.id, u.name, u.role FROM app_users u WHERE u.cadet_id IS NULL AND u.role NOT IN ('snco', 'admin', 'staff')`).catch(() => ({ rows: [] })),
      query(`SELECT c.id, c.name, c.flight FROM cadets c WHERE c.flight != 'hq' AND c.is_nco = false AND NOT EXISTS (SELECT 1 FROM app_users u WHERE u.cadet_id = c.id)`).catch(() => ({ rows: [] })),
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

    add('Accounts', 'All Cadets Have Accounts',
      cadetsWithoutAccount.rows.length === 0 ? 'pass' : 'warning',
      cadetsWithoutAccount.rows.length === 0 ? 'All eligible cadets have user accounts' : `${cadetsWithoutAccount.rows.length} cadet(s) without accounts`,
      cadetsWithoutAccount.rows.length > 0 ? cadetsWithoutAccount.rows.slice(0, 8).map((r: any) => r.name).join(', ') : undefined
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
    // BUILD SUMMARY
    // ═══════════════════════════════════════════════════

    const summary = {
      totalChecks: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      warnings: checks.filter(c => c.status === 'warning').length,
      failed: checks.filter(c => c.status === 'fail').length,
      categories: [...new Set(checks.map(c => c.category))],
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
        suggested_at TIMESTAMP DEFAULT NOW()
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
      await query('CREATE INDEX IF NOT EXISTS idx_reward_votes_suggestion_id ON reward_votes (suggestion_id)');
      await query('CREATE INDEX IF NOT EXISTS idx_reward_votes_user_id ON reward_votes (user_id)');
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
app.get('/api/reward-suggestions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureRewardsSchema();
    const result = await query(
      `SELECT rs.id, rs.title, rs.description, rs.suggested_by, rs.suggested_by_name, rs.suggested_at,
        (SELECT COUNT(*)::int FROM reward_votes rv WHERE rv.suggestion_id = rs.id) AS computed_vote_count
       FROM reward_suggestions rs
       ORDER BY computed_vote_count DESC, rs.suggested_at DESC`
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
      `INSERT INTO reward_suggestions (id, title, description, suggested_by, suggested_by_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
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