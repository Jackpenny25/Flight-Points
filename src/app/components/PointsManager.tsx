import { useState, useEffect } from 'react';
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

  // Validate and parse names
  const validateNames = (namesInput: string) => {
    if (!namesInput.trim()) {
      setDuplicateWarning([]);
      setInvalidNames([]);
      return;
    }

    // Split by commas or newlines
    const names = namesInput
      .split(/[,\n]/)
      .map(name => name.trim())
      .filter(name => name.length > 0);

    // Check for duplicates
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    setDuplicateWarning(Array.from(new Set(duplicates)));

    // Check if names exist in cadet list
    const cadetNames = cadets.map(c => c.name.toLowerCase());
    const invalid = names.filter(name => !cadetNames.includes(name.toLowerCase()));
    setInvalidNames(invalid);
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
      toast.error(`Invalid names: ${invalidNames.join(', ')}`);
      return;
    }

    if (!selectedFlight) {
      toast.error('Please select a flight');
      return;
    }

    setSubmitting(true);

    try {
      // Submit points for each name
      const promises = names.map(async (name) => {
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
      
      toast.success(`Points added successfully for ${names.length} cadet(s)!`);
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

  const canDelete = userRole === 'staff' || userRole === 'snco';

  // Get unique flights from cadets
  const flights = Array.from(new Set(cadets.map(c => c.flight))).sort();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Add Points Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add Points</CardTitle>
          <CardDescription>Award or deduct points for cadets (supports multiple names)</CardDescription>
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
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">{point.cadetName}</p>
                      <p className="text-sm text-gray-600">{formatFlight(point.flight)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={point.points >= 0 ? 'default' : 'destructive'}>
                        {point.points >= 0 ? '+' : ''}{point.points} pts
                      </Badge>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePoint(point.id)}
                        >
                          <Trash2 className="size-4 text-red-600" />
                        </Button>
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}