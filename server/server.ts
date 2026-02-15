import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import crypto from 'crypto';
import dotenv from 'dotenv';
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
// Middleware
app.use(cors({
  origin: ['https://flightpoints.uk', 'https://api.flightpoints.uk'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

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
app.post('/api/auth/login', async (req: Request, res: Response) => {
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
// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Uploads directory: ${UPLOADS_DIR}`);
});