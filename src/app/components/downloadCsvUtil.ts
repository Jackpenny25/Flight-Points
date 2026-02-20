import { api } from '../../utils/api';

function arrayToCsv(rows: Record<string, any>[]): string {
  if (!rows || rows.length === 0) return ''
  const keySet = new Set<string>()
  rows.forEach(r => { Object.keys(r).forEach(k => keySet.add(k)) })
  const keys = Array.from(keySet)
  const escape = (v: any) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const header = keys.join(',')
  const body = rows.map(r => keys.map(k => escape(r[k])).join(',')).join('\n')
  return header + '\n' + body
}

function downloadBlob(filename: string, content: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function exportAllCsvs(accessToken?: string | null) {
  // Implemented to be reused by UI components
  try {
    // Fetch data from API
    const cadets = await api.getCadets();
    const attendance = await api.getAttendance();
    const points = await api.getPoints();

    const cadetsCount = cadets?.length || 0;
    const attendanceCount = attendance?.length || 0;
    const pointsCount = points?.length || 0;
    
    if (cadetsCount === 0 && attendanceCount === 0 && pointsCount === 0) {
      console.warn('exportAllCsvs: no data found', { cadetsCount, attendanceCount, pointsCount });
      throw new Error(`No cadet, attendance, or points data found to export. Found counts — cadets: ${cadetsCount}, attendance: ${attendanceCount}, points: ${pointsCount}.`);
    }

    const pointRecords = (points || []).map((p: any) => ({
      id: p.id || p.pointId || '',
      cadetName: p.cadetName || p.name || p.cadet || '',
      date: p.date || p.created_at || p.timestamp || '',
      reason: p.reason || p.note || '',
      points: p.points != null ? p.points : (p.value != null ? p.value : ''),
      flight: p.flight || p.unit || p.squad || '',
      type: p.type || ''
    }))

    const attendanceRecords = (attendance || []).map((a: any) => ({
      id: a.id || '',
      cadetName: a.cadetName || a.name || '',
      date: a.date || a.sessionDate || '',
      present: a.present != null ? a.present : (a.attended != null ? a.attended : ''),
      flight: a.flight || a.unit || ''
    }))

    const cadetTotalsMap: Record<string, number> = {}
    for (const p of pointRecords) {
      const n = (p.cadetName || '').trim()
      if (!n) continue
      cadetTotalsMap[n] = (cadetTotalsMap[n] || 0) + Number(p.points || 0)
    }

    for (const c of (cadets || [])) {
      const name = (c.name || c.fullName || c.cadetName || '').trim()
      if (!name) continue
      const pts = Number((c as any).points ?? (c as any).totalPoints ?? 0)
      if (pts) cadetTotalsMap[name] = (cadetTotalsMap[name] || 0) + pts
    }

    const flightTotalsMap: Record<string, number> = {}
    for (const p of pointRecords) {
      const f = p.flight || 'Unknown'
      flightTotalsMap[f] = (flightTotalsMap[f] || 0) + Number(p.points || 0)
    }

    const pointsCsvRows = pointRecords.map((p: any) => ({ id: p.id, cadetName: p.cadetName, date: p.date, reason: p.reason, points: p.points, flight: p.flight, type: p.type }))
    const attendanceCsvRows = attendanceRecords.map((a: any) => ({ id: a.id, cadetName: a.cadetName, date: a.date, present: a.present, flight: a.flight }))

    const cadetTotalsRows = Object.entries(cadetTotalsMap).map(([name, pts]) => {
      const found = (cadets || []).find((c: any) => ((c.name || c.fullName || c.cadetName) || '').trim() === name)
      return { name, flight: found ? (found.flight || found.unit || '') : '', totalPoints: pts }
    }).sort((a, b) => b.totalPoints - a.totalPoints)

    const flightTotalsRows = Object.entries(flightTotalsMap).map(([flight, pts]) => ({ flight, totalPoints: pts })).sort((a, b) => b.totalPoints - a.totalPoints)

    const cadetBreakdownRows: Record<string, any>[] = []
    for (const name of Object.keys(cadetTotalsMap)) {
      const theirPoints = pointRecords.filter(p => (p.cadetName || '').trim() === name)
      for (const p of theirPoints) {
        cadetBreakdownRows.push({ cadetName: name, entryType: 'point', date: p.date, reason: p.reason, points: p.points, flight: p.flight })
      }
      const theirAttendance = attendanceRecords.filter(a => (a.cadetName || '').trim() === name)
      for (const a of theirAttendance) {
        cadetBreakdownRows.push({ cadetName: name, entryType: 'attendance', date: a.date, present: a.present, points: '' , flight: a.flight })
      }
    }

    const topCadet = cadetTotalsRows.length > 0 ? cadetTotalsRows[0] : null

    if (pointsCsvRows.length > 0) downloadBlob('points.csv', arrayToCsv(pointsCsvRows))
    if (attendanceCsvRows.length > 0) downloadBlob('attendance.csv', arrayToCsv(attendanceCsvRows))
    if (cadetTotalsRows.length > 0) downloadBlob('cadet_totals.csv', arrayToCsv(cadetTotalsRows))
    if (flightTotalsRows.length > 0) downloadBlob('flight_totals.csv', arrayToCsv(flightTotalsRows))
    if (cadetBreakdownRows.length > 0) downloadBlob('cadet_breakdowns.csv', arrayToCsv(cadetBreakdownRows))

    if (topCadet) {
      downloadBlob('top_cadet.csv', arrayToCsv([ { name: topCadet.name, flight: topCadet.flight, totalPoints: topCadet.totalPoints } ]))
      return { topCadet: { name: topCadet.name, totalPoints: topCadet.totalPoints } }
    }
    return { topCadet: null }

  } catch (err) {
    console.error('exportAllCsvs failed', err)
    throw err
  }
}
