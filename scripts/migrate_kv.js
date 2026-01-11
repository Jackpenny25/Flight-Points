import { createClient } from '@supabase/supabase-js';

// Usage (ESM):
// SUPABASE_URL=https://<project>.supabase.co SUPABASE_KEY=<anon_or_service_key> node scripts/migrate_kv.js

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please set SUPABASE_URL and SUPABASE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  // string
  try {
    return JSON.parse(value);
  } catch (e) {
    // try cleaning quotes
    try {
      const trimmed = value.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return JSON.parse(trimmed);
      }
    } catch (e2) {}
  }
  return null;
}

async function migrate() {
  console.log('Reading KV store entries...');
  const { data: kv, error } = await supabase.from('kv_store_73a3871f').select('key, value').limit(10000);
  if (error) {
    console.error('Error reading kv store:', error.message || error);
    process.exit(1);
  }
  console.log(`Found ${kv.length} kv rows`);

  const cadets = [];
  const attendance = [];
  const points = [];
  const skippedPoints = [];
  const skippedCadets = [];
  const skippedAttendance = [];

  kv.forEach((row) => {
    const key = row.key || '';
    const raw = row.value;
    let parsed = parseValue(raw);
    // if parsing failed, try alternative shapes (value.value, data, payload)
    if (!parsed && raw && typeof raw === 'object') {
      // object but not parsed earlier (shouldn't happen) — try common nested names
      parsed = raw.value || raw.data || raw.payload || null;
    }
    // if still a string, attempt to parse nested JSON inside
    if (!parsed && raw && typeof raw === 'string') {
      // look for a JSON substring
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        try {
          parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
        } catch (e) {
          // ignore
        }
      }
    }
    if (!parsed) {
      // leave a trace — we'll report skipped rows later
      parsed = null;
    }
    if (key.startsWith('cadet:')) {
      // Extract cadet fields with several possible shapes
      const id = parsed ? (parsed.id || parsed.uuid || parsed._id || null) : null;
      let email = parsed ? (parsed.email || parsed.email_address || parsed.contact_email || null) : null;
      // name could be stored as first_name/last_name, given_name/family_name, or full name fields
      let first_name = null;
      let last_name = null;
      if (parsed) {
        first_name = parsed.first_name || parsed.given_name || parsed.firstName || null;
        last_name = parsed.last_name || parsed.family_name || parsed.lastName || null;
        const fullname = parsed.name || parsed.fullName || parsed.cadetName || parsed.displayName || null;
        if ((!first_name || !last_name) && fullname && typeof fullname === 'string') {
          const parts = fullname.trim().split(/\s+/);
          first_name = first_name || parts.slice(0, -1).join(' ') || parts[0];
          last_name = last_name || parts.slice(-1).join(' ');
        }
      }
      const created_at = parsed ? (parsed.createdAt || parsed.created_at || parsed.created || null) : null;
      if (id || email || first_name) {
        cadets.push({ id, email, first_name, last_name, created_at });
      } else {
        skippedCadets.push({ key, raw: typeof raw === 'string' ? raw : JSON.stringify(raw) });
      }
    } else if (key.startsWith('attendance:')) {
      // Attendance entries can reference cadet by id or cadetName; parse multiple shapes
      const aid = parsed ? (parsed.id || parsed.uuid || null) : null;
      const acadet = parsed ? (parsed.cadet_id || parsed.cadet || parsed.user_id || null) : null;
      const acadetName = parsed ? (parsed.cadetName || parsed.name || parsed.cadet_name || null) : null;
      const adate = parsed ? (parsed.date || parsed.attendance_date || parsed.timestamp || null) : null;
      const apresent = parsed ? (parsed.present == null ? true : parsed.present) : true;
      const acreated = parsed ? (parsed.createdAt || parsed.created_at || parsed.created || null) : null;
      if (aid || acadet || acadetName) {
        attendance.push({ id: aid, cadet_id: acadet, cadetName: acadetName, date: adate, present: apresent, created_at: acreated });
      } else {
        skippedAttendance.push({ key, raw: typeof raw === 'string' ? raw : JSON.stringify(raw) });
      }
    } else if (key.startsWith('point:') || key.startsWith('points:')) {
      // Try multiple possibilities for points data shape
      const pid = parsed ? (parsed.id || parsed.uuid || null) : null;
      const pcadet = parsed ? (parsed.cadet_id || parsed.cadet || parsed.user_id || null) : null;
      const ppoints = parsed ? (parsed.points ?? parsed.value ?? parsed.score ?? null) : null;
      const preason = parsed ? (parsed.reason || parsed.notes || parsed.note || null) : null;
      if (parsed && (pid || pcadet || ppoints !== null)) {
        points.push({ id: pid, cadet_id: pcadet, cadetName: parsed.cadetName || parsed.cadetName || parsed.cadet_name || null, points: ppoints || 0, reason: preason, created_at: parsed.createdAt || parsed.created_at || parsed.created || null });
      } else {
        // store a debug entry for analysis
        skippedPoints.push({ key, raw: typeof raw === 'string' ? raw : JSON.stringify(raw) });
      }
    }
  });

  console.log(`Prepared ${cadets.length} cadets, ${attendance.length} attendance, ${points.length} points`);

  if (cadets.length > 0) {
    console.log('Upserting cadets...');
    const { error: e1 } = await supabase.from('cadets').upsert(cadets, { onConflict: 'id' });
    if (e1) console.error('Cadets upsert error:', e1.message || e1);
    else console.log('Cadets upsert complete');
  }

  if (attendance.length > 0) {
    // Resolve cadetName->cadet_id for attendance where possible
    try {
      const { data: cadetsList } = await supabase.from('cadets').select('id, first_name, last_name');
      if (cadetsList && Array.isArray(cadetsList)) {
        const nameMap = new Map();
        cadetsList.forEach((c) => {
          const full = ((c.first_name || '') + ' ' + (c.last_name || '')).trim().toLowerCase();
          if (full) nameMap.set(full, c.id);
        });
        attendance.forEach((a) => {
          if (!a.cadet_id && a.cadetName) {
            const lookup = a.cadetName.trim().toLowerCase();
            if (nameMap.has(lookup)) a.cadet_id = nameMap.get(lookup);
          }
        });
      }
    } catch (e) {
      // ignore mapping failures
    }

    console.log('Sanitizing and upserting attendance...');
    const sanitizedAttendance = attendance.map(a => ({
      id: a.id || null,
      cadet_id: a.cadet_id || null,
      date: a.date || null,
      present: a.present == null ? true : a.present,
      created_at: a.created_at || null,
    }));
    const { error: e2 } = await supabase.from('attendance').upsert(sanitizedAttendance, { onConflict: 'id' });
    if (e2) console.error('Attendance upsert error:', e2.message || e2);
    else console.log('Attendance upsert complete');
  }

  if (points.length > 0) {
    // Try to resolve cadetName -> cadet_id by querying existing cadets
    try {
      const { data: cadetsList } = await supabase.from('cadets').select('id, first_name, last_name');
      if (cadetsList && Array.isArray(cadetsList)) {
        const nameMap = new Map();
        cadetsList.forEach((c) => {
          const full = ((c.first_name || '') + ' ' + (c.last_name || '')).trim().toLowerCase();
          if (full) nameMap.set(full, c.id);
        });
        points.forEach((p) => {
          if (!p.cadet_id && p.cadetName) {
            const lookup = p.cadetName.trim().toLowerCase();
            if (nameMap.has(lookup)) p.cadet_id = nameMap.get(lookup);
          }
        });
      }
    } catch (e) {
      // ignore mapping failures — we'll still upsert without cadet_id
    }

    console.log('Sanitizing and upserting points...');
    const sanitizedPoints = points.map(p => ({
      id: p.id || null,
      cadet_id: p.cadet_id || null,
      points: p.points != null ? p.points : 0,
      reason: p.reason || null,
      created_at: p.created_at || null,
    }));
    const { error: e3 } = await supabase.from('points').upsert(sanitizedPoints, { onConflict: 'id' });
    if (e3) console.error('Points upsert error:', e3.message || e3);
    else console.log('Points upsert complete');
  }

  if (skippedPoints.length > 0) {
    console.warn(`Skipped ${skippedPoints.length} points entries due to unrecognized shape. Sample:`);
    console.warn(JSON.stringify(skippedPoints.slice(0,5), null, 2));
  }
  if (skippedCadets.length > 0) {
    console.warn(`Skipped ${skippedCadets.length} cadet entries. Sample:`);
    console.warn(JSON.stringify(skippedCadets.slice(0,5), null, 2));
  }
  if (skippedAttendance.length > 0) {
    console.warn(`Skipped ${skippedAttendance.length} attendance entries. Sample:`);
    console.warn(JSON.stringify(skippedAttendance.slice(0,5), null, 2));
  }

  console.log('Migration finished. Verify counts in Supabase dashboard.');
}

migrate().catch((err) => {
  console.error('Migration failed', err);
});
