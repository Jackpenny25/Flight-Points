import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Root test endpoint
app.get("/", (c) => {
  return c.json({ message: "Hono server is running", routes: ["health", "cadets", "points", "attendance"] });
});

// Catch-all for debugging
app.all("*", (c) => {
  return c.json({ error: "Route not found", path: c.req.path, method: c.req.method }, 404);
});

// Health check endpoint
app.get("/make-server-73a3871f/health", (c) => {
  return c.json({ status: "ok" });
});

// Get Supabase client with service role
function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

// Get Supabase client with anon key
function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  );
}

// Auth Routes
// Signup
app.post("/make-server-73a3871f/auth/signup", async (c) => {
  try {
    const { email, password, name, role } = await c.req.json();
    
    const supabase = getSupabaseAdmin();
    
    // Create user with metadata
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role: role || 'cadet' },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });
    
    if (error) {
      console.log('Error during signup:', error);
      return c.json({ error: error.message }, 400);
    }
    
    return c.json({ user: data.user });
  } catch (error) {
    console.log('Server error during signup:', error);
    return c.json({ error: 'Internal server error during signup' }, 500);
  }
});

// Middleware to verify user authentication
async function verifyAuth(c: any, next: any) {
  const accessToken = c.req.header('Authorization')?.split(' ')[1];
  
  if (!accessToken) {
    return c.json({ error: 'Unauthorized - no token provided' }, 401);
  }
  
  const supabase = getSupabaseAdmin();
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  
  if (error || !user) {
    console.log('Auth error:', error);
    return c.json({ error: 'Unauthorized - invalid token' }, 401);
  }
  
  // Attach user to context
  c.set('user', user);
  await next();
}

// Get current user info
app.get("/make-server-73a3871f/auth/me", verifyAuth, async (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// Cadet Routes
// Get all cadets
// Get all cadets (no auth required for read - allows all browsers to sync)
app.get("/make-server-73a3871f/cadets", async (c) => {
  try {
    const cadets = await kv.getByPrefix('cadet:');
    return c.json({ cadets });
  } catch (error) {
    console.log('Error fetching cadets:', error);
    return c.json({ error: 'Failed to fetch cadets' }, 500);
  }
});

// Public read-only cadets endpoint (no auth) - useful for clients that should be able
// to read the roster without signing in. This helps lightweight browsers share a
// canonical cadet list when they cannot provide an access token.
app.get("/make-server-73a3871f/public/cadets", async (c) => {
  try {
    const cadets = await kv.getByPrefix('cadet:');
    return c.json({ cadets });
  } catch (error) {
    console.log('Error fetching public cadets:', error);
    return c.json({ error: 'Failed to fetch cadets' }, 500);
  }
});

// Duplicate public route without the legacy prefix for simpler access
app.get("/public/cadets", async (c) => {
  try {
    const cadets = await kv.getByPrefix('cadet:');
    return c.json({ cadets });
  } catch (error) {
    console.log('Error fetching public cadets:', error);
    return c.json({ error: 'Failed to fetch cadets' }, 500);
  }
});

// Add cadet (staff/SNCO only)
app.post("/make-server-73a3871f/cadets", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const userRole = user.user_metadata?.role || 'cadet';
    
    if (userRole !== 'staff' && userRole !== 'snco') {
      return c.json({ error: 'Unauthorized - only staff/SNCO can add cadets' }, 403);
    }
    
    const { name, flight } = await c.req.json();

    if (!name || !flight) {
      return c.json({ error: 'Name and flight are required' }, 400);
    }

    const cadetId = crypto.randomUUID();
    const cadet = {
      id: cadetId,
      name,
      flight,
      createdAt: new Date().toISOString(),
    };
    
    await kv.set(`cadet:${cadetId}`, cadet);
    return c.json({ cadet });
  } catch (error) {
    console.log('Error adding cadet:', error);
    return c.json({ error: 'Failed to add cadet' }, 500);
  }
});

