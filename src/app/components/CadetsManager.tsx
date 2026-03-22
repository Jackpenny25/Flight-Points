import { useState, useEffect, useRef } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { api } from '../../utils/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { formatFlight } from './ui/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Plus, Trash2, UserPlus, Edit2, Shield } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';

interface Cadet {
  id: string;
  name: string;
  flight: string;
  rank?: string;
  isNco?: boolean;
  createdAt: string;
}

interface CadetsManagerProps {
  accessToken: string;
}

export function CadetsManager({ accessToken }: CadetsManagerProps) {
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(
    typeof window !== 'undefined' && sessionStorage.getItem('adminPinVerified') === 'true'
  );

  const [cadets, setCadets] = useState<Cadet[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [flight, setFlight] = useState('');
  const [rank, setRank] = useState('');
  

  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [csvPreviewEntries, setCsvPreviewEntries] = useState<Array<{ name: string; flight: string }>>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportFailures, setCsvImportFailures] = useState<Array<{ name: string; reason?: string }>>([]);
  // Flight to assign to rows missing a flight (1..4)
  const [csvImportFlight, setCsvImportFlight] = useState<string>('1');

  // Bulk remove & edit state
  const [selectedCadetIds, setSelectedCadetIds] = useState<Set<string>>(new Set());
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);
  const [bulkRemoveConfirmText, setBulkRemoveConfirmText] = useState('');
  const [pinVerifyOpen, setPinVerifyOpen] = useState(false);
  const [pinVerifyValue, setPinVerifyValue] = useState('');
  const [pinVerifyError, setPinVerifyError] = useState('');
  const [pinVerifyLoading, setPinVerifyLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingCadet, setEditingCadet] = useState<Cadet | null>(null);
  const [editName, setEditName] = useState('');
  const [editFlight, setEditFlight] = useState('');
  const [editRank, setEditRank] = useState('');
  const [editNco, setEditNco] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const ensureAdminPin = () => {
    if (sessionStorage.getItem('adminPinVerified') === 'true') return true;
    toast.error('Unlock admin mode first using your admin PIN or authenticator code.');
    return false;
  };

  const openPinVerifyForDelete = (cadetId: string, cadetName: string) => {
    setPendingDelete({ id: cadetId, name: cadetName });
    setPendingBulkDelete(false);
    setPinVerifyError('');
    setPinVerifyValue('');
    setPinVerifyOpen(true);
  };

  const openPinVerifyForBulkDelete = () => {
    setPendingDelete(null);
    setPendingBulkDelete(true);
    setPinVerifyError('');
    setPinVerifyValue('');
    setPinVerifyOpen(true);
  };

  const verifyPinAndContinue = async () => {
    if (!pinVerifyValue) {
      setPinVerifyError('PIN is required.');
      return;
    }
    setPinVerifyLoading(true);
    setPinVerifyError('');
    try {
      const res = await api.verifyAdminCode(pinVerifyValue);
      if (res?.success) {
        setPinVerifyOpen(false);
        if (pendingDelete) {
          await executeDeleteCadet(pendingDelete.id, pendingDelete.name);
        } else if (pendingBulkDelete) {
          await executeBulkRemove();
        }
        setPendingDelete(null);
        setPendingBulkDelete(false);
        setPinVerifyValue('');
      } else {
        setPinVerifyError(res?.error || 'Verification failed.');
      }
    } catch (e: any) {
      setPinVerifyError(String(e?.message || e));
    } finally {
      setPinVerifyLoading(false);
    }
  };

  function formatDisplayName(name: string) {
    if (!name) return '';
    const parts = name.split(' ');
    const last = parts[parts.length - 1];
    if (last && last.length <= 2 && parts.length > 1) {
      parts[parts.length - 1] = `\u00A0${last}`;
      return parts.join(' ');
    }
    return name;
  }

  useEffect(() => {
    fetchCadets();
    const id = setInterval(() => {
      fetchCadets();
    }, 120000);
    return () => clearInterval(id);
  }, []);

  const fetchCadets = async () => {
    setLoading(true);
    try {
      const res = await api.getCadets();
      if (Array.isArray(res)) {
        setCadets(res);
        localStorage.setItem('cadets', JSON.stringify(res));
      } else if (res && Array.isArray(res.cadets)) {
        setCadets(res.cadets);
        localStorage.setItem('cadets', JSON.stringify(res.cadets));
      } else {
        setCadets([]);
        toast.error('No cadets found');
      }
    } catch (error) {
      console.error('Error fetching cadets:', error);
      toast.error('Failed to load cadets');
    } finally {
      setLoading(false);
    }
  };

  // helper: dedupe cadets array by `id`, preferring items from `overrides` when ids conflict
  const mergeAndDedupe = (existing: Cadet[], overrides: Cadet[]) => {
    const map = new Map<string, Cadet>();
    // keep existing first
    for (const c of existing || []) map.set(c.id, c);
    // then apply overrides (they replace existing entries)
    for (const c of overrides || []) map.set(c.id, c);
    return Array.from(map.values());
  };

  const parseCSV = (text: string) => {
    const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
    if (rows.length === 0) return [];

    // If first row looks like headers, skip it (common CSVs include headers)
    const first = rows[0].toLowerCase();
    let startIndex = 0;
    if (first.includes('name') && (first.includes('flight') || first.includes('join'))) startIndex = 1;
    // Also skip a numeric-only first row (many exported lists include an index '0' or '1' at top)
    if (/^\d+$/.test(rows[0])) startIndex = 1;

    // Accepts lines like: name,flight. Support comma or semicolon delimiters.
    return rows.slice(startIndex).map((row) => {
      const parts = row.split(/,|;/).map(p => p.trim());
      return {
        name: parts[0] || '',
        flight: parts[1] || 'Unassigned',
      };
    }).filter(r => r.name.length > 0);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const entries = parseCSV(text);
    if (entries.length === 0) {
      toast.error('No valid rows found in CSV');
      return;
    }
    // Show preview dialog
    setCsvPreviewEntries(entries);
    setCsvPreviewOpen(true);
  };

  const confirmCsvImport = async (entries?: Array<{ name: string; flight: string }>) => {
    if (!ensureAdminPin()) return;
    const rows = entries || csvPreviewEntries;
    setCsvImporting(true);
    try {
      const results = await Promise.all(rows.map(async (entry) => {
        try {
          const flightToUse = (!entry.flight || entry.flight === 'Unassigned') ? csvImportFlight : entry.flight;
          const res = await api.createCadet({ name: entry.name, flight: flightToUse });
          if (res && res.id) {
            return { ok: true, name: entry.name, cadet: res };
          } else {
            return { ok: false, name: entry.name, reason: res?.error || 'Unknown error' };
          }
        } catch (err: any) {
          return { ok: false, name: entry.name, reason: String(err) };
        }
      }));
      const failures = results.filter(r => !r.ok);
      const successesWithCadets = results.filter((r: any) => r.ok && r.cadet).map((r: any) => r.cadet as Cadet);
      if (successesWithCadets.length > 0) {
        try {
          const existing = JSON.parse(localStorage.getItem('cadets') || '[]');
          const merged = mergeAndDedupe(Array.isArray(existing) ? existing : [], successesWithCadets);
          localStorage.setItem('cadets', JSON.stringify(merged));
          setCadets(merged);
        } catch (err) {
          console.error('Failed updating local cadets after import', err);
        }
      }
      if (failures.length > 0) {
        toast.error(`Imported with ${failures.length} failures`);
      } else {
        toast.success(`Imported ${successesWithCadets.length} cadets (persisted locally)`);
      }
      fetchCadets();
    } catch (err) {
      console.error('CSV import failed', err);
      toast.error('Failed to import CSV');
    } finally {
      setCsvImporting(false);
    }
  };

  const handleMoveCadet = async (cadetId: string, newFlight: string) => {
    if (!ensureAdminPin()) return;
    try {
      // Get existing cadets from local storage
      const existingCadets = JSON.parse(localStorage.getItem('cadets') || '[]');

      // Update the cadet's flight
      const updatedCadets = (Array.isArray(existingCadets) ? existingCadets : []).map((cadet: Cadet) =>
        cadet.id === cadetId ? { ...cadet, flight: newFlight, updatedAt: new Date().toISOString() } : cadet
      );

      // Save back to localStorage (dedupe safety)
      const deduped = mergeAndDedupe([], updatedCadets);
      localStorage.setItem('cadets', JSON.stringify(deduped));

      // Update state
      setCadets(deduped);
      toast.success('Cadet moved');
    } catch (err) {
      console.error('Error moving cadet:', err);
      toast.error('Failed to move cadet');
    }
  };

  const openEditCadet = (cadet: Cadet) => {
    setEditingCadet(cadet);
    setEditName(cadet.name);
    setEditFlight(cadet.flight);
    setEditRank(cadet.rank || '');
    setEditNco(!!cadet.isNco);
    setEditOpen(true);
  };

  const submitEditCadet = async () => {
    if (!ensureAdminPin()) return;
    if (!editingCadet) return;
    setEditSubmitting(true);
    try {
      const payload: any = { name: editName, flight: editFlight, isNco: editNco };
      if (editFlight === 'hq') payload.rank = editRank;
      const res = await api.updateCadet(editingCadet.id, payload);
      if (res && res.id) {
        const existing = JSON.parse(localStorage.getItem('cadets') || '[]');
        const updated = (Array.isArray(existing) ? existing : []).map((c: Cadet) => c.id === res.id ? res : c);
        localStorage.setItem('cadets', JSON.stringify(updated));
        setCadets(updated);
        toast.success('Cadet updated');
        setEditOpen(false);
        setEditingCadet(null);
      } else {
        toast.error(res?.error || 'Failed to update cadet');
      }
    } catch (err) {
      console.error('Edit cadet failed', err);
      toast.error('Failed to update cadet');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleToggleNco = async (cadet: Cadet) => {
    if (!ensureAdminPin()) return;
    const newValue = !cadet.isNco;
    try {
      const res = await api.updateCadet(cadet.id, { isNco: newValue } as any);
      if (res && res.id) {
        const updated = cadets.map(c => c.id === cadet.id ? { ...c, isNco: newValue } : c);
        setCadets(updated);
        localStorage.setItem('cadets', JSON.stringify(updated));
        toast.success(`${cadet.name} ${newValue ? 'marked as NCO — cannot receive points' : 'unmarked as NCO — can receive points again'}`);
      } else {
        toast.error(res?.error || 'Failed to update NCO status');
      }
    } catch (err) {
      console.error('Toggle NCO failed', err);
      toast.error('Failed to update NCO status');
    }
  };

  const confirmBulkRemove = async () => {
    if (!ensureAdminPin()) return;
    if (bulkRemoveConfirmText !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }

    const ids = Array.from(selectedCadetIds);
    if (ids.length === 0) {
      toast.error('No cadets selected');
      return;
    }

    setBulkRemoveOpen(false);
    setBulkRemoveConfirmText('');
    openPinVerifyForBulkDelete();
  };

  const executeBulkRemove = async () => {
    const ids = Array.from(selectedCadetIds);
    if (ids.length === 0) {
      toast.error('No cadets selected');
      return;
    }

    try {
      const results = await Promise.all(ids.map(async (id) => {
        try {
          await api.deleteCadet(id);
          return { id, ok: true };
        } catch (e) { 
          return { id, ok: false };
        }
      }));

      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        toast.error(`${failed.length} cadet(s) failed to delete`);
      } else {
        toast.success(`Deleted ${results.length} cadet(s)`);
      }

      setSelectedCadetIds(new Set());
      fetchCadets();
    } catch (err) {
      console.error('Bulk delete error:', err);
      toast.error('Bulk delete failed');
    }
  };

  const ItemTypes = { CADET: 'cadet' } as const;

  function CadetCard({ cadet }: { cadet: Cadet }) {
    const [, drag] = useDrag(() => ({ type: ItemTypes.CADET, item: { id: cadet.id, flight: cadet.flight } }));

    const checked = selectedCadetIds.has(cadet.id);
    const isHq = cadet.flight === 'hq';

    return (
      <div ref={isHq ? undefined : drag as any} className={`p-3 mb-2 bg-white rounded border flex justify-between items-center ${checked ? 'ring-2 ring-red-200' : ''} ${cadet.isNco ? 'border-amber-300 bg-amber-50' : ''}`}>
        <div className="flex items-center gap-3">
          <Checkbox checked={checked} onCheckedChange={() => {
            const next = new Set(selectedCadetIds);
            if (next.has(cadet.id)) next.delete(cadet.id);
            else next.add(cadet.id);
            setSelectedCadetIds(next);
          }} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate max-w-[220px] flex items-center gap-1">
              {isHq && cadet.rank ? <span className="text-blue-700 mr-1">{cadet.rank}</span> : null}
              {formatDisplayName(cadet.name)}
              {cadet.isNco && (
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-700 bg-amber-200 px-1.5 py-0.5 rounded ml-1" title="NCO — cannot receive points">
                  <Shield className="h-3 w-3" />NCO
                </span>
              )}
            </div>
            {!isHq && <div className="text-sm text-gray-500">{formatFlight(cadet.flight)}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => openEditCadet(cadet)}><Edit2 size={14} /></Button>
          <Button size="sm" variant="destructive" onClick={() => handleDeleteCadet(cadet.id, cadet.name)}><Trash2 size={14} /></Button>
        </div>
      </div>
    );
  }

  function FlightColumn({ flight, items }: { flight: string; items: Cadet[] }) {
    const [, drop] = useDrop(() => ({
      accept: ItemTypes.CADET,
      drop: (item: any) => {
        if (item.id && item.flight !== flight) {
          handleMoveCadet(item.id, flight);
        }
      },
    }));

    return (
      <div ref={drop as any} className="bg-blue-50 rounded p-3 min-h-[200px]">
        <h4 className="font-semibold mb-2">{formatFlight(flight)} ({items.length})</h4>
        <div className="space-y-2">
          {items.map((c) => (
            <CadetCard key={c.id} cadet={c} />
          ))}
        </div>
      </div>
    );
  }

  const handleAddCadet = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = { name, flight };
      if (flight === 'hq' && rank) payload.rank = rank;
      const res = await api.createCadet(payload);
      if (res && res.id) {
        const existing = JSON.parse(localStorage.getItem('cadets') || '[]');
        const merged = Array.isArray(existing) ? existing.concat(res) : [res];
        localStorage.setItem('cadets', JSON.stringify(merged));
        setCadets(merged);
        toast.success(flight === 'hq' ? 'Staff member added!' : 'Cadet added successfully!');
        setName('');
        setFlight('');
        setRank('');
        setOpen(false);
      } else {
        toast.error(res?.error || 'Failed to add cadet');
      }
    } catch (error) {
      console.error('Error adding cadet:', error);
      toast.error('Failed to add cadet');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCadet = async (cadetId: string, cadetName: string) => {
    if (!ensureAdminPin()) return;
    if (!confirm(`Are you sure you want to remove ${cadetName} from the system?`)) {
      return;
    }

    openPinVerifyForDelete(cadetId, cadetName);
  };

  const executeDeleteCadet = async (cadetId: string, cadetName: string) => {

    try {
      const res = await api.deleteCadet(cadetId);
      if (res && (res.success || res.id || res.deleted)) {
        const existingCadets = JSON.parse(localStorage.getItem('cadets') || '[]');
        const updatedCadets = existingCadets.filter((cadet: Cadet) => cadet.id !== cadetId);
        localStorage.setItem('cadets', JSON.stringify(updatedCadets));
        setCadets(updatedCadets);
        toast.success('Cadet removed successfully');
      } else {
        toast.error(res?.error || 'Failed to remove cadet');
      }
    } catch (error) {
      console.error('Error deleting cadet:', error);
      toast.error(`Failed to remove cadet: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Group cadets by flight (exclude hq) and sort alphabetically
  const cadetsByFlight = cadets.filter(c => c.flight !== 'hq').reduce((acc, cadet) => {
    if (!acc[cadet.flight]) {
      acc[cadet.flight] = [];
    }
    acc[cadet.flight].push(cadet);
    return acc;
  }, {} as Record<string, Cadet[]>);

  // Sort each flight group alphabetically
  for (const key of Object.keys(cadetsByFlight)) {
    cadetsByFlight[key].sort((a, b) => a.name.localeCompare(b.name));
  }

  // HQ / Staff members (sorted alphabetically)
  const hqMembers = cadets.filter(c => c.flight === 'hq').sort((a, b) => a.name.localeCompare(b.name));

  // Ensure we always show at least three flight headings (1,2,3)
  const defaultFlights = ['1', '2', '3'];
  for (const f of defaultFlights) {
    if (!cadetsByFlight[f]) cadetsByFlight[f] = [];
  }

  // Build sorted flights array (numeric sort, excluding hq)
  const flights = Object.keys(cadetsByFlight).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Manage Cadets</CardTitle>
              <CardDescription>Add and remove cadets from the system</CardDescription>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4 mr-2" />
                  Add Cadet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleAddCadet}>
                  <DialogHeader>
                    <DialogTitle>Add New Member</DialogTitle>
                    <DialogDescription>
                      Enter the member's information below
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="cadet-flight">Flight</Label>
                      <Select value={flight} onValueChange={(v: any) => { setFlight(v); if (v !== 'hq') setRank(''); }}>
                        <SelectTrigger id="cadet-flight">
                          <SelectValue placeholder="Select flight" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">{formatFlight('1')}</SelectItem>
                          <SelectItem value="2">{formatFlight('2')}</SelectItem>
                          <SelectItem value="3">{formatFlight('3')}</SelectItem>
                          <SelectItem value="4">{formatFlight('4')}</SelectItem>
                          <SelectItem value="hq">Staff / HQ Flight</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {flight === 'hq' && (
                      <div className="space-y-2">
                        <Label htmlFor="cadet-rank">Rank</Label>
                        <Input
                          id="cadet-rank"
                          placeholder="e.g. Fg Off, Flt Lt, Sqn Ldr"
                          value={rank}
                          onChange={(e) => setRank(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="cadet-name">Full Name</Label>
                      <Input
                        id="cadet-name"
                        placeholder="Surname Initial"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      <UserPlus className="size-4 mr-2" />
                      {submitting ? 'Adding...' : flight === 'hq' ? 'Add Staff Member' : 'Add Cadet'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Bulk Remove Button */}
            <div className="ml-2">
              <Button variant="destructive" disabled={selectedCadetIds.size === 0} onClick={() => setBulkRemoveOpen(true)}>
                Bulk Remove ({selectedCadetIds.size})
              </Button>
            </div>

            {/* CSV import button moved to admin-only card at bottom */}
            <div className="ml-2">
              <Button variant="ghost" onClick={() => { setLoading(true); fetchCadets(); }}>Sync</Button>
            </div>
            {/* Admin controls removed; use header logo as unlock indicator */}
            
          </div>
        </CardHeader>

        {/* Bulk Remove Confirmation Dialog */}
        <Dialog open={bulkRemoveOpen} onOpenChange={setBulkRemoveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Bulk Remove</DialogTitle>
              <DialogDescription>
                This will permanently delete {selectedCadetIds.size} cadet(s) and cannot be undone. Type <span className="font-mono">DELETE</span> to confirm.
              </DialogDescription>
            </DialogHeader>
            <div className="py-3">
              <Input value={bulkRemoveConfirmText} onChange={(e) => setBulkRemoveConfirmText(e.target.value)} placeholder="Type DELETE to confirm" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setBulkRemoveOpen(false); setBulkRemoveConfirmText(''); }}>Cancel</Button>
              <Button variant="destructive" disabled={bulkRemoveConfirmText !== 'DELETE'} onClick={() => confirmBulkRemove()}>Confirm Remove</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={pinVerifyOpen} onOpenChange={setPinVerifyOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Verify Admin Safeguard</DialogTitle>
              <DialogDescription>
                Enter your admin PIN or authenticator code to continue this sensitive operation.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-2">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="PIN or code"
                value={pinVerifyValue}
                onChange={(e) => setPinVerifyValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    verifyPinAndContinue();
                  }
                }}
              />
              {pinVerifyError && <div className="text-sm text-red-700">{pinVerifyError}</div>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPinVerifyOpen(false)} disabled={pinVerifyLoading}>Cancel</Button>
              <Button onClick={verifyPinAndContinue} disabled={pinVerifyLoading}>{pinVerifyLoading ? 'Verifying...' : 'Verify & Continue'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Edit Cadet Dialog (always rendered) */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit {editFlight === 'hq' ? 'Staff Member' : 'Cadet'}</DialogTitle>
              <DialogDescription>Edit name, rank and flight</DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); submitEditCadet(); }}>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label>Flight</Label>
                  <Select value={editFlight} onValueChange={(v: any) => { setEditFlight(v); if (v !== 'hq') setEditRank(''); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select flight" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{formatFlight('1')}</SelectItem>
                      <SelectItem value="2">{formatFlight('2')}</SelectItem>
                      <SelectItem value="3">{formatFlight('3')}</SelectItem>
                      <SelectItem value="4">{formatFlight('4')}</SelectItem>
                      <SelectItem value="hq">Staff / HQ Flight</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editFlight === 'hq' && (
                  <div className="space-y-2">
                    <Label>Rank</Label>
                    <Input placeholder="e.g. Fg Off, Flt Lt, Sqn Ldr" value={editRank} onChange={(e) => setEditRank(e.target.value)} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="flex items-center gap-1.5 font-medium text-sm">
                      <Shield size={14} className={editNco ? 'text-amber-600' : 'text-muted-foreground'} />
                      NCO Status
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">NCOs cannot receive points</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={editNco ? 'default' : 'outline'}
                    className={editNco ? 'bg-amber-600 hover:bg-amber-700' : ''}
                    onClick={() => setEditNco(!editNco)}
                  >
                    {editNco ? 'NCO ✓' : 'Mark NCO'}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEditOpen(false); setEditingCadet(null); }}>Cancel</Button>
                <Button type="submit" disabled={editSubmitting}>{editSubmitting ? 'Saving...' : 'Save'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading cadets...</div>
          ) : cadets.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <UserPlus className="size-12 mx-auto mb-4 text-gray-400" />
              <p>No cadets added yet</p>
              <p className="text-sm">Click "Add Cadet" to get started</p>
            </div>
          ) : (
            <DndProvider backend={HTML5Backend}>
              <div className="space-y-6">
                {/* Numbered flights */}
                {flights.length > 0 && (
                  <div className="flex gap-4">
                    <div className="flex-1 overflow-x-auto">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-cols-min">
                        {flights.map((flight) => (
                          <div key={flight} className="min-w-[220px]">
                            <FlightColumn flight={flight} items={cadetsByFlight[flight] || []} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Staff / HQ Flight */}
                {hqMembers.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">Staff / HQ Flight ({hqMembers.length})</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {hqMembers.map(m => (
                        <CadetCard key={m.id} cadet={m} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </DndProvider>
          )}
        </CardContent>
      </Card>

      {adminUnlocked && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>CSV Import (Admin)</CardTitle>
            <CardDescription>Preview and import cadets from CSV</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded p-3">
              <p className="text-xs text-gray-600">Use the 'Import CSV' button to preview rows before importing.</p>

              <div className="mt-2 mb-2 flex items-center gap-2">
                <Label className="text-sm">Assign flight for missing rows</Label>
                <Select value={csvImportFlight} onValueChange={(v: any) => setCsvImportFlight(v)}>
                  <SelectTrigger id="csv-import-flight" className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{formatFlight('1')}</SelectItem>
                    <SelectItem value="2">{formatFlight('2')}</SelectItem>
                    <SelectItem value="3">{formatFlight('3')}</SelectItem>
                    <SelectItem value="4">{formatFlight('4')}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-gray-500">Applied to rows without a flight value</div>
              </div>

              {csvPreviewEntries.length > 0 ? (
                <div className="mt-2 max-h-48 overflow-y-auto text-sm">
                  {csvPreviewEntries.map((r, i) => (
                    <div key={i} className="py-1 border-b last:border-b-0">{r.name} — {formatFlight((r.flight === 'Unassigned' || !r.flight) ? csvImportFlight : r.flight)}</div>
                  ))}

                  {csvImportFailures.length > 0 && (
                    <>
                      <div className="font-semibold mb-1">Import Failures ({csvImportFailures.length})</div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {csvImportFailures.map((f, idx) => (
                          <div key={idx} className="text-xs">{f.name} — <span className="font-mono">{f.reason}</span></div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => confirmCsvImport()} disabled={csvImporting}>{csvImporting ? 'Importing...' : 'Confirm Import'}</Button>
                    <Button size="sm" variant="outline" onClick={() => { setCsvPreviewEntries([]); setCsvImportFailures([]); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">No preview loaded</div>
              )}

              {/* Select button moved to the bottom to avoid accidental clicks */}

              {csvPreviewEntries.length > 0 ? (
                <div className="mt-2 max-h-48 overflow-y-auto text-sm">
                  {csvPreviewEntries.map((r, i) => (
                    <div key={i} className="py-1 border-b last:border-b-0">{r.name} — {formatFlight((r.flight === 'Unassigned' || !r.flight) ? csvImportFlight : r.flight)}</div>
                  ))}

                  {csvImportFailures.length > 0 && (
                    <>
                      <div className="font-semibold mb-1">Import Failures ({csvImportFailures.length})</div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {csvImportFailures.map((f, idx) => (
                          <div key={idx} className="text-xs">{f.name} — <span className="font-mono">{f.reason}</span></div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => confirmCsvImport()} disabled={csvImporting}>{csvImporting ? 'Importing...' : 'Confirm Import'}</Button>
                    <Button size="sm" variant="outline" onClick={() => { setCsvPreviewEntries([]); setCsvImportFailures([]); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">No preview loaded</div>
              )}
              <div className="mt-4">
                <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                <Button onClick={() => csvInputRef.current?.click()}>Select CSV file</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

