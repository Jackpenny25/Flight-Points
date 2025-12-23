import { useState, useEffect, useMemo } from 'react';
import { projectId } from '../../../utils/supabase/info';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { formatFlight } from './ui/utils';
import { Trash2, Plus, AlertCircle } from 'lucide-react';
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
  accessToken: string;
  userRole: string;
}

export function PointsManager({ accessToken, userRole }: PointsManagerProps) {
  const ADMIN_PIN = '5394';
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

  useEffect(() => {
    fetchPoints();
    fetchCadets();
  }, []);

  const fetchPoints = async () => {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/points`,
        { headers }
      );

      if (response.ok) {
        const data = await response.json();
        setPoints(data.points || []);
      }
    } catch (error) {
      console.error('Error fetching points:', error);
      toast.error('Failed to fetch points');
    } finally {
      setLoading(false);
    }
  };

  const fetchCadets = async () => {
    try {
      const headers2: Record<string, string> = {};
      if (accessToken) headers2['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/cadets`,
        { headers: headers2 }
      );

      if (response.ok) {
        const data = await response.json();
        setCadets(data.cadets || []);
      }
    } catch (error) {
      console.error('Error fetching cadets:', error);
    }
  };

  // Smart name matching: allows partial last names, handles siblings
  const matchCadetByPartialName = (input: string): { cadet: any; ambiguous: boolean } | null => {
    if (cadets.length === 0) return null; // No cadets loaded yet
    
    const inputLower = input.trim().toLowerCase();
    
    // First try exact match
    const exactMatch = cadets.find(c => c.name.toLowerCase() === inputLower);
    if (exactMatch) return { cadet: exactMatch, ambiguous: false };
    
    // Try matching by last name (first word of input)
    const inputParts = inputLower.split(/\s+/);
    const inputLastName = inputParts[0];
    const inputFirstInitial = inputParts[1] || null;
    
    // Find all cadets whose name starts with the input last name
    const matches = cadets.filter(c => {
      const cadetNameLower = c.name.toLowerCase();
      return cadetNameLower.startsWith(inputLastName);
    });
    
    if (matches.length === 0) return null;
    if (matches.length === 1) return { cadet: matches[0], ambiguous: false };
    
    // Multiple matches - check if first initial was provided
    if (inputFirstInitial) {
      const withInitial = matches.filter(c => {
        const cadetParts = c.name.toLowerCase().split(/[\s-]+/);
        // Check if any part after the first (first name or initials) starts with inputFirstInitial
        return cadetParts.slice(1).some(part => part.startsWith(inputFirstInitial));
      });
      
      if (withInitial.length === 1) return { cadet: withInitial[0], ambiguous: false };
      if (withInitial.length > 1) {
        // Still multiple matches even with initial - return as ambiguous
        return { cadet: withInitial[0], ambiguous: true };
      }
    }
    
    // Still ambiguous - siblings with same last name
    return { cadet: matches[0], ambiguous: true };
  };

  // Validate and parse names
  const validateNames = (namesInput: string) => {
    if (!namesInput.trim()) {
      setDuplicateWarning([]);
      setInvalidNames([]);
      return;
    }

    console.log('[PointsManager] Validating, total cadets:', cadets.length);
    console.log('[PointsManager] Cadet names:', cadets.map(c => c.name).join(', '));

    // Split by commas or newlines
    const names = namesInput
      .split(/[,\n]/)
      .map(name => name.trim())
      .filter(name => name.length > 0);

    console.log('[PointsManager] Names to validate:', names);

    // Check for duplicates in input
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    setDuplicateWarning(Array.from(new Set(duplicates)));

    // Check if names can be matched to cadets
    const invalid: string[] = [];
    const ambiguous: string[] = [];
    
    names.forEach(name => {
      const match = matchCadetByPartialName(name);
      console.log(`[PointsManager] Match result for "${name}":`, match);
      
      if (!match) {
        invalid.push(name);
      } else if (match.ambiguous) {
        // Find all matches for this name to show in error
        const inputLower = name.trim().toLowerCase();
        const inputParts = inputLower.split(/\s+/);
        const inputLastName = inputParts[0];
        const siblings = cadets.filter(c => c.name.toLowerCase().startsWith(inputLastName));
        ambiguous.push(`${name} (could be: ${siblings.map(s => s.name).join(', ')} - add first initial)`);
      }
    });
    
    console.log('[PointsManager] Invalid names:', invalid);
    console.log('[PointsManager] Ambiguous names:', ambiguous);
    
    setInvalidNames([...invalid, ...ambiguous]);
  };

  useEffect(() => {
    validateNames(multipleNames);
  }, [multipleNames, cadets]);

  const handleAddPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse names
    const names = multipleNames
      .split(/[,\n]/)
      .map(name => name.trim())
      .filter(name => name.length > 0);

    if (names.length === 0) {
      toast.error('Please enter at least one cadet name');
      return;
    }

    if (invalidNames.length > 0) {
      toast.error(`Invalid or ambiguous names - please fix before submitting`);
      return;
    }

    if (!selectedFlight) {
      toast.error('Please select a flight');
      return;
    }

    setSubmitting(true);

    try {
      // Match each input name to the full cadet name
      const resolvedNames = names.map(name => {
        const match = matchCadetByPartialName(name);
        return match ? match.cadet.name : name; // Use full name from match
      });

      // Submit points for each resolved name
      const promises = resolvedNames.map(async (name) => {
        const postHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (accessToken) postHeaders['Authorization'] = `Bearer ${accessToken}`;

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/points`,
          {
            method: 'POST',
            headers: postHeaders,
            body: JSON.stringify({
              cadetName: name,
              flight: selectedFlight,
              points: parseFloat(pointValue),
              reason,
              type: pointType,
              date: new Date().toISOString(),
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to add points for ${name}`);
        }
        
        return response.json();
      });

      await Promise.all(promises);
      
      toast.success(`Points added successfully for ${resolvedNames.length} cadet(s)!`);
      setMultipleNames('');
      setSelectedFlight('');
      setPointValue('');
      setReason('');
      setPointType('general');
      setDuplicateWarning([]);
      setInvalidNames([]);
      fetchPoints();
    } catch (error) {
      console.error('Error adding points:', error);
      toast.error('Failed to add points for some cadets');
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
      const delHeaders: Record<string, string> = {};
      if (accessToken) delHeaders['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/points/${pointId}`,
        {
          method: 'DELETE',
          headers: delHeaders,
        }
      );

      if (response.ok) {
        toast.success('Point entry deleted');
        fetchPoints();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete point');
      }
    } catch (error) {
      console.error('Error deleting point:', error);
      toast.error('Failed to delete point');
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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/points/${editingId}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            cadetName: editValues.cadetName,
            points: parseFloat(editValues.points),
            reason: editValues.reason,
            type: editValues.type,
            flight: editValues.flight,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update point');
      }

      toast.success('Point updated');
      setEditingId(null);
      fetchPoints();
    } catch (error) {
      console.error('Error updating point:', error);
      toast.error('Failed to update point');
    }
  };

  const handleClearCadetPoints = async (cadetName: string) => {
    if (!ensureAdminPin()) return;
    if (!confirm(`Clear all points for ${cadetName}?`)) return;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/points/clear-cadet`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ cadetName }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to clear points');
      }

      toast.success(`Cleared points for ${cadetName}`);
      fetchPoints();
    } catch (error) {
      console.error('Error clearing cadet points:', error);
      toast.error('Failed to clear points');
    }
  };

  const canAdmin = userRole === 'staff' || userRole === 'snco';
  const canDelete = canAdmin;

  // Get unique flights from cadets
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
      <div className="grid gap-6 md:grid-cols-2">
      {/* Add Points Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Add Points</CardTitle>
              <CardDescription>Award or deduct points for cadets (supports multiple names)</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleLogoClick}>
                <span className="font-bold tracking-wider">2427</span>
              </Button>
              <span className={`text-xs px-2 py-1 rounded ${adminUnlocked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {adminUnlocked ? 'Admin: Unlocked' : 'Admin: Locked'}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddPoints} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="names">Cadet Name(s)</Label>
              <Textarea
                id="names"
                placeholder="Enter one or more names (separated by commas or new lines)&#10;e.g., John Smith, Jane Doe&#10;or one name per line"
                value={multipleNames}
                onChange={(e) => setMultipleNames(e.target.value)}
                required
                rows={4}
              />
              <p className="text-xs text-gray-500">
                Tip: Enter multiple names separated by commas or line breaks
              </p>
            </div>

            {duplicateWarning.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>
                  Duplicate names detected: {duplicateWarning.join(', ')}
                </AlertDescription>
              </Alert>
            )}

            {invalidNames.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>
                  Names not found in system: {invalidNames.join(', ')}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="flight">Flight</Label>
              <Select value={selectedFlight} onValueChange={setSelectedFlight}>
                <SelectTrigger id="flight">
                  <SelectValue placeholder="Select flight" />
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

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
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
              <Label htmlFor="points">Points</Label>
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
              <Label htmlFor="reason">Reason</Label>
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

      {/* Recent Points */}
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
      </div>

      {canAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Cadet Totals & Clear</CardTitle>
            <CardDescription>SNCO/staff tools to adjust points</CardDescription>
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