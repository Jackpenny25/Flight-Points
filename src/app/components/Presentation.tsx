import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { api } from '../../utils/api';
import { Copy, Check } from 'lucide-react';

interface CadetData {
  id: string;
  name: string;
  flight: string;
  points: number;
}

export function Presentation() {
  const [cadets, setCadets] = useState<CadetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedHeading, setCopiedHeading] = useState<string | null>(null);

  // Fetch data on mount and on interval
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const cadetsRes = await api.getCadets();
        setCadets(cadetsRes.data || cadetsRes || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching presentation data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const handleCopyHeading = (heading: string) => {
    navigator.clipboard.writeText(heading);
    setCopiedHeading(heading);
    setTimeout(() => setCopiedHeading(null), 2000);
  };

  // Calculate flight totals
  const flightTotals = cadets.reduce((acc: any, cadet) => {
    const flightNum = cadet.flight || 'Unknown';
    acc[flightNum] = (acc[flightNum] || 0) + (cadet.points || 0);
    return acc;
  }, {} as Record<string, number>);

  // Get winning flight
  const winningFlight = Object.entries(flightTotals).sort((a, b) => b[1] - a[1])[0];

  // Get cadet with most points
  const topCadet = cadets.reduce((max, cadet) => 
    (cadet.points || 0) > (max.points || 0) ? cadet : max,
    cadets[0]
  );

  // Get all cadets sorted by points (excluding 0 points)
  const leaderboard = cadets
    .filter(c => (c.points || 0) > 0)
    .sort((a, b) => (b.points || 0) - (a.points || 0));

  if (loading) {
    return (
      <div className="w-full h-[calc(100vh-200px)] bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading presentation data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[calc(100vh-200px)] bg-white flex items-center justify-center">
        <div className="text-center text-red-600">
          <p>{error}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white p-6 rounded-lg space-y-8">
      {/* Section 1: Winning Flight and Cadet */}
      <div className="space-y-6">
        {/* Winning Flight Heading */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-blue-700">Flight with the most points:</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyHeading('Flight with the most points:')}
              className="border-blue-500 text-blue-700 hover:bg-blue-50"
              title="Copy heading"
            >
              {copiedHeading === 'Flight with the most points:' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
          {winningFlight && (
            <Card className="bg-blue-50 border-2 border-blue-200">
              <CardContent className="pt-6">
                <p className="text-4xl font-bold text-blue-700">
                  {winningFlight[0]}: {winningFlight[1]} points
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Cadet with Most Points Heading */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-blue-700">Cadet with the most points:</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyHeading('Cadet with the most points:')}
              className="border-blue-500 text-blue-700 hover:bg-blue-50"
              title="Copy heading"
            >
              {copiedHeading === 'Cadet with the most points:' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
          {topCadet && (
            <Card className="bg-blue-50 border-2 border-blue-200">
              <CardContent className="pt-6">
                <p className="text-2xl font-bold text-blue-700">
                  {topCadet.name}: {topCadet.points} points
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Section 2: Flight Breakdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-blue-700">Flight point totals:</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCopyHeading('Flight point totals:')}
            className="border-blue-500 text-blue-700 hover:bg-blue-50"
            title="Copy heading"
          >
            {copiedHeading === 'Flight point totals:' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        <Card className="bg-blue-50 border-2 border-blue-200">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-6">
              {Object.entries(flightTotals)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([flight, total]) => (
                  <div key={flight} className="text-center p-4 bg-white rounded border border-blue-200">
                    <p className="text-sm text-gray-600 mb-2">{flight}</p>
                    <p className="text-4xl font-bold text-blue-700">{total}</p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 3: All Cadets Leaderboard */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-blue-700">All cadets by total points:</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCopyHeading('All cadets by total points:')}
            className="border-blue-500 text-blue-700 hover:bg-blue-50"
            title="Copy heading"
          >
            {copiedHeading === 'All cadets by total points:' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        <Card className="border-2 border-blue-200">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-100 border-b-2 border-blue-200">
                  <th className="px-4 py-3 text-left font-bold text-blue-700">Rank</th>
                  <th className="px-4 py-3 text-left font-bold text-blue-700">Name</th>
                  <th className="px-4 py-3 text-left font-bold text-blue-700">Flight</th>
                  <th className="px-4 py-3 text-right font-bold text-blue-700">Points</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((cadet, idx) => (
                  <tr
                    key={cadet.id}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}
                  >
                    <td className="px-4 py-2 font-bold text-blue-700">{idx + 1}</td>
                    <td className="px-4 py-2 text-gray-800">{cadet.name}</td>
                    <td className="px-4 py-2 text-gray-700">{cadet.flight}</td>
                    <td className="px-4 py-2 text-right font-bold text-blue-700">{cadet.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        
        <p className="text-sm text-gray-500 text-center">
          Showing {leaderboard.length} cadets with points (0 points excluded)
        </p>
      </div>
    </div>
  );
}
