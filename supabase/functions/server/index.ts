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

// Catch-all removed: defined routes must take precedence

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

// Ticket Routes
// Create a ticket (any authenticated user; primarily cadets)
app.post("/make-server-73a3871f/tickets", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const cadetId = user.user_metadata?.cadetId || null;
    const cadetName = user.user_metadata?.cadetName || user.user_metadata?.name || user.email;
    const flight = user.user_metadata?.flight || null;

    const { category, description, requestedPoints, evidenceUrl } = await c.req.json();
    if (!category || !description) {
      return c.json({ error: 'Category and description are required' }, 400);
    }

    const id = crypto.randomUUID();
    const ticket = {
      id,
      status: 'open',
      category,
      description,
      requestedPoints: requestedPoints !== undefined ? Number(requestedPoints) : null,
      evidenceUrl: evidenceUrl || null,
      cadetId,
      cadetName,
      flight,
      submittedBy: user.user_metadata?.name || user.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`ticket:${id}`, ticket);
    return c.json({ ticket });
  } catch (error) {
    console.log('Error creating ticket:', error);
    return c.json({ error: 'Failed to create ticket' }, 500);
  }
});

// List tickets - cadets see their own; SNCO/Staff see all
app.get("/make-server-73a3871f/tickets", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const role = (user.user_metadata?.role || 'cadet').toLowerCase();
    const myCadetId = user.user_metadata?.cadetId || null;
    const myCadetName = user.user_metadata?.cadetName || user.user_metadata?.name || user.email;

    const tickets = await kv.getByPrefix('ticket:');
    let results = tickets;
    if (role !== 'snco' && role !== 'staff') {
      results = tickets.filter((t: any) => (t.cadetId && myCadetId && t.cadetId === myCadetId) || (t.cadetName && myCadetName && t.cadetName === myCadetName) || (t.submittedBy === (user.user_metadata?.name || user.email)));
    }

    results.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return c.json({ tickets: results });
  } catch (error) {
    console.log('Error listing tickets:', error);
    return c.json({ error: 'Failed to fetch tickets' }, 500);
  }
});

// Update ticket: cadet can edit description while open; SNCO/Staff can approve/reject and optionally award points
app.put("/make-server-73a3871f/tickets/:id", verifyAuth, async (c) => {
  try {
    const user = c.get('user');
    const role = (user.user_metadata?.role || 'cadet').toLowerCase();
    const id = c.req.param('id');
    const existingArr = await kv.getByPrefix(`ticket:${id}`);
    const existing = existingArr.find((t: any) => t.id === id) || await kv.get(`ticket:${id}`);
    if (!existing) return c.json({ error: 'Ticket not found' }, 404);

    const body = await c.req.json();

    // Cadet edits (only while open)
    if (role !== 'snco' && role !== 'staff') {
      if (existing.status !== 'open') return c.json({ error: 'Ticket is not editable' }, 400);
      const myId = user.user_metadata?.cadetId || null;
      const myName = user.user_metadata?.cadetName || user.user_metadata?.name || user.email;
      const isOwner = (existing.cadetId && myId && existing.cadetId === myId) || (existing.cadetName && myName && existing.cadetName === myName) || (existing.submittedBy === (user.user_metadata?.name || user.email));
      if (!isOwner) return c.json({ error: 'Forbidden' }, 403);

      const updated = {
        ...existing,
        category: body.category ?? existing.category,
        description: body.description ?? existing.description,
        requestedPoints: body.requestedPoints !== undefined ? Number(body.requestedPoints) : existing.requestedPoints,
        evidenceUrl: body.evidenceUrl ?? existing.evidenceUrl,
        updatedAt: new Date().toISOString(),
      };
      await kv.set(`ticket:${id}`, updated);
      return c.json({ ticket: updated });
    }

    // SNCO/Staff actions
    const action = (body.action || '').toLowerCase();
    if (action === 'approve') {
      const awardPoints = Number(body.points || existing.requestedPoints || 0);
      const reason = body.reason || `Ticket approved: ${existing.category}`;
      const updated = {
        ...existing,
        status: 'approved',
        decisionReason: reason,
        approvedAt: new Date().toISOString(),
        approvedBy: user.user_metadata?.name || user.email,
        updatedAt: new Date().toISOString(),
      };
      await kv.set(`ticket:${id}`, updated);

      if (awardPoints && !isNaN(awardPoints)) {
        // Create a points entry
        const pointId = crypto.randomUUID();
        const point = {
          id: pointId,
          cadetName: existing.cadetName,
          date: new Date().toISOString(),
          flight: existing.flight || 'unknown',
          reason: reason || `Ticket: ${existing.category}`,
          points: awardPoints,
          type: 'good',
          givenBy: user.user_metadata?.name || user.email,
          createdAt: new Date().toISOString(),
        };
        await kv.set(`point:${pointId}`, point);
      }

      return c.json({ ticket: updated });
    }

    if (action === 'reject') {
      const reason = body.reason || 'Rejected';
      const updated = {
        ...existing,
        status: 'rejected',
        decisionReason: reason,
        rejectedAt: new Date().toISOString(),
        rejectedBy: user.user_metadata?.name || user.email,
        updatedAt: new Date().toISOString(),
      };
      await kv.set(`ticket:${id}`, updated);
      return c.json({ ticket: updated });
    }

    return c.json({ error: 'Unsupported action' }, 400);
  } catch (error) {
    console.log('Error updating ticket:', error);
    return c.json({ error: 'Failed to update ticket' }, 500);
  }
});

