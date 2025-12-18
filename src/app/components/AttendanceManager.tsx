import { useState, useEffect, useRef } from 'react';
import { projectId } from '../../../utils/supabase/info';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { CalendarDays, UserCheck, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface AttendanceRecord {
  id: string;
  cadetName: string;
  date: string;
  flight: string;
  status: 'present' | 'authorised_absence' | 'absent';
  submittedBy: string;
  createdAt: string;
}

interface AttendanceManagerProps {
  accessToken: string;
  userRole: string;
}

export function AttendanceManager({ accessToken, userRole }: AttendanceManagerProps) {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [cadets, setCadets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Bulk attendance state
  const [attendanceStatuses, setAttendanceStatuses] = useState<Record<string, 'present' | 'authorised_absence' | 'absent'>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [flightFilter, setFlightFilter] = useState<string>('all');
  const [bulkStatus, setBulkStatus] = useState<'present' | 'authorised_absence' | 'absent'>('present');
  const [bulkErrors, setBulkErrors] = useState<Array<{ cadetName: string; reason?: string }>>([]);
  const [bulkFailedEntries, setBulkFailedEntries] = useState<Array<any>>([]);

  // OCR state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrMatches, setOcrMatches] = useState<Array<{ line: string; cadet?: any }>>([]);
  const ocrFileRef = useRef<HTMLInputElement | null>(null);

  // Tick-detection (fallback) state
  const [tickDetectLoading, setTickDetectLoading] = useState(false);
  const [tickDetections, setTickDetections] = useState<Array<{ cadetId?: string; cadetName?: string; present: boolean; confidence: number }>>([]);


  // Form state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCadet, setSelectedCadet] = useState('');
  const [selectedFlight, setSelectedFlight] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState<'present' | 'authorised_absence' | 'absent'>('present');

  // Helpers for bulk
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
      return;
    }
    const ids = cadets
      .filter(c => flightFilter === 'all' || c.flight === flightFilter)
      .map(c => c.id);
    setSelectedIds(new Set(ids));
    setSelectAll(true);
  };

  const handleOcrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setOcrImage(url);
    setOcrText('');
    setOcrMatches([]);
    setOcrError(null);
  };

  const runOcr = async () => {
    if (!ocrImage) {
      setOcrError('Please select an image first');
      return;
    }

    setOcrLoading(true);
    setOcrError(null);
    setOcrText('');
    setOcrMatches([]);
    setTickDetections([]);

    // Attempt to run full OCR (text extraction). If that fails, fallback to image-based tick detection.
    try {
      // Dynamically import tesseract if installed; keep bundlers from resolving it at build time
      const modName = 'tesseract.js';
      let createWorkerFn: any;
      try {
        const mod = await import(/* @vite-ignore */ modName);
        createWorkerFn = mod.createWorker || (mod as any).default?.createWorker || mod;
      } catch (e) {
        // Not installed or failed import: fallback to tick detection
        console.warn('tesseract import failed, falling back to tick-detection', e);
        await runTickDetection();
        return;
      }

      const worker = createWorkerFn({ logger: (m: any) => {} });
      await worker.load();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      const { data: { text } } = await worker.recognize(ocrImage);
      await worker.terminate();
      setOcrText(text || '');

      // parse lines and try to match cadet names
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const matches: Array<{ line: string; cadet?: any }> = [];
      const cadetLower = cadets.map(c => ({ ...c, _name: c.name.toLowerCase() }));
      for (const line of lines) {
        const l = line.toLowerCase();
        const match = cadetLower.find(c => c._name.includes(l) || l.includes(c._name) || c._name.split(' ')[0] === l.split(' ')[0]);
        matches.push({ line, cadet: match });
      }
      setOcrMatches(matches);

      // if OCR succeeds, also attempt tick-detection to get per-row marks (optional enhancement)
      try {
        await runTickDetection();
      } catch (e) {
        // non-fatal - leave tickDetections empty
        console.warn('tick detection after ocr failed', e);
      }
    } catch (err: any) {
      console.error('OCR failed', err);
      // If OCR failed due to runtime issues, attempt tick-detection fallback and report any helpful messages
      try {
        await runTickDetection();
      } catch (e: any) {
        console.error('Tick-detection fallback also failed', e);
        const msg = e?.message || String(e) || 'OCR failed. Try a clearer photo or use manual entry.';
        setOcrError(msg.includes('flight') || msg.includes('cadets') ? msg : 'OCR failed. Try a clearer photo or use manual entry.');
      }
    } finally {
      setOcrLoading(false);
    }
  };

  // Canvas-based tick detection fallback (works without tesseract)
  // sensitivity slider state (tunable)
  const [tickThreshold, setTickThreshold] = useState<number>(0.02);

  const runTickDetection = async () => {
    if (!ocrImage) throw new Error('No image');
    if (!cadets || cadets.length === 0) throw new Error('No cadets loaded to match rows');

    // Use the selected flight filter to detect only that flight's cadets (recommended workflow)
    const cadetsToMatch = flightFilter === 'all' ? cadets : cadets.filter(c => c.flight === flightFilter);
    if (cadetsToMatch.length === 0) throw new Error('No cadets for selected flight — choose a flight first');

    setTickDetectLoading(true);
    setTickDetections([]);

    // Load image
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = (e) => reject(new Error('Image load failed'));
      i.src = ocrImage as string;
    });

    // Resize to a reasonable width for processing
    const maxW = 1200;
    const scale = Math.min(1, maxW / img.naturalWidth);
    const wScaled = Math.max(1, Math.floor(img.naturalWidth * scale));
    const hScaled = Math.max(1, Math.floor(img.naturalHeight * scale));

    // draw to canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');

    canvas.width = wScaled;
    canvas.height = hScaled;
    ctx.drawImage(img, 0, 0, wScaled, hScaled);

    const w = canvas.width;
    const h = canvas.height;

    // Preprocess: grayscale and compute luminance array
    const fullImg = ctx.getImageData(0, 0, w, h);
    const lum = new Float32Array(w * h);
    const lumArr: number[] = [];
    for (let i = 0; i < fullImg.data.length; i += 4) {
      const r = fullImg.data[i];
      const g = fullImg.data[i + 1];
      const b = fullImg.data[i + 2];
      const yV = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[i / 4] = yV;
      lumArr.push(yV);
    }

    // compute median-based threshold for binarization
    lumArr.sort((a, b) => a - b);
    const median = lumArr[Math.floor(lumArr.length / 2)] || 128;
    const thresh = Math.max(40, Math.min(220, median * 0.9));

    // Binarize to a boolean grid (black = true)
    const bw = new Uint8ClampedArray(w * h);
    for (let i = 0; i < lum.length; i++) {
      bw[i] = lum[i] < thresh ? 1 : 0;
    }

    // Determine the approximate vertical span containing text by vertical projection on left area
    const leftW = Math.floor(w * 0.6);
    const rowSums = new Array(h).fill(0);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = 0; x < leftW; x++) {
        if (bw[y * w + x]) sum++;
      }
      rowSums[y] = sum;
    }

    const meanRow = rowSums.reduce((a, b) => a + b, 0) / rowSums.length;
    const active = rowSums.map(v => v > Math.max(2, meanRow * 0.12));

    // find runs of active rows -> text lines
    const runs: Array<{ y0: number; y1: number }> = [];
    let inRun = false;
    let start = 0;
    for (let y = 0; y < h; y++) {
      if (active[y]) {
        if (!inRun) { inRun = true; start = y; }
      } else {
        if (inRun) { inRun = false; runs.push({ y0: start, y1: y - 1 }); }
      }
    }
    if (inRun) runs.push({ y0: start, y1: h - 1 });

    // Reduce/merge small runs and compute centers
    const centers: number[] = runs.map(r => Math.floor((r.y0 + r.y1) / 2));

    // If we didn't find enough centers, fallback to equal-split based on cadet count
    if (centers.length < Math.max(3, cadetsToMatch.length / 2)) {
      // fallback to dividing active area
      const top = runs.length ? runs[0].y0 : 0;
      const bottom = runs.length ? runs[runs.length - 1].y1 : h - 1;
      const totalRows = cadetsToMatch.length;
      const rowHeight = Math.max(8, Math.floor((bottom - top + 1) / totalRows));
      centers.length = 0;
      for (let i = 0; i < totalRows; i++) centers.push(top + i * rowHeight + Math.floor(rowHeight / 2));
    }

    // Heuristic: tick column on the right side, but find the column with highest dark variance in right half
    const searchStart = Math.max(0, Math.floor(w * 0.55));
    const searchEnd = w - 1;
    const colScores: number[] = new Array(w).fill(0);
    for (let x = searchStart; x <= searchEnd; x++) {
      let colSum = 0;
      for (let y = 0; y < h; y++) {
        colSum += bw[y * w + x];
      }
      colScores[x] = colSum;
    }
    // pick column with max sum in search area and use a window around it
    let bestX = searchStart;
    let bestVal = -1;
    for (let x = searchStart; x <= searchEnd; x++) {
      if (colScores[x] > bestVal) { bestVal = colScores[x]; bestX = x; }
    }
    const tickColStart = Math.max(0, bestX - Math.floor(w * 0.06));
    const tickColEnd = Math.min(w, bestX + Math.floor(w * 0.06));
    const tickColWidth = Math.max(6, tickColEnd - tickColStart + 1);

    const detections: Array<{ cadetId?: string; cadetName?: string; present: boolean; confidence: number }> = [];

    // For each center, analyse a small band around the center in tick column
    for (let i = 0; i < centers.length && i < cadetsToMatch.length; i++) {
      const centerY = centers[i];
      const band = Math.max(6, Math.floor((h / centers.length) * 0.6));
      const y0 = Math.max(0, centerY - Math.floor(band / 2));
      const y1 = Math.min(h - 1, centerY + Math.floor(band / 2));
      let dark = 0;
      let total = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = tickColStart; x < tickColStart + tickColWidth; x++) {
          if (bw[y * w + x]) dark++;
          total++;
        }
      }
      const ratio = total > 0 ? dark / total : 0;
      const present = ratio > tickThreshold; // user-tunable
      // Confidence scales with ratio beyond threshold
      const conf = Math.min(1, Math.max(0, (ratio - tickThreshold) / (0.5 - tickThreshold)));
      const cad = cadetsToMatch[i];
      detections.push({ cadetId: cad.id, cadetName: cad.name, present, confidence: conf });
    }

    // If we had more cadets than detected centers, fill the rest as absent
    if (detections.length < cadetsToMatch.length) {
      for (let j = detections.length; j < cadetsToMatch.length; j++) {
        const cad = cadetsToMatch[j];
        detections.push({ cadetId: cad.id, cadetName: cad.name, present: false, confidence: 0 });
      }
    }

    setTickDetections(detections);
    setTickDetectLoading(false);
  };

  const applyOcrMatches = () => {
    const ids = new Set(selectedIds);
    setAttendanceStatuses(prev => {
      const next = { ...prev };
      ocrMatches.forEach(m => {
        if (m.cadet) {
          next[m.cadet.id] = 'present';
          ids.add(m.cadet.id);
        }
      });
      return next;
    });
    setSelectedIds(ids);
    toast.success(`Applied ${ocrMatches.filter(m => m.cadet).length} OCR matches`);
  };

  const handleSelectCadet = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    const visibleCount = cadets.filter(c => flightFilter === 'all' || c.flight === flightFilter).length;
    setSelectAll(next.size === visibleCount && visibleCount > 0);
  };

  const applyStatusToSelected = (status: 'present' | 'authorised_absence' | 'absent') => {
    setAttendanceStatuses(prev => {
      const next = { ...prev };
      cadets.forEach(c => {
        if (selectedIds.size === 0 || selectedIds.has(c.id)) {
          next[c.id] = status;
        }
      });
      return next;
    });
  };

  const saveAttendanceBulk = async () => {
    const targets = cadets.filter(c => (selectedIds.size ? selectedIds.has(c.id) : true) && (flightFilter === 'all' || c.flight === flightFilter));
    if (targets.length === 0) {
      toast.error('No cadets selected for bulk save');
      return;
    }

    setBulkSubmitting(true);
    setBulkErrors([]);

    try {
      const postHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) postHeaders['Authorization'] = `Bearer ${accessToken}`;

      const entries = targets.map(c => ({
        cadetName: c.name,
        flight: c.flight,
        date: new Date(selectedDate).toISOString(),
        status: attendanceStatuses[c.id] || 'present',
      }));

      const results = await Promise.all(entries.map(async (entry) => {
        try {
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/attendance`,
            {
              method: 'POST',
              headers: postHeaders,
              body: JSON.stringify(entry),
            }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'unknown' }));
            return { ok: false, cadetName: entry.cadetName, reason: err.error || res.statusText || 'Failed', entry };
          }
          return { ok: true, cadetName: entry.cadetName };
        } catch (err: any) {
          return { ok: false, cadetName: entry.cadetName, reason: String(err), entry };
        }
      }));

      const failures = results.filter(r => !r.ok);
      if (failures.length > 0) {
        setBulkErrors(failures.map(f => ({ cadetName: f.cadetName, reason: f.reason })));
        setBulkFailedEntries(failures.map(f => f.entry));
        toast.error(`Saved ${entries.length - failures.length} succeeded, ${failures.length} failed`);
      } else {
        setBulkFailedEntries([]);
        toast.success(`Saved ${entries.length} attendance records`);
      }

      setSelectedIds(new Set());
      setSelectAll(false);
      fetchAttendance();
    } catch (err) {
      console.error('Bulk save error:', err);
      toast.error('Failed to save attendance in bulk');
    } finally {
      setBulkSubmitting(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
    fetchCadets();
  }, []);

  const fetchAttendance = async () => {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/attendance`,
        { headers }
      );

      if (response.ok) {
        const data = await response.json();
        setAttendance(data.attendance || []);
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
      toast.error('Failed to fetch attendance');
    } finally {
      setLoading(false);
    }
  };

  const fetchCadets = async () => {
    try {
      const headers2: Record<string, string> = {};
      if (accessToken) headers2['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/cadets`,
        { headers: headers2 }
      );

      if (response.ok) {
        const data = await response.json();
        const cadetList = data.cadets || [];
        setCadets(cadetList);
        // Initialize attendance statuses for new cadets
        setAttendanceStatuses(prev => {
          const next = { ...prev };
          cadetList.forEach((c: any) => {
            if (!next[c.id]) next[c.id] = 'present';
          });
          return next;
        });
      }
    } catch (error) {
      console.error('Error fetching cadets:', error);
    }
  };

  const handleSubmitAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const postHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) postHeaders['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/attendance`,
        {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify({
            cadetName: selectedCadet,
            flight: selectedFlight,
            date: new Date(selectedDate).toISOString(),
            status: attendanceStatus,
          }),
        }
      );

      if (response.ok) {
        toast.success('Attendance recorded successfully!');
        setSelectedCadet('');
        setSelectedFlight('');
        setAttendanceStatus('present');
        fetchAttendance();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to record attendance');
      }
    } catch (error) {
      console.error('Error submitting attendance:', error);
      toast.error('Failed to record attendance');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAttendance = async (attendanceId: string) => {
    if (!confirm('Are you sure you want to delete this attendance record?')) {
      return;
    }

    try {
      const delHeaders: Record<string, string> = {};
      if (accessToken) delHeaders['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/attendance/${attendanceId}`,
        {
          method: 'DELETE',
          headers: delHeaders,
        }
      );

      if (response.ok) {
        toast.success('Attendance record deleted');
        fetchAttendance();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete attendance');
      }
    } catch (error) {
      console.error('Error deleting attendance:', error);
      toast.error('Failed to delete attendance');
    }
  };

  const canDelete = userRole === 'staff' || userRole === 'snco';

  // Get unique flights from cadets
  const flights = Array.from(new Set(cadets.map(c => c.flight))).sort();

  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'present':
        return 'default';
      case 'authorised_absence':
        return 'secondary';
      case 'absent':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'present':
        return 'Present Correctly Dressed';
      case 'authorised_absence':
        return 'Authorised Absence';
      case 'absent':
        return 'Absent';
      default:
        return status;
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">

      {/* Bulk Attendance (for large groups) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="size-5" />
            Bulk Attendance
          </CardTitle>
          <CardDescription>Quickly mark attendance for many cadets — select, set status, then 'Save All'</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex gap-3 items-center">
              <Label>Date</Label>
              <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />

              <Label>Flight</Label>
              <Select value={flightFilter} onValueChange={(v: any) => setFlightFilter(v)}>
                <SelectTrigger id="bulk-flight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Flights</SelectItem>
                  {flights.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="ml-auto flex items-center gap-2">
                <button className="btn-ghost text-sm" onClick={toggleSelectAll} type="button">
                  <Checkbox checked={selectAll} onCheckedChange={toggleSelectAll} />
                  <span className="ml-2">Select All</span>
                </button>
                <Select value={bulkStatus} onValueChange={(v: any) => setBulkStatus(v)}>
                  <SelectTrigger id="bulk-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="authorised_absence">Authorised Absence</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => applyStatusToSelected(bulkStatus)}>Set Selected</Button>
                <Button onClick={saveAttendanceBulk} disabled={bulkSubmitting}>{bulkSubmitting ? 'Saving...' : 'Save All'}</Button>
              </div>
            </div>

            {/* OCR Section */}
            <div className="mt-4 border-t pt-4">
              <Label>Photo Register (OCR)</Label>
              <div className="flex items-center gap-3 mt-2">
                <input ref={ocrFileRef} type="file" accept="image/*" className="hidden" onChange={handleOcrFileChange} />
                <Button variant="outline" onClick={() => ocrFileRef.current?.click()}>Choose Photo</Button>
                <Button onClick={runOcr} disabled={ocrLoading || tickDetectLoading || !ocrImage}>{(ocrLoading || tickDetectLoading) ? 'Scanning...' : 'Run OCR'}</Button>
                <Button variant="ghost" onClick={() => { setOcrImage(null); setOcrText(''); setOcrMatches([]); setTickDetections([]); setOcrError(null); setTickDetectLoading(false); }}>Clear</Button>
              </div>

              {flightFilter === 'all' && (
                <div className="text-xs text-gray-500 mt-2">Tip: Select a flight in the filter before scanning for best results (maps rows to cadets automatically).</div>
              )}

              <div className="mt-2 flex items-center gap-3">
                <div className="text-xs text-gray-500">Sensitivity</div>
                <input type="range" min="0.005" max="0.08" step="0.005" value={tickThreshold} onChange={(e) => setTickThreshold(Number(e.target.value))} />
                <div className="text-xs text-gray-500">{(tickThreshold*100).toFixed(1)}%</div>
              </div>

              {ocrImage && (
                <div className="mt-3">
                  <img src={ocrImage} className="max-h-48 object-contain rounded border" alt="OCR upload preview" />
                </div>
              )}

              {ocrError && (
                <div className="text-sm text-red-600 mt-2">{ocrError}</div>
              )}

              {ocrText && (
                <div className="mt-3 space-y-2">
                  <div className="text-sm text-gray-600">Parsed lines (click to accept match):</div>
                  <div className="grid gap-2">
                    {ocrMatches.map((m, idx) => (
                      <div key={idx} className="p-2 border rounded flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{m.line}</div>
                          <div className="text-xs text-gray-500">{m.cadet ? `Matched: ${m.cadet.name}` : 'No match'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => {
                            if (m.cadet) {
                              setAttendanceStatuses(prev => ({ ...prev, [m.cadet.id]: 'present' }));
                              setSelectedIds(prev => new Set(prev).add(m.cadet.id));
                              toast.success(`Accepted ${m.cadet.name}`);
                            } else {
                              toast.error('No matched cadet for this line');
                            }
                          }}>Accept</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Button onClick={applyOcrMatches} disabled={ocrMatches.filter(m => m.cadet).length === 0}>Apply Matches to Bulk</Button>
                  </div>
                </div>
              )}

              {tickDetections.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-sm text-gray-600">Detected ticks (preview):</div>
                  <div className="grid gap-2">
                    {tickDetections.map((t, idx) => (
                      <div key={idx} className="p-2 border rounded flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{t.cadetName}</div>
                          <div className="text-xs text-gray-500">{t.present ? 'Detected: Present' : 'Detected: Not present'} • Confidence: {(t.confidence*100).toFixed(0)}%</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant={t.present ? 'default' : 'outline'} onClick={() => {
                            setTickDetections(prev => prev.map((x, i) => i === idx ? { ...x, present: !x.present } : x));
                          }}>{t.present ? 'Present' : 'Mark Present'}</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => {
                      // apply tick detections to attendanceStatuses
                      const ids = new Set(selectedIds);
                      setAttendanceStatuses(prev => {
                        const next = { ...prev };
                        tickDetections.forEach(d => {
                          if (d.cadetId) {
                            next[d.cadetId] = d.present ? 'present' : 'absent';
                            if (d.present) ids.add(d.cadetId);
                            else ids.delete(d.cadetId);
                          }
                        });
                        return next;
                      });
                      setSelectedIds(ids);
                      toast.success(`Applied ${tickDetections.filter(d => d.present).length} detected presents`);
                    }}>Apply Detections to Bulk</Button>
                    <Button variant="outline" onClick={() => setTickDetections([])}>Clear Detections</Button>
                  </div>
                </div>
              )}

              {bulkErrors.length > 0 && (
                <div className="mt-3 text-sm text-red-600">
                  <div className="flex items-center justify-between">
                    <div>Failed to save {bulkErrors.length} records:</div>
                    <div>
                      <Button size="sm" variant="outline" onClick={async () => {
                        if (bulkFailedEntries.length === 0) return;
                        setBulkSubmitting(true);
                        try {
                          const postHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
                          if (accessToken) postHeaders['Authorization'] = `Bearer ${accessToken}`;
                          const retryResults = await Promise.all(bulkFailedEntries.map(async (entry: any) => {
                            try {
                              const res = await fetch(
                                `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/attendance`,
                                { method: 'POST', headers: postHeaders, body: JSON.stringify(entry) }
                              );
                              if (!res.ok) {
                                const err = await res.json().catch(() => ({ error: 'unknown' }));
                                return { ok: false, name: entry.cadetName, reason: err.error || res.statusText };
                              }
                              return { ok: true, name: entry.cadetName };
                            } catch (err: any) {
                              return { ok: false, name: entry.cadetName, reason: String(err) };
                            }
                          }));

                          const stillFailed = retryResults.filter(r => !r.ok);
                          if (stillFailed.length > 0) {
                            setBulkErrors(stillFailed.map(s => ({ cadetName: s.name, reason: s.reason })));
                            setBulkFailedEntries(stillFailed.map((s: any) => s.entry));
                            toast.error(`Retry completed: ${stillFailed.length} failures remain`);
                          } else {
                            setBulkErrors([]);
                            setBulkFailedEntries([]);
                            toast.success('All failed entries retried successfully');
                          }
                          fetchAttendance();
                        } catch (err) {
                          console.error('Retry failed', err);
                          toast.error('Retry failed');
                        } finally {
                          setBulkSubmitting(false);
                        }
                      }}>Retry Failed</Button>
                    </div>
                  </div>
                  <ul className="list-disc pl-5 mt-1">
                    {bulkErrors.map((b, i) => (
                      <li key={i}>{b.cadetName}: {b.reason || 'Unknown'}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>


          </div>
        </CardContent>
      </Card>

      {/* Attendance Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-5" />
            Record Attendance
          </CardTitle>
          <CardDescription>Mark cadet attendance for a specific date</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitAttendance} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="attendance-date">Date</Label>
              <Input
                id="attendance-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="attendance-cadet">Cadet Name</Label>
              <Select value={selectedCadet} onValueChange={(value) => {
                setSelectedCadet(value);
                const cadet = cadets.find(c => c.name === value);
                if (cadet) setSelectedFlight(cadet.flight);
              }}>
                <SelectTrigger id="attendance-cadet">
                  <SelectValue placeholder="Select a cadet" />
                </SelectTrigger>
                <SelectContent>
                  {cadets.map((cadet) => (
                    <SelectItem key={cadet.id} value={cadet.name}>
                      {cadet.name} ({cadet.flight})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="attendance-flight">Flight</Label>
              <Select value={selectedFlight} onValueChange={setSelectedFlight}>
                <SelectTrigger id="attendance-flight">
                  <SelectValue placeholder="Select flight" />
                </SelectTrigger>
                <SelectContent>
                  {flights.map((flight) => (
                    <SelectItem key={flight} value={flight}>
                      {flight}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="attendance-status">Status</Label>
              <Select 
                value={attendanceStatus} 
                onValueChange={(value: any) => setAttendanceStatus(value)}
              >
                <SelectTrigger id="attendance-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">
                    <div className="flex items-center gap-2">
                      <UserCheck className="size-4 text-green-600" />
                      Present Correctly Dressed
                    </div>
                  </SelectItem>
                  <SelectItem value="authorised_absence">
                    Authorised Absence
                  </SelectItem>
                  <SelectItem value="absent">
                    Absent
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              <Plus className="size-4 mr-2" />
              {submitting ? 'Recording...' : 'Record Attendance'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Recent Attendance */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Attendance</CardTitle>
          <CardDescription>Last 15 attendance records</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : attendance.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No attendance recorded yet</div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {attendance.slice(0, 15).map((record) => (
                <div key={record.id} className="p-3 border rounded-lg bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{record.cadetName}</p>
                        <Badge variant="outline" className="text-xs">
                          {record.flight}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">
                        {new Date(record.date).toLocaleDateString()}
                      </p>
                      <Badge variant={getStatusBadge(record.status)} className="mt-1">
                        {getStatusLabel(record.status)}
                      </Badge>
                    </div>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAttendance(record.id)}
                      >
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
