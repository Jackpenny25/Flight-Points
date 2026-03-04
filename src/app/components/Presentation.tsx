import { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
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
        const response = await api.getCadets();
        
        // Handle different response structures
        let cadetList = [];
        if (Array.isArray(response)) {
          cadetList = response;
        } else if (response?.data && Array.isArray(response.data)) {
          cadetList = response.data;
        } else if (response?.cadets && Array.isArray(response.cadets)) {
          cadetList = response.cadets;
        }
        
        setCadets(cadetList);
        setError(null);
      } catch (err) {
        console.error('Error fetching presentation data:', err);
        setError('Failed to load data. Check console for details.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 120000); // Refresh every 2 minutes
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

  // Get winning flight (most points)
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
      <div className="w-full min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00247D] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading presentation data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-600 mb-2">{error}</p>
          <p className="text-gray-600 text-sm mb-4">Cadets loaded: {cadets.length}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white p-6 rounded-lg">
      {/* Main Title */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-gray-800 underline">Flight points:</h1>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-2 gap-8 mb-12">
        {/* LEFT: Flight point totals */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Flight point totals:</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyHeading('Flight point totals:')}
              className="border-gray-400 text-gray-700 hover:bg-gray-50"
              title="Copy heading"
            >
              {copiedHeading === 'Flight point totals:' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>

          <div className="border-2 border-gray-400">
            <table className="w-full">
              <thead>
                <tr className="bg-[#00247D]">
                  <th className="px-6 py-3 text-left font-bold text-white text-lg">Flight</th>
                  <th className="px-6 py-3 text-left font-bold text-white text-lg">Points</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(flightTotals)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .map(([flight, total], idx) => (
                    <tr
                      key={flight}
                      className={idx % 2 === 0 ? 'bg-[#00247D]/10' : 'bg-white'}
                    >
                      <td className="px-6 py-4 text-gray-800 border-b border-gray-300">{flight}</td>
                      <td className="px-6 py-4 text-gray-800 border-b border-gray-300 font-semibold">{total}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: Who has the most points */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Who has the most points:</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyHeading('Who has the most points:')}
              className="border-gray-400 text-gray-700 hover:bg-gray-50"
              title="Copy heading"
            >
              {copiedHeading === 'Who has the most points:' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Winning Cadet Table */}
          <div className="border-2 border-gray-400">
            <table className="w-full">
              <thead>
                <tr className="bg-[#00247D]">
                  <th className="px-6 py-3 text-left font-bold text-white text-lg">Winning cadet</th>
                  <th className="px-6 py-3 text-left font-bold text-white text-lg">Points</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-[#00247D]/10">
                  <td className="px-6 py-4 text-gray-800 border-b border-gray-300">{topCadet?.name || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-800 border-b border-gray-300 font-semibold">{topCadet?.points || 0}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Winning Flight Table */}
          <div className="border-2 border-gray-400">
            <table className="w-full">
              <thead>
                <tr className="bg-[#00247D]">
                  <th className="px-6 py-3 text-left font-bold text-white text-lg">Flight</th>
                  <th className="px-6 py-3 text-left font-bold text-white text-lg">Points</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-[#00247D]/10">
                  <td className="px-6 py-4 text-gray-800 border-b border-gray-300">{winningFlight?.[0] || 'N/A'}</td>
                  <td className="px-6 py-4 text-gray-800 border-b border-gray-300 font-semibold">{winningFlight?.[1] || 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* All Cadets Leaderboard */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-800">All cadets by total points:</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCopyHeading('All cadets by total points:')}
            className="border-gray-400 text-gray-700 hover:bg-gray-50"
            title="Copy heading"
          >
            {copiedHeading === 'All cadets by total points:' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>

        <div className="border-2 border-gray-400 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#00247D]">
                <th className="px-4 py-3 text-left font-bold text-white text-sm">Rank</th>
                <th className="px-4 py-3 text-left font-bold text-white text-sm">Cadet Name</th>
                <th className="px-4 py-3 text-left font-bold text-white text-sm">Flight</th>
                <th className="px-4 py-3 text-right font-bold text-white text-sm">Points</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length > 0 ? (
                leaderboard.map((cadet, idx) => (
                  <tr
                    key={cadet.id}
                    className={idx % 2 === 0 ? 'bg-[#00247D]/10' : 'bg-white'}
                  >
                    <td className="px-4 py-2 text-gray-800 border-b border-gray-300 font-semibold">{idx + 1}</td>
                    <td className="px-4 py-2 text-gray-800 border-b border-gray-300">{cadet.name}</td>
                    <td className="px-4 py-2 text-gray-800 border-b border-gray-300">{cadet.flight}</td>
                    <td className="px-4 py-2 text-gray-800 border-b border-gray-300 text-right font-semibold">{cadet.points}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No cadets with points to display
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-sm text-gray-600 text-center">
          Showing {leaderboard.length} cadets with points (0 points excluded)
        </p>
      </div>
    </div>
  );
}