// Delete cadet (staff/SNCO only)
app.delete("/make-server-73a3871f/cadets/:id", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const userRole = user.user_metadata?.role || 'cadet';
    
    if (userRole !== 'staff' && userRole !== 'snco') {
      return c.json({ error: 'Unauthorized - only staff/SNCO can delete cadets' }, 403);
    }
    
    const cadetId = c.req.param('id');
    await kv.del(`cadet:${cadetId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting cadet:', error);
    return c.json({ error: 'Failed to delete cadet' }, 500);
  }
});

// Update cadet (staff/SNCO only) - allows editing name and flight
app.put("/make-server-73a3871f/cadets/:id", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const userRole = user.user_metadata?.role || 'cadet';

    if (userRole !== 'staff' && userRole !== 'snco') {
      return c.json({ error: 'Unauthorized - only staff/SNCO can update cadets' }, 403);
    }

    const cadetId = c.req.param('id');
    const { name, flight } = await c.req.json();

    const existing = await kv.getByPrefix(`cadet:${cadetId}`);
    const cadet = existing.find((c: any) => c.id === cadetId);

    if (!cadet) {
      return c.json({ error: 'Cadet not found' }, 404);
    }

    const updated = {
      ...cadet,
      name: name !== undefined ? name : cadet.name,
      flight: flight !== undefined ? flight : cadet.flight,
      updatedAt: new Date().toISOString(),
      updatedBy: user.user_metadata?.name || user.email,
    };

    await kv.set(`cadet:${cadetId}`, updated);

    return c.json({ cadet: updated });
  } catch (error) {
    console.log('Error updating cadet:', error);
    return c.json({ error: 'Failed to update cadet' }, 500);
  }
});

// Points Routes
// Get all points
app.get("/make-server-73a3871f/points", verifyAuth, async (c) => {
  try {
    const points = await kv.getByPrefix('point:');
    // Sort by date, newest first
    points.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return c.json({ points });
  } catch (error) {
    console.log('Error fetching points:', error);
    return c.json({ error: 'Failed to fetch points' }, 500);
  }
});

// Add points (point givers and staff/SNCO)
app.post("/make-server-73a3871f/points", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const userRole = user.user_metadata?.role || 'cadet';
    
    if (userRole !== 'staff' && userRole !== 'snco' && userRole !== 'pointgiver') {
      return c.json({ error: 'Unauthorized - only point givers and staff can add points' }, 403);
    }
    
    const { cadetName, date, flight, reason, points: pointValue, type } = await c.req.json();
    
    if (!cadetName || !flight || !reason || pointValue === undefined) {
      return c.json({ error: 'Cadet name, flight, reason, and points are required' }, 400);
    }
    
    const pointId = crypto.randomUUID();
    const point = {
      id: pointId,
      cadetName,
      date: date || new Date().toISOString(),
      flight,
      reason,
      points: pointValue,
      type: type || 'general', // general, attendance, good, bad
      givenBy: user.user_metadata?.name || user.email,
      createdAt: new Date().toISOString(),
    };
    
    await kv.set(`point:${pointId}`, point);
    return c.json({ point });
  } catch (error) {
    console.log('Error adding points:', error);
    return c.json({ error: 'Failed to add points' }, 500);
  }
});

// Delete point (staff/SNCO only)
app.delete("/make-server-73a3871f/points/:id", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const userRole = user.user_metadata?.role || 'cadet';
    
    if (userRole !== 'staff' && userRole !== 'snco') {
      return c.json({ error: 'Unauthorized - only staff/SNCO can delete points' }, 403);
    }
    
    const pointId = c.req.param('id');
    await kv.del(`point:${pointId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting point:', error);
    return c.json({ error: 'Failed to delete point' }, 500);
  }
});

// Update point (staff/SNCO only)
app.put("/make-server-73a3871f/points/:id", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const userRole = user.user_metadata?.role || 'cadet';
    
    if (userRole !== 'staff' && userRole !== 'snco') {
      return c.json({ error: 'Unauthorized - only staff/SNCO can update points' }, 403);
    }
    
    const pointId = c.req.param('id');
    const { points: pointValue, reason } = await c.req.json();
    
    // Get existing point
    const existingPoints = await kv.getByPrefix(`point:${pointId}`);
    const existingPoint = existingPoints.find((p: any) => p.id === pointId);
    
    if (!existingPoint) {
      return c.json({ error: 'Point not found' }, 404);
    }
    
    // Update the point
    const updatedPoint = {
      ...existingPoint,
      points: pointValue !== undefined ? pointValue : existingPoint.points,
      reason: reason !== undefined ? reason : existingPoint.reason,
      updatedAt: new Date().toISOString(),
      updatedBy: user.user_metadata?.name || user.email,
    };
    
    await kv.set(`point:${pointId}`, updatedPoint);
    
    return c.json({ point: updatedPoint });
  } catch (error) {
    console.log('Error updating point:', error);
    return c.json({ error: 'Failed to update point' }, 500);
  }
});

