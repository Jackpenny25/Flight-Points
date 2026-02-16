import { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';
import { formatFlight } from './ui/utils';
import { X, ChevronLeft, ChevronRight, Pause, Play, Trophy, Award, TrendingUp, CalendarCheck, Medal } from 'lucide-react';
import { Button } from './ui/button';

interface LeaderboardData {
  winningCadet?: { name: string; points: number; flight?: string };
  winningFlight?: { flight: string; points: number };
  winnersCadets?: Array<{ name: string; points: number; flight?: string }>;
  winnersFlights?: Array<{ flight: string; points: number }>;
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

interface SpecialAchievements {
  highestSingleAward?: { cadetName: string; points: number; reason: string };
  mostAttendance?: { name: string; attendanceCount: number };
  mostConsistent?: { name: string };
}

const SLIDE_DURATION = 10000; // 10 seconds
const DATA_REFRESH_INTERVAL = 30000; // 30 seconds

export function PresentationMode({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [achievements, setAchievements] = useState<SpecialAchievements>({});
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const totalSlides = 6;

  // Fetch leaderboard data
  const fetchData = useCallback(async () => {
    try {
      const result = await api.getLeaderboards();
      setData(result);
      
      // Calculate special achievements
      if (result.recentPoints && result.recentPoints.length > 0) {
        const nonAttendancePoints = result.recentPoints.filter((p: any) => 
          p.type !== 'Attendance' && p.points > 0
        );
        
        if (nonAttendancePoints.length > 0) {
          const highest = nonAttendancePoints.reduce((max: any, current: any) => 
            current.points > max.points ? current : max
          );
          setAchievements(prev => ({
            ...prev,
            highestSingleAward: {
              cadetName: highest.cadetName,
              points: highest.points,
              reason: highest.reason
            }
          }));
        }
      }
      
      // Most attendance (you can enhance this with actual attendance data if available)
      if (result.cadetLeaderboard && result.cadetLeaderboard.length > 0) {
        setAchievements(prev => ({
          ...prev,
          mostConsistent: { name: result.cadetLeaderboard[0].name }
        }));
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch leaderboard data:', error);
      setLoading(false);
    }
  }, []);

  // Initial data fetch and periodic refresh
  useEffect(() => {
    fetchData();
    const refreshInterval = setInterval(fetchData, DATA_REFRESH_INTERVAL);
    return () => clearInterval(refreshInterval);
  }, [fetchData]);

  // Auto-advance slides
  useEffect(() => {
    if (isPaused || loading) return;
    
    const slideInterval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % totalSlides);
    }, SLIDE_DURATION);
    
    return () => clearInterval(slideInterval);
  }, [isPaused, loading, totalSlides]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          exitFullscreen();
          onClose();
          break;
        case 'ArrowLeft':
          setCurrentSlide(prev => (prev - 1 + totalSlides) % totalSlides);
          break;
        case 'ArrowRight':
          setCurrentSlide(prev => (prev + 1) % totalSlides);
          break;
        case ' ':
          e.preventDefault();
          setIsPaused(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, totalSlides]);

  // Fullscreen handling
  const enterFullscreen = () => {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    enterFullscreen();
    
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      exitFullscreen();
    };
  }, []);

  // Render individual slides
  const renderSlide = () => {
    if (loading || !data) {
      return (
        <div className="flex items-center justify-center w-full h-full">
          <div className="text-white text-4xl animate-pulse">Loading...</div>
        </div>
      );
    }

    switch (currentSlide) {
      case 0:
        return <SlideWinningCadet data={data} />;
      case 1:
        return <SlideWinningFlight data={data} />;
      case 2:
        return <SlideTop5Cadets data={data} />;
      case 3:
        return <SlideTop3Flights data={data} />;
      case 4:
        return <SlideRecentActivity data={data} />;
      case 5:
        return <SlideSpecialAchievements achievements={achievements} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 z-50 overflow-hidden">
      {/* RAF Logo/Header */}
      <div className="absolute top-8 left-0 right-0 text-center z-10">
        <div className="text-white/80 text-2xl font-bold tracking-wider">
          RAF CADET SQUADRON
        </div>
        <div className="text-white/60 text-lg mt-1">Flight Points Leaderboard</div>
      </div>

      {/* Main Slide Content */}
      <div className="presentation-slide-container h-full w-full flex items-center justify-center pt-32 pb-24">
        {renderSlide()}
      </div>

      {/* Progress Dots */}
      <div className="absolute bottom-20 left-0 right-0 flex justify-center gap-3 z-10">
        {Array.from({ length: totalSlides }).map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${
              index === currentSlide
                ? 'bg-white w-8'
                : 'bg-white/30 hover:bg-white/50'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center gap-4 z-10">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCurrentSlide(prev => (prev - 1 + totalSlides) % totalSlides)}
          className="bg-white/10 hover:bg-white/20 border-white/30 text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsPaused(!isPaused)}
          className="bg-white/10 hover:bg-white/20 border-white/30 text-white"
        >
          {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCurrentSlide(prev => (prev + 1) % totalSlides)}
          className="bg-white/10 hover:bg-white/20 border-white/30 text-white"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        
        <div className="mx-4 text-white/60 text-sm">
          {isPaused ? 'Paused' : `Auto-advancing in ${SLIDE_DURATION / 1000}s`}
        </div>
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            exitFullscreen();
            onClose();
          }}
          className="bg-red-500/20 hover:bg-red-500/30 border-red-500/50 text-white"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <style>{`
        .presentation-slide-container > * {
          animation: fadeIn 0.5s ease-in-out;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// Slide 1: Winning Cadet
function SlideWinningCadet({ data }: { data: LeaderboardData }) {
  const winners = data.winnersCadets && data.winnersCadets.length > 0 
    ? data.winnersCadets 
    : data.winningCadet 
    ? [data.winningCadet] 
    : [];

  if (winners.length === 0) {
    return <EmptySlide message="No cadet data available yet" />;
  }

  const isJointWin = winners.length > 1;

  return (
    <div className="text-center text-white max-w-4xl mx-auto px-8">
      <Trophy className="w-24 h-24 mx-auto mb-8 text-yellow-400 animate-pulse" />
      <h1 className="text-6xl font-bold mb-6 tracking-tight">
        {isJointWin ? 'JOINT WINNING CADETS' : 'WINNING CADET'}
      </h1>
      <div className="text-8xl mb-4">🥇</div>
      
      {winners.map((winner, index) => (
        <div key={index} className="mb-6">
          <div className="text-7xl font-bold mb-4 text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.5)]">
            {winner.name}
          </div>
        </div>
      ))}
      
      <div className="text-6xl font-bold text-white/90 mb-6">
        {winners[0].points} POINTS
      </div>
      
      {winners[0].flight && (
        <div className="text-3xl text-white/70">
          Flight: {formatFlight(winners[0].flight)}
        </div>
      )}
    </div>
  );
}

// Slide 2: Winning Flight
function SlideWinningFlight({ data }: { data: LeaderboardData }) {
  const winners = data.winnersFlights && data.winnersFlights.length > 0 
    ? data.winnersFlights 
    : data.winningFlight 
    ? [data.winningFlight] 
    : [];

  if (winners.length === 0) {
    return <EmptySlide message="No flight data available yet" />;
  }

  const isJointWin = winners.length > 1;

  return (
    <div className="text-center text-white max-w-4xl mx-auto px-8">
      <Award className="w-24 h-24 mx-auto mb-8 text-blue-400 animate-pulse" />
      <h1 className="text-6xl font-bold mb-6 tracking-tight">
        {isJointWin ? 'JOINT WINNING FLIGHTS' : 'WINNING FLIGHT'}
      </h1>
      <div className="text-8xl mb-4">🏆</div>
      
      {winners.map((winner, index) => (
        <div key={index} className="mb-6">
          <div className="text-7xl font-bold mb-4 text-blue-400 drop-shadow-[0_0_30px_rgba(96,165,250,0.5)]">
            {formatFlight(winner.flight)}
          </div>
        </div>
      ))}
      
      <div className="text-6xl font-bold text-white/90">
        {winners[0].points} POINTS
      </div>
    </div>
  );
}

// Slide 3: Top 5 Cadets
function SlideTop5Cadets({ data }: { data: LeaderboardData }) {
  const topCadets = data.cadetLeaderboard.slice(0, 5);

  if (topCadets.length === 0) {
    return <EmptySlide message="No cadet leaderboard data yet" />;
  }

  const medals = ['🥇', '🥈', '🥉', '', ''];
  const colors = ['text-yellow-400', 'text-gray-300', 'text-amber-600', 'text-white', 'text-white'];

  return (
    <div className="text-white max-w-5xl mx-auto px-8">
      <h1 className="text-6xl font-bold mb-12 text-center tracking-tight">
        TOP 5 CADETS
      </h1>
      
      <div className="space-y-6">
        {topCadets.map((cadet, index) => (
          <div
            key={cadet.name}
            className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-2xl p-6 border-2 border-white/20 hover:border-white/40 transition-all"
          >
            <div className="flex items-center gap-6 flex-1">
              <div className="text-5xl font-bold text-white/60 w-16">
                {index + 1}.
              </div>
              <div className="text-5xl mr-4">
                {medals[index]}
              </div>
              <div>
                <div className={`text-5xl font-bold ${colors[index]}`}>
                  {cadet.name}
                </div>
                <div className="text-2xl text-white/60 mt-1">
                  {formatFlight(cadet.flight)}
                </div>
              </div>
            </div>
            <div className={`text-5xl font-bold ${colors[index]}`}>
              {cadet.points} pts
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Slide 4: Top 3 Flights
function SlideTop3Flights({ data }: { data: LeaderboardData }) {
  const topFlights = data.flightLeaderboard.slice(0, 3);

  if (topFlights.length === 0) {
    return <EmptySlide message="No flight leaderboard data yet" />;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const colors = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
  const bgColors = ['bg-yellow-500/20', 'bg-gray-400/20', 'bg-amber-600/20'];

  return (
    <div className="text-white max-w-5xl mx-auto px-8">
      <h1 className="text-6xl font-bold mb-12 text-center tracking-tight">
        TOP 3 FLIGHTS
      </h1>
      
      <div className="space-y-8">
        {topFlights.map((flight, index) => (
          <div
            key={flight.flight}
            className={`flex items-center justify-between ${bgColors[index]} backdrop-blur-sm rounded-2xl p-8 border-2 border-white/30`}
          >
            <div className="flex items-center gap-6">
              <div className="text-6xl font-bold text-white/60 w-20">
                {index + 1}.
              </div>
              <div className="text-6xl mr-4">
                {medals[index]}
              </div>
              <div className={`text-6xl font-bold ${colors[index]}`}>
                {formatFlight(flight.flight)}
              </div>
            </div>
            <div className={`text-6xl font-bold ${colors[index]}`}>
              {flight.points} pts
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Slide 5: Recent Points Activity
function SlideRecentActivity({ data }: { data: LeaderboardData }) {
  const recentPoints = data.recentPoints
    .filter(p => p.type !== 'Attendance')
    .slice(0, 5);

  if (recentPoints.length === 0) {
    return <EmptySlide message="No recent activity yet" />;
  }

  return (
    <div className="text-white max-w-6xl mx-auto px-8">
      <h1 className="text-6xl font-bold mb-12 text-center tracking-tight flex items-center justify-center gap-4">
        <TrendingUp className="w-16 h-16" />
        RECENT ACTIVITY
      </h1>
      
      <div className="space-y-4">
        {recentPoints.map((point) => (
          <div
            key={point.id}
            className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20"
          >
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-2">
                <span className="text-4xl font-bold">{point.cadetName}</span>
                <span className="text-2xl text-white/60 px-4 py-1 bg-white/10 rounded-full">
                  {formatFlight(point.flight)}
                </span>
                <span className="text-2xl text-white/60 px-4 py-1 bg-blue-500/30 rounded-full">
                  {point.type}
                </span>
              </div>
              <p className="text-2xl text-white/80">{point.reason}</p>
              <p className="text-xl text-white/50 mt-2">
                {new Date(point.date).toLocaleDateString()} • by {point.givenBy}
              </p>
            </div>
            <div className={`text-5xl font-bold ml-8 px-6 py-3 rounded-xl ${
              point.points >= 0 ? 'bg-green-500/30 text-green-400' : 'bg-red-500/30 text-red-400'
            }`}>
              {point.points >= 0 ? '+' : ''}{point.points}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Slide 6: Special Achievements
function SlideSpecialAchievements({ achievements }: { achievements: SpecialAchievements }) {
  const hasAny = achievements.highestSingleAward || achievements.mostAttendance || achievements.mostConsistent;

  if (!hasAny) {
    return <EmptySlide message="No special achievements yet" />;
  }

  return (
    <div className="text-white max-w-5xl mx-auto px-8">
      <h1 className="text-6xl font-bold mb-12 text-center tracking-tight flex items-center justify-center gap-4">
        <Medal className="w-16 h-16 text-purple-400" />
        SPECIAL ACHIEVEMENTS
      </h1>
      
      <div className="space-y-8">
        {achievements.highestSingleAward && (
          <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-sm rounded-2xl p-8 border-2 border-purple-400/30">
            <div className="flex items-center gap-4 mb-4">
              <Trophy className="w-12 h-12 text-purple-400" />
              <h2 className="text-4xl font-bold text-purple-400">Highest Single Award</h2>
            </div>
            <div className="text-5xl font-bold mb-2">{achievements.highestSingleAward.cadetName}</div>
            <div className="text-3xl text-white/80">{achievements.highestSingleAward.reason}</div>
            <div className="text-5xl font-bold text-purple-400 mt-4">
              +{achievements.highestSingleAward.points} points
            </div>
          </div>
        )}
        
        {achievements.mostAttendance && (
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl p-8 border-2 border-green-400/30">
            <div className="flex items-center gap-4 mb-4">
              <CalendarCheck className="w-12 h-12 text-green-400" />
              <h2 className="text-4xl font-bold text-green-400">Most Attendance</h2>
            </div>
            <div className="text-5xl font-bold mb-2">{achievements.mostAttendance.name}</div>
            <div className="text-3xl text-white/80">
              {achievements.mostAttendance.attendanceCount} sessions attended
            </div>
          </div>
        )}
        
        {achievements.mostConsistent && !achievements.mostAttendance && (
          <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 backdrop-blur-sm rounded-2xl p-8 border-2 border-blue-400/30">
            <div className="flex items-center gap-4 mb-4">
              <Award className="w-12 h-12 text-blue-400" />
              <h2 className="text-4xl font-bold text-blue-400">Most Consistent</h2>
            </div>
            <div className="text-5xl font-bold">{achievements.mostConsistent.name}</div>
            <div className="text-3xl text-white/80 mt-2">Leading the way with dedication</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Empty state component
function EmptySlide({ message }: { message: string }) {
  return (
    <div className="text-center text-white max-w-2xl mx-auto px-8">
      <div className="text-5xl mb-6 opacity-50">📊</div>
      <div className="text-4xl font-medium text-white/60">{message}</div>
    </div>
  );
}
