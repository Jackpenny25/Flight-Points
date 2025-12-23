import { useState, useEffect } from 'react';
import { projectId } from '../../../utils/supabase/info';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { formatFlight } from './ui/utils';
import { Trophy, Award, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AttendanceReports } from './AttendanceReports';

interface LeaderboardsProps {
  accessToken: string;
}

export function Leaderboards({ accessToken }: LeaderboardsProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboards();
    // Refresh every 30 seconds
    const interval = setInterval(fetchLeaderboards, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchLeaderboards = async () => {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/leaderboards`,
        { headers }
      );

      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching leaderboards:', error);
      toast.error('Failed to fetch leaderboards');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">Loading leaderboards...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">No data available</div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="points" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="points">Points Leaderboards</TabsTrigger>
        <TabsTrigger value="attendance">Attendance Reports</TabsTrigger>
      </TabsList>

      <TabsContent value="points" className="space-y-6">
        {/* Winners Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-yellow-200 bg-gradient-to-br from-yellow-50 to-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="size-6 text-yellow-600" />
                {data.winnersFlights && data.winnersFlights.length > 1 ? 'Joint Winning Flights' : 'Winning Flight'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.winnersFlights && data.winnersFlights.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {data.winnersFlights.map((f: any) => (
                      <Badge key={f.flight} variant="default" className="text-lg font-bold px-3 py-1 bg-yellow-600">
                        {formatFlight(f.flight)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-2xl font-semibold text-yellow-800">{data.winnersFlights[0].points} points</p>
                </div>
              ) : data.winningFlight ? (
                <div>
                  <p className="text-4xl font-extrabold text-yellow-900">{formatFlight(data.winningFlight.flight)}</p>
                  <p className="text-2xl font-semibold text-yellow-800">{data.winningFlight.points} points</p>
                </div>
              ) : (
                <p className="text-gray-500">No data yet</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="size-6 text-blue-600" />
                {data.winnersCadets && data.winnersCadets.length > 1 ? 'Joint Winning Cadets' : 'Winning Cadet'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.winnersCadets && data.winnersCadets.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {data.winnersCadets.map((c: any) => (
                      <Badge key={c.name} variant="default" className="text-lg font-bold px-3 py-1">
                        {c.name}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-2xl font-semibold text-blue-800">{data.winnersCadets[0].points} points</p>
                </div>
              ) : data.winningCadet ? (
                <div>
                  <p className="text-4xl font-extrabold text-blue-900">{data.winningCadet.name}</p>
                  <p className="text-2xl font-semibold text-blue-800">{data.winningCadet.points} points</p>
                </div>
              ) : (
                <p className="text-gray-500">No data yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Leaderboard Tables */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Flight Leaderboard */}
          <Card>
            <CardHeader>
              <CardTitle>Flight Leaderboard</CardTitle>
              <CardDescription>Total points by flight</CardDescription>
            </CardHeader>
            <CardContent>
              {data.flightLeaderboard && data.flightLeaderboard.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rank</TableHead>
                      <TableHead>Flight</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.flightLeaderboard.map((entry: any, index: number) => (
                      <TableRow key={entry.flight}>
                        <TableCell className="font-medium">
                          {entry.points === data.flightLeaderboard[0].points && (
                            <Trophy className="inline size-4 text-yellow-600 mr-1" />
                          )}
                          #{index + 1}
                        </TableCell>
                        <TableCell className="font-medium">{formatFlight(entry.flight)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={entry.points === data.flightLeaderboard[0].points ? 'default' : 'secondary'}>
                            {entry.points}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-500">No flights recorded yet</div>
              )}
            </CardContent>
          </Card>

          {/* Cadet Leaderboard */}
          <Card>
            <CardHeader>
              <CardTitle>Cadet Leaderboard</CardTitle>
              <CardDescription>Top 10 cadets by points</CardDescription>
            </CardHeader>
            <CardContent>
              {data.cadetLeaderboard && data.cadetLeaderboard.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Rank</TableHead>
                      <TableHead>Cadet</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.cadetLeaderboard.slice(0, 10).map((entry: any, index: number) => (
                      <TableRow key={entry.name}>
                        <TableCell className="font-medium">
                          {entry.points === data.cadetLeaderboard[0].points && (
                            <Award className="inline size-4 text-blue-600 mr-1" />
                          )}
                          #{index + 1}
                        </TableCell>
                        <TableCell className="font-medium">{entry.name}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={entry.points === data.cadetLeaderboard[0].points ? 'default' : 'secondary'}>
                            {entry.points}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-500">No cadets recorded yet</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Points (excluding attendance) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest point awards (excluding attendance)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentPoints && data.recentPoints.length > 0 ? (
              <div className="space-y-3">
                {data.recentPoints.map((point: any) => (
                  <div key={point.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{point.cadetName}</span>
                        <Badge variant="outline" className="text-xs">{formatFlight(point.flight)}</Badge>
                        <Badge variant="outline" className="text-xs">{point.type}</Badge>
                      </div>
                      <p className="text-sm text-gray-600">{point.reason}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(point.date).toLocaleDateString()} • {point.givenBy}
                      </p>
                    </div>
                    <Badge variant={point.points >= 0 ? 'default' : 'destructive'} className="ml-4">
                      {point.points >= 0 ? '+' : ''}{point.points}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">No recent activity</div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="attendance">
        <AttendanceReports accessToken={accessToken} />
      </TabsContent>
    </Tabs>
  );
}