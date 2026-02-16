import { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';
import { formatFlight } from './ui/utils';
import { X, ChevronLeft, ChevronRight, Pause, Play, Trophy, Award, TrendingUp, CalendarCheck, Medal, Star } from 'lucide-react';
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

interface PresentationSettings {
  slideDuration: number;
  dataRefreshInterval: number;
  enabledSlides: {
    winningCadet: boolean;
    winningFlight: boolean;
    topCadets: boolean;
    topFlights: boolean;
    recentActivity: boolean;
    specialAchievements: boolean;
  };
  customText: {
    squadronName: string;
    headerSubtitle: string;
  };
  colors: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
}

const DEFAULT_SETTINGS: PresentationSettings = {
  slideDuration: 10,
  dataRefreshInterval: 30,
  enabledSlides: {
    winningCadet: true,
    winningFlight: true,
    topCadets: true,
    topFlights: true,
    recentActivity: true,
    specialAchievements: true,
  },
  customText: {
    squadronName: '2427 (Biggin Hill) Squadron',
    headerSubtitle: 'RAF Air Cadets',
  },
  colors: {
    primaryColor: '#1e40af',
    secondaryColor: '#7c3aed',
    accentColor: '#f59e0b',
  },
};

export function PresentationMode({ 
  onClose, 
  settings: propSettings 
}: { 
  onClose: () => void;
  settings?: PresentationSettings;
}) {
  // Load settings from props or localStorage
  const [settings] = useState<PresentationSettings>(() => {
    if (propSettings) return propSettings;
    const saved = localStorage.getItem('presentationSettings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [achievements, setAchievements] = useState<SpecialAchievements>({});
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Calculate enabled slides
  const enabledSlides = Object.entries(settings.enabledSlides)
    .filter(([_, enabled]) => enabled)
    .map(([key]) => key);
  const totalSlides = enabledSlides.length;

  const SLIDE_DURATION = settings.slideDuration * 1000;
  const DATA_REFRESH_INTERVAL = settings.dataRefreshInterval * 1000;

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
  }, [fetchData, DATA_REFRESH_INTERVAL]);

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
          <div className="text-white text-5xl font-light animate-pulse">Loading presentation...</div>
        </div>
      );
    }

    const slideKey = enabledSlides[currentSlide];
    
    switch (slideKey) {
      case 'winningCadet':
        return <SlideWinningCadet data={data} settings={settings} />;
      case 'winningFlight':
        return <SlideWinningFlight data={data} settings={settings} />;
      case 'topCadets':
        return <SlideTop5Cadets data={data} settings={settings} />;
      case 'topFlights':
        return <SlideTop3Flights data={data} settings={settings} />;
      case 'recentActivity':
        return <SlideRecentActivity data={data} settings={settings} />;
      case 'specialAchievements':
        return <SlideSpecialAchievements achievements={achievements} settings={settings} />;
      default:
        return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${settings.colors.primaryColor} 0%, ${settings.colors.secondaryColor} 100%)`
      }}
    >
      {/* Squadron Header */}
      <div className="absolute top-0 left-0 right-0 bg-black/20 backdrop-blur-sm border-b border-white/10 z-10 py-6">
        <div className="max-w-7xl mx-auto px-12">
          <div className="text-white/95 text-3xl font-bold tracking-wide">
            {settings.customText.squadronName}
          </div>
          <div className="text-white/70 text-lg mt-1">{settings.customText.headerSubtitle}</div>
        </div>
      </div>

      {/* Main Slide Content */}
      <div className="presentation-slide-container h-full w-full flex items-center justify-center px-16 py-32">
        {renderSlide()}
      </div>

      {/* Progress Dots */}
      <div className="absolute bottom-24 left-0 right-0 flex justify-center gap-3 z-10">
        {Array.from({ length: totalSlides }).map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === currentSlide
                ? 'bg-white w-12'
                : 'bg-white/40 hover:bg-white/60 w-2'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Slide Number Indicator */}
      <div className="absolute bottom-24 right-12 text-white/60 text-sm font-medium z-10">
        {currentSlide + 1} / {totalSlides}
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentSlide(prev => (prev - 1 + totalSlides) % totalSlides)}
          className="bg-black/20 hover:bg-black/30 border border-white/20 text-white h-10 w-10"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsPaused(!isPaused)}
          className="bg-black/20 hover:bg-black/30 border border-white/20 text-white h-10 w-10"
        >
          {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentSlide(prev => (prev + 1) % totalSlides)}
          className="bg-black/20 hover:bg-black/30 border border-white/20 text-white h-10 w-10"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        
        <div className="mx-4 text-white/70 text-sm font-medium min-w-[140px] text-center">
          {isPaused ? 'Paused' : `Next in ${settings.slideDuration}s`}
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            exitFullscreen();
            onClose();
          }}
          className="bg-red-500/30 hover:bg-red-500/50 border border-red-400/50 text-white h-10 w-10"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <style>{`
        .presentation-slide-container > * {
          animation: fadeIn 0.6s ease-out;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// Slide 1: Winning Cadet
function SlideWinningCadet({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
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
    <div className="w-full max-w-6xl mx-auto">
      <div className="bg-white/10 backdrop-blur-md rounded-3xl border-2 border-white/20 p-16 shadow-2xl">
        <div className="text-center">
          {/* Trophy Icon */}
          <div className="flex justify-center mb-8">
            <div className="bg-yellow-400/20 p-8 rounded-full">
              <Trophy className="w-20 h-20 text-yellow-400" />
            </div>
          </div>
          
          {/* Title */}
          <h1 className="text-5xl font-bold text-white mb-12 tracking-wide uppercase">
            {isJointWin ? 'Joint Winning Cadets' : 'Winning Cadet'}
          </h1>
          
          {/* Winners */}
          <div className="space-y-8 mb-12">
            {winners.map((winner, index) => (
              <div key={index} className="space-y-4">
                <div 
                  className="text-7xl font-extrabold tracking-tight"
                  style={{ color: settings.colors.accentColor }}
                >
                  {winner.name}
                </div>
                {winner.flight && (
                  <div className="text-3xl text-white/80">
                    Flight {formatFlight(winner.flight)}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Points */}
          <div className="bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-2xl py-8 px-12 inline-block">
            <div className="text-6xl font-bold text-white">
              {winners[0].points}
              <span className="text-4xl text-white/80 ml-4">points</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Slide 2: Winning Flight
function SlideWinningFlight({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
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
    <div className="w-full max-w-6xl mx-auto">
      <div className="bg-white/10 backdrop-blur-md rounded-3xl border-2 border-white/20 p-16 shadow-2xl">
        <div className="text-center">
          {/* Award Icon */}
          <div className="flex justify-center mb-8">
            <div className="bg-blue-400/20 p-8 rounded-full">
              <Award className="w-20 h-20 text-blue-400" />
            </div>
          </div>
          
          {/* Title */}
          <h1 className="text-5xl font-bold text-white mb-12 tracking-wide uppercase">
            {isJointWin ? 'Joint Winning Flights' : 'Winning Flight'}
          </h1>
          
          {/* Winners */}
          <div className="space-y-8 mb-12">
            {winners.map((winner, index) => (
              <div key={index}>
                <div 
                  className="text-7xl font-extrabold tracking-tight"
                  style={{ color: settings.colors.accentColor }}
                >
                  Flight {formatFlight(winner.flight)}
                </div>
              </div>
            ))}
          </div>
          
          {/* Points */}
          <div className="bg-gradient-to-r from-blue-400/20 to-cyan-400/20 rounded-2xl py-8 px-12 inline-block">
            <div className="text-6xl font-bold text-white">
              {winners[0].points}
              <span className="text-4xl text-white/80 ml-4">points</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Slide 3: Top 5 Cadets
function SlideTop5Cadets({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
  const topCadets = data.cadetLeaderboard.slice(0, 5);

  if (topCadets.length === 0) {
    return <EmptySlide message="No cadet leaderboard data yet" />;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32', '#ffffff', '#ffffff'];

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="bg-white/10 backdrop-blur-md rounded-3xl border-2 border-white/20 p-12 shadow-2xl">
        {/* Title */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <Star className="w-12 h-12" style={{ color: settings.colors.accentColor }} />
          <h1 className="text-5xl font-bold text-white tracking-wide uppercase">
            Top 5 Cadets
          </h1>
          <Star className="w-12 h-12" style={{ color: settings.colors.accentColor }} />
        </div>
        
        {/* Leaderboard */}
        <div className="space-y-4">
          {topCadets.map((cadet, index) => (
            <div
              key={cadet.name}
              className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:bg-white/10 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6 flex-1">
                  {/* Rank */}
                  <div 
                    className="text-4xl font-bold w-16 text-center"
                    style={{ color: rankColors[index] }}
                  >
                    #{index + 1}
                  </div>
                  
                  {/* Medal */}
                  {index < 3 && (
                    <div className="text-5xl">{medals[index]}</div>
                  )}
                  
                  {/* Name & Flight */}
                  <div className="flex-1">
                    <div className="text-3xl font-bold text-white mb-1">
                      {cadet.name}
                    </div>
                    <div className="text-xl text-white/60">
                      Flight {formatFlight(cadet.flight)}
                    </div>
                  </div>
                </div>
                
                {/* Points */}
                <div 
                  className="text-4xl font-bold px-8py-3 rounded-xl"
                  style={{ color: index < 3 ? rankColors[index] : '#ffffff'}}
                >
                  {cadet.points}
                  <span className="text-2xl text-white/70 ml-2">pts</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Slide 4: Top 3 Flights
function SlideTop3Flights({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
  const topFlights = data.flightLeaderboard.slice(0, 3);

  if (topFlights.length === 0) {
    return <EmptySlide message="No flight leaderboard data yet" />;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="bg-white/10 backdrop-blur-md rounded-3xl border-2 border-white/20 p-12 shadow-2xl">
        {/* Title */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <Trophy className="w-12 h-12" style={{ color: settings.colors.accentColor }} />
          <h1 className="text-5xl font-bold text-white tracking-wide uppercase">
            Top 3 Flights
          </h1>
          <Trophy className="w-12 h-12" style={{ color: settings.colors.accentColor }} />
        </div>
        
        {/* Leaderboard */}
        <div className="space-y-6">
          {topFlights.map((flight, index) => (
            <div
              key={flight.flight}
              className="bg-white/5 backdrop-blur-sm rounded-xl p-8 border border-white/10 hover:bg-white/10 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-8">
                  {/* Rank */}
                  <div 
                    className="text-5xl font-bold w-20 text-center"
                    style={{ color: rankColors[index] }}
                  >
                    #{index + 1}
                  </div>
                  
                  {/* Medal */}
                  <div className="text-6xl">{medals[index]}</div>
                  
                  {/* Flight Name */}
                  <div 
                    className="text-5xl font-bold"
                    style={{ color: rankColors[index] }}
                  >
                    Flight {formatFlight(flight.flight)}
                  </div>
                </div>
                
                {/* Points */}
                <div 
                  className="text-5xl font-bold"
                  style={{ color: rankColors[index] }}
                >
                  {flight.points}
                  <span className="text-3xl text-white/70 ml-2">pts</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Slide 5: Recent Points Activity
function SlideRecentActivity({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
  const recentPoints = data.recentPoints
    .filter(p => p.type !== 'Attendance')
    .slice(0, 5);

  if (recentPoints.length === 0) {
    return <EmptySlide message="No recent activity yet" />;
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="bg-white/10 backdrop-blur-md rounded-3xl border-2 border-white/20 p-12 shadow-2xl">
        {/* Title */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <TrendingUp className="w-12 h-12" style={{ color: settings.colors.accentColor }} />
          <h1 className="text-5xl font-bold text-white tracking-wide uppercase">
            Recent Activity
          </h1>
        </div>
        
        {/* Activity List */}
        <div className="space-y-4">
          {recentPoints.map((point) => (
            <div
              key={point.id}
              className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 min-w-0">
                  {/* Cadet Name & Flight */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl font-bold text-white truncate">
                      {point.cadetName}
                    </span>
                    <span className="text-lg px-3 py-1 bg-white/10 rounded-full text-white/80 flex-shrink-0">
                      Flight {formatFlight(point.flight)}
                    </span>
                    <span 
                      className="text-lg px-3 py-1 rounded-full text-white font-medium flex-shrink-0"
                      style={{ backgroundColor: `${settings.colors.primaryColor}40` }}
                    >
                      {point.type}
                    </span>
                  </div>
                  
                  {/* Reason */}
                  <p className="text-xl text-white/80 mb-2">{point.reason}</p>
                  
                  {/* Date & Given By */}
                  <p className="text-base text-white/50">
                    {new Date(point.date).toLocaleDateString('en-GB')} • by {point.givenBy}
                  </p>
                </div>
                
                {/* Points Badge */}
                <div 
                  className={`text-3xl font-bold px-6 py-3 rounded-xl flex-shrink-0 ${
                    point.points >= 0 ? 'bg-green-500/30 text-green-300' : 'bg-red-500/30 text-red-300'
                  }`}
                >
                  {point.points >= 0 ? '+' : ''}{point.points}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// Slide 6: Special Achievements
function SlideSpecialAchievements({ achievements, settings }: { achievements: SpecialAchievements; settings: PresentationSettings }) {
  const hasAny = achievements.highestSingleAward || achievements.mostAttendance || achievements.mostConsistent;

  if (!hasAny) {
    return <EmptySlide message="No special achievements yet" />;
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="bg-white/10 backdrop-blur-md rounded-3xl border-2 border-white/20 p-12 shadow-2xl">
        {/* Title */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <Medal className="w-12 h-12" style={{ color: settings.colors.accentColor }} />
          <h1 className="text-5xl font-bold text-white tracking-wide uppercase">
            Special Achievements
          </h1>
          <Medal className="w-12 h-12" style={{ color: settings.colors.accentColor }} />
        </div>
        
        {/* Achievements */}
        <div className="space-y-6">
          {achievements.highestSingleAward && (
            <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-sm rounded-2xl p-8 border border-purple-400/30">
              <div className="flex items-center gap-4 mb-4">
                <Trophy className="w-10 h-10 text-purple-300" />
                <h2 className="text-3xl font-bold text-purple-300">Highest Single Award</h2>
              </div>
              <div className="text-4xl font-bold text-white mb-3">
                {achievements.highestSingleAward.cadetName}
              </div>
              <div className="text-2xl text-white/80 mb-4">
                {achievements.highestSingleAward.reason}
              </div>
              <div className="text-4xl font-bold text-purple-300">
                +{achievements.highestSingleAward.points} points
              </div>
            </div>
          )}
          
          {achievements.mostAttendance && (
            <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-sm rounded-2xl p-8 border border-green-400/30">
              <div className="flex items-center gap-4 mb-4">
                <CalendarCheck className="w-10 h-10 text-green-300" />
                <h2 className="text-3xl font-bold text-green-300">Most Attendance</h2>
              </div>
              <div className="text-4xl font-bold text-white mb-3">
                {achievements.mostAttendance.name}
              </div>
              <div className="text-2xl text-white/80">
                {achievements.mostAttendance.attendanceCount} sessions attended
              </div>
            </div>
          )}
          
          {achievements.mostConsistent && !achievements.mostAttendance && (
            <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 backdrop-blur-sm rounded-2xl p-8 border border-blue-400/30">
              <div className="flex items-center gap-4 mb-4">
                <Award className="w-10 h-10 text-blue-300" />
                <h2 className="text-3xl font-bold text-blue-300">Most Consistent</h2>
              </div>
              <div className="text-4xl font-bold text-white mb-3">
                {achievements.mostConsistent.name}
              </div>
              <div className="text-2xl text-white/80">
                Leading the way with dedication
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Empty state component
function EmptySlide({ message }: { message: string }) {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-16 text-center">
        <div className="text-6xl mb-6 opacity-40">📊</div>
        <div className="text-3xl font-medium text-white/60">{message}</div>
      </div>
    </div>
  );
}
