import { useState, useEffect, useRef } from 'react';
import { FileStorage } from '../../../utils/fileStorage';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { formatFlight } from './ui/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Plus, Trash2, UserPlus, Edit2 } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';

interface Cadet {
  id: string;
  name: string;
  flight: string;
  createdAt: string;
}

interface CadetsManagerProps {
  accessToken: string;
}

export function CadetsManager({ accessToken }: CadetsManagerProps) {
  const ADMIN_PIN = '5394';
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

  const [editOpen, setEditOpen] = useState(false);
  const [editingCadet, setEditingCadet] = useState<Cadet | null>(null);
  const [editName, setEditName] = useState('');
  const [editFlight, setEditFlight] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const ensureAdminPin = () => {
    if (sessionStorage.getItem('adminPinVerified') === 'true') return true;
    const pin = prompt('Enter 4-digit admin PIN');
    if (pin === ADMIN_PIN) {
      sessionStorage.setItem('adminPinVerified', 'true');
      setAdminUnlocked(true);
      toast.success('Admin PIN accepted');
      return true;
    }
    toast.error('Incorrect PIN');
    return false;
  };

  const handleLogoClick = () => {
    // Clicking the 2427 logo prompts to unlock admin
    ensureAdminPin();
  };

  useEffect(() => {
    fetchCadets();
    
    // Poll server periodically to keep cadets in sync across browsers
    const id = setInterval(() => {
      fetchCadets();
    }, 30000); // every 30s
    
    return () => clearInterval(id);
  }, []);

  const fetchCadets = async () => {
    // Try to fetch server cadets (public read). If that fails, fall back to localStorage.
    try {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        // Use access token if present, otherwise anon key (required by Supabase functions)
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
        else headers['Authorization'] = `Bearer ${publicAnonKey}`;
        const path = `/functions/v1/server/make-server-73a3871f/cadets`;
        const res = await fetch(`https://${projectId}.supabase.co${path}`, { headers });
        if (res.ok) {
          const body = await res.json().catch(() => null);
          const serverCadets = (body && body.cadets) ? body.cadets : [];
          try { localStorage.setItem('cadets', JSON.stringify(serverCadets)); } catch (e) { /* noop */ }
          setCadets(serverCadets);
          return;
        }
      } catch (e) {
        console.warn('Server cadets fetch failed, falling back to localStorage', e);
      }

      // localStorage fallback
      const cadetsData = JSON.parse(localStorage.getItem('cadets') || '[]');
      setCadets(Array.isArray(cadetsData) ? cadetsData : []);
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

    // If not signed in, allow local-only import; if signed in, attempt server import and fall back to local entries

    try {
      const postHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) postHeaders['Authorization'] = `Bearer ${accessToken}`;

      const results = await Promise.all(rows.map(async (entry) => {
        try {
          const flightToUse = (!entry.flight || entry.flight === 'Unassigned') ? csvImportFlight : entry.flight;
          // If no access token, create local cadet
          if (!accessToken) {
            const localCadet: Cadet = {
              id: `local_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,
              name: entry.name,
              flight: flightToUse,
              createdAt: new Date().toISOString(),
            };
            return { ok: true, name: entry.name, cadet: localCadet } as any;
          }
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/cadets`,
            {
              method: 'POST',
              headers: postHeaders,
              body: JSON.stringify({ name: entry.name, flight: flightToUse }),
            }
          );
          if (res.ok) {
            try {
              const body = await res.json().catch(() => null);
              if (body && body.cadet) {
                const created = body.cadet as Cadet;
                const existing = JSON.parse(localStorage.getItem('cadets') || '[]');
                const merged = mergeAndDedupe(Array.isArray(existing) ? existing : [], [created]);
                localStorage.setItem('cadets', JSON.stringify(merged));
                setCadets(merged);
                return { ok: true, name: entry.name, cadet: created } as any;
              }
              // If server returned ok but no cadet body, fall through to fallback
            } catch (err) {
              console.warn('Could not parse created cadet body:', err);
            }
            // Fallback local-ish cadet so UI can show it
            const fallbackCadet: Cadet = {
              id: `remote_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,
              name: entry.name,
              flight: flightToUse,
              createdAt: new Date().toISOString(),
            };
            const existing = JSON.parse(localStorage.getItem('cadets') || '[]');
            const merged = mergeAndDedupe(Array.isArray(existing) ? existing : [], [fallbackCadet]);
            localStorage.setItem('cadets', JSON.stringify(merged));
            setCadets(merged);
            return { ok: true, name: entry.name, cadet: fallbackCadet } as any;
          } else {
            const errBody = await res.json().catch(() => ({ error: res.statusText }));
            return { ok: false, name: entry.name, reason: errBody.error || res.statusText } as any;
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
    setEditOpen(true);
  };

  const submitEditCadet = async () => {
    if (!ensureAdminPin()) return;
    if (!editingCadet) return;
    setEditSubmitting(true);

    try {
      // If unauthenticated, update localStorage directly
      if (!accessToken) {
        try {
          const existing = JSON.parse(localStorage.getItem('cadets') || '[]');
          const updated = (Array.isArray(existing) ? existing : []).map((c: Cadet) => c.id === editingCadet.id ? { ...c, name: editName, flight: editFlight, updatedAt: new Date().toISOString() } : c);
          localStorage.setItem('cadets', JSON.stringify(updated));
          setCadets(updated);
          toast.success('Cadet updated locally');
          setEditOpen(false);
          setEditingCadet(null);
        } catch (err) {
          console.error('Local edit failed', err);
          toast.error('Failed to update cadet locally');
        }
        setEditSubmitting(false);
        return;
      }

      const putHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) putHeaders['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/cadets/${editingCadet.id}`, { method: 'PUT', headers: putHeaders, body: JSON.stringify({ name: editName, flight: editFlight }) });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'unknown' }));
        toast.error(`Failed to update cadet: ${err.error || response.statusText}`);
      } else {
        try {
          const body = await response.json().catch(() => null);
          if (body && body.cadet) {
            const existing = JSON.parse(localStorage.getItem('cadets') || '[]');
            const updated = (Array.isArray(existing) ? existing : []).map((c: Cadet) => c.id === body.cadet.id ? body.cadet : c);
            localStorage.setItem('cadets', JSON.stringify(updated));
            setCadets(updated);
          } else {
            fetchCadets();
          }
          toast.success('Cadet updated');
          setEditOpen(false);
          setEditingCadet(null);
        } catch (err) {
          console.error('Failed processing update response', err);
        }
      }
    } catch (err) {
      console.error('Edit cadet failed', err);
      toast.error('Failed to update cadet');
    } finally {
      setEditSubmitting(false);
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

    try {
      const delHeaders: Record<string, string> = {};
      if (accessToken) delHeaders['Authorization'] = `Bearer ${accessToken}`;

      const results = await Promise.all(ids.map(async (id) => {
        try {
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/cadets/${id}`,
            { method: 'DELETE', headers: delHeaders }
          );
          return res.ok ? { id, ok: true } : { id, ok: false };
        } catch (e) { return { id, ok: false }; }
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

    return (
      <div ref={drag as any} className={`p-3 mb-2 bg-white rounded border flex justify-between items-center ${checked ? 'ring-2 ring-red-200' : ''}`}>
        <div className="flex items-center gap-3">
          <Checkbox checked={checked} onCheckedChange={() => {
            const next = new Set(selectedCadetIds);
            if (next.has(cadet.id)) next.delete(cadet.id);
            else next.add(cadet.id);
            setSelectedCadetIds(next);
          }} />
          <div>
            <div className="font-medium">{cadet.name}</div>
            <div className="text-xs text-gray-500">{formatFlight(cadet.flight)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { openEditCadet(cadet); }}>
            <Edit2 className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleDeleteCadet(cadet.id, cadet.name)}>
            <Trash2 className="size-4 text-red-600" />
          </Button>
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
        <div>
          {items.sort((a,b) => a.name.localeCompare(b.name)).map(c => (
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
      // If not signed in, create a local cadet immediately
      if (!accessToken) {
        const localCadet: Cadet = { id: `local_${Date.now()}_${Math.random().toString(36).slice(2,9)}`, name, flight, createdAt: new Date().toISOString() };
        try {
          const existing = JSON.parse(localStorage.getItem('cadets') || '[]');
          const merged = Array.isArray(existing) ? existing.concat(localCadet) : [localCadet];
          localStorage.setItem('cadets', JSON.stringify(merged));
          setCadets(merged);
        } catch (err) {
          console.error('Failed saving local cadet', err);
        }
        toast.success('Cadet added locally');
        setName('');
        setFlight('');
        setOpen(false);
        return;
      }

      const postHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) postHeaders['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/cadets`, {
        method: 'POST', headers: postHeaders, body: JSON.stringify({ name, flight })
      });

      if (response.ok) {
        try {
          const body = await response.json().catch(() => null);
          if (body && body.cadet) {
            const created = body.cadet as Cadet;
            const existing = JSON.parse(localStorage.getItem('cadets') || '[]');
            const merged = Array.isArray(existing) ? existing.concat(created) : [created];
            localStorage.setItem('cadets', JSON.stringify(merged));
            setCadets(merged);
          } else {
            fetchCadets();
          }
        } catch (err) {
          console.warn('Could not parse created cadet body:', err);
          fetchCadets();
        }

        toast.success('Cadet added successfully!');
        setName('');
        setFlight('');
        setOpen(false);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to add cadet');
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

    try {
      // Delete from server first
      const delHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) delHeaders['Authorization'] = `Bearer ${accessToken}`;
      else delHeaders['Authorization'] = `Bearer ${publicAnonKey}`;
      
      const deleteRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/cadets/${cadetId}`,
        { method: 'DELETE', headers: delHeaders }
      );

      console.log('Delete response:', deleteRes.status, deleteRes.ok);
      
      if (!deleteRes.ok) {
        const errBody = await deleteRes.text();
        console.error('Server delete failed:', deleteRes.status, errBody);
        toast.warning('Could not sync deletion to server, deleting locally only');
      } else {
        const delBody = await deleteRes.json();
        console.log('Delete success:', delBody);
      }

      // Delete from local storage
      const existingCadets = JSON.parse(localStorage.getItem('cadets') || '[]');
      const updatedCadets = existingCadets.filter((cadet: Cadet) => cadet.id !== cadetId);
      localStorage.setItem('cadets', JSON.stringify(updatedCadets));
      
      // Update state
      setCadets(updatedCadets);
      toast.success('Cadet removed successfully');
    } catch (error) {
      console.error('Error deleting cadet:', error);
      toast.error(`Failed to remove cadet: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Group cadets by flight
  const cadetsByFlight = cadets.reduce((acc, cadet) => {
    if (!acc[cadet.flight]) {
      acc[cadet.flight] = [];
    }
    acc[cadet.flight].push(cadet);
    return acc;
  }, {} as Record<string, Cadet[]>);

  const flights = Object.keys(cadetsByFlight).sort();

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
                    <DialogTitle>Add New Cadet</DialogTitle>
                    <DialogDescription>
                      Enter the cadet's information below
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="cadet-name">Full Name</Label>
                      <Input
                        id="cadet-name"
                        placeholder="John Smith"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cadet-flight">Flight</Label>
                      <Select value={flight} onValueChange={(v: any) => setFlight(v)}>
                        <SelectTrigger id="cadet-flight">
                          <SelectValue placeholder="Select flight" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">{formatFlight('1')}</SelectItem>
                          <SelectItem value="2">{formatFlight('2')}</SelectItem>
                          <SelectItem value="3">{formatFlight('3')}</SelectItem>
                          <SelectItem value="4">{formatFlight('4')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      <UserPlus className="size-4 mr-2" />
                      {submitting ? 'Adding...' : 'Add Cadet'}
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

            <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            <div className="ml-3">
              <Button variant="outline" onClick={() => csvInputRef.current?.click()}>Import CSV</Button>
            </div>
            <div className="ml-2">
              <Button variant="ghost" onClick={() => { setLoading(true); fetchCadets(); }}>Sync</Button>
            </div>
            <div className="ml-2 flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleLogoClick}>
                <span className="font-bold tracking-wider">2427</span>
              </Button>
              <span className={`text-xs px-2 py-1 rounded ${adminUnlocked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {adminUnlocked ? 'Admin: Unlocked' : 'Admin: Locked'}
              </span>
            </div>
            
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
            <div className="flex gap-4">
              <div className="flex-1 overflow-x-auto">
                <DndProvider backend={HTML5Backend}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {flights.map((flight) => (
                      <div key={flight}>
                        <FlightColumn flight={flight} items={cadetsByFlight[flight] || []} />
                      </div>
                    ))}
                  </div>
                </DndProvider>
              </div>

              <div className="w-80">
                <h4 className="text-sm font-semibold mb-2">CSV Import Preview</h4>
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
                        <div className="mt-3 p-2 bg-red-50 border border-red-100 rounded text-sm text-red-700">
                          <div className="font-semibold mb-1">Import Failures ({csvImportFailures.length})</div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {csvImportFailures.map((f, idx) => (
                              <div key={idx} className="text-xs">{f.name} — <span className="font-mono">{f.reason}</span></div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => confirmCsvImport()} disabled={csvImporting}>{csvImporting ? 'Importing...' : 'Confirm Import'}</Button>
                        <Button size="sm" variant="outline" onClick={() => { setCsvPreviewEntries([]); setCsvPreviewOpen(false); setCsvImportFailures([]); }}>Cancel</Button>
                      </div>

                      {!accessToken && <div className="text-xs text-yellow-700 mt-2">Not signed in: imported rows will be stored locally only.</div>}

                      {/* Edit Cadet Dialog (reused for editing) */}
                      <Dialog open={editOpen} onOpenChange={setEditOpen}>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Cadet</DialogTitle>
                            <DialogDescription>Edit cadet name and flight</DialogDescription>
                          </DialogHeader>
                          <form onSubmit={(e) => { e.preventDefault(); submitEditCadet(); }}>
                            <div className="space-y-3 py-2">
                              <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
                              </div>
                              <div className="space-y-2">
                                <Label>Flight</Label>
                                <Select value={editFlight} onValueChange={(v: any) => setEditFlight(v)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select flight" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="1">{formatFlight('1')}</SelectItem>
                                    <SelectItem value="2">{formatFlight('2')}</SelectItem>
                                    <SelectItem value="3">{formatFlight('3')}</SelectItem>
                                    <SelectItem value="4">{formatFlight('4')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => { setEditOpen(false); setEditingCadet(null); }}>Cancel</Button>
                              <Button type="submit" disabled={editSubmitting}>{editSubmitting ? 'Saving...' : 'Save'}</Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 mt-2">No preview loaded</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-blue-900">{cadets.length}</p>
              <p className="text-sm text-blue-700">Total Cadets</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-900">{flights.length}</p>
              <p className="text-sm text-blue-700">Flights</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
 

