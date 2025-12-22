import { useState, useEffect } from 'react';
import { projectId } from '../../../utils/supabase/info';
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
  }, []);

  const performIntegrityChecks = async () => {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/integrity-check`,
        { headers }
      );

      if (response.ok) {
        const data = await response.json();
        setChecks(data.checks || []);
        setSummary(data.summary || {
          totalChecks: 0,
          passed: 0,
          warnings: 0,
          failed: 0,
        });
      }
    } catch (error) {
      console.error('Error performing integrity checks:', error);
      toast.error('Failed to perform integrity checks');
    } finally {
      setLoading(false);
    }
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
