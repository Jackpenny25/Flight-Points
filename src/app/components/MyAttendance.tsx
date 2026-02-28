import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { CalendarDays, CheckCircle2, XCircle } from 'lucide-react';

interface MyAttendanceProps {
  cadetName: string;
}

export function MyAttendance({ cadetName }: MyAttendanceProps) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendance();
  }, [cadetName]);

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const data = await api.getAttendance();
      const list = Array.isArray(data) ? data : (data.attendance || []);
      setRecords(list.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (e) {
      console.error('Failed to fetch attendance', e);
    } finally {
      setLoading(false);
    }
  };

  const presentCount = records.filter(r => r.status === 'present').length;
  const absentCount = records.filter(r => r.status !== 'present').length;
  const rate = records.length > 0 ? Math.round((presentCount / records.length) * 100) : 0;

  const statusBadge = (status: string) => {
    if (status === 'present') return <Badge className="bg-green-100 text-green-800 border-green-200">Present</Badge>;
    if (status === 'authorised_absence') return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Auth. Absence</Badge>;
    return <Badge className="bg-red-100 text-red-800 border-red-200">Absent</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-8 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-700">{presentCount}</div>
                <div className="text-sm text-green-600">Times Present</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="size-8 text-red-500" />
              <div>
                <div className="text-2xl font-bold text-red-600">{absentCount}</div>
                <div className="text-sm text-red-500">Times Absent</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CalendarDays className="size-8 text-primary" />
              <div>
                <div className="text-2xl font-bold text-primary">{rate}%</div>
                <div className="text-sm text-gray-600">Attendance Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Records list */}
      <Card>
        <CardHeader>
          <CardTitle>My Attendance Record</CardTitle>
          <CardDescription>{records.length} session{records.length !== 1 ? 's' : ''} recorded</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No attendance records yet</div>
          ) : (
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border bg-white">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="size-4 text-gray-400" />
                    <div>
                      <div className="font-medium text-sm">
                        {new Date(r.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                      {r.submittedBy && (
                        <div className="text-xs text-muted-foreground">Recorded by {r.submittedBy}</div>
                      )}
                    </div>
                  </div>
                  {statusBadge(r.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
