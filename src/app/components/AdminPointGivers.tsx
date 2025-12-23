import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Users, Clock } from 'lucide-react';
import { projectId } from '../../../utils/supabase/info';

interface ContributorSummary {
  name: string;
  totalPointsGiven: number;
  totalPointEntries: number;
  lastPointAt: string | null;
  totalAttendanceSubmitted: number;
  lastAttendanceAt: string | null;
  recentPoints: Array<{
    id: string;
    cadetName: string;
    flight: string;
    points: number;
    type: string;
    reason: string;
    date: string;
  }>;
}

interface AdminPointGiversProps {
  accessToken: string;
}

export function AdminPointGivers({ accessToken }: AdminPointGiversProps) {
  const [loading, setLoading] = useState(true);
  const [contributors, setContributors] = useState<ContributorSummary[]>([]);
  const [recentPointsGlobal, setRecentPointsGlobal] = useState<ContributorSummary['recentPoints']>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/admin/point-givers`,
        { headers }
      );
      const data = await res.json();
      setContributors(data.contributors || []);
      setRecentPointsGlobal(data.recentPointsGlobal || []);
    } catch (e) {
      setContributors([]);
      setRecentPointsGlobal([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleExpanded = (name: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>NCO Activity</CardTitle>
          <CardDescription>Overview of users awarding points and recording attendance</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground py-6">Loading…</div>
          ) : contributors.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">No contributor activity yet</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Total Points Given</TableHead>
                    <TableHead className="text-right">Point Entries</TableHead>
                    <TableHead>Last Points</TableHead>
                    <TableHead className="text-right">Attendance Entries</TableHead>
                    <TableHead>Last Attendance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contributors.map((c) => {
                    const isExpanded = expandedRows.has(c.name);
                    return (
                      <>
                        <TableRow key={c.name} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleExpanded(c.name)}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                <path d="m9 18 6-6-6-6" />
                              </svg>
                              <Users className="size-4 text-muted-foreground" />
                              <span>{c.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">{c.totalPointsGiven}</TableCell>
                          <TableCell className="text-right">{c.totalPointEntries}</TableCell>
                          <TableCell>
                            {c.lastPointAt ? (
                              <div className="flex items-center gap-1">
                                <Clock className="size-4 text-muted-foreground" />
                                <span>{new Date(c.lastPointAt).toLocaleString()}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{c.totalAttendanceSubmitted}</TableCell>
                          <TableCell>
                            {c.lastAttendanceAt ? (
                              <div className="flex items-center gap-1">
                                <Clock className="size-4 text-muted-foreground" />
                                <span>{new Date(c.lastAttendanceAt).toLocaleString()}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && c.recentPoints.length > 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30 p-4">
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Recent Points by {c.name}</p>
                                <div className="rounded-md border">
                                  <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                      <tr>
                                        <th className="p-2 text-left">Cadet</th>
                                        <th className="p-2 text-left">Flight</th>
                                        <th className="p-2 text-right">Points</th>
                                        <th className="p-2 text-left">Type</th>
                                        <th className="p-2 text-left">Reason</th>
                                        <th className="p-2 text-left">Date</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {c.recentPoints.map((p) => (
                                        <tr key={p.id} className="border-t">
                                          <td className="p-2">{p.cadetName}</td>
                                          <td className="p-2">{p.flight}</td>
                                          <td className="p-2 text-right font-medium">{p.points}</td>
                                          <td className="p-2"><Badge variant="outline" className="text-xs">{p.type || 'general'}</Badge></td>
                                          <td className="p-2 max-w-xs truncate" title={p.reason}>{p.reason}</td>
                                          <td className="p-2 text-xs text-muted-foreground">{new Date(p.date).toLocaleString()}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Points (All Givers)</CardTitle>
          <CardDescription>Non-attendance points, latest 20 entries</CardDescription>
        </CardHeader>
        <CardContent>
          {recentPointsGlobal.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">No recent points</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cadet</TableHead>
                    <TableHead>Flight</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPointsGlobal.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.cadetName}</TableCell>
                      <TableCell>{p.flight}</TableCell>
                      <TableCell className="text-right font-medium">{p.points}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{p.type || 'general'}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[28rem] truncate" title={p.reason}>{p.reason}</TableCell>
                      <TableCell>{new Date(p.date).toLocaleString()}</TableCell>
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
