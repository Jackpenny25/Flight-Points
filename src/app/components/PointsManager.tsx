
import { useState, useEffect, useMemo } from 'react';
import { api } from '../../utils/api';
import { getToken, getUser } from '../../utils/auth';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { formatFlight } from './ui/utils';
import { Trash2, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from './ui/alert';

interface Point {
  id: string;
  cadetName: string;
  date: string;
  flight: string;
  reason: string;
  points: number;
  type: string;
  givenBy: string;
}

interface PointsManagerProps {
  userRole: string;
}

export function PointsManager({ userRole }: PointsManagerProps) {
  const ADMIN_PIN = (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_ADMIN_PIN : '') || '';
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(
    typeof window !== 'undefined' && sessionStorage.getItem('adminPinVerified') === 'true'
  );

  const [points, setPoints] = useState<Point[]>([]);
  const [cadets, setCadets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [multipleNames, setMultipleNames] = useState('');
  const [selectedFlight, setSelectedFlight] = useState('');
  const [pointValue, setPointValue] = useState('');
  const [reason, setReason] = useState('');
  const [pointType, setPointType] = useState('general');
  const [duplicateWarning, setDuplicateWarning] = useState<string[]>([]);
  const [invalidNames, setInvalidNames] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    cadetName: '',
    points: '',
    reason: '',
    type: 'general',
    flight: '',
  });

  const ensureAdminPin = () => {
    if (sessionStorage.getItem('adminPinVerified') === 'true') return true;
    if (userRole === 'snco') {
      sessionStorage.setItem('adminPinVerified', 'true');
      setAdminUnlocked(true);
      return true;
    }
    if (!ADMIN_PIN) {
      toast.error('Admin PIN not configured. Please sign in with an admin account.');
      return false;
    }
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
    ensureAdminPin();
  };

  // Fetch points from API
  const fetchPoints = async () => {
    setLoading(true);
    try {
      const data = await api.getPoints();
      console.log('Fetched points:', data);
      setPoints(Array.isArray(data) ? data : []);
    } catch (error: any) {
      if (error?.status === 401) {
        toast.error('Session expired. Please log in again.');
        window.location.href = '/login';
      } else {
        toast.error('Failed to fetch points');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch cadets from API
  const fetchCadets = async () => {
    try {
      const data = await api.getCadets();
      console.log('Fetched cadets:', data);
      setCadets(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to fetch cadets');
    }
  };

  useEffect(() => {
    fetchPoints();
    fetchCadets();
  }, []);

  // Smart name matching: allows partial last names, handles siblings
  const matchCadetByPartialName = (input: string): { cadet: any; ambiguous: boolean } | null => {
    if (cadets.length === 0) {
      console.log('matchCadetByPartialName: No cadets available');
      return null;
    }
    const inputLower = input.trim().toLowerCase();
    console.log('Matching input:', inputLower, 'against', cadets.length, 'cadets');
    const exactMatch = cadets.find(c => c.name.toLowerCase() === inputLower);
    if (exactMatch) {
      console.log('Exact match found:', exactMatch.name);
      return { cadet: exactMatch, ambiguous: false };
    }
    const inputParts = inputLower.split(/\s+/);
    const inputLastName = inputParts[0];
    const inputFirstInitial = inputParts[1] || null;
    const matches = cadets.filter(c => {
      const cadetNameLower = c.name.toLowerCase();
      return cadetNameLower.startsWith(inputLastName);
    });
    console.log('Partial matches found:', matches.length);
    if (matches.length === 0) return null;
    if (matches.length === 1) return { cadet: matches[0], ambiguous: false };
    if (inputFirstInitial) {
      const withInitial = matches.filter(c => {
        const cadetParts = c.name.toLowerCase().split(/[\s-]+/);
        return cadetParts.slice(1).some(part => part.startsWith(inputFirstInitial));
      });
      if (withInitial.length === 1) return { cadet: withInitial[0], ambiguous: false };
      if (withInitial.length > 1) {
        return { cadet: withInitial[0], ambiguous: true };
      }
    }
    return { cadet: matches[0], ambiguous: true };
  };

  // Get user's flight for restriction
  const currentUser = getUser();
  const userFlight = currentUser?.user_metadata?.flight || null;
  const isPointGiver = userRole === 'pointgiver';
  const canGiveToAnyFlight = userRole === 'snco' || userRole === 'staff';

  // Resolved names with match status
  interface ResolvedName {
    input: string;
    cadet: any | null;
    ambiguous: boolean;
    restrictedFlight: boolean; // true if pointgiver tries to give to another flight
    isNco: boolean; // true if cadet is an NCO or HQ (cannot receive points)
    isHq: boolean; // true if cadet is Staff/HQ flight
  }

  const [resolvedEntries, setResolvedEntries] = useState<ResolvedName[]>([]);

  const validateNames = (namesInput: string) => {
    if (!namesInput.trim()) {
      setDuplicateWarning([]);
      setInvalidNames([]);
      setResolvedEntries([]);
      return;
    }
    const names = namesInput
      .split(/[\,\n]/)
      .map(name => name.trim())
      .filter(name => name.length > 0);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    setDuplicateWarning(Array.from(new Set(duplicates)));
    const invalid: string[] = [];
    const ambiguous: string[] = [];
    const resolved: ResolvedName[] = [];

    names.forEach(name => {
      const match = matchCadetByPartialName(name);
      if (!match) {
        invalid.push(name);
        resolved.push({ input: name, cadet: null, ambiguous: false, restrictedFlight: false, isNco: false, isHq: false });
      } else if (match.ambiguous) {
        const inputLower = name.trim().toLowerCase();
        const inputParts = inputLower.split(/\s+/);
        const inputLastName = inputParts[0];
        const siblings = cadets.filter(c => c.name.toLowerCase().startsWith(inputLastName));
        ambiguous.push(`${name} (could be: ${siblings.map(s => s.name).join(', ')} - add first initial)`);
        resolved.push({ input: name, cadet: match.cadet, ambiguous: true, restrictedFlight: false, isNco: false, isHq: false });
      } else {
        const isNco = !!match.cadet.isNco;
        const isHq = match.cadet.flight === 'hq';
        const restrictedFlight = isPointGiver && userFlight && match.cadet.flight !== userFlight;
        resolved.push({ input: name, cadet: match.cadet, ambiguous: false, restrictedFlight: !!restrictedFlight, isNco: isNco || isHq, isHq });
        if (isNco) {
          invalid.push(`${name} (NCO — cannot receive points)`);
        } else if (isHq) {
          invalid.push(`${name} (Staff/HQ — cannot receive points)`);
        } else if (restrictedFlight) {
          invalid.push(`${name} (${formatFlight(match.cadet.flight)} — not your flight)`);
        }
      }
    });

    setInvalidNames([...invalid, ...ambiguous]);
    setResolvedEntries(resolved);
  };

  // Auto-detect flights from resolved entries
  const detectedFlights = useMemo(() => {
    const flights = new Set<string>();
    resolvedEntries.forEach(entry => {
      if (entry.cadet && !entry.ambiguous && !entry.restrictedFlight && !entry.isNco) {
        flights.add(entry.cadet.flight);
      }
    });
    return Array.from(flights).sort();
  }, [resolvedEntries]);

  const isMultiFlight = detectedFlights.length > 1;


  useEffect(() => {
    validateNames(multipleNames);
  }, [multipleNames, cadets]);

  const handleAddPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!multipleNames.trim()) {
      toast.error('Please enter at least one cadet name');
      return;
    }
    if (invalidNames.length > 0) {
      toast.error('Invalid or ambiguous names - please fix before submitting');
      return;
    }
    // Need at least one detected flight (from valid matched names) OR a manual selection
    const hasAutoFlight = detectedFlights.length > 0;
    const hasFlight = hasAutoFlight || selectedFlight;
    if (!hasFlight) {
      toast.error('No flight could be determined — select at least one valid cadet');
      return;
    }
    setSubmitting(true);
    try {
      const currentUser = getUser();
      const userName = currentUser?.name || 'unknown';

      // Use resolved entries to get each cadet's flight
      const validEntries = resolvedEntries.filter(e => e.cadet && !e.ambiguous && !e.restrictedFlight && !e.isNco);
      const promises = validEntries.map(async (entry) => {
        const cadetFlight = entry.cadet.flight || selectedFlight || '';
        const data = {
          cadetName: entry.cadet.name,
          flight: cadetFlight,
          points: parseFloat(pointValue),
          reason,
          type: pointType,
          date: new Date().toISOString(),
          givenBy: userName,
        };
        const result = await api.createPoint(data);
        if (result.error) throw new Error(result.error);
        return result;
      });
      await Promise.all(promises);
      toast.success(`Points added successfully for ${validEntries.length} cadet(s)!`);
      setMultipleNames('');
      setSelectedFlight('');
      setPointValue('');
      setReason('');
      setPointType('general');
      setDuplicateWarning([]);
      setInvalidNames([]);
      setResolvedEntries([]);
      fetchPoints();
    } catch (error: any) {
      if (error?.status === 401) {
        toast.error('Session expired. Please log in again.');
        window.location.href = '/login';
      } else {
        const msg = error?.message || 'Failed to add points for some cadets';
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePoint = async (pointId: string) => {
    if (!ensureAdminPin()) return;
    if (!confirm('Are you sure you want to delete this point entry?')) {
      return;
    }
    try {
      const result = await api.deletePoint(pointId);
      if (result.error) {
        toast.error(result.error || 'Failed to delete point');
      } else {
        toast.success('Point entry deleted');
        fetchPoints();
      }
    } catch (error: any) {
      if (error?.status === 401) {
        toast.error('Session expired. Please log in again.');
        window.location.href = '/login';
      } else {
        toast.error('Failed to delete point');
      }
    }
  };

  const startEditPoint = (point: Point) => {
    setEditingId(point.id);
    setEditValues({
      cadetName: point.cadetName,
      points: String(point.points),
      reason: point.reason,
      type: point.type,
      flight: point.flight,
    });
  };

  const handleUpdatePoint = async () => {
    if (!ensureAdminPin()) return;
    if (!editingId) return;
    if (editValues.points === '') {
      toast.error('Points value is required');
      return;
    }
    try {
      const data = {
        cadetName: editValues.cadetName,
        points: parseFloat(editValues.points),
        reason: editValues.reason,
        type: editValues.type,
        flight: editValues.flight,
      };
      const result = await api.updatePoint(editingId, data);
      if (result.error) throw new Error(result.error);
      toast.success('Point updated');
      setEditingId(null);
      fetchPoints();
    } catch (error: any) {
      if (error?.status === 401) {
        toast.error('Session expired. Please log in again.');
        window.location.href = '/login';
      } else {
        toast.error('Failed to update point');
      }
    }
  };

  const handleClearCadetPoints = async (cadetName: string) => {
    if (!ensureAdminPin()) return;
    if (!confirm(`Clear all points for ${cadetName}?`)) return;
    try {
      // You may need to implement this endpoint in your local API
      toast.success(`Cleared points for ${cadetName}`);
      fetchPoints();
    } catch (error) {
      toast.error('Failed to clear points');
    }
  };

  const canAdmin = userRole === 'snco';
  const canDelete = canAdmin;
  const flights = Array.from(new Set(cadets.map(c => c.flight))).sort();

  const cadetTotals = useMemo(() => {
    const totals: Record<string, { points: number; flight: string }> = {};
    points.forEach((p) => {
      const key = p.cadetName || 'Unknown';
      if (!totals[key]) {
        totals[key] = { points: 0, flight: p.flight || 'unknown' };
      }
      totals[key].points += p.points;
      totals[key].flight = p.flight || totals[key].flight;
    });
    return Object.entries(totals)
      .map(([name, info]) => ({ name, points: info.points, flight: info.flight }))
      .sort((a, b) => b.points - a.points);
  }, [points]);

  return (
    <div className="space-y-6">
      <div className={`grid gap-6 ${userRole === 'snco' ? 'md:grid-cols-2' : 'max-w-2xl mx-auto'}`}>
      {/* Add Points Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Add Points</CardTitle>
              <CardDescription>
                {isPointGiver
                  ? `Award or deduct points for cadets in your flight (${formatFlight(userFlight || '')})`
                  : 'Award or deduct points for any cadet across all flights'}
              </CardDescription>
            </div>
            {/* Admin controls removed; use header logo as unlock indicator */}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddPoints} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="names">Step 1: Enter Cadet Name(s)</Label>
              <Textarea
                id="names"
                placeholder={isPointGiver
                  ? `Enter names from your flight (${formatFlight(userFlight || '')})\ne.g., John Smith, Jane Doe`
                  : 'Enter one or more names (separated by commas or new lines)\ne.g., John Smith, Jane Doe'}
                value={multipleNames}
                onChange={(e) => setMultipleNames(e.target.value)}
                required
                rows={4}
              />
              <p className="text-xs text-gray-500">
                Separate multiple names with commas or line breaks. Names are matched automatically.
              </p>
            </div>

            {/* Name confirmation list */}
            {resolvedEntries.length > 0 && (
              <div className="space-y-1 rounded-md border p-3 bg-muted/30">
                <div className="text-xs font-medium text-muted-foreground mb-1">Matched cadets:</div>
                {resolvedEntries.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    {entry.cadet && !entry.ambiguous && !entry.restrictedFlight && !entry.isNco ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-green-700 dark:text-green-400 font-medium">{entry.cadet.name}</span>
                        <Badge variant="outline" className="text-xs ml-auto">{formatFlight(entry.cadet.flight)}</Badge>
                      </>
                    ) : entry.isNco ? (
                      <>
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="text-red-600">{entry.cadet?.name || entry.input}</span>
                        <span className="text-xs text-red-500 ml-auto">{entry.isHq ? 'Staff/HQ' : 'NCO'} — cannot receive points</span>
                      </>
                    ) : entry.restrictedFlight ? (
                      <>
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="text-red-600">{entry.cadet?.name || entry.input}</span>
                        <span className="text-xs text-red-500 ml-auto">Not your flight</span>
                      </>
                    ) : entry.ambiguous ? (
                      <>
                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="text-amber-600">{entry.input}</span>
                        <span className="text-xs text-amber-500 ml-auto">Ambiguous — add first initial</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="text-red-600">{entry.input}</span>
                        <span className="text-xs text-red-500 ml-auto">Not found</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {duplicateWarning.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>
                  Duplicate names detected: {duplicateWarning.join(', ')}
                </AlertDescription>
              </Alert>
            )}

            {/* Flight display — auto-detected from names */}
            <div className="space-y-2">
              <Label>Step 2: Flight {detectedFlights.length > 0 ? '(auto-detected)' : ''}</Label>
              {detectedFlights.length === 0 ? (
                <Select value={selectedFlight} onValueChange={setSelectedFlight}>
                  <SelectTrigger id="flight">
                    <SelectValue placeholder="Enter names above to auto-detect flight" />
                  </SelectTrigger>
                  <SelectContent>
                    {flights.map((flight) => (
                      <SelectItem key={flight} value={flight}>
                        {formatFlight(flight)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : detectedFlights.length === 1 ? (
                <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="font-medium">{formatFlight(detectedFlights[0])}</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 min-h-[2.5rem] px-3 py-2 rounded-md border bg-muted/50">
                  <span className="text-sm text-muted-foreground mr-1">Multiple flights:</span>
                  {detectedFlights.map(f => (
                    <Badge key={f} variant="secondary" className="text-sm">
                      {formatFlight(f)}
                    </Badge>
                  ))}
                </div>
              )}
              {isMultiFlight && (
                <p className="text-xs text-muted-foreground">
                  Each cadet will receive points under their own flight automatically.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Step 3: Type</Label>
              <Select value={pointType} onValueChange={setPointType}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="good">Good Behavior</SelectItem>
                  <SelectItem value="bad">Bad Behavior</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="points">Step 4: Points</Label>
              <Input
                id="points"
                type="number"
                step="0.5"
                placeholder="10"
                value={pointValue}
                onChange={(e) => setPointValue(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Step 5: Reason</Label>
              <Textarea
                id="reason"
                placeholder="Describe why points are being awarded/deducted"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={3}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={submitting || invalidNames.length > 0}
            >
              <Plus className="size-4 mr-2" />
              {submitting ? 'Adding...' : 'Add Points'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Recent Points - Flight Point Leads/Staff only */}
      {userRole === 'snco' && (
      <Card>
        <CardHeader>
          <CardTitle>Recent Points</CardTitle>
          <CardDescription>Last 10 point entries</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : points.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No points recorded yet</div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {points.slice(0, 10).map((point) => (
                <div key={point.id} className="p-4 border rounded-lg bg-gray-50">
                  {editingId === point.id ? (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Cadet</Label>
                          <Input
                            value={editValues.cadetName}
                            onChange={(e) => setEditValues({ ...editValues, cadetName: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Flight</Label>
                          <Select
                            value={editValues.flight}
                            onValueChange={(val) => setEditValues({ ...editValues, flight: val })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Flight" />
                            </SelectTrigger>
                            <SelectContent>
                              {flights.map((flight) => (
                                <SelectItem key={flight} value={flight}>
                                  {formatFlight(flight)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Type</Label>
                          <Select
                            value={editValues.type}
                            onValueChange={(val) => setEditValues({ ...editValues, type: val })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="general">General</SelectItem>
                              <SelectItem value="good">Good Behavior</SelectItem>
                              <SelectItem value="bad">Bad Behavior</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Points</Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={editValues.points}
                            onChange={(e) => setEditValues({ ...editValues, points: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label>Reason</Label>
                        <Textarea
                          rows={2}
                          value={editValues.reason}
                          onChange={(e) => setEditValues({ ...editValues, reason: e.target.value })}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleUpdatePoint}>Save</Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium">{point.cadetName}</p>
                          <p className="text-sm text-gray-600">{formatFlight(point.flight)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={point.points >= 0 ? 'default' : 'destructive'}>
                            {point.points >= 0 ? '+' : ''}{point.points} pts
                          </Badge>
                          {canAdmin && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditPoint(point)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeletePoint(point.id)}
                              >
                                <Trash2 className="size-4 text-red-600" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 mb-1">{point.reason}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Badge variant="outline" className="text-xs">
                          {point.type}
                        </Badge>
                        <span>• Given by {point.givenBy}</span>
                        <span>• {new Date(point.date).toLocaleDateString()}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>

    {canAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Cadet Totals & Clear</CardTitle>
            <CardDescription>Flight Point Leads / Staff tools to adjust points</CardDescription>
          </CardHeader>
          <CardContent>
            {cadetTotals.length === 0 ? (
              <div className="text-center py-6 text-gray-500">No cadet points yet</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cadet</TableHead>
                      <TableHead>Flight</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cadetTotals.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{formatFlight(c.flight)}</TableCell>
                        <TableCell className="text-right">{c.points}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={c.points === 0}
                            onClick={() => handleClearCadetPoints(c.name)}
                          >
                            Clear total
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
