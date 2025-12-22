import { projectId } from '../../utils/supabase/info';
import { readStore, writeStore, uuid, type Cadet, type Point, type Attendance, type AttendanceBulk } from './localStore';

function jsonResponse(obj: any, init: number = 200) {
  return new Response(JSON.stringify(obj), { status: init, headers: { 'Content-Type': 'application/json' } });
}

function notFound(msg = 'Not found') { return jsonResponse({ error: msg }, 404); }
function badRequest(msg = 'Bad request') { return jsonResponse({ error: msg }, 400); }
function unauthorized(msg = 'Unauthorized') { return jsonResponse({ error: msg }, 401); }

export function enableLocalMode() {
  if (typeof window === 'undefined' || !(window as any).fetch) return;
  // Match the deployed function name "server"; all routes are nested under it
  const base = `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f`;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      // Allow public endpoints to hit the real server (do not intercept)
      if (url.includes('/public/')) {
        return originalFetch(input as any, init);
      }

      if (!url.startsWith(base)) {
        return originalFetch(input as any, init);
      }

      const u = new URL(url);
      const path = u.pathname.replace('/functions/v1/server', '');
      const method = (init?.method || 'GET').toUpperCase();
      const body = init?.body ? JSON.parse(init.body as string) : undefined;

      // For local mode we ignore Authorization headers.
      const store = readStore();

      // Routes
      // Cadets
      if (path === '/make-server-73a3871f/cadets' && method === 'GET') {
        return jsonResponse({ cadets: store.cadets });
      }
      if (path === '/make-server-73a3871f/cadets' && method === 'POST') {
        const { name, flight } = body || {};
        if (!name || !flight) return badRequest('Name and flight are required');
        const cadet: Cadet = { id: uuid(), name, flight, createdAt: new Date().toISOString() };
        store.cadets.push(cadet);
        writeStore(store);
        return jsonResponse({ cadet });
      }
      const cadetMatch = path.match(/^\/make-server-73a3871f\/cadets\/(.+)$/);
      if (cadetMatch) {
        const id = cadetMatch[1];
        const idx = store.cadets.findIndex(c => c.id === id);
        if (idx === -1) return notFound('Cadet not found');
        if (method === 'DELETE') {
          store.cadets.splice(idx, 1);
          writeStore(store);
          return jsonResponse({ success: true });
        }
        if (method === 'PUT') {
          const { name, flight } = body || {};
          const cadet = store.cadets[idx];
          const updated: Cadet = { ...cadet, name: name ?? cadet.name, flight: flight ?? cadet.flight, updatedAt: new Date().toISOString() };
          store.cadets[idx] = updated;
          writeStore(store);
          return jsonResponse({ cadet: updated });
        }
      }

      // Points
      if (path === '/make-server-73a3871f/points' && method === 'GET') {
        const points = [...store.points].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return jsonResponse({ points });
      }
      if (path === '/make-server-73a3871f/points' && method === 'POST') {
        const { cadetName, date, flight, reason, points, type } = body || {};
        if (!cadetName || !flight || reason == null || points == null) return badRequest('Cadet name, flight, reason, and points are required');
        const point: Point = { id: uuid(), cadetName, date: date || new Date().toISOString(), flight, reason, points, type: type || 'general', createdAt: new Date().toISOString() };
        store.points.push(point);
        writeStore(store);
        return jsonResponse({ point });
      }
      const pointMatch = path.match(/^\/make-server-73a3871f\/points\/(.+)$/);
      if (pointMatch) {
        const id = pointMatch[1];
        const idx = store.points.findIndex(p => p.id === id);
        if (idx === -1) return notFound('Point not found');
        if (method === 'DELETE') {
          store.points.splice(idx, 1);
          writeStore(store);
          return jsonResponse({ success: true });
        }
        if (method === 'PUT') {
          const { points: newPoints, reason } = body || {};
          const p = store.points[idx];
          const updated: Point = { ...p, points: newPoints ?? p.points, reason: reason ?? p.reason, updatedAt: new Date().toISOString() };
          store.points[idx] = updated;
          writeStore(store);
          return jsonResponse({ point: updated });
        }
      }

      // Attendance
      if (path === '/make-server-73a3871f/attendance' && method === 'GET') {
        const attendance = [...store.attendance].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return jsonResponse({ attendance });
      }
      if (path === '/make-server-73a3871f/attendance' && method === 'POST') {
        const { cadetName, date, flight, status, bulkId } = body || {};
        if (!cadetName || !flight || !status) return badRequest('Cadet name, flight, and status are required');
        const att: Attendance = { id: uuid(), cadetName, date: date || new Date().toISOString(), flight, status, bulkId: bulkId || null, createdAt: new Date().toISOString() };
        store.attendance.push(att);
        if (status === 'present') {
          const pt: Point = { id: uuid(), cadetName, date: att.date, flight, reason: 'Attendance - Present Correctly Dressed', points: 1, type: 'attendance', createdAt: new Date().toISOString() };
          store.points.push(pt);
        }
        writeStore(store);
        return jsonResponse({ attendance: att });
      }
      const attMatch = path.match(/^\/make-server-73a3871f\/attendance\/(.+)$/);
      if (attMatch && method === 'DELETE') {
        const id = attMatch[1];
        const idx = store.attendance.findIndex(a => a.id === id);
        if (idx === -1) return notFound('Attendance not found');
        store.attendance.splice(idx, 1);
        writeStore(store);
        return jsonResponse({ success: true });
      }

      // Bulk attendance
      if (path === '/make-server-73a3871f/attendance/bulk' && method === 'POST') {
        const { entries, date, flightFilter, bulkId } = body || {};
        if (!entries || !Array.isArray(entries) || entries.length === 0) return badRequest('Entries are required');
        const id = bulkId || uuid();
        let presentCount = 0;
        for (const e of entries) {
          const att: Attendance = { id: uuid(), cadetName: e.cadetName, date: e.date || date || new Date().toISOString(), flight: e.flight, status: e.status, bulkId: id, createdAt: new Date().toISOString() };
          store.attendance.push(att);
          if (e.status === 'present') {
            presentCount++;
            const pt: Point = { id: uuid(), cadetName: e.cadetName, date: att.date, flight: e.flight, reason: 'Attendance - Present Correctly Dressed', points: 1, type: 'attendance', createdAt: new Date().toISOString() };
            store.points.push(pt);
          }
        }
        const bulk: AttendanceBulk = { id, date: date || new Date().toISOString(), flightFilter: flightFilter || 'all', totalRecords: entries.length, totalPresent: presentCount, createdAt: new Date().toISOString() };
        store.attendanceBulks.push(bulk);
        writeStore(store);
        return jsonResponse({ bulk });
      }
      if (path === '/make-server-73a3871f/attendance/bulk' && method === 'GET') {
        const bulks = [...store.attendanceBulks].sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
        return jsonResponse({ bulks });
      }
      const bulkMatch = path.match(/^\/make-server-73a3871f\/attendance\/bulk\/(.+)$/);
      if (bulkMatch && method === 'DELETE') {
        const id = bulkMatch[1];
        // delete all attendance with this bulkId
        store.attendance = store.attendance.filter(a => a.bulkId !== id);
        // delete attendance points tied to those dates/names
        // For simplicity, keep existing points; full parity would scan and remove matching attendance points.
        store.attendanceBulks = store.attendanceBulks.filter(b => b.id !== id);
        writeStore(store);
        return jsonResponse({ success: true });
      }

      // Leaderboards
      if (path === '/make-server-73a3871f/leaderboards' && method === 'GET') {
        const points = store.points;
        const cadetTotals: Record<string, number> = {};
        points.forEach(p => { cadetTotals[p.cadetName] = (cadetTotals[p.cadetName] || 0) + (p.points || 0); });
        const flightTotals: Record<string, number> = {};
        points.forEach(p => { flightTotals[p.flight] = (flightTotals[p.flight] || 0) + (p.points || 0); });
        const cadetLeaderboard = Object.entries(cadetTotals).map(([name, pts]) => ({ name, points: pts })).sort((a, b) => b.points - a.points);
        const flightLeaderboard = Object.entries(flightTotals).map(([flight, pts]) => ({ flight, points: pts })).sort((a, b) => b.points - a.points);
        const recentPoints = [...points].filter(p => p.type !== 'attendance').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20);
        return jsonResponse({ cadetLeaderboard, flightLeaderboard, recentPoints, winningCadet: cadetLeaderboard[0] || null, winningFlight: flightLeaderboard[0] || null });
      }

      // Integrity check (basic)
      if (path === '/make-server-73a3871f/integrity-check' && method === 'GET') {
        const cadets = store.cadets;
        const points = store.points;
        const attendance = store.attendance;
        const cadetNames = new Set(cadets.map(c => c.name.toLowerCase()));
        const invalidPoints = points.filter(p => !cadetNames.has(p.cadetName.toLowerCase()));
        const invalidAttendance = attendance.filter(a => !cadetNames.has(a.cadetName.toLowerCase()));
        const totalPointsGiven = points.reduce((s, p) => s + (p.points || 0), 0);
        const cadetTotals: Record<string, number> = {};
        points.forEach(p => { cadetTotals[p.cadetName] = (cadetTotals[p.cadetName] || 0) + (p.points || 0); });
        const totalPointsCalculated = Object.values(cadetTotals).reduce((s, v) => s + v, 0);
        const nameCounts: Record<string, number> = {};
        cadets.forEach(c => { const k = c.name.toLowerCase(); nameCounts[k] = (nameCounts[k] || 0) + 1; });
        const duplicates = Object.entries(nameCounts).filter(([, n]) => n > 1);
        const attendanceCadets = new Set(attendance.map(a => `${a.cadetName}:${a.date}`));
        const attendancePoints = points.filter(p => p.type === 'attendance');
        const orphanedPoints = attendancePoints.filter(p => !attendanceCadets.has(`${p.cadetName}:${p.date}`));
        const cadetsWithoutFlight = cadets.filter(c => !c.flight || c.flight.trim() === '');
        const checks = [
          { name: 'Points Reference Valid Cadets', status: invalidPoints.length === 0 ? 'pass' : 'fail', message: invalidPoints.length === 0 ? `All ${points.length} point records reference valid cadets` : `${invalidPoints.length} point record(s) reference non-existent cadets` },
          { name: 'Attendance References Valid Cadets', status: invalidAttendance.length === 0 ? 'pass' : 'fail', message: invalidAttendance.length === 0 ? `All ${attendance.length} attendance records reference valid cadets` : `${invalidAttendance.length} attendance record(s) reference non-existent cadets` },
          { name: 'Points Total Consistency', status: totalPointsGiven === totalPointsCalculated ? 'pass' : 'fail', message: totalPointsGiven === totalPointsCalculated ? `Points totals match: ${totalPointsGiven} points` : `Points mismatch detected` },
          { name: 'Unique Cadet Names', status: duplicates.length === 0 ? 'pass' : 'warning', message: duplicates.length === 0 ? `All ${cadets.length} cadet names are unique` : `${duplicates.length} duplicate cadet name(s) found` },
          { name: 'Attendance Points Have Records', status: orphanedPoints.length === 0 ? 'pass' : 'warning', message: orphanedPoints.length === 0 ? `All ${attendancePoints.length} attendance points have corresponding records` : `${orphanedPoints.length} attendance point(s) without records` },
          { name: 'All Cadets Assigned to Flight', status: cadetsWithoutFlight.length === 0 ? 'pass' : 'fail', message: cadetsWithoutFlight.length === 0 ? `All cadets are assigned to a flight` : `${cadetsWithoutFlight.length} cadet(s) not assigned to a flight` },
        ];
        const summary = { totalChecks: checks.length, passed: checks.filter(c => c.status === 'pass').length, warnings: checks.filter(c => c.status === 'warning').length, failed: checks.filter(c => c.status === 'fail').length };
        return jsonResponse({ checks, summary });
      }

      // Reports
      if (path === '/make-server-73a3871f/attendance/reports' && method === 'GET') {
        const attendance = store.attendance;
        const cadetSummary: Record<string, any> = {};
        attendance.forEach(rec => {
          const k = rec.cadetName;
          cadetSummary[k] = cadetSummary[k] || { cadetName: rec.cadetName, flight: rec.flight, totalPresent: 0, totalAuthorisedAbsence: 0, totalAbsent: 0, totalRecords: 0 };
          cadetSummary[k].totalRecords++;
          if (rec.status === 'present') cadetSummary[k].totalPresent++;
          else if (rec.status === 'authorised_absence') cadetSummary[k].totalAuthorisedAbsence++;
          else if (rec.status === 'absent') cadetSummary[k].totalAbsent++;
        });
        const summary = Object.values(cadetSummary).map((c: any) => ({ ...c, attendanceRate: c.totalRecords > 0 ? Math.round((c.totalPresent / c.totalRecords) * 100) : 0 }));
        const stats = {
          totalPresent: summary.reduce((s: number, c: any) => s + c.totalPresent, 0),
          totalAuthorisedAbsence: summary.reduce((s: number, c: any) => s + c.totalAuthorisedAbsence, 0),
          totalAbsent: summary.reduce((s: number, c: any) => s + c.totalAbsent, 0),
          averageAttendanceRate: summary.length > 0 ? Math.round(summary.reduce((s: number, c: any) => s + c.attendanceRate, 0) / summary.length) : 0,
        };
        return jsonResponse({ summary, stats });
      }

      // Default: not found for unimplemented routes
      return notFound('Local mode route not implemented: ' + path);
    } catch (e: any) {
      console.error('Local mode handler error', e);
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
  };
}
