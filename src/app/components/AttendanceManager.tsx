import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { getToken } from '../../utils/auth';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { formatFlight } from './ui/utils';
import { UserCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface AttendanceRecord {
  id: string;
  cadetName: string;
  date: string;
  flight: string;
  status: 'present' | 'absent';
  submittedBy: string;
  createdAt: string;
}

interface AttendanceManagerProps {
  userRole: string;
}

export function AttendanceManager({ userRole }: AttendanceManagerProps) {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [cadets, setCadets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkEvents, setBulkEvents] = useState<Array<any>>([]);

  // Bulk attendance state
  const [attendanceStatuses, setAttendanceStatuses] = useState<Record<string, 'present' | 'absent'>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [flightFilter, setFlightFilter] = useState<string>('all');
  const [bulkErrors, setBulkErrors] = useState<Array<{ cadetName: string; reason?: string }>>([]);
  const [bulkFailedEntries, setBulkFailedEntries] = useState<Array<any>>([]);

  // Form state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchAttendance();
    fetchCadets();
    fetchBulkAttendance();
  }, []);

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

  const handleSelectCadet = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    const visibleCount = cadets.filter(c => flightFilter === 'all' || c.flight === flightFilter).length;
    setSelectAll(next.size === visibleCount && visibleCount > 0);
  };

  const applyStatusToSelected = (status: 'present' | 'absent') => {
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
      const entries = targets.map(c => ({
        cadetName: c.name,
        flight: c.flight,
        date: new Date(selectedDate).toISOString(),
        status: attendanceStatuses[c.id] || 'absent',
        submittedBy: getToken() || 'unknown',
      }));

      // Submit as a single bulk request to avoid many parallel calls
      try {
        const res = await api.createBulkAttendance
          ? await api.createBulkAttendance({ entries, date: new Date(selectedDate).toISOString(), flightFilter })
          : await Promise.all(entries.map(entry => api.createAttendance(entry)));

        if (res && res.error) {
          setBulkErrors(entries.map(e => ({ cadetName: e.cadetName, reason: res.error || 'Failed' })));
          setBulkFailedEntries(entries);
          toast.error(`Saved 0 succeeded, ${entries.length} failed`);
        } else {
          toast.success(`Saved ${entries.length} attendance records`);
        }
      } catch (err: any) {
        setBulkErrors(entries.map(e => ({ cadetName: e.cadetName, reason: String(err) })));
        setBulkFailedEntries(entries);
        toast.error(`Saved 0 succeeded, ${entries.length} failed`);
      }

      setSelectedIds(new Set());
      setSelectAll(false);
      fetchAttendance();
      fetchBulkAttendance();
    } catch (err) {
      console.error('Bulk save error:', err);
      toast.error('Failed to save attendance in bulk');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const fetchAttendance = async () => {
    try {
      const data = await api.getAttendance();
      const attendanceData = data.attendance || [];
      setAttendance(attendanceData);
      try { localStorage.setItem('attendance', JSON.stringify(attendanceData)); } catch (e) { }
    } catch (error) {
      console.error('Error fetching attendance:', error);
      const localData = JSON.parse(localStorage.getItem('attendance') || '[]');
      setAttendance(localData);
      toast.error('Failed to load attendance records from server, using local data');
    } finally {
      setLoading(false);
    }
  };

  const fetchBulkAttendance = async () => {
    try {
      const data = await api.getAttendanceReports ? await api.getAttendanceReports() : {};
      setBulkEvents(data.bulks || []);
    } catch (error) {
      console.error('Error fetching bulk attendance:', error);
    }
  };

  const fetchCadets = async () => {
    try {
      const data = await api.getCadets();
      const cadetList = data.cadets || [];
      setCadets(cadetList);
      setAttendanceStatuses(prev => {
        const next = { ...prev };
        cadetList.forEach((c: any) => {
          if (!next[c.id]) next[c.id] = 'present';
        });
        return next;
      });
    } catch (error) {
      console.error('Error fetching cadets:', error);
      toast.error('Failed to load cadets from local storage');
    }
  };

  const handleDeleteBulk = async (bulkId: string) => {
    if (!confirm('Delete this bulk attendance session and its attendance records? This is irreversible.')) return;
    try {
      const res = await api.deleteAttendance ? await api.deleteAttendance(bulkId) : null;
      if (res && res.error) {
        toast.error(res.error || 'Failed to delete bulk attendance session');
      } else {
        toast.success('Bulk attendance session deleted');
        fetchAttendance();
        fetchBulkAttendance();
      }
    } catch (error) {
      console.error('Error deleting bulk attendance session:', error);
      toast.error('Failed to delete bulk attendance session');
    }
  };

  const canDelete = userRole === 'staff' || userRole === 'snco';

  const flights = Array.from(new Set(cadets.map(c => c.flight))).sort();
  const visibleCadets = cadets.filter(c => flightFilter === 'all' || c.flight === flightFilter);
  const presentCount = visibleCadets.filter(c => attendanceStatuses[c.id] === 'present').length;
  const selectedCount = selectedIds.size;

  return (
    <div className={`space-y-6 ${(userRole === 'snco' || userRole === 'staff') ? 'grid gap-6 md:grid-cols-3' : ''}`}>

      <Card className={(userRole === 'snco' || userRole === 'staff') ? 'md:col-span-2' : 'max-w-4xl mx-auto'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="size-5" />
            Bulk Attendance
          </CardTitle>
          <CardDescription>Quickly mark attendance for many cadets — select, set status, then 'Save All'</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="space-y-2 sm:col-span-1">
                <Label>Date</Label>
                <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              </div>

              <div className="space-y-2 sm:col-span-1">
                <Label>Flight</Label>
                <Select value={flightFilter} onValueChange={(v: any) => setFlightFilter(v)}>
                  <SelectTrigger id="bulk-flight">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Flights</SelectItem>
                    {flights.map(f => <SelectItem key={f} value={f}>{formatFlight(f)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
                <div className="w-full sm:w-auto mr-2 text-sm text-gray-600">Marked present: {presentCount} • Selected: {selectedCount}</div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center text-sm cursor-pointer">
                    <Checkbox checked={selectAll} onCheckedChange={toggleSelectAll} />
                    <span className="ml-2">Select All</span>
                  </label>
                </div>
                <Button variant="outline" size="sm" onClick={() => applyStatusToSelected('present')}>Mark Selected Present</Button>
                <Button variant="outline" size="sm" onClick={() => applyStatusToSelected('absent')}>Clear Selected</Button>
                <Button onClick={saveAttendanceBulk} disabled={bulkSubmitting}>{bulkSubmitting ? 'Saving...' : 'Save All'}</Button>
              </div>
            </div>

            <div className="mt-4 border-t pt-4">
              <Label>Mark Attendance (Manual)</Label>
              <div className="mt-3 grid gap-2 max-h-80 overflow-y-auto">
                {visibleCadets.length === 0 ? (
                  <div className="text-sm text-gray-500">No cadets for the selected flight.</div>
                ) : (
                  visibleCadets.map((c) => (
                    <label key={c.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={attendanceStatuses[c.id] === 'present'}
                          onCheckedChange={(v) => {
                            const isPresent = Boolean(v);
                            setAttendanceStatuses(prev => ({ ...prev, [c.id]: isPresent ? 'present' : 'absent' }));
                            const ids = new Set(selectedIds);
                            if (isPresent) ids.add(c.id); else ids.delete(c.id);
                            setSelectedIds(ids);
                            setSelectAll(ids.size === visibleCadets.length && visibleCadets.length > 0);
                          }}
                        />
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-gray-500">{formatFlight(c.flight)}</div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">{attendanceStatuses[c.id] === 'present' ? 'Present' : 'Absent'}</div>
                    </label>
                  ))
                )}
              </div>
            </div>

            {bulkErrors.length > 0 && (
              <div className="mt-3 text-sm text-red-600">
                <div className="flex items-center justify-between">
                  <div>Failed to save {bulkErrors.length} records:</div>
                  <div>
                    <Button size="sm" variant="outline" onClick={async () => {
                      if (bulkFailedEntries.length === 0) return;
                      setBulkSubmitting(true);
                      try {
                        const retryResults = await Promise.all(bulkFailedEntries.map(async (entry: any) => {
                          try {
                            const existingRecords = JSON.parse(localStorage.getItem('attendance') || '[]');
                            const newRecord = {
                              ...entry,
                              id: `attn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                              createdAt: new Date().toISOString(),
                              submittedBy: 'local_user'
                            };
                            existingRecords.push(newRecord);
                            localStorage.setItem('attendance', JSON.stringify(existingRecords));
                            return { ok: true, cadetName: entry.cadetName };
                          } catch (err: any) {
                            return { ok: false, cadetName: entry.cadetName, reason: String(err), entry };
                          }
                        }));

                        const stillFailed = retryResults.filter(r => !r.ok);
                        if (stillFailed.length > 0) {
                          setBulkErrors(stillFailed.map(s => ({ cadetName: s.cadetName, reason: s.reason })));
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
        </CardContent>
      </Card>

      {(userRole === 'snco' || userRole === 'staff') && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Attendance</CardTitle>
            <CardDescription>Last 15 bulk attendance sessions</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : bulkEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No bulk attendance recorded yet</div>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto">
                {bulkEvents.slice(0, 15).map((b) => (
                  <div key={b.id} className="p-3 border rounded-lg bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">Session on {new Date(b.date).toLocaleString()}</p>
                          <Badge variant="outline" className="text-xs">{formatFlight(b.flightFilter)}</Badge>
                        </div>
                        <p className="text-sm text-gray-600">Present: {b.totalPresent} / {b.totalRecords}</p>
                        <p className="text-sm text-gray-600">Submitted by: {b.submittedBy}</p>
                      </div>
                      {canDelete && (
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteBulk(b.id)}>
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
      )}
    </div>
  );
}