// Leaderboard Routes
// Get leaderboards
app.get("/make-server-73a3871f/leaderboards", verifyAuth, async (c) => {
  try {
    const points = await kv.getByPrefix('point:');
    
    // Calculate cadet totals
    const cadetTotals: { [key: string]: number } = {};
    points.forEach((point: any) => {
      if (!cadetTotals[point.cadetName]) {
        cadetTotals[point.cadetName] = 0;
      }
      cadetTotals[point.cadetName] += point.points;
    });
    
    // Calculate flight totals
    const flightTotals: { [key: string]: number } = {};
    points.forEach((point: any) => {
      if (!flightTotals[point.flight]) {
        flightTotals[point.flight] = 0;
      }
      flightTotals[point.flight] += point.points;
    });
    
    // Sort cadets by points
    const cadetLeaderboard = Object.entries(cadetTotals)
      .map(([name, points]) => ({ name, points }))
      .sort((a, b) => b.points - a.points);
    
    // Sort flights by points
    const flightLeaderboard = Object.entries(flightTotals)
      .map(([flight, points]) => ({ flight, points }))
      .sort((a, b) => b.points - a.points);
    
    // Get recent non-attendance points
    const recentPoints = points
      .filter((point: any) => point.type !== 'attendance')
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);
    
    return c.json({
      cadetLeaderboard,
      flightLeaderboard,
      recentPoints,
      winningCadet: cadetLeaderboard[0] || null,
      winningFlight: flightLeaderboard[0] || null,
    });
  } catch (error) {
    console.log('Error fetching leaderboards:', error);
    return c.json({ error: 'Failed to fetch leaderboards' }, 500);
  }
});

// Attendance Routes
// Get all attendance records
app.get("/make-server-73a3871f/attendance", verifyAuth, async (c) => {
  try {
    const attendance = await kv.getByPrefix('attendance:');
    // Sort by date, newest first
    attendance.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return c.json({ attendance });
  } catch (error) {
    console.log('Error fetching attendance:', error);
    return c.json({ error: 'Failed to fetch attendance' }, 500);
  }
});

// Add attendance (point givers and staff/SNCO)
app.post("/make-server-73a3871f/attendance", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const userRole = user.user_metadata?.role || 'cadet';
    
    if (userRole !== 'staff' && userRole !== 'snco' && userRole !== 'pointgiver') {
      return c.json({ error: 'Unauthorized - only point givers and staff can record attendance' }, 403);
    }
    
    const { cadetName, date, flight, status, bulkId } = await c.req.json();
    
    if (!cadetName || !flight || !status) {
      return c.json({ error: 'Cadet name, flight, and status are required' }, 400);
    }
    
    const attendanceId = crypto.randomUUID();
    const attendanceRecord = {
      id: attendanceId,
      cadetName,
      date: date || new Date().toISOString(),
      flight,
      status, // 'present', 'authorised_absence', 'absent'
      submittedBy: user.user_metadata?.name || user.email,
      bulkId: bulkId || null,
      createdAt: new Date().toISOString(),
    };
    
    await kv.set(`attendance:${attendanceId}`, attendanceRecord);
    
    // Optionally award attendance points if present
    if (status === 'present') {
      const pointId = crypto.randomUUID();
      const point = {
        id: pointId,
        cadetName,
        date: date || new Date().toISOString(),
        flight,
        reason: 'Attendance - Present Correctly Dressed',
        points: 1,
        type: 'attendance',
        givenBy: user.user_metadata?.name || user.email,
        createdAt: new Date().toISOString(),
      };
      await kv.set(`point:${pointId}`, point);
    }
    
    return c.json({ attendance: attendanceRecord });
  } catch (error) {
    console.log('Error adding attendance:', error);
    return c.json({ error: 'Failed to add attendance' }, 500);
  }
});

