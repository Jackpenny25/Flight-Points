import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Award, TrendingUp, TrendingDown } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface MyPointsProps {
  accessToken: string;
  cadetName: string;
}

interface Point {
  id: string;
  cadetName: string;
  date: string;
  flight: string;
  reason: string;
  points: number;
  type?: string;
  givenBy?: string;
  updatedBy?: string;
}

export function MyPoints({ accessToken, cadetName }: MyPointsProps) {
  const [points, setPoints] = useState<Point[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchMyPoints();
  }, [accessToken]);

  const fetchMyPoints = async () => {
    try {
      setLoading(true);
      const functionBase = `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f`;
      console.log('Fetching my points for:', cadetName);
      const url = `${functionBase}/data/my-points?name=${encodeURIComponent(cadetName)}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to fetch points:', response.status, errorData);
        throw new Error('Failed to fetch points');
      }
      
      const data = await response.json();
      console.log('Received points data:', data);
      setPoints(data.points || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching my points:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  };

  const getTypeColor = (type?: string) => {
    switch (type) {
      case 'good': return 'bg-green-100 text-green-800';
      case 'bad': return 'bg-red-100 text-red-800';
      case 'attendance': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Award className="size-6 text-primary" />
                My Points Report
              </CardTitle>
              <CardDescription className="text-base mt-2">
                {cadetName}
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Total Points</div>
              <div className="text-4xl font-bold text-primary">{total}</div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Points Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Points</CardTitle>
          <CardDescription>Complete breakdown of all points awarded</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading points...</div>
          ) : points.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No points recorded yet</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Given By</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {points.map((point) => (
                    <TableRow key={point.id}>
                      <TableCell className="font-medium">{formatDate(point.date)}</TableCell>
                      <TableCell>{point.reason}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getTypeColor(point.type)}>
                          {point.type || 'general'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(point.givenBy && point.givenBy.trim()) || (point.updatedBy && point.updatedBy.trim()) || 'Unknown'}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold flex items-center justify-end gap-1 ${
                          point.points > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {point.points > 0 ? (
                            <TrendingUp className="size-4" />
                          ) : (
                            <TrendingDown className="size-4" />
                          )}
                          {point.points > 0 ? '+' : ''}{point.points}
                        </span>
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