// Storage: ensure evidence bucket exists (SNCO/Staff/Cadet authenticated)
app.post("/make-server-73a3871f/storage/init", verifyAuth, async (c) => {
  try {
    const admin = getSupabaseAdmin();
    const bucket = 'ticket-evidence';

    // Check bucket
    const { data: list, error: listErr } = await admin.storage.listBuckets();
    if (listErr) console.log('List buckets error (non-fatal):', listErr);
    const exists = (list || []).some((b: any) => b.name === bucket);

    if (!exists) {
      const { error: createErr } = await admin.storage.createBucket(bucket, { public: true });
      if (createErr && !String(createErr.message || '').includes('already exists')) {
        return c.json({ error: 'Failed to create bucket' }, 500);
      }
    }

    return c.json({ ok: true, bucket });
  } catch (error) {
    console.log('Error ensuring storage bucket:', error);
    return c.json({ error: 'Failed to ensure storage bucket' }, 500);
  }
});

// Get points for logged-in cadet
app.get("/make-server-73a3871f/my-points", verifyAuth, async (c) => {
  console.log('=== MY POINTS ENDPOINT HIT ===');
  try {
    const user = c.get('user');
    const cadetName = user.user_metadata?.cadetName;
    const cadetId = user.user_metadata?.cadetId;
    
    console.log('My points request - cadetName:', cadetName, 'cadetId:', cadetId);
    
    if (!cadetName && !cadetId) {
      return c.json({ error: 'No cadet profile associated with this account' }, 404);
    }
    
    const allPoints = await kv.getByPrefix('point:');
    console.log('Total points in system:', allPoints.length);
    
    // Filter points for this cadet - check both cadetName match and cadetId if available
    const myPoints = allPoints.filter((p: any) => {
      const nameMatch = p.cadetName === cadetName;
      // Also try matching if the point's cadetName contains our name or vice versa (for partial matches)
      const partialMatch = cadetName && p.cadetName && (
        p.cadetName.includes(cadetName) || cadetName.includes(p.cadetName)
      );
      console.log('Point:', p.cadetName, 'vs user:', cadetName, 'nameMatch:', nameMatch, 'partialMatch:', partialMatch);
      return nameMatch || partialMatch;
    });
    
    console.log('My points found:', myPoints.length);
    
    // Sort by date, newest first
    myPoints.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // Calculate total
    const total = myPoints.reduce((sum: number, p: any) => sum + (p.points || 0), 0);
    
    return c.json({ points: myPoints, total, cadetName });
  } catch (error) {
    console.log('Error fetching my points:', error);
    return c.json({ error: 'Failed to fetch points' }, 500);
  }
});

