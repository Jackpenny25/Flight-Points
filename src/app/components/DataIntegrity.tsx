import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { CheckCircle, XCircle, AlertTriangle, Shield, RefreshCw, ChevronDown, ChevronRight, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';

interface DataIntegrityProps {
  accessToken: string;
}

interface IntegrityCheck {
  name: string;
  category: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  details?: string;
}

export function DataIntegrity({ accessToken }: DataIntegrityProps) {
  const [checks, setChecks] = useState<IntegrityCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState({
    totalChecks: 0,
    passed: 0,
    warnings: 0,
    failed: 0,
  });

  useEffect(() => {
    performIntegrityChecks();
    const interval = setInterval(performIntegrityChecks, 120000);
    return () => clearInterval(interval);
  }, [accessToken]);

  const performIntegrityChecks = async () => {
    setLoading(true);
    try {
      const data = await api.runIntegrityCheck();
      const runChecks: IntegrityCheck[] = data.checks || [];
      const summaryCounts = {
        totalChecks: runChecks.length,
        passed: runChecks.filter(c => c.status === 'pass').length,
        warnings: runChecks.filter(c => c.status === 'warning').length,
        failed: runChecks.filter(c => c.status === 'fail').length,
      };
      setChecks(runChecks);
      setSummary(summaryCounts);
    } catch (error) {
      console.error('Error performing integrity checks:', error);
      toast.error('Failed to perform integrity checks');
      setChecks([{
        name: 'API Error',
        category: 'System',
        status: 'fail',
        message: 'Failed to connect to server for integrity checks'
      }]);
      setSummary({ totalChecks: 1, passed: 0, warnings: 0, failed: 1 });
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle className="size-5 text-green-600 shrink-0" />;
      case 'warning': return <AlertTriangle className="size-5 text-yellow-600 shrink-0" />;
      case 'fail': return <XCircle className="size-5 text-red-600 shrink-0" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass': return 'bg-green-50 border-green-200';
      case 'warning': return 'bg-yellow-50 border-yellow-200';
      case 'fail': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50';
    }
  };

  const getCategoryStatusColor = (categoryChecks: IntegrityCheck[]) => {
    if (categoryChecks.some(c => c.status === 'fail')) return 'border-l-red-500';
    if (categoryChecks.some(c => c.status === 'warning')) return 'border-l-yellow-500';
    return 'border-l-green-500';
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Referential Integrity': return '🔗';
      case 'Duplicates': return '📋';
      case 'Data Quality': return '✅';
      case 'Accounts': return '👤';
      case 'Business Rules': return '📏';
      case 'Rewards': return '🏆';
      case 'Attendance': return '📅';
      case 'Statistics': return '📊';
      case 'Deployment': return '🚀';
      default: return '🔍';
    }
  };

  // Group checks by category
  const categories = checks.reduce<Record<string, IntegrityCheck[]>>((acc, check) => {
    const cat = check.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(check);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="text-center py-12">
        <RefreshCw className="size-8 text-blue-600 animate-spin mx-auto mb-3" />
        <div className="text-gray-600">Running {summary.totalChecks > 0 ? summary.totalChecks : ''} integrity checks...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Deploy Failure Banner */}
      {checks.some(c => c.category === 'Deployment' && c.status === 'fail') && (
        <Alert className="bg-red-100 border-red-400 border-2 animate-pulse">
          <Rocket className="size-5 text-red-700" />
          <AlertTitle className="text-red-900 font-bold text-lg">Deployment Failed!</AlertTitle>
          <AlertDescription className="text-red-800">
            The last auto-deploy failed. The live site may be running an outdated version.
            Check the deploy log on the server or contact the system administrator.
            <br />
            <span className="font-mono text-sm mt-1 block">
              {checks.find(c => c.category === 'Deployment' && c.status === 'fail')?.message}
            </span>
            {checks.find(c => c.category === 'Deployment' && c.status === 'fail')?.details && (
              <span className="font-mono text-xs mt-1 block text-red-700">
                Error: {checks.find(c => c.category === 'Deployment' && c.status === 'fail')?.details}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

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
            All {summary.totalChecks} data integrity checks passed successfully. Your system is healthy.
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

      {summary.warnings > 0 && summary.failed === 0 && (
        <Alert className="bg-yellow-50 border-yellow-200">
          <AlertTriangle className="size-4 text-yellow-600" />
          <AlertTitle className="text-yellow-900">Warnings Found</AlertTitle>
          <AlertDescription className="text-yellow-700">
            {summary.warnings} warning{summary.warnings > 1 ? 's' : ''} detected. These may not require immediate action but should be reviewed.
          </AlertDescription>
        </Alert>
      )}

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={performIntegrityChecks} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Re-run Checks
        </Button>
      </div>

      {/* Categorised Checks */}
      {Object.entries(categories).map(([category, categoryChecks]) => {
        const isCollapsed = collapsedCategories.has(category);
        const catFails = categoryChecks.filter(c => c.status === 'fail').length;
        const catWarnings = categoryChecks.filter(c => c.status === 'warning').length;
        const catPasses = categoryChecks.filter(c => c.status === 'pass').length;

        return (
          <Card key={category} className={`border-l-4 ${getCategoryStatusColor(categoryChecks)}`}>
            <CardHeader
              className="cursor-pointer select-none hover:bg-gray-50/50 transition-colors"
              onClick={() => toggleCategory(category)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <span>{getCategoryIcon(category)}</span>
                  {category}
                  <span className="text-sm font-normal text-gray-500">({categoryChecks.length} check{categoryChecks.length !== 1 ? 's' : ''})</span>
                </CardTitle>
                <div className="flex items-center gap-3">
                  {catFails > 0 && <Badge variant="destructive">{catFails} fail{catFails > 1 ? 's' : ''}</Badge>}
                  {catWarnings > 0 && <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">{catWarnings} warning{catWarnings > 1 ? 's' : ''}</Badge>}
                  {catPasses > 0 && <Badge className="bg-green-100 text-green-800">{catPasses} pass{catPasses > 1 ? 'ed' : ''}</Badge>}
                  {isCollapsed ? <ChevronRight className="size-5 text-gray-400" /> : <ChevronDown className="size-5 text-gray-400" />}
                </div>
              </div>
            </CardHeader>
            {!isCollapsed && (
              <CardContent>
                <div className="space-y-2">
                  {categoryChecks.map((check, index) => (
                    <div
                      key={index}
                      className={`p-3 border rounded-lg ${getStatusColor(check.status)}`}
                    >
                      <div className="flex items-start gap-3">
                        {getStatusIcon(check.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <h4 className="font-medium text-sm">{check.name}</h4>
                            <Badge
                              variant={
                                check.status === 'pass' ? 'default' :
                                check.status === 'warning' ? 'secondary' :
                                'destructive'
                              }
                              className="shrink-0"
                            >
                              {check.status.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-700">{check.message}</p>
                          {check.details && (
                            <p className="text-xs text-gray-600 mt-1.5 font-mono bg-white/50 p-2 rounded break-all">
                              {check.details}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
