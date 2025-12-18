import { useState, useEffect, useRef } from 'react';
import { projectId } from '../../../utils/supabase/info';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

interface Cadet {
  id: string;
  name: string;
  joinDate: string;
  flight: string;
  createdAt: string;
}

interface CadetsManagerProps {
  accessToken: string;
}

export function CadetsManager({ accessToken }: CadetsManagerProps) {
  const [cadets, setCadets] = useState<Cadet[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [flight, setFlight] = useState('');
  const [joinDate, setJoinDate] = useState(new Date().toISOString().split('T')[0]);

  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [csvPreviewEntries, setCsvPreviewEntries] = useState<Array<{ name: string; flight: string; joinDate: string }>>([]);
  const [csvImporting, setCsvImporting] = useState(false);

  useEffect(() => {
    fetchCadets();
  }, []);

  const fetchCadets = async () => {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/cadets`,
        { headers }
      );

      if (response.ok) {
        const data = await response.json();
        setCadets(data.cadets || []);
      }
    } catch (error) {
      console.error('Error fetching cadets:', error);
      toast.error('Failed to fetch cadets');
    } finally {
      setLoading(false);
    }
  };

  const parseCSV = (text: string) => {
    const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
    // Accepts lines like: name,flight,joinDate  (joinDate optional)
    return rows.map((row) => {
      const parts = row.split(',').map(p => p.trim());
      return {
        name: parts[0] || '',
        flight: parts[1] || 'Unassigned',
        joinDate: parts[2] ? new Date(parts[2]).toISOString() : new Date().toISOString(),
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

  const confirmCsvImport = async (entries?: Array<{ name: string; flight: string; joinDate: string }>) => {
    const rows = entries || csvPreviewEntries;
    setCsvImporting(true);
    try {
      const postHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) postHeaders['Authorization'] = `Bearer ${accessToken}`;

      const results = await Promise.all(rows.map(async (entry) => {
        try {
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/cadets`,
            {
              method: 'POST',
              headers: postHeaders,
              body: JSON.stringify({ name: entry.name, flight: entry.flight, joinDate: entry.joinDate }),
            }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'unknown' }));
            return { ok: false, name: entry.name, reason: err.error || res.statusText };
          }
          return { ok: true, name: entry.name };
        } catch (err: any) {
          return { ok: false, name: entry.name, reason: String(err) };
        }
      }));

      const failures = results.filter(r => !r.ok);
      if (failures.length > 0) {
        toast.error(`Imported with ${failures.length} failures`);
      } else {
        toast.success(`Imported ${rows.length} cadets`);
      }

      setCsvPreviewOpen(false);
      fetchCadets();
    } catch (err) {
      console.error('CSV import failed', err);
      toast.error('Failed to import CSV');
    } finally {
      setCsvImporting(false);
    }
  };

  const handleMoveCadet = async (cadetId: string, newFlight: string) => {
    try {
      const putHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) putHeaders['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/cadets/${cadetId}`,
        {
          method: 'PUT',
          headers: putHeaders,
          body: JSON.stringify({ flight: newFlight }),
        }
      );

      if (response.ok) {
        // optimistic update
        setCadets(prev => prev.map(c => c.id === cadetId ? { ...c, flight: newFlight } : c));
        toast.success('Cadet moved');
      } else {
        const err = await response.json();
        toast.error(err.error || 'Failed to move cadet');
      }
    } catch (err) {
      console.error('Error moving cadet:', err);
      toast.error('Failed to move cadet');
    }
  };

  const ItemTypes = { CADET: 'cadet' } as const;

  function CadetCard({ cadet }: { cadet: Cadet }) {
    const [, drag] = useDrag(() => ({ type: ItemTypes.CADET, item: { id: cadet.id, flight: cadet.flight } }));
    return (
      <div ref={drag} className="p-3 mb-2 bg-white rounded border flex justify-between items-center">
        <div>
          <div className="font-medium">{cadet.name}</div>
          <div className="text-xs text-gray-500">Joined: {new Date(cadet.joinDate).toLocaleDateString()}</div>
        </div>
        <div className="flex items-center gap-2">
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
      <div ref={drop} className="bg-blue-50 rounded p-3 min-h-[200px]">
        <h4 className="font-semibold mb-2">{flight} ({items.length})</h4>
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
      const postHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) postHeaders['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/cadets`,
        {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify({
            name,
            flight,
            joinDate: new Date(joinDate).toISOString(),
          }),
        }
      );

      if (response.ok) {
        toast.success('Cadet added successfully!');
        setName('');
        setFlight('');
        setJoinDate(new Date().toISOString().split('T')[0]);
        setOpen(false);
        fetchCadets();
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
    if (!confirm(`Are you sure you want to remove ${cadetName} from the system?`)) {
      return;
    }

    try {
      const delHeaders: Record<string, string> = {};
      if (accessToken) delHeaders['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/cadets/${cadetId}`,
        {
          method: 'DELETE',
          headers: delHeaders,
        }
      );

      if (response.ok) {
        toast.success('Cadet removed');
        fetchCadets();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to remove cadet');
      }
    } catch (error) {
      console.error('Error deleting cadet:', error);
      toast.error('Failed to remove cadet');
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
                      <Input
                        id="cadet-flight"
                        placeholder="e.g., Alpha, Bravo, Charlie"
                        value={flight}
                        onChange={(e) => setFlight(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cadet-join-date">Join Date</Label>
                      <Input
                        id="cadet-join-date"
                        type="date"
                        value={joinDate}
                        onChange={(e) => setJoinDate(e.target.value)}
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
                      {submitting ? 'Adding...' : 'Add Cadet'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            <div className="ml-3">
              <Button variant="outline" onClick={() => csvInputRef.current?.click()}>Import CSV</Button>
            </div>
          </div>
        </CardHeader>
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
                  {csvPreviewEntries.length > 0 ? (
                    <div className="mt-2 max-h-48 overflow-y-auto text-sm">
                      {csvPreviewEntries.map((r, i) => (
                        <div key={i} className="py-1 border-b last:border-b-0">{r.name} — {r.flight} — {new Date(r.joinDate).toLocaleDateString()}</div>
                      ))}
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => confirmCsvImport()}>Confirm Import</Button>
                        <Button size="sm" variant="outline" onClick={() => { setCsvPreviewEntries([]); setCsvPreviewOpen(false); }}>Cancel</Button>
                      </div>
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
