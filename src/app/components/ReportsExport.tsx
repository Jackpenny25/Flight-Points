import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { formatFlight } from './ui/utils';
import { Filter, Edit2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Textarea } from './ui/textarea';

interface ReportsExportProps {
  accessToken: string;
  userRole: string;
}

export function ReportsExport({ accessToken, userRole }: ReportsExportProps) {
  const [points, setPoints] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [cadets, setCadets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedFlight, setSelectedFlight] = useState('all');
  const [selectedCadet, setSelectedCadet] = useState('all');

  // Edit state
  const [editingPoint, setEditingPoint] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    points: '',
    reason: '',
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const [pointsData, attendanceData, cadetsData] = await Promise.all([
        api.getPoints(),
        api.getAttendance(),
        api.getCadets(),
      ]);
      setPoints(pointsData.points || pointsData || []);
      setAttendance(attendanceData.attendance || attendanceData || []);
      setCadets(cadetsData.cadets || cadetsData || []);
    } catch (error) {
      toast.error('Error fetching reports data');
      console.error('Error fetching reports data:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEditPoint = async () => {
    if (!editingPoint) return;

    try {
      const updated = await api.updatePoint(editingPoint.id, {
        points: parseFloat(editForm.points),
        reason: editForm.reason,
      });
      if (updated && !updated.error) {
        toast.success('Point updated successfully');
        setEditingPoint(null);
        fetchAllData();
      } else {
        toast.error('Failed to update point');
      }
    } catch (error) {
      console.error('Error updating point:', error);
      toast.error('Failed to update point');
    }
  };

  const openEditDialog = (point: any) => {
    setEditingPoint(point);
    setEditForm({
      points: point.points.toString(),
      reason: point.reason,
    });
  };

  // Filter data
  const filterData = (data: any[]) => {
    return data.filter((item) => {
      const itemDate = new Date(item.date);
      
      if (dateFrom && itemDate < new Date(dateFrom)) return false;
      if (dateTo && itemDate > new Date(dateTo)) return false;
      if (selectedFlight !== 'all' && item.flight !== selectedFlight) return false;
      if (selectedCadet !== 'all' && item.cadetName !== selectedCadet) return false;
      
      return true;
    });
  };

  const filteredPoints = filterData(points).filter((p) => p.type !== 'attendance');
  const filteredAttendance = filterData(attendance);

  const flights = Array.from(new Set(cadets.map(c => c.flight))).sort();
  const cadetNames = cadets.map(c => c.name).sort();

  const canEdit = userRole === 'snco';

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading reports data...</div>
    );
  }

  if (fetchError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-red-600 font-medium mb-2">Failed to load reports data</p>
          <p className="text-sm text-muted-foreground mb-4">This may be due to rate limiting (too many requests). Wait a moment and try again.</p>
          <Button onClick={fetchAllData}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="size-5" />
            Filters
          </CardTitle>
          <CardDescription>Filter data by date range, flight, or cadet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="date-from">From Date</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date-to">To Date</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-flight">Flight</Label>
              <Select value={selectedFlight} onValueChange={setSelectedFlight}>
                <SelectTrigger id="filter-flight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Flights</SelectItem>
                  {flights.map((flight) => (
                    <SelectItem key={flight} value={flight}>
                      {formatFlight(flight)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-cadet">Cadet</Label>
              <Select value={selectedCadet} onValueChange={setSelectedCadet}>
                <SelectTrigger id="filter-cadet">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cadets</SelectItem>
                  {cadetNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(dateFrom || dateTo || selectedFlight !== 'all' || selectedCadet !== 'all') && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setSelectedFlight('all');
                  setSelectedCadet('all');
                }}
              >
                Clear Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="points" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="points">Points Records</TabsTrigger>
          <TabsTrigger value="attendance">Attendance Records</TabsTrigger>
        </TabsList>

        {/* Points Tab */}
        <TabsContent value="points">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Points Records</CardTitle>
                  <CardDescription>
                    {filteredPoints.length} record(s) found
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : filteredPoints.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No records found</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Cadet</TableHead>
                        <TableHead>Flight</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Points</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Given By</TableHead>
                        {canEdit && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPoints.map((point) => (
                        <TableRow key={point.id}>
                          <TableCell>{new Date(point.date).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{point.cadetName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{formatFlight(point.flight)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{point.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={point.points >= 0 ? 'default' : 'destructive'}>
                              {point.points >= 0 ? '+' : ''}{point.points}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{point.reason}</TableCell>
                          <TableCell className="text-sm text-gray-600">{point.givenBy}</TableCell>
                          {canEdit && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(point)}
                              >
                                <Edit2 className="size-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Attendance Records</CardTitle>
                  <CardDescription>
                    {filteredAttendance.length} record(s) found
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : filteredAttendance.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No records found</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Cadet</TableHead>
                        <TableHead>Flight</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAttendance.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{record.cadetName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{formatFlight(record.flight)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                record.status === 'present' ? 'default' :
                                record.status === 'authorised_absence' ? 'secondary' :
                                'destructive'
                              }
                            >
                              {record.status === 'present' ? 'Present' :
                               record.status === 'authorised_absence' ? 'Auth. Absence' :
                               'Absent'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{record.submittedBy}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editingPoint !== null} onOpenChange={(open) => !open && setEditingPoint(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Point Entry</DialogTitle>
            <DialogDescription>
              Make changes to this point record
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Cadet: {editingPoint?.cadetName}</Label>
              <p className="text-sm text-gray-600">
                Date: {editingPoint && new Date(editingPoint.date).toLocaleDateString()}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-points">Points</Label>
              <Input
                id="edit-points"
                type="number"
                step="0.5"
                value={editForm.points}
                onChange={(e) => setEditForm({ ...editForm, points: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-reason">Reason</Label>
              <Textarea
                id="edit-reason"
                value={editForm.reason}
                onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPoint(null)}>
              <X className="size-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleEditPoint}>
              <Save className="size-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
