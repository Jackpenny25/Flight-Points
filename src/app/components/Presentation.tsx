import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { api } from '../../utils/api';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';

interface CadetData {
  id: string;
  name: string;
  flight: string;
  points: number;
}

interface PointRecord {
  id: string;
  cadetName: string;
  flight: string;
  points: number;
  reason: string;
  type: string;
  date: string;
  givenBy: string;
}

interface RewardData {
  id: string;
  title: string;
  description: string;
  points?: number;
  for_flight?: boolean;
}

export function Presentation() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [cadets, setCadets] = useState<CadetData[]>([]);
  const [points, setPoints] = useState<PointRecord[]>([]);
  const [rewards, setRewards] = useState<RewardData[]>([]);
  const [ncoStructure, setNcoStructure] = useState({
    fs: 'FS Martin',
    fs_deputy: 'Deputy Name',
    sgt1: 'SGT Penny',
    sgt1_deputy: 'Deputy Name',
    sgt2: 'SGT Penny',
    sgt2_deputy: 'Deputy Name',
    it: 'IT Officer Name'
  });
  const [isPlaying, setIsPlaying] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data on mount and on interval
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [cadetsRes, pointsRes, rewardsRes] = await Promise.all([
          api.getCadets(),
          api.getPoints(),
          api.getRewards(),
        ]);

        setCadets(cadetsRes.data || cadetsRes || []);
        const pointList = pointsRes.data || pointsRes || [];
        
        // Filter out attendance points
        const nonAttendancePoints = pointList.filter((p: any) => p.type !== 'attendance');
        setPoints(nonAttendancePoints);
        
        setRewards(rewardsRes.data || rewardsRes || []);
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

  // Auto-advance slides
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setTimeout(() => {
      setCurrentSlide((prev) => (prev + 1) % 5); // 5 slides total
    }, 10000); // 10 seconds per slide

    return () => clearTimeout(timer);
  }, [currentSlide, isPlaying]);

  const handlePrevious = () => {
    setCurrentSlide((prev) => (prev - 1 + 5) % 5);
  };

  const handleNext = () => {
    setCurrentSlide((prev) => (prev + 1) % 5);
  };

  const handleReset = () => {
    setCurrentSlide(0);
    setIsPlaying(true);
  };

  // Calculate flight totals
  const flightTotals = cadets.reduce((acc: any, cadet) => {
    const flightNum = cadet.flight || 'Unknown';
    acc[flightNum] = (acc[flightNum] || 0) + (cadet.points || 0);
    return acc;
  }, {} as Record<string, number>);

  // Get cadet with most points
  const topCadet = cadets.reduce((max, cadet) => 
    (cadet.points || 0) > (max.points || 0) ? cadet : max,
    cadets[0]
  );

  // Get all cadets sorted by points (excluding 0 points)
  const leaderboard = cadets
    .filter(c => (c.points || 0) > 0)
    .sort((a, b) => (b.points || 0) - (a.points || 0));

  // Get recent points (last 15, excluding attendance)
  const recentPoints = points
    .filter(p => p.type !== 'attendance')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 15);

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
    <div className="w-full bg-white p-6 rounded-lg">
      {/* Slide 1: Flight Totals and Top Cadet */}
      {currentSlide === 0 && (
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-blue-700 mb-6">Flight Point Totals</h1>
          
          <div className="grid grid-cols-2 gap-6">
            {/* Flight Totals Table */}
            <div>
              <Card className="bg-blue-50 border-2 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-blue-700">Flight Points</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full">
                    <tbody>
                      {Object.entries(flightTotals)
                        .sort((a, b) => b[0].localeCompare(a[0]))
                        .map(([flight, total]) => (
                          <tr key={flight} className="border-b border-blue-200">
                            <td className="py-2 text-gray-700">{flight}</td>
                            <td className="py-2 text-right font-bold text-blue-700">{total}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>

            {/* Top Cadet */}
            <div>
              <Card className="bg-blue-50 border-2 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-blue-700">Cadet with Most Points</CardTitle>
                </CardHeader>
                <CardContent className="text-center py-8">
                  <div className="text-5xl mb-4">🏆</div>
                  <p className="text-2xl font-bold text-blue-700">{topCadet?.name || 'N/A'}</p>
                  <p className="text-4xl font-bold text-blue-900 mt-4">{topCadet?.points || 0} points</p>
                  {topCadet?.flight && (
                    <p className="text-lg text-gray-700 mt-2">{topCadet.flight}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Slide 2: Complete Leaderboard */}
      {currentSlide === 1 && (
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-blue-700 mb-6">Cadet Leaderboard</h1>
          
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
            Showing {leaderboard.length} cadets with points
          </p>
        </div>
      )}

      {/* Slide 3: Recent Points Activity */}
      {currentSlide === 2 && (
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-blue-700 mb-6">Who Got Points Recently</h1>
          
          <Card className="border-2 border-blue-200">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-100 border-b-2 border-blue-200">
                    <th className="px-4 py-3 text-left font-bold text-blue-700">Date</th>
                    <th className="px-4 py-3 text-left font-bold text-blue-700">Cadet Name</th>
                    <th className="px-4 py-3 text-left font-bold text-blue-700">Reason</th>
                    <th className="px-4 py-3 text-right font-bold text-blue-700">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPoints.map((point, idx) => (
                    <tr
                      key={point.id}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}
                    >
                      <td className="px-4 py-2 text-gray-700">
                        {new Date(point.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-gray-800 font-semibold">{point.cadetName}</td>
                      <td className="px-4 py-2 text-gray-700">{point.reason}</td>
                      <td className="px-4 py-2 text-right font-bold text-blue-700">{point.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          
          <p className="text-sm text-gray-500 text-center">
            Last 15 non-attendance points
          </p>
        </div>
      )}

      {/* Slide 4: NCO Structure */}
      {currentSlide === 3 && (
        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-blue-700 mb-6">Squadron Structure</h1>
          
          <div className="grid grid-cols-3 gap-6">
            {/* Flight Sergeant */}
            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-lg text-blue-700">Flight Sergeant</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-sm text-gray-600">FS</p>
                  <p className="text-lg font-bold text-blue-900">{ncoStructure.fs}</p>
                </div>
                <div className="pt-4 border-t border-blue-200">
                  <p className="text-sm text-gray-600">Deputy</p>
                  <p className="text-lg font-bold text-blue-900">{ncoStructure.fs_deputy}</p>
                </div>
              </CardContent>
            </Card>

            {/* 1 Flight */}
            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-lg text-blue-700">1 Flight</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-sm text-gray-600">SGT</p>
                  <p className="text-lg font-bold text-blue-900">{ncoStructure.sgt1}</p>
                </div>
                <div className="pt-4 border-t border-blue-200">
                  <p className="text-sm text-gray-600">Deputy</p>
                  <p className="text-lg font-bold text-blue-900">{ncoStructure.sgt1_deputy}</p>
                </div>
              </CardContent>
            </Card>

            {/* 2 Flight */}
            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-lg text-blue-700">2 Flight</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-sm text-gray-600">SGT</p>
                  <p className="text-lg font-bold text-blue-900">{ncoStructure.sgt2}</p>
                </div>
                <div className="pt-4 border-t border-blue-200">
                  <p className="text-sm text-gray-600">Deputy</p>
                  <p className="text-lg font-bold text-blue-900">{ncoStructure.sgt2_deputy}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* IT Officer */}
          <Card className="border-2 border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-blue-700">IT Officer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-blue-900">{ncoStructure.it}</p>
              <p className="text-sm text-gray-600 mt-2">Contact for points system issues</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Slide 5: Available Rewards */}
      {currentSlide === 4 && (
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-blue-700 mb-6">Current Rewards</h1>
          
          <div className="grid grid-cols-2 gap-4">
            {rewards && rewards.length > 0 ? (
              rewards.map((reward) => (
                <Card
                  key={reward.id}
                  className={`border-2 ${reward.for_flight ? 'border-green-300 bg-green-50' : 'border-blue-200 bg-blue-50'}`}
                >
                  <CardHeader>
                    <CardTitle className={reward.for_flight ? 'text-green-700' : 'text-blue-700'}>
                      {reward.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700">{reward.description}</p>
                    {reward.points && (
                      <p className="text-sm text-gray-600 mt-2">
                        {reward.points} points available
                      </p>
                    )}
                    {reward.for_flight && (
                      <p className="text-sm text-green-700 font-semibold mt-2">✈️ Flight Reward</p>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-2 text-center py-12">
                <p className="text-gray-600">No rewards configured</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-between items-center mt-8 pt-6 border-t-2 border-blue-200">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            className="border-blue-500 text-blue-700 hover:bg-blue-50"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPlaying(!isPlaying)}
            className="border-blue-500 text-blue-700 hover:bg-blue-50"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 mr-1" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-1" />
                Play
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            className="border-blue-500 text-blue-700 hover:bg-blue-50"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="border-blue-500 text-blue-700 hover:bg-blue-50"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </Button>
        </div>

        {/* Slide Counter and Progress Dots */}
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((slide) => (
              <button
                key={slide}
                onClick={() => setCurrentSlide(slide)}
                className={`w-3 h-3 rounded-full transition-all ${
                  currentSlide === slide ? 'bg-blue-700 w-8' : 'bg-blue-200'
                }`}
                aria-label={`Go to slide ${slide + 1}`}
              />
            ))}
          </div>
          <span className="text-sm font-semibold text-blue-700">
            {currentSlide + 1} / 5
          </span>
        </div>
      </div>
    </div>
  );
}