// Add bulk attendance endpoint that writes a bulk summary and attendance records atomically
app.post("/make-server-73a3871f/attendance/bulk", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const userRole = user.user_metadata?.role || 'cadet';
    
    if (userRole !== 'staff' && userRole !== 'snco' && userRole !== 'pointgiver') {
      return c.json({ error: 'Unauthorized - only point givers and staff can record attendance' }, 403);
    }

    const { entries, date, flightFilter, bulkId } = await c.req.json();
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return c.json({ error: 'Entries are required' }, 400);
    }

    const id = bulkId || crypto.randomUUID();
    let presentCount = 0;
    let total = entries.length;

    for (const e of entries) {
      const attendanceId = crypto.randomUUID();
      const attendanceRecord = {
        id: attendanceId,
        cadetName: e.cadetName,
        date: e.date || date || new Date().toISOString(),
        flight: e.flight,
        status: e.status,
        submittedBy: user.user_metadata?.name || user.email,
        bulkId: id,
        createdAt: new Date().toISOString(),
      };
      await kv.set(`attendance:${attendanceId}`, attendanceRecord);

      if (e.status === 'present') {
        presentCount++;
        const pointId = crypto.randomUUID();
        const point = {
          id: pointId,
          cadetName: e.cadetName,
          date: e.date || date || new Date().toISOString(),
          flight: e.flight,
          reason: 'Attendance - Present Correctly Dressed',
          points: 1,
          type: 'attendance',
          givenBy: user.user_metadata?.name || user.email,
          createdAt: new Date().toISOString(),
        };
        await kv.set(`point:${pointId}`, point);
      }
    }

    const bulkRecord = {
      id,
      date: date || new Date().toISOString(),
      flightFilter: flightFilter || 'all',
      totalRecords: total,
      totalPresent: presentCount,
      submittedBy: user.user_metadata?.name || user.email,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`attendance-bulk:${id}`, bulkRecord);

    return c.json({ bulk: bulkRecord });
  } catch (error) {
    console.log('Error adding bulk attendance:', error);
    return c.json({ error: 'Failed to add bulk attendance' }, 500);
  }
});

