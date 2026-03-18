import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { getToken, getUser } from '../../utils/auth';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { formatFlight } from './ui/utils';
import { UserCheck, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
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
  canDeleteBulk?: boolean;
  canViewRecentSessions?: boolean;
  canEditSavedAttendance?: boolean;
}

export function AttendanceManager({ userRole, canDeleteBulk = false, canViewRecentSessions = false, canEditSavedAttendance = false }: AttendanceManagerProps) {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [cadets, setCadets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkEvents, setBulkEvents] = useState<Array<any>>([]);
  const [expandedBulkIds, setExpandedBulkIds] = useState<Set<string>>(new Set());
  const [bulkRecords, setBulkRecords] = useState<Record<string, AttendanceRecord[]>>({});
  const [loadingBulkIds, setLoadingBulkIds] = useState<Set<string>>(new Set());
  const [updatingRecordIds, setUpdatingRecordIds] = useState<Set<string>>(new Set());

  // Bulk attendance state
  const [attendanceStatuses, setAttendanceStatuses] = useState<Record<string, 'present' | 'absent'>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [flightFilter, setFlightFilter] = useState<string>('all');
  const [bulkErrors, setBulkErrors] = useState<Array<{ cadetName: string; reason?: string }>>([]);
  const [bulkFailedEntries, setBulkFailedEntries] = useState<Array<any>>([]);
  const [collapsedFlights, setCollapsedFlights] = useState<Set<string>>(new Set());

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
      .filter(c => c.flight && c.flight.toLowerCase() !== 'hq' && (flightFilter === 'all' || c.flight === flightFilter))
      .map(c => c.id);
    setSelectedIds(new Set(ids));
    setSelectAll(true);
  };

  const handleSelectCadet = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    const visibleCount = cadets.filter(c => c.flight && c.flight.toLowerCase() !== 'hq' && (flightFilter === 'all' || c.flight === flightFilter)).length;
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
    const targets = cadets.filter(c => c.flight && c.flight.toLowerCase() !== 'hq' && (flightFilter === 'all' || c.flight === flightFilter));
    if (targets.length === 0) {
      toast.error('No cadets available for this flight filter');
      return;
    }

    setBulkSubmitting(true);
    setBulkErrors([]);

    try {
      const currentUser = getUser();
      const userName = currentUser?.name || 'unknown';
      const entries = targets.map(c => ({
        cadetName: c.name,
        flight: c.flight,
        date: new Date(selectedDate).toISOString(),
        status: attendanceStatuses[c.id] || 'absent',
        submittedBy: userName,
      }));

      // Submit as a single bulk request
      try {
        const res = await api.createBulkAttendance({ entries, date: new Date(selectedDate).toISOString(), flightFilter });

        if (res && res.error) {
          setBulkErrors(entries.map(e => ({ cadetName: e.cadetName, reason: res.error || 'Failed' })));
          setBulkFailedEntries(entries);
          toast.error(`Failed: ${res.error}`);
        } else {
          const pointsMsg = res.pointsAwarded > 0
            ? `, ${res.pointsAwarded} cadets awarded ${res.pointsAwarded} flight points`
            : (res.totalPresent > 0 ? `, 0 flight points awarded` : '');
          toast.success(`Saved ${res.totalRecords || entries.length} attendance records (${res.totalPresent || 0} present${pointsMsg})`);
          if (res.pointErrors && res.pointErrors.length > 0) {
            console.error('Point award errors:', res.pointErrors);
            toast.error(`Points failed for ${res.pointErrors.length} cadet(s) — check browser console for details`);
          }
        }
      } catch (err: any) {
        setBulkErrors(entries.map(e => ({ cadetName: e.cadetName, reason: String(err) })));
        setBulkFailedEntries(entries);
        toast.error(`Failed to save attendance`);
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
      const attendanceData = Array.isArray(data) ? data : (data.attendance || data || []);
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
      const data = await api.getAttendanceBulks();
      const bulksData = Array.isArray(data) ? data : [];
      setBulkEvents(bulksData);
    } catch (error) {
      console.error('Error fetching bulk attendance:', error);
    }
  };

  const fetchCadets = async () => {
    try {
      const data = await api.getCadets();
      const cadetList = Array.isArray(data) ? data : (data.cadets || []);
      setCadets(cadetList);
      setAttendanceStatuses(prev => {
        const next = { ...prev };
        cadetList.forEach((c: any) => {
          if (!next[c.id]) next[c.id] = 'absent';
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
      const res = await api.deleteAttendanceBulk(bulkId);
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

  const toggleBulkExpand = async (bulkId: string) => {
    const currentlyExpanded = expandedBulkIds.has(bulkId);
    if (currentlyExpanded) {
      setExpandedBulkIds(prev => {
        const next = new Set(prev);
        next.delete(bulkId);
        return next;
      });
      return;
    }

    setExpandedBulkIds(prev => {
      const next = new Set(prev);
      next.add(bulkId);
      return next;
    });

    if (bulkRecords[bulkId]) return;

    setLoadingBulkIds(prev => {
      const next = new Set(prev);
      next.add(bulkId);
      return next;
    });

    try {
      const data = await api.getAttendanceBulkRecords(bulkId);
      const records = (Array.isArray(data) ? data : [])
        .sort((a: any, b: any) => {
          const flightCmp = String(a.flight || '').localeCompare(String(b.flight || ''));
          if (flightCmp !== 0) return flightCmp;
          return String(a.cadetName || '').localeCompare(String(b.cadetName || ''));
        });
      setBulkRecords(prev => ({ ...prev, [bulkId]: records }));
    } catch (error) {
      console.error('Error loading bulk attendance records:', error);
      toast.error('Failed to load session details');
    } finally {
      setLoadingBulkIds(prev => {
        const next = new Set(prev);
        next.delete(bulkId);
        return next;
      });
    }
  };

  const handleUpdateSavedAttendance = async (bulkId: string, record: AttendanceRecord, status: 'present' | 'absent') => {
    if (record.status === status) return;

    setUpdatingRecordIds(prev => {
      const next = new Set(prev);
      next.add(record.id);
      return next;
    });

    try {
      const res = await api.updateAttendanceStatus(record.id, status);
      if (res?.error) {
        toast.error(res.error || 'Failed to update attendance');
        return;
      }

      setBulkRecords(prev => {
        const list = prev[bulkId] || [];
        return {
          ...prev,
          [bulkId]: list.map(r => (r.id === record.id ? { ...r, status } : r)),
        };
      });

      if (typeof res?.bulkTotalPresent === 'number') {
        setBulkEvents(prev => prev.map(b => b.id === bulkId ? { ...b, totalPresent: res.bulkTotalPresent } : b));
      }

      toast.success(`${record.cadetName} marked ${status}`);
      fetchAttendance();
    } catch (error) {
      console.error('Error updating saved attendance:', error);
      toast.error('Failed to update attendance');
    } finally {
      setUpdatingRecordIds(prev => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  };

  const canDelete = canDeleteBulk;

  const nonHqCadets = cadets.filter(c => c.flight && c.flight.toLowerCase() !== 'hq');
  const flights = Array.from(new Set(nonHqCadets.map(c => c.flight))).sort();
  const visibleCadets = nonHqCadets.filter(c => flightFilter === 'all' || c.flight === flightFilter);
  const presentCount = visibleCadets.filter(c => attendanceStatuses[c.id] === 'present').length;
  const selectedCount = selectedIds.size;

  // Group visible cadets by flight, sorted alphabetically within each flight
  const flightGroups: Record<string, any[]> = {};
  visibleCadets.forEach(c => {
    if (!flightGroups[c.flight]) flightGroups[c.flight] = [];
    flightGroups[c.flight].push(c);
  });
  Object.values(flightGroups).forEach(group => group.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));
  const sortedFlightKeys = Object.keys(flightGroups).sort();

  const toggleFlightCollapse = (flight: string) => {
    setCollapsedFlights(prev => {
      const next = new Set(prev);
      if (next.has(flight)) next.delete(flight);
      else next.add(flight);
      return next;
    });
  };

  return (
    <div className={`space-y-6 ${canViewRecentSessions ? 'grid gap-6 md:grid-cols-3' : ''}`}>

      <Card className={canViewRecentSessions ? 'md:col-span-2' : 'max-w-4xl mx-auto'}>
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
              {visibleCadets.length === 0 ? (
                <div className="text-sm text-gray-500 py-4">No cadets for the selected flight.</div>
              ) : (
                <div className="space-y-3">
                  {sortedFlightKeys.map(flight => {
                    const group = flightGroups[flight];
                    const isCollapsed = collapsedFlights.has(flight);
                    const flightPresent = group.filter((c: any) => attendanceStatuses[c.id] === 'present').length;

                    return (
                      <div key={flight} className="border rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleFlightCollapse(flight)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {isCollapsed ? <ChevronRight className="size-4 text-gray-500" /> : <ChevronDown className="size-4 text-gray-500" />}
                            <span className="font-semibold text-sm">{formatFlight(flight)}</span>
                            <Badge variant="outline" className="text-xs">{group.length} cadet{group.length !== 1 ? 's' : ''}</Badge>
                          </div>
                          <div className="text-xs text-gray-500">
                            {flightPresent}/{group.length} present
                          </div>
                        </button>
                        {!isCollapsed && (
                          <div className="divide-y">
                            {group.map((c: any) => (
                              <label key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
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
                                  <span className="font-medium text-sm">{c.name}</span>
                                </div>
                                <span className={`text-xs font-medium ${attendanceStatuses[c.id] === 'present' ? 'text-green-600' : 'text-gray-400'}`}>
                                  {attendanceStatuses[c.id] === 'present' ? 'Present' : 'Absent'}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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

      {canViewRecentSessions && (
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
                          <button
                            type="button"
                            onClick={() => toggleBulkExpand(b.id)}
                            className="font-medium inline-flex items-center gap-1 hover:underline text-left"
                          >
                            {expandedBulkIds.has(b.id) ? <ChevronDown className="size-4 text-gray-500" /> : <ChevronRight className="size-4 text-gray-500" />}
                            <span>Session on {new Date(b.date).toLocaleString()}</span>
                          </button>
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

                    {expandedBulkIds.has(b.id) && (
                      <div className="mt-3 pt-3 border-t">
                        {loadingBulkIds.has(b.id) ? (
                          <div className="text-xs text-gray-500">Loading session details...</div>
                        ) : (bulkRecords[b.id] || []).length === 0 ? (
                          <div className="text-xs text-gray-500">No attendance records in this session.</div>
                        ) : (
                          <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                            {(bulkRecords[b.id] || []).map((record) => {
                              const isUpdating = updatingRecordIds.has(record.id);
                              const isPresent = record.status === 'present';
                              return (
                                <div key={record.id} className="flex items-center justify-between gap-2 text-xs bg-white rounded border px-2 py-1.5">
                                  <div className="min-w-0">
                                    <div className="font-medium truncate">{record.cadetName}</div>
                                    <div className="text-gray-500">{formatFlight(record.flight)}</div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant="outline" className={isPresent ? 'text-green-700 border-green-200' : 'text-gray-500'}>
                                      {isPresent ? 'Present' : 'Absent'}
                                    </Badge>
                                    {canEditSavedAttendance && <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={isUpdating}
                                      onClick={() => handleUpdateSavedAttendance(b.id, record, isPresent ? 'absent' : 'present')}
                                    >
                                      {isUpdating ? 'Saving...' : (isPresent ? 'Mark Absent' : 'Mark Present')}
                                    </Button>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
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
