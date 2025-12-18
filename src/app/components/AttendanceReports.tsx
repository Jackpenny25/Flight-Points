import { useState, useEffect } from 'react';
import { projectId } from '../../../utils/supabase/info';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { formatFlight } from './ui/utils';
import { CheckCircle, XCircle, Clock, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

interface AttendanceSummary {
  cadetName: string;
  flight: string;
  totalPresent: number;
  totalAbsent: number;
  totalRecords: number;
  attendanceRate: number;
}

interface AttendanceReportsProps {
  accessToken: string;
}

export function AttendanceReports({ accessToken }: AttendanceReportsProps) {
  const [summary, setSummary] = useState<AttendanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPresent: 0,
    totalAbsent: 0,
    averageAttendanceRate: 0,
  });

  useEffect(() => {
    fetchAttendanceReports();
    // Refresh every 30 seconds
    const interval = setInterval(fetchAttendanceReports, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAttendanceReports = async () => {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-73a3871f/attendance-summary`,
        { headers }
      );

      if (response.ok) {
        const data = await response.json();
        setSummary(data.summary || []);
        setStats(data.stats || {
          totalPresent: 0,
          totalAbsent: 0,
          averageAttendanceRate: 0,
        });
      }
    } catch (error) {
      console.error('Error fetching attendance reports:', error);
      toast.error('Failed to fetch attendance reports');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">Loading attendance reports...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-green-50 to-white border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="size-4 text-green-600" />
              Total Present
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-900">{stats.totalPresent}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-white border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <XCircle className="size-4 text-red-600" />
              Total Absent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-900">{stats.totalAbsent}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserCheck className="size-4 text-blue-600" />
              Avg. Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-900">{stats.averageAttendanceRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Summary by Cadet */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Summary by Cadet</CardTitle>
          <CardDescription>Breakdown of attendance records per cadet</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No attendance data yet</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cadet Name</TableHead>
                    <TableHead>Flight</TableHead>
                    <TableHead className="text-center">Present</TableHead>
                    <TableHead className="text-center">Absent</TableHead>
                    <TableHead className="text-center">Total Records</TableHead>
                    <TableHead className="text-right">Attendance Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary
                    .sort((a, b) => b.attendanceRate - a.attendanceRate)
                    .map((record, index) => (
                      <TableRow key={`${record.cadetName}-${index}`}>
                        <TableCell className="font-medium">{record.cadetName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatFlight(record.flight)}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-green-700">
                            <CheckCircle className="size-3" />
                            {record.totalPresent}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-red-700">
                            <XCircle className="size-3" />
                            {record.totalAbsent}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">{record.totalRecords}</TableCell>
                        <TableCell className="text-right">
                          <Badge 
                            variant={
                              record.attendanceRate >= 90 ? 'default' : 
                              record.attendanceRate >= 75 ? 'secondary' : 
                              'destructive'
                            }
                          >
                            {record.attendanceRate}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