// Public endpoint to get points for a cadet by name or id (uses anon key header)
app.get("/make-server-73a3871f/data/my-points", async (c) => {
  try {
    const url = new URL(c.req.url);
    const cadetName = url.searchParams.get('name') || '';
    const cadetId = url.searchParams.get('cadetId') || '';

    if (!cadetName && !cadetId) {
      return c.json({ error: 'Missing name or cadetId' }, 400);
    }

    const allPoints = await kv.getByPrefix('point:');

    const myPoints = allPoints.filter((p: any) => {
      const byId = cadetId && p.cadetId && p.cadetId === cadetId;
      const exact = cadetName && p.cadetName === cadetName;
      const partial = cadetName && p.cadetName && (p.cadetName.includes(cadetName) || cadetName.includes(p.cadetName));
      return byId || exact || partial;
    });

    myPoints.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const total = myPoints.reduce((sum: number, p: any) => sum + (p.points || 0), 0);

    return c.json({ points: myPoints, total, cadetName: cadetName || undefined });
  } catch (error) {
    console.log('Error fetching public my-points:', error);
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

    // Determine joint winners (ties)
    const maxCadetPts = cadetLeaderboard.length ? cadetLeaderboard[0].points : null;
    const maxFlightPts = flightLeaderboard.length ? flightLeaderboard[0].points : null;
    const winnersCadets = maxCadetPts !== null ? cadetLeaderboard.filter((e: any) => e.points === maxCadetPts) : [];
    const winnersFlights = maxFlightPts !== null ? flightLeaderboard.filter((e: any) => e.points === maxFlightPts) : [];

    return c.json({
      cadetLeaderboard,
      flightLeaderboard,
      recentPoints,
      winningCadet: cadetLeaderboard[0] || null,
      winningFlight: flightLeaderboard[0] || null,
      winnersCadets,
      winnersFlights,
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
    console.log('=== INCOMING REQUEST ===', {
      method: req.method,
      pathname,
      url: req.url,
      headers: {
        authorization: req.headers.get('Authorization'),
        contentType: req.headers.get('Content-Type'),
      }
    });
    
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

    // PUBLIC ENDPOINTS (no auth required) - check these FIRST
    
    // Public: cadets list (check before /cadets to avoid catch-all)
    if (pathname.endsWith('/data/cadets') && req.method === 'GET') {
      console.log('🟢 MATCHED /data/cadets endpoint');
      try {
        const cadets = await kv.getByPrefix('cadet:');
        console.log('✅ Returning', cadets.length, 'cadets');
        return new Response(JSON.stringify({ cadets }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        console.error('❌ /data/cadets error:', e);
        return new Response(JSON.stringify({ cadets: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // Public My Points endpoint handled at top-level to bypass gateway auth quirks
    if (pathname.endsWith('/data/my-points') && req.method === 'GET') {
      console.log('🟢 MATCHED /data/my-points endpoint');
      try {
        const cadetName = url.searchParams.get('name') || '';
        const cadetId = url.searchParams.get('cadetId') || '';

        if (!cadetName && !cadetId) {
          return new Response(JSON.stringify({ error: 'Missing name or cadetId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        const allPoints = await kv.getByPrefix('point:');
        const myPoints = allPoints.filter((p: any) => {
          const byId = cadetId && p.cadetId && p.cadetId === cadetId;
          const exact = cadetName && p.cadetName === cadetName;
          const partial = cadetName && p.cadetName && (p.cadetName.includes(cadetName) || cadetName.includes(p.cadetName));
          return byId || exact || partial;
        });

        myPoints.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const total = myPoints.reduce((sum: number, p: any) => sum + (p.points || 0), 0);

        return new Response(JSON.stringify({ points: myPoints, total, cadetName: cadetName || undefined }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        console.error('❌ /data/my-points error:', e);
        return new Response(JSON.stringify({ error: 'Failed to fetch points' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // Public: pending signups count
    if (pathname.endsWith('/data/signups-count') && req.method === 'GET') {
      console.log('🟢 MATCHED /data/signups-count endpoint');
      try {
        const items = await kv.getByPrefix('signup:');
        console.log('✅ Returning count:', items.length);
        return new Response(JSON.stringify({ count: (items || []).length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        console.log('❌ /data/signups-count error:', e);
        return new Response(JSON.stringify({ count: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // Direct: Auth signup (redundant path to ensure availability)
    if (pathname.includes('/auth/signup') && req.method === 'POST') {
      try {
        const body = await req.json();
        const { email, password, name, role } = body || {};
        if (!email || !password) {
          return new Response(JSON.stringify({ error: 'Email and password are required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          user_metadata: { name, role: role || 'cadet' },
          email_confirm: true,
        });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        return new Response(JSON.stringify({ user: data.user }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        console.error('Signup error:', e);
        return new Response(JSON.stringify({ error: 'Internal server error during signup' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // Collect signup requests (no immediate account creation)
    if (pathname.includes('/auth/request-signup') && req.method === 'POST') {
      try {
        const body = await req.json();
        const { email, password, name, joinCode, flight } = body || {};
        if (!email || !password || !name) {
          return new Response(JSON.stringify({ error: 'Name, email and password are required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        // Validate flight (optional but preferred): must be one of '1','2','3','4'
        let flightNorm: string | null = null;
        if (flight != null) {
          const fStr = String(flight).trim();
          if (['1','2','3','4'].includes(fStr)) {
            flightNorm = fStr;
          } else {
            // If provided but invalid, reject
            return new Response(JSON.stringify({ error: 'Invalid flight. Choose 1, 2, 3 or 4.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }
        }
        // Validate active join code
        const jc = await kv.get('joincode:current');
        if (!jc || !jc.code || !jc.expiresAt) {
          return new Response(JSON.stringify({ error: 'Signup is currently closed. Ask an SNCO for the join code.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        const now = Date.now();
        const expires = new Date(jc.expiresAt).getTime();
        if (now > expires) {
          return new Response(JSON.stringify({ error: 'Join code expired.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        if (!joinCode || String(joinCode).trim().toUpperCase() !== String(jc.code).trim().toUpperCase()) {
          return new Response(JSON.stringify({ error: 'Invalid join code.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        // Basic per-email throttle (max 5 requests per hour)
        const throttleKey = `throttle:${(email || '').toLowerCase()}`;
        const t = await kv.get(throttleKey);
        const windowMs = 60 * 60 * 1000; // 1 hour
        const limit = 5;
        const nowMs = Date.now();
        if (t && t.resetAt && nowMs < new Date(t.resetAt).getTime() && (t.count || 0) >= limit) {
          return new Response(JSON.stringify({ error: 'Too many signup attempts. Try again later.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        const nextCount = t && nowMs < new Date(t.resetAt).getTime() ? (t.count || 0) + 1 : 1;
        const nextReset = t && nowMs < new Date(t.resetAt).getTime() ? t.resetAt : new Date(nowMs + windowMs).toISOString();
        await kv.set(throttleKey, { count: nextCount, resetAt: nextReset });
        const id = crypto.randomUUID();
        const rec = { id, email, name, password, flight: flightNorm, status: 'pending', createdAt: new Date().toISOString() };
        await kv.set(`signup:${id}`, rec);
        return new Response(JSON.stringify({ request: { id, email, name, flight: flightNorm, status: 'pending' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        console.error('Request-signup error:', e);
        return new Response(JSON.stringify({ error: 'Failed to create signup request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // Admin: get current join code (SNCO/Staff)
    if (pathname.includes('/admin/join-code') && req.method === 'GET') {
      try {
        const accessToken = req.headers.get('Authorization')?.split(' ')[1];
        if (!accessToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        const { data: { user }, error } = await sb.auth.getUser(accessToken);
        if (error || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const role = (user.user_metadata?.role || '').toLowerCase();
        if (role !== 'snco' && role !== 'staff') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const jc = await kv.get('joincode:current');
        return new Response(JSON.stringify({ joinCode: jc?.code || null, expiresAt: jc?.expiresAt || null, durationSeconds: jc?.durationSeconds || null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Failed to fetch join code' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    // Admin: create/rotate join code with duration (SNCO/Staff)
    if (pathname.includes('/admin/join-code') && req.method === 'POST') {
      try {
        const accessToken = req.headers.get('Authorization')?.split(' ')[1];
        if (!accessToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        const { data: { user }, error } = await sb.auth.getUser(accessToken);
        if (error || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const role = (user.user_metadata?.role || '').toLowerCase();
        if (role !== 'snco' && role !== 'staff') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const body = await req.json();
        const durationSeconds = Math.max(60, Number(body?.durationSeconds || 3600)); // min 1 min, default 1 hour
        // Generate a 6-character alphanumeric code
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
        const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
        await kv.set('joincode:current', { code, expiresAt, durationSeconds, createdAt: new Date().toISOString(), createdBy: user.user_metadata?.name || user.email });
        return new Response(JSON.stringify({ joinCode: code, expiresAt, durationSeconds }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Failed to create join code' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    // Count signup requests (public, no auth - check BEFORE /auth/requests)
    if (pathname.match(/\/auth\/requests-count$/) && req.method === 'GET') {
      try {
        const items = await kv.getByPrefix('signup:');
        return new Response(JSON.stringify({ count: (items || []).length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ count: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // List signup requests (SNCO/Staff only)
    if (pathname.includes('/auth/requests') && req.method === 'GET') {
      try {
        const accessToken = req.headers.get('Authorization')?.split(' ')[1];
        if (!accessToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);
        if (error || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const role = (user.user_metadata?.role || '').toLowerCase();
        if (role !== 'snco' && role !== 'staff') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const items = await kv.getByPrefix('signup:');
        const list = (items || []).map((r: any) => ({ id: r.id, email: r.email, name: r.name, flight: r.flight || null, status: r.status, createdAt: r.createdAt }));
        return new Response(JSON.stringify({ requests: list }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Failed to fetch requests' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // Approve signup request (SNCO/Staff) -> create user
    if (pathname.match(/\/auth\/requests\/[^/]+\/approve$/) && req.method === 'POST') {
      try {
        const accessToken = req.headers.get('Authorization')?.split(' ')[1];
        if (!accessToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const sb = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );
        const { data: { user: approver }, error: authErr } = await sb.auth.getUser(accessToken);
        if (authErr || !approver) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const approverRole = (approver.user_metadata?.role || '').toLowerCase();
        if (approverRole !== 'snco' && approverRole !== 'staff') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const id = pathname.split('/').slice(-2, -1)[0];
        const body = await req.json();
        const role = (body?.role || 'cadet').toLowerCase();
        const cadetId = String(body?.cadetId || '').trim() || null;
        const rec = await kv.get(`signup:${id}`);
        if (!rec) {
          return new Response(JSON.stringify({ error: 'Request not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
        let cadetMeta: { cadetId?: string; cadetName?: string; flight?: string } = {};
        if (cadetId) {
          const cadet = await kv.get(`cadet:${cadetId}`);
          if (!cadet) {
            return new Response(JSON.stringify({ error: 'Selected cadet not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }
          cadetMeta = { cadetId: cadet.id, cadetName: cadet.name, flight: cadet.flight };
        } else if (rec.flight) {
          // Preserve requested flight if no cadet mapping provided
          cadetMeta = { flight: rec.flight };
        }
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );
        const { data, error } = await supabase.auth.admin.createUser({
          email: rec.email,
          password: rec.password,
          user_metadata: { name: rec.name, role, ...cadetMeta },
          email_confirm: true,
        });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
        await kv.del(`signup:${id}`);
        return new Response(JSON.stringify({ user: data.user }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (e) {
        console.error('Approve error:', e);
        return new Response(JSON.stringify({ error: 'Failed to approve request' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    // Reject/delete signup request
    if (pathname.match(/\/auth\/requests\/[^/]+$/) && req.method === 'DELETE') {
      try {
        const accessToken = req.headers.get('Authorization')?.split(' ')[1];
        if (!accessToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const sb = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );
        const { data: { user: approver }, error: authErr } = await sb.auth.getUser(accessToken);
        if (authErr || !approver) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const approverRole = (approver.user_metadata?.role || '').toLowerCase();
        if (approverRole !== 'snco' && approverRole !== 'staff') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const id = pathname.split('/').pop()!;
        await kv.del(`signup:${id}`);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Failed to delete request' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
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
    
    // Handle tickets endpoint directly (bypass Hono)
    if (pathname.includes('/tickets')) {
      // Create ticket
      if (req.method === 'POST') {
        try {
          const accessToken = req.headers.get('Authorization')?.split(' ')[1] || null;
          if (!accessToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
          const { data: { user }, error: authErr } = await sb.auth.getUser(accessToken);
          if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

          const body = await req.json();
          const { category, description, evidenceUrl } = body || {};
          if (!category || !description) return new Response(JSON.stringify({ error: 'Category and description are required' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

          const id = crypto.randomUUID();
          const ticket = {
            id,
            status: 'open',
            category,
            description,
            requestedPoints: null,
            evidenceUrl: evidenceUrl || null,
            cadetId: user.user_metadata?.cadetId || null,
            cadetName: user.user_metadata?.cadetName || user.user_metadata?.name || user.email,
            flight: user.user_metadata?.flight || null,
            submittedBy: user.user_metadata?.name || user.email,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await kv.set(`ticket:${id}`, ticket);
          return new Response(JSON.stringify({ ticket }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        } catch (e) {
          console.error('Tickets POST error:', e);
          return new Response(JSON.stringify({ error: 'Failed to create ticket' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
      }

      // Resolve ticket id if present
      const ticketIdMatch = pathname.match(/\/tickets\/([^/]+)$/);

      // Update ticket
      if (ticketIdMatch && req.method === 'PUT') {
        try {
          const accessToken = req.headers.get('Authorization')?.split(' ')[1] || null;
          if (!accessToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
          const { data: { user }, error: authErr } = await sb.auth.getUser(accessToken);
          if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

          const id = decodeURIComponent(ticketIdMatch[1]);
          const existing = (await kv.get(`ticket:${id}`)) as any;
          if (!existing) return new Response(JSON.stringify({ error: 'Ticket not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

          const role = (user.user_metadata?.role || 'cadet').toLowerCase();
          const body = await req.json();
          if (role !== 'snco' && role !== 'staff') {
            if (existing.status !== 'open') return new Response(JSON.stringify({ error: 'Ticket is not editable' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
            const myId = user.user_metadata?.cadetId || null;
            const myName = user.user_metadata?.cadetName || user.user_metadata?.name || user.email;
            const isOwner = (existing.cadetId && myId && existing.cadetId === myId) || (existing.cadetName && myName && existing.cadetName === myName) || (existing.submittedBy === (user.user_metadata?.name || user.email));
            if (!isOwner) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
            const updated = { ...existing, category: body.category ?? existing.category, description: body.description ?? existing.description, evidenceUrl: body.evidenceUrl ?? existing.evidenceUrl, updatedAt: new Date().toISOString() };
            await kv.set(`ticket:${id}`, updated);
            return new Response(JSON.stringify({ ticket: updated }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }

          const action = (body.action || '').toLowerCase();
          if (action === 'approve') {
            const pts = Number(body.points || 0);
            const reason = body.reason || `Ticket approved: ${existing.category}`;
            const updated = { ...existing, status: 'approved', decisionReason: reason, approvedAt: new Date().toISOString(), approvedBy: user.user_metadata?.name || user.email, updatedAt: new Date().toISOString() };
            await kv.set(`ticket:${id}`, updated);
            if (pts && !isNaN(pts)) {
              const pointId = crypto.randomUUID();
              const point = { id: pointId, cadetName: existing.cadetName, date: new Date().toISOString(), flight: existing.flight || 'unknown', reason, points: pts, type: 'good', givenBy: user.user_metadata?.name || user.email, createdAt: new Date().toISOString() };
              await kv.set(`point:${pointId}`, point);
            }
            return new Response(JSON.stringify({ ticket: updated }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }
          if (action === 'reject') {
            const reason = body.reason || 'Rejected';
            const updated = { ...existing, status: 'rejected', decisionReason: reason, rejectedAt: new Date().toISOString(), rejectedBy: user.user_metadata?.name || user.email, updatedAt: new Date().toISOString() };
            await kv.set(`ticket:${id}`, updated);
            return new Response(JSON.stringify({ ticket: updated }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }
          return new Response(JSON.stringify({ error: 'Unsupported action' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        } catch (e) {
          console.error('Tickets PUT error:', e);
          return new Response(JSON.stringify({ error: 'Failed to update ticket' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
      }

      // List tickets
      if (req.method === 'GET') {
        try {
          const accessToken = req.headers.get('Authorization')?.split(' ')[1] || null;
          if (!accessToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
          const { data: { user }, error: authErr } = await sb.auth.getUser(accessToken);
          if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          const role = (user.user_metadata?.role || 'cadet').toLowerCase();
          const myCadetId = user.user_metadata?.cadetId || null;
          const myCadetName = user.user_metadata?.cadetName || user.user_metadata?.name || user.email;
          const tickets = await kv.getByPrefix('ticket:');
          let results = tickets;
          if (role !== 'snco' && role !== 'staff') {
            results = tickets.filter((t: any) => (t.cadetId && myCadetId && t.cadetId === myCadetId) || (t.cadetName && myCadetName && t.cadetName === myCadetName) || (t.submittedBy === (user.user_metadata?.name || user.email)));
          }
          results.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          return new Response(JSON.stringify({ tickets: results }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        } catch (e) {
          console.error('Tickets GET error:', e);
          return new Response(JSON.stringify({ error: 'Failed to fetch tickets' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
      }
    }

    // Handle points endpoint directly (bypass Hono)
    if (pathname.includes('/points')) {
      // Clear all points for a cadet
      if (pathname.includes('/points/clear-cadet') && req.method === 'POST') {
        try {
          const body = await req.json();
          const cadetName = (body.cadetName || '').trim();
          if (!cadetName) {
            return new Response(JSON.stringify({ error: 'cadetName is required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }

          const points = await kv.getByPrefix('point:');
          const toDelete = points.filter((p: any) => (p.cadetName || '').toLowerCase() === cadetName.toLowerCase());

          for (const p of toDelete) {
            await kv.del(`point:${p.id}`);
          }

          return new Response(JSON.stringify({ deleted: toDelete.length }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (e) {
          console.error('Points clear error:', e);
          return new Response(JSON.stringify({ error: 'Failed to clear points', details: String(e) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      // Single point operations
      const pointIdMatch = pathname.match(/\/points\/([^/]+)$/);

      if (pointIdMatch && req.method === 'DELETE') {
        const pointId = decodeURIComponent(pointIdMatch[1]);
        try {
          await kv.del(`point:${pointId}`);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (e) {
          console.error('Points delete error:', e);
          return new Response(JSON.stringify({ error: 'Failed to delete point', details: String(e) }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      if (pointIdMatch && req.method === 'PUT') {
        const pointId = decodeURIComponent(pointIdMatch[1]);
        try {
          const body = await req.json();
          const existing = await kv.get(`point:${pointId}`);
          if (!existing) {
            return new Response(JSON.stringify({ error: 'Point not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }

          const updated = {
            ...existing,
            cadetName: body.cadetName ?? existing.cadetName,
            points: body.points !== undefined ? Number(body.points) : existing.points,
            type: body.type ?? existing.type,
            reason: body.reason ?? existing.reason,
            flight: body.flight ?? existing.flight,
          };

          await kv.set(`point:${pointId}`, updated);

          return new Response(JSON.stringify(updated), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } catch (e) {
          console.error('Points update error:', e);
          return new Response(JSON.stringify({ error: 'Failed to update point', details: String(e) }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      if (req.method === 'GET') {
        try {
          const points = await kv.getByPrefix('point:');
          const sorted = (points || []).sort((a, b) => {
            const aDate = new Date(a.date || 0).getTime();
            const bDate = new Date(b.date || 0).getTime();
            return bDate - aDate;
          });
          return new Response(JSON.stringify({ points: sorted.slice(0, 50) }), {
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

          // Try to resolve the requesting user (giver) from the Authorization header
          let giver = 'Unknown';
          try {
            const accessToken = req.headers.get('Authorization')?.split(' ')[1] || null;
            if (accessToken) {
              const sb = getSupabaseAdmin();
              const { data: { user }, error: authErr } = await sb.auth.getUser(accessToken);
              if (!authErr && user) {
                giver = user.user_metadata?.name || user.email || giver;
              }
            }
          } catch (e) {
            console.error('Failed to resolve giver from token:', e);
          }

          const id = crypto.randomUUID();
          const entry = {
            id,
            cadetName,
            points: Number(points),
            type: type || 'general',
            reason: reason || '',
            flight: flight || 'unknown',
            date: new Date().toISOString(),
            givenBy: giver,
            createdAt: new Date().toISOString(),
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

    // Storage init (ensure bucket) direct handler
    if (pathname.includes('/storage/init') && req.method === 'POST') {
      try {
        const accessToken = req.headers.get('Authorization')?.split(' ')[1] || null;
        if (!accessToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        const bucket = 'ticket-evidence';
        const { data: list } = await admin.storage.listBuckets();
        const exists = (list || []).some((b: any) => b.name === bucket);
        if (!exists) await admin.storage.createBucket(bucket, { public: true });
        return new Response(JSON.stringify({ ok: true, bucket }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (e) {
        console.error('storage/init error:', e);
        return new Response(JSON.stringify({ error: 'Failed to ensure bucket' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    // Upload ticket evidence via service role (bypasses RLS) - expects multipart form with 'file'
    if (pathname.includes('/upload/ticket-evidence') && req.method === 'POST') {
      try {
        const accessToken = req.headers.get('Authorization')?.split(' ')[1] || null;
        if (!accessToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        const { data: { user }, error: authErr } = await sb.auth.getUser(accessToken);
        if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

        const form = await req.formData();
        const file = form.get('file') as unknown as File | null;
        if (!file) return new Response(JSON.stringify({ error: 'Missing file' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

        const bucket = 'ticket-evidence';
        // Ensure bucket exists
        const { data: list } = await sb.storage.listBuckets();
        const exists = (list || []).some((b: any) => b.name === bucket);
        if (!exists) await sb.storage.createBucket(bucket, { public: true });

        const sanitized = (file as any).name ? String((file as any).name).replace(/[^a-zA-Z0-9._-]+/g, '_') : `evidence_${Date.now()}`;
        const path = `tickets/${crypto.randomUUID()}_${sanitized}`;
        const { error: upErr } = await sb.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false, contentType: (file as any).type || 'application/octet-stream' });
        if (upErr) return new Response(JSON.stringify({ error: String(upErr.message || upErr) }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
        return new Response(JSON.stringify({ url: pub?.publicUrl || null, path }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (e) {
        console.error('upload/ticket-evidence error:', e);
        return new Response(JSON.stringify({ error: 'Failed to upload evidence' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
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

        const maxCadetPts = cadetLeaderboard.length ? cadetLeaderboard[0].points : null;
        const maxFlightPts = flightLeaderboard.length ? flightLeaderboard[0].points : null;
        const winnersCadets = maxCadetPts !== null ? cadetLeaderboard.filter((e: any) => e.points === maxCadetPts) : [];
        const winnersFlights = maxFlightPts !== null ? flightLeaderboard.filter((e: any) => e.points === maxFlightPts) : [];

        return new Response(JSON.stringify({
          cadetLeaderboard,
          flightLeaderboard,
          recentPoints,
          winningCadet: cadetLeaderboard[0] || null,
          winningFlight: flightLeaderboard[0] || null,
          winnersCadets,
          winnersFlights,
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

    // Admin: point givers summary (read-only)
    if (pathname.includes('/admin/point-givers') && req.method === 'GET') {
      try {
        const points = await kv.getByPrefix('point:');
        const attendance = await kv.getByPrefix('attendance:');

        const contributors: Record<string, any> = {};

        // Aggregate points by givenBy
        for (const p of points) {
          const key = (p.givenBy || 'Unknown').trim();
          if (!contributors[key]) {
            contributors[key] = {
              name: key,
              totalPointsGiven: 0,
              totalPointEntries: 0,
              lastPointAt: null as string | null,
              recentPoints: [] as any[],
              totalAttendanceSubmitted: 0,
              lastAttendanceAt: null as string | null,
            };
          }
          contributors[key].totalPointsGiven += Number(p.points || 0);
          contributors[key].totalPointEntries += 1;
          const d = p.date || p.createdAt || null;
          if (d && (!contributors[key].lastPointAt || new Date(d).getTime() > new Date(contributors[key].lastPointAt!).getTime())) {
            contributors[key].lastPointAt = d;
          }
          // collect recent points per contributor (limit later)
          contributors[key].recentPoints.push({
            id: p.id,
            cadetName: p.cadetName,
            flight: p.flight,
            points: p.points,
            type: p.type,
            reason: p.reason,
            date: p.date,
          });
        }

        // Aggregate attendance by submittedBy
        for (const a of attendance) {
          const key = (a.submittedBy || 'Unknown').trim();
          if (!contributors[key]) {
            contributors[key] = {
              name: key,
              totalPointsGiven: 0,
              totalPointEntries: 0,
              lastPointAt: null as string | null,
              recentPoints: [] as any[],
              totalAttendanceSubmitted: 0,
              lastAttendanceAt: null as string | null,
            };
          }
          contributors[key].totalAttendanceSubmitted += 1;
          const d = a.date || a.createdAt || null;
          if (d && (!contributors[key].lastAttendanceAt || new Date(d).getTime() > new Date(contributors[key].lastAttendanceAt!).getTime())) {
            contributors[key].lastAttendanceAt = d;
          }
        }

        // Finalize recent points per contributor: sort by date desc and limit 5
        Object.values(contributors).forEach((c: any) => {
          c.recentPoints = (c.recentPoints || [])
            .sort((x: any, y: any) => new Date(y.date || 0).getTime() - new Date(x.date || 0).getTime())
            .slice(0, 5);
        });

        // Global recent points (non-attendance) top 20
        const recentPointsGlobal = (points || [])
          .filter((p: any) => p.type !== 'attendance')
          .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
          .slice(0, 20);

        // Convert contributors map to array and sort by totalPointsGiven desc
        const list = Object.values(contributors)
          .map((c: any) => c)
          .sort((a: any, b: any) => b.totalPointsGiven - a.totalPointsGiven);

        return new Response(JSON.stringify({ contributors: list, recentPointsGlobal }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        console.error('Admin point-givers error:', e);
        return new Response(JSON.stringify({ error: 'Failed to fetch point givers', details: String(e) }), {
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