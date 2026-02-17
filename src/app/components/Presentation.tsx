import { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';

interface LeaderboardData {
  winningCadet?: { name: string; points: number; flight?: string };
  winningFlight?: { flight: string; points: number };
  cadetLeaderboard: Array<{ name: string; points: number; flight: string }>;
  flightLeaderboard: Array<{ flight: string; points: number }>;
  recentPoints: Array<{
    id: string;
    cadetName: string;
    flight: string;
    points: number;
    reason: string;
    type: string;
    date: string;
    givenBy: string;
  }>;
}

const SLIDES = ['flightTotals', 'recentActivity', 'completeLeaderboard'] as const;
type SlideType = typeof SLIDES[number];

export function Presentation() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const SLIDE_DURATION = 10000; // 10 seconds per slide
  const DATA_REFRESH_INTERVAL = 30000; // 30 seconds data refresh

  // Fetch leaderboard data
  const fetchData = useCallback(async () => {
    try {
      const result = await api.getLeaderboards();
      setData(result);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch leaderboard data:', err);
      setError('Failed to load presentation data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Periodic data refresh
  useEffect(() => {
    const refreshInterval = setInterval(fetchData, DATA_REFRESH_INTERVAL);
    return () => clearInterval(refreshInterval);
  }, [fetchData]);

  // Auto-advance slides
  useEffect(() => {
    if (isPaused || !data) return;

    const slideTimer = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % SLIDES.length);
    }, SLIDE_DURATION);

    return () => clearInterval(slideTimer);
  }, [isPaused, data]);

  const currentSlide = SLIDES[currentSlideIndex];

  const handlePrevSlide = () => {
    setCurrentSlideIndex((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  };

  const handleNextSlide = () => {
    setCurrentSlideIndex((prev) => (prev + 1) % SLIDES.length);
  };

  const handleReset = () => {
    setCurrentSlideIndex(0);
  };

  if (error) {
    return (
      <div className="w-full h-screen bg-red-50 flex items-center justify-center">
        <Card className="border-red-200">
          <CardHeader>
            <h2 className="text-red-700">Error</h2>
          </CardHeader>
          <CardContent>
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={fetchData}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-semibold text-gray-700 mb-2">Loading presentation...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full h-screen bg-red-50 flex items-center justify-center">
        <p className="text-red-600">No data available</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white flex flex-col h-full min-h-[calc(100vh-300px)]">
      {/* Presentation Area */}
      <div className="flex-1 overflow-hidden relative bg-white">
        {currentSlide === 'flightTotals' && (
          <FlightTotalsSlide data={data} />
        )}
        {currentSlide === 'recentActivity' && (
          <RecentActivitySlide data={data} />
        )}
        {currentSlide === 'completeLeaderboard' && (
          <CompleteLeaderboardSlide data={data} />
        )}
      </div>

      {/* Controls */}
      <div className="bg-gray-100 border-t border-gray-300 p-4 flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevSlide}
            className="text-blue-700 border-blue-500 hover:bg-blue-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextSlide}
            className="text-blue-700 border-blue-500 hover:bg-blue-50"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            className="text-blue-700 border-blue-500 hover:bg-blue-50"
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="text-blue-700 border-blue-500 hover:bg-blue-50"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <div className="text-sm text-gray-600">
          Slide {currentSlideIndex + 1} of {SLIDES.length} • {SLIDES[currentSlideIndex]}
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Auto-refresh: {DATA_REFRESH_INTERVAL / 1000}s</span>
        </div>
      </div>
    </div>
  );
}

function FlightTotalsSlide({ data }: { data: LeaderboardData }) {
  const calculateFlightTotals = () => {
    const flights: { [key: string]: number } = {};
    data.cadetLeaderboard.forEach((cadet) => {
      const flight = cadet.flight || 'Unknown';
      flights[flight] = (flights[flight] || 0) + cadet.points;
    });
    return Object.entries(flights)
      .map(([flight, points]) => ({ flight, points }))
      .sort((a, b) => b.points - a.points);
  };

  const flightTotals = calculateFlightTotals();

  return (
    <div className="w-full h-full bg-white flex flex-col items-center justify-center p-8">
      <h1 className="text-6xl font-bold text-blue-700 mb-4">Flight Points Totals</h1>

      <div className="grid grid-cols-3 gap-8 mt-12 w-full max-w-4xl">
        {flightTotals.map((flight) => (
          <Card
            key={flight.flight}
            className="bg-blue-50 border-2 border-blue-200 text-blue-900"
          >
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-semibold mb-2">{flight.flight}</p>
                <p className="text-5xl font-bold text-blue-600">{flight.points}</p>
                <p className="text-sm text-blue-700 mt-2">Total Points</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.winningCadet && (
        <div className="mt-12 text-center">
          <p className="text-2xl text-blue-700 mb-2">🏆 Top Cadet</p>
          <p className="text-4xl font-bold text-blue-600">{data.winningCadet.name}</p>
          <p className="text-xl text-gray-600 mt-1">{data.winningCadet.points} points</p>
        </div>
      )}
    </div>
  );
}

function RecentActivitySlide({ data }: { data: LeaderboardData }) {
  const recentActivity = data.recentPoints.slice(0, 12);

  return (
    <div className="w-full h-full bg-white p-8 flex flex-col">
      <h1 className="text-5xl font-bold text-blue-700 mb-8">Recent Activity</h1>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-gray-700">
          <thead>
            <tr className="border-b-2 border-blue-500 bg-blue-100">
              <th className="text-left py-3 px-4 font-semibold text-blue-700">Date</th>
              <th className="text-left py-3 px-4 font-semibold text-blue-700">Cadet</th>
              <th className="text-left py-3 px-4 font-semibold text-blue-700">Reason</th>
              <th className="text-right py-3 px-4 font-semibold text-blue-700">Points</th>
            </tr>
          </thead>
          <tbody>
            {recentActivity.map((activity, idx) => (
              <tr
                key={activity.id}
                className={`${idx % 2 === 0 ? 'bg-blue-50' : 'bg-white'} border-b border-blue-200`}
              >
                <td className="py-3 px-4">{new Date(activity.date).toLocaleDateString()}</td>
                <td className="py-3 px-4">{activity.cadetName}</td>
                <td className="py-3 px-4">{activity.reason}</td>
                <td className="py-3 px-4 text-right font-semibold text-blue-600">+{activity.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompleteLeaderboardSlide({ data }: { data: LeaderboardData }) {
  const sortedCadets = [...data.cadetLeaderboard].sort((a, b) => b.points - a.points);

  return (
    <div className="w-full h-full bg-white p-8 flex flex-col">
      <h1 className="text-5xl font-bold text-blue-700 mb-8">Complete Leaderboard</h1>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-gray-700">
          <thead>
            <tr className="border-b-2 border-blue-500 bg-blue-100">
              <th className="text-left py-3 px-4 font-semibold w-12 text-blue-700">Rank</th>
              <th className="text-left py-3 px-4 font-semibold text-blue-700">Cadet</th>
              <th className="text-center py-3 px-4 font-semibold text-blue-700">Flight</th>
              <th className="text-right py-3 px-4 font-semibold text-blue-700">Points</th>
            </tr>
          </thead>
          <tbody>
            {sortedCadets.map((cadet, idx) => (
              <tr
                key={cadet.name}
                className={`${idx % 2 === 0 ? 'bg-blue-50' : 'bg-white'} border-b border-blue-200`}
              >
                <td className="py-2 px-4 font-bold text-lg text-blue-600">#{idx + 1}</td>
                <td className="py-2 px-4">{cadet.name}</td>
                <td className="py-2 px-4 text-center text-sm">{cadet.flight}</td>
                <td className="py-2 px-4 text-right font-semibold text-blue-600">{cadet.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