// Delete attendance (staff/SNCO only)
app.delete("/make-server-73a3871f/attendance/:id", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const userRole = user.user_metadata?.role || 'cadet';
    
    if (userRole !== 'staff' && userRole !== 'snco') {
      return c.json({ error: 'Unauthorized - only staff/SNCO can delete attendance' }, 403);
    }
    
    const attendanceId = c.req.param('id');
    await kv.del(`attendance:${attendanceId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting attendance:', error);
    return c.json({ error: 'Failed to delete attendance' }, 500);
  }
});

// Get attendance reports and statistics
app.get("/make-server-73a3871f/attendance/reports", verifyAuth, async (c) => {
  try {
    const attendance = await kv.getByPrefix('attendance:');

// Get bulk attendance overview
app.get("/make-server-73a3871f/attendance/bulk", verifyAuth, async (c) => {
  try {
    const bulks = await kv.getByPrefix('attendance-bulk:');
    bulks.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return c.json({ bulks });
  } catch (error) {
    console.log('Error fetching bulk attendance:', error);
    return c.json({ error: 'Failed to fetch bulk attendance' }, 500);
  }
});

// Delete a bulk attendance session and associated attendance/points
app.delete("/make-server-73a3871f/attendance/bulk/:id", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const userRole = user.user_metadata?.role || 'cadet';

    if (userRole !== 'staff' && userRole !== 'snco') {
      return c.json({ error: 'Unauthorized - only staff/SNCO can delete bulk attendance' }, 403);
    }

    const id = c.req.param('id');

    // Find and delete attendance records with this bulkId
    const attendance = await kv.getByPrefix('attendance:');
    const toDelete = attendance.filter((a: any) => a.bulkId === id);
    for (const rec of toDelete) {
      await kv.del(`attendance:${rec.id}`);
    }

    // Delete associated attendance points (match by cadetName and date)
    const points = await kv.getByPrefix('point:');
    let deletedPoints = 0;
    for (const p of points) {
      if (p.type === 'attendance' && toDelete.find((t: any) => t.cadetName === p.cadetName && t.date === p.date)) {
        await kv.del(`point:${p.id}`);
        deletedPoints++;
      }
    }

    // Delete the bulk summary
    await kv.del(`attendance-bulk:${id}`);

    return c.json({ success: true, deletedAttendanceCount: toDelete.length, deletedPointsCount: deletedPoints });
  } catch (error) {
    console.log('Error deleting bulk attendance:', error);
    return c.json({ error: 'Failed to delete bulk attendance' }, 500);
  }
});
    
    // Calculate summary per cadet
    const cadetSummary: { [key: string]: any } = {};
    
    attendance.forEach((record: any) => {
      if (!cadetSummary[record.cadetName]) {
        cadetSummary[record.cadetName] = {
          cadetName: record.cadetName,
          flight: record.flight,
          totalPresent: 0,
          totalAuthorisedAbsence: 0,
          totalAbsent: 0,
          totalRecords: 0,
        };
      }
      
      cadetSummary[record.cadetName].totalRecords++;
      
      switch (record.status) {
        case 'present':
          cadetSummary[record.cadetName].totalPresent++;
          break;
        case 'authorised_absence':
          cadetSummary[record.cadetName].totalAuthorisedAbsence++;
          break;
        case 'absent':
          cadetSummary[record.cadetName].totalAbsent++;
          break;
      }
    });
    
    // Calculate attendance rate for each cadet
    const summary = Object.values(cadetSummary).map((cadet: any) => ({
      ...cadet,
      attendanceRate: cadet.totalRecords > 0 
        ? Math.round((cadet.totalPresent / cadet.totalRecords) * 100)
        : 0,
    }));
    
    // Calculate overall statistics
    const stats = {
      totalPresent: summary.reduce((sum: number, c: any) => sum + c.totalPresent, 0),
      totalAuthorisedAbsence: summary.reduce((sum: number, c: any) => sum + c.totalAuthorisedAbsence, 0),
      totalAbsent: summary.reduce((sum: number, c: any) => sum + c.totalAbsent, 0),
      averageAttendanceRate: summary.length > 0
        ? Math.round(summary.reduce((sum: number, c: any) => sum + c.attendanceRate, 0) / summary.length)
        : 0,
    };
    
    return c.json({ summary, stats });
  } catch (error) {
    console.log('Error fetching attendance reports:', error);
    return c.json({ error: 'Failed to fetch attendance reports' }, 500);
  }
});

// Data Integrity Checks
app.get("/make-server-73a3871f/integrity-check", verifyAuth, async (c) => {
  try {
    const checks = [];
    const cadets = await kv.getByPrefix('cadet:');
    const points = await kv.getByPrefix('point:');
    const attendance = await kv.getByPrefix('attendance:');
    
    // Check 1: Verify all points reference valid cadets
    const cadetNames = new Set(cadets.map((c: any) => c.name.toLowerCase()));
    const invalidPoints = points.filter((p: any) => !cadetNames.has(p.cadetName.toLowerCase()));
    
    checks.push({
      name: 'Points Reference Valid Cadets',
      status: invalidPoints.length === 0 ? 'pass' : 'fail',
      message: invalidPoints.length === 0 
        ? `All ${points.length} point records reference valid cadets`
        : `${invalidPoints.length} point record(s) reference non-existent cadets`,
      details: invalidPoints.length > 0 
        ? `Invalid cadet names: ${invalidPoints.map((p: any) => p.cadetName).slice(0, 5).join(', ')}${invalidPoints.length > 5 ? '...' : ''}`
        : undefined,
    });
    
    // Check 2: Verify all attendance references valid cadets
    const invalidAttendance = attendance.filter((a: any) => !cadetNames.has(a.cadetName.toLowerCase()));
    
    checks.push({
      name: 'Attendance References Valid Cadets',
      status: invalidAttendance.length === 0 ? 'pass' : 'fail',
      message: invalidAttendance.length === 0 
        ? `All ${attendance.length} attendance records reference valid cadets`
        : `${invalidAttendance.length} attendance record(s) reference non-existent cadets`,
      details: invalidAttendance.length > 0 
        ? `Invalid cadet names: ${invalidAttendance.map((a: any) => a.cadetName).slice(0, 5).join(', ')}${invalidAttendance.length > 5 ? '...' : ''}`
        : undefined,
    });
    
    // Check 3: Verify points totals consistency
    const totalPointsGiven = points.reduce((sum: number, p: any) => sum + p.points, 0);
    const cadetTotals: { [key: string]: number } = {};
    points.forEach((p: any) => {
      if (!cadetTotals[p.cadetName]) cadetTotals[p.cadetName] = 0;
      cadetTotals[p.cadetName] += p.points;
    });
    const totalPointsCalculated = Object.values(cadetTotals).reduce((sum: number, pts: any) => sum + pts, 0);
    
    checks.push({
      name: 'Points Total Consistency',
      status: totalPointsGiven === totalPointsCalculated ? 'pass' : 'fail',
      message: totalPointsGiven === totalPointsCalculated 
        ? `Points totals match: ${totalPointsGiven} points`
        : `Points mismatch detected`,
      details: totalPointsGiven !== totalPointsCalculated
        ? `Total given: ${totalPointsGiven}, Total calculated: ${totalPointsCalculated}`
        : undefined,
    });
    
    // Check 4: Check for duplicate cadet names
    const cadetNameCounts: { [key: string]: number } = {};
    cadets.forEach((c: any) => {
      const nameLower = c.name.toLowerCase();
      cadetNameCounts[nameLower] = (cadetNameCounts[nameLower] || 0) + 1;
    });
    const duplicates = Object.entries(cadetNameCounts).filter(([_, count]) => count > 1);
    
    checks.push({
      name: 'Unique Cadet Names',
      status: duplicates.length === 0 ? 'pass' : 'warning',
      message: duplicates.length === 0 
        ? `All ${cadets.length} cadet names are unique`
        : `${duplicates.length} duplicate cadet name(s) found`,
      details: duplicates.length > 0 
        ? `Duplicates: ${duplicates.map(([name, count]) => `${name} (${count}x)`).join(', ')}`
        : undefined,
    });
    
    // Check 5: Check for orphaned attendance points
    const attendanceCadets = new Set(attendance.map((a: any) => `${a.cadetName}:${a.date}`));
    const attendancePoints = points.filter((p: any) => p.type === 'attendance');
    const orphanedPoints = attendancePoints.filter((p: any) => {
      const key = `${p.cadetName}:${p.date}`;
      return !attendanceCadets.has(key);
    });
    
    checks.push({
      name: 'Attendance Points Have Records',
      status: orphanedPoints.length === 0 ? 'pass' : 'warning',
      message: orphanedPoints.length === 0 
        ? `All ${attendancePoints.length} attendance points have corresponding records`
        : `${orphanedPoints.length} attendance point(s) without records`,
      details: orphanedPoints.length > 0 
        ? `These may be legacy points or records that were deleted`
        : undefined,
    });
    
    // Check 6: Verify all cadets belong to a flight
    const cadetsWithoutFlight = cadets.filter((c: any) => !c.flight || c.flight.trim() === '');
    
    checks.push({
      name: 'All Cadets Assigned to Flight',
      status: cadetsWithoutFlight.length === 0 ? 'pass' : 'fail',
      message: cadetsWithoutFlight.length === 0 
        ? `All cadets are assigned to a flight`
        : `${cadetsWithoutFlight.length} cadet(s) not assigned to a flight`,
      details: cadetsWithoutFlight.length > 0 
        ? `Cadets: ${cadetsWithoutFlight.map((c: any) => c.name).slice(0, 5).join(', ')}${cadetsWithoutFlight.length > 5 ? '...' : ''}`
        : undefined,
    });
    
    // Calculate summary
    const summary = {
      totalChecks: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      warnings: checks.filter(c => c.status === 'warning').length,
      failed: checks.filter(c => c.status === 'fail').length,
    };
    
    return c.json({ checks, summary });
  } catch (error) {
    console.log('Error performing integrity checks:', error);
    return c.json({ error: 'Failed to perform integrity checks' }, 500);
  }
});

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }
    
    // Clear all cadets (emergency reset)
    if (pathname.includes('/cadets/clear-all') && req.method === 'POST') {
      try {
        // Use Supabase directly to get all cadet keys and delete them
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );
        
        const { data, error } = await supabase
          .from('kv_store_73a3871f')
          .select('key')
          .like('key', 'cadet:%');
        
        if (error) throw error;
        
        const keys = (data || []).map(d => d.key);
        if (keys.length > 0) {
          const { error: delError } = await supabase
            .from('kv_store_73a3871f')
            .delete()
            .in('key', keys);
          
          if (delError) throw delError;
        }
        
        return new Response(JSON.stringify({ success: true, deleted: keys.length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        console.error('Clear error:', e);
        return new Response(JSON.stringify({ error: 'Failed to clear cadets', details: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }
    
    // Handle points endpoint directly (bypass Hono)
    if (pathname.includes('/points')) {
      if (req.method === 'GET') {
        try {
          const points = await kv.getByPrefix('point:');
          const sorted = (points || []).sort((a, b) => {
            const aDate = new Date(a.date || 0).getTime();
            const bDate = new Date(b.date || 0).getTime();
            return bDate - aDate;
          });
          return new Response(JSON.stringify(sorted.slice(0, 50)), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (e) {
          console.error('Points list error:', e);
          return new Response(JSON.stringify({ error: 'Failed to fetch points', details: String(e) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }
      
      if (req.method === 'POST') {
        try {
          const body = await req.json();
          const { cadetName, points, type, reason, flight } = body;
          
          const id = crypto.randomUUID();
          const entry = {
            id,
            cadetName,
            points: Number(points),
            type: type || 'general',
            reason: reason || '',
            flight: flight || 'unknown',
            date: new Date().toISOString(),
          };
          
          await kv.set(`point:${id}`, entry);
          
          return new Response(JSON.stringify(entry), {
            status: 201,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (e) {
          console.error('Points error:', e);
          return new Response(JSON.stringify({ error: 'Failed to add points', details: String(e) }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }
    }

    // Handle leaderboards directly (bypass Hono)
    if (pathname.includes('/leaderboards') && req.method === 'GET') {
      try {
        const points = await kv.getByPrefix('point:');
        const cadetTotals: Record<string, number> = {};
        const flightTotals: Record<string, number> = {};

        points.forEach((point: any) => {
          cadetTotals[point.cadetName] = (cadetTotals[point.cadetName] || 0) + point.points;
          flightTotals[point.flight] = (flightTotals[point.flight] || 0) + point.points;
        });

        const cadetLeaderboard = Object.entries(cadetTotals)
          .map(([name, pts]) => ({ name, points: pts }))
          .sort((a, b) => b.points - a.points);

        const flightLeaderboard = Object.entries(flightTotals)
          .map(([flight, pts]) => ({ flight, points: pts }))
          .sort((a, b) => b.points - a.points);

        const recentPoints = points
          .filter((p: any) => p.type !== 'attendance')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 20);

        return new Response(JSON.stringify({
          cadetLeaderboard,
          flightLeaderboard,
          recentPoints,
          winningCadet: cadetLeaderboard[0] || null,
          winningFlight: flightLeaderboard[0] || null,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        console.error('Leaderboards error:', e);
        return new Response(JSON.stringify({ error: 'Failed to fetch leaderboards', details: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }
    
    // Handle cadets endpoint directly (bypass Hono for now)
    if (pathname.includes('/cadets')) {
      if (req.method === 'GET') {
        const cadets = await kv.getByPrefix('cadet:');
        return new Response(JSON.stringify({ cadets }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else if (req.method === 'POST') {
        try {
          const body = await req.json();
          const { name, flight } = body;
          const id = crypto.randomUUID();
          const cadet = {
            id,
            name,
            flight: flight || 'Unassigned',
            createdAt: new Date().toISOString(),
          };
          await kv.set(`cadet:${id}`, cadet);
          return new Response(JSON.stringify(cadet), {
            status: 201,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: 'Failed to create cadet' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      } else if (req.method === 'DELETE') {
        // Handle DELETE /cadets/:id
        const deleteMatch = pathname.match(/\/cadets\/([^/]+)$/);
        console.log('DELETE request to', pathname, 'match:', deleteMatch ? deleteMatch[1] : 'no match');
        if (deleteMatch) {
          const id = deleteMatch[1];
          try {
            console.log('Deleting cadet:', id);
            await kv.del(`cadet:${id}`);
            console.log('Successfully deleted:', id);
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          } catch (e) {
            console.log('Delete error:', e);
            return new Response(JSON.stringify({ error: 'Failed to delete cadet', details: String(e) }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
        } else {
          console.log('No match for DELETE pattern');
          return new Response(JSON.stringify({ error: 'Invalid delete request' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      } else if (req.method === 'PUT') {
        // Handle PUT /cadets/:id
        const putMatch = pathname.match(/\/cadets\/([^/]+)$/);
        if (putMatch) {
          const id = putMatch[1];
          try {
            const body = await req.json();
            const { name, flight } = body;
            const existing = await kv.get(`cadet:${id}`);
            if (!existing) {
              return new Response(JSON.stringify({ error: 'Cadet not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              });
            }
            const updated = { ...existing, name, flight };
            await kv.set(`cadet:${id}`, updated);
            return new Response(JSON.stringify(updated), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          } catch (e) {
            return new Response(JSON.stringify({ error: 'Failed to update cadet' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
        }
      }
    }
    
    // Fall back to Hono for other routes
    const response = await app.fetch(req);
    return response;
  } catch (error) {
    console.error('Error in Deno.serve:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});