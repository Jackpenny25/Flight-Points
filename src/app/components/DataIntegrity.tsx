import { useState, useEffect } from 'react';
import { projectId } from '../../utils/supabase/info';
import supabase from '../../utils/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { CheckCircle, XCircle, AlertTriangle, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

interface DataIntegrityProps {
  accessToken: string;
}

interface IntegrityCheck {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  details?: string;
}

export function DataIntegrity({ accessToken }: DataIntegrityProps) {
  const [checks, setChecks] = useState<IntegrityCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalChecks: 0,
    passed: 0,
    warnings: 0,
    failed: 0,
  });

  useEffect(() => {
    performIntegrityChecks();
    // Refresh every 30 seconds
    const interval = setInterval(performIntegrityChecks, 30000);
    return () => clearInterval(interval);
  }, [accessToken]);

  const performIntegrityChecks = async () => {
    setLoading(true);
    const runChecks: IntegrityCheck[] = [];
    const summaryCounts = { totalChecks: 0, passed: 0, warnings: 0, failed: 0 };

    const add = (c: IntegrityCheck) => {
      runChecks.push(c);
      summaryCounts.totalChecks += 1;
      if (c.status === 'pass') summaryCounts.passed += 1;
      if (c.status === 'warning') summaryCounts.warnings += 1;
      if (c.status === 'fail') summaryCounts.failed += 1;
    };

    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    // Client-side Supabase checks (avoid directly calling function URLs to prevent 404 noise)
    // Cadets table
    try {
      const { data: cadets, error: cadetError } = await supabase.from('cadets').select('id, email, first_name, last_name');
      if (cadetError) {
        add({ name: 'Cadets table', status: 'warning', message: `Error querying cadets: ${cadetError.message}` });
      } else if (!cadets || cadets.length === 0) {
        add({ name: 'Cadets table', status: 'warning', message: 'Cadets table is empty or inaccessible.' });
      } else {
        // duplicate id/email checks
        const ids = new Set<string>();
        const emails = new Map<string, number>();
        cadets.forEach((c: any) => {
          if (c && c.id) ids.add(String(c.id));
          if (c && c.email) emails.set(String(c.email).toLowerCase(), (emails.get(String(c.email).toLowerCase()) || 0) + 1);
        });
        const duplicateEmails = Array.from(emails.entries()).filter(([, count]) => count > 1).map(([e]) => e).slice(0, 5);
        if (duplicateEmails.length > 0) {
          add({ name: 'Cadets table', status: 'warning', message: `Loaded ${cadets.length} cadets. Duplicate emails found: ${duplicateEmails.join(', ')}`, details: `${duplicateEmails.length} duplicate email(s) shown.` });
        } else {
          add({ name: 'Cadets table', status: 'pass', message: `Loaded ${cadets.length} cadets.` });
        }
      }
    } catch (e: any) {
      add({ name: 'Cadets table', status: 'warning', message: `Unexpected error checking cadets: ${String(e?.message || e)}` });
    }

    // Attendance table
    let cadetIdSet = new Set<string>();
    try {
      const { data: cadetsAll } = await supabase.from('cadets').select('id');
      if (cadetsAll && Array.isArray(cadetsAll)) cadetIdSet = new Set(cadetsAll.map((c: any) => String(c.id)));
    } catch (e) {
      // ignore — we'll still run attendance checks best-effort
    }

    try {
      const { data: attendance, error: attendError } = await supabase.from('attendance').select('id, cadet_id, date').limit(5000);
      if (attendError) {
        add({ name: 'Attendance table', status: 'warning', message: `Error querying attendance: ${attendError.message}` });
      } else if (!attendance || attendance.length === 0) {
        add({ name: 'Attendance table', status: 'warning', message: 'No attendance records found.' });
      } else {
        // find orphan attendance entries pointing to missing cadets
        const orphaned = attendance.filter((a: any) => a && a.cadet_id && !cadetIdSet.has(String(a.cadet_id)));
        if (orphaned.length > 0) {
          add({ name: 'Attendance table', status: 'warning', message: `Loaded ${attendance.length} records. ${orphaned.length} orphaned attendance entries.` , details: `${orphaned.slice(0,5).map((o:any)=>o.id).join(', ')}`});
        } else {
          add({ name: 'Attendance table', status: 'pass', message: `Loaded ${attendance.length} attendance records.` });
        }
      }
    } catch (e: any) {
      add({ name: 'Attendance table', status: 'warning', message: `Unexpected error checking attendance: ${String(e?.message || e)}` });
    }

    // Points table
    try {
      const { data: points, error: pointsError } = await supabase.from('points').select('id, cadet_id, points').limit(5000);
      if (pointsError) {
        add({ name: 'Points table', status: 'warning', message: `Error querying points: ${pointsError.message}` });
      } else if (!points || points.length === 0) {
        add({ name: 'Points table', status: 'warning', message: 'No point records found.' });
      } else {
        const orphanPoints = points.filter((p: any) => p && p.cadet_id && !cadetIdSet.has(String(p.cadet_id)));
        const negativePoints = points.filter((p: any) => typeof p.points === 'number' && p.points < 0);
        if (orphanPoints.length > 0 || negativePoints.length > 0) {
          const details = [`orphaned:${orphanPoints.length}`, `negative:${negativePoints.length}`].join(', ');
          add({ name: 'Points table', status: 'warning', message: `Loaded ${points.length} point records. Issues found: ${details}`, details });
        } else {
          add({ name: 'Points table', status: 'pass', message: `Loaded ${points.length} point records.` });
        }
      }
    } catch (e: any) {
      add({ name: 'Points table', status: 'warning', message: `Unexpected error checking points: ${String(e?.message || e)}` });
    }

    // Note about server-side function checks
    add({ name: 'Server integrity endpoint', status: 'warning', message: 'Server functions are not invoked from the client to avoid network 404 noise. Deploy and run server-side checks from the server environment.' });

    // 5) Auth session availability
    if (!accessToken) {
      add({ name: 'Auth session', status: 'warning', message: 'No access token — some server checks are unavailable. Sign in to run full checks.' });
    } else {
      add({ name: 'Auth session', status: 'pass', message: 'Access token available.' });
    }

    // finalize
    setChecks(runChecks);
    setSummary(summaryCounts);
    setLoading(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="size-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="size-5 text-yellow-600" />;
      case 'fail':
        return <XCircle className="size-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'fail':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">Running integrity checks...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="size-4 text-blue-600" />
              Total Checks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-900">{summary.totalChecks}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-white border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="size-4 text-green-600" />
              Passed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-900">{summary.passed}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-50 to-white border-yellow-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="size-4 text-yellow-600" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-900">{summary.warnings}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-white border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <XCircle className="size-4 text-red-600" />
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-900">{summary.failed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Overall Status */}
      {summary.failed === 0 && summary.warnings === 0 && summary.passed > 0 && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="size-4 text-green-600" />
          <AlertTitle className="text-green-900">All Systems Operational</AlertTitle>
          <AlertDescription className="text-green-700">
            All data integrity checks passed successfully. Your system is healthy.
          </AlertDescription>
        </Alert>
      )}

      {summary.failed > 0 && (
        <Alert variant="destructive">
          <XCircle className="size-4" />
          <AlertTitle>Critical Issues Detected</AlertTitle>
          <AlertDescription>
            {summary.failed} critical issue{summary.failed > 1 ? 's' : ''} found. Please review and address immediately.
          </AlertDescription>
        </Alert>
      )}

      {/* Detailed Checks */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Integrity Checks</CardTitle>
          <CardDescription>Comprehensive validation of all system data</CardDescription>
        </CardHeader>
        <CardContent>
          {checks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No checks performed yet</div>
          ) : (
            <div className="space-y-3">
              {checks.map((check, index) => (
                <div
                  key={index}
                  className={`p-4 border rounded-lg ${getStatusColor(check.status)}`}
                >
                  <div className="flex items-start gap-3">
                    {getStatusIcon(check.status)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium">{check.name}</h4>
                        <Badge
                          variant={
                            check.status === 'pass' ? 'default' :
                            check.status === 'warning' ? 'secondary' :
                            'destructive'
                          }
                        >
                          {check.status.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700">{check.message}</p>
                      {check.details && (
                        <p className="text-xs text-gray-600 mt-2 font-mono bg-white/50 p-2 rounded">
                          {check.details}
                        </p>
                      )}
                    </div>
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
