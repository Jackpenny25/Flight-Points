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
    flightPointsSummary: boolean;
    completeLeaderboard: boolean;
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
    flightPointsSummary: true,
    completeLeaderboard: true,
  },
  customText: {
    squadronName: '2427 (Biggin Hill) Squadron',
    headerSubtitle: 'RAF Air Cadets',
  },
  colors: {
    primaryColor: '#004B87',      // RAF Blue
    secondaryColor: '#5b9bd5',    // RAF Light Blue (table headings)
    accentColor: '#dceaf6',       // RAF Very Light Blue (table rows)
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
      case 'flightPointsSummary':
        return <SlideFlightPointsSummary data={data} settings={settings} />;
      case 'completeLeaderboard':
        return <SlideCompleteLeaderboard data={data} settings={settings} />;
      default:
        return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-hidden bg-white"
    >
      {/* Squadron Header - RAF Blue */}
      <div 
        className="absolute top-0 left-0 right-0 border-b-4 z-10 py-6"
        style={{ backgroundColor: settings.colors.primaryColor }}
      >
        <div className="max-w-7xl mx-auto px-12">
          <div className="text-white text-3xl font-bold tracking-wide">
            {settings.customText.squadronName}
          </div>
          <div className="text-white/90 text-lg mt-1">{settings.customText.headerSubtitle}</div>
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
            className="h-2 rounded-full transition-all duration-300"
            style={{
              backgroundColor: index === currentSlide ? settings.colors.primaryColor : settings.colors.accentColor,
              width: index === currentSlide ? '48px' : '8px'
            }}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Slide Number Indicator */}
      <div 
        className="absolute bottom-24 right-12 text-sm font-medium z-10"
        style={{ color: settings.colors.primaryColor }}
      >
        {currentSlide + 1} / {totalSlides}
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentSlide(prev => (prev - 1 + totalSlides) % totalSlides)}
          className="h-10 w-10"
          style={{
            backgroundColor: settings.colors.accentColor,
            borderColor: settings.colors.secondaryColor,
            color: settings.colors.primaryColor
          }}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsPaused(!isPaused)}
          className="h-10 w-10"
          style={{
            backgroundColor: settings.colors.accentColor,
            borderColor: settings.colors.secondaryColor,
            color: settings.colors.primaryColor
          }}
        >
          {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentSlide(prev => (prev + 1) % totalSlides)}
          className="h-10 w-10"
          style={{
            backgroundColor: settings.colors.accentColor,
            borderColor: settings.colors.secondaryColor,
            color: settings.colors.primaryColor
          }}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        
        <div 
          className="mx-4 text-sm font-medium min-w-[140px] text-center"
          style={{ color: settings.colors.primaryColor }}
        >
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
    return <EmptySlide message="No cadet data available yet" settings={settings} />;
  }

  const isJointWin = winners.length > 1;

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div 
        className="rounded-3xl p-16 shadow-2xl border-2"
        style={{
          backgroundColor: '#ffffff',
          borderColor: settings.colors.secondaryColor
        }}
      >
        <div className="text-center">
          {/* Trophy Icon */}
          <div className="flex justify-center mb-8">
            <div 
              className="p-8 rounded-full"
              style={{ backgroundColor: settings.colors.accentColor }}
            >
              <Trophy className="w-20 h-20" style={{ color: settings.colors.primaryColor }} />
            </div>
          </div>
          
          {/* Title */}
          <h1 
            className="text-5xl font-bold mb-12 tracking-wide uppercase"
            style={{ color: settings.colors.primaryColor }}
          >
            {isJointWin ? 'Joint Winning Cadets' : 'Winning Cadet'}
          </h1>
          
          {/* Winners */}
          <div className="space-y-8 mb-12">
            {winners.map((winner, index) => (
              <div key={index} className="space-y-4">
                <div 
                  className="text-7xl font-extrabold tracking-tight"
                  style={{ color: settings.colors.primaryColor }}
                >
                  {winner.name}
                </div>
                {winner.flight && (
                  <div style={{ color: settings.colors.secondaryColor }} className="text-3xl">
                    Flight {formatFlight(winner.flight)}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Points */}
          <div 
            className="rounded-2xl py-8 px-12 inline-block"
            style={{ backgroundColor: settings.colors.accentColor }}
          >
            <div 
              className="text-6xl font-bold"
              style={{ color: settings.colors.primaryColor }}
            >
              {winners[0].points}
              <span style={{ color: settings.colors.secondaryColor }} className="text-4xl ml-4">points</span>
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
    return <EmptySlide message="No flight data available yet" settings={settings} />;
  }

  const isJointWin = winners.length > 1;

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div 
        className="rounded-3xl p-16 shadow-2xl border-2"
        style={{
          backgroundColor: '#ffffff',
          borderColor: settings.colors.secondaryColor
        }}
      >
        <div className="text-center">
          {/* Award Icon */}
          <div className="flex justify-center mb-8">
            <div 
              className="p-8 rounded-full"
              style={{ backgroundColor: settings.colors.accentColor }}
            >
              <Award className="w-20 h-20" style={{ color: settings.colors.primaryColor }} />
            </div>
          </div>
          
          {/* Title */}
          <h1 
            className="text-5xl font-bold mb-12 tracking-wide uppercase"
            style={{ color: settings.colors.primaryColor }}
          >
            {isJointWin ? 'Joint Winning Flights' : 'Winning Flight'}
          </h1>
          
          {/* Winners */}
          <div className="space-y-8 mb-12">
            {winners.map((winner, index) => (
              <div key={index}>
                <div 
                  className="text-7xl font-extrabold tracking-tight"
                  style={{ color: settings.colors.primaryColor }}
                >
                  Flight {formatFlight(winner.flight)}
                </div>
              </div>
            ))}
          </div>
          
          {/* Points */}
          <div 
            className="rounded-2xl py-8 px-12 inline-block"
            style={{ backgroundColor: settings.colors.accentColor }}
          >
            <div 
              className="text-6xl font-bold"
              style={{ color: settings.colors.primaryColor }}
            >
              {winners[0].points}
              <span style={{ color: settings.colors.secondaryColor }} className="text-4xl ml-4">points</span>
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
    return <EmptySlide message="No cadet leaderboard data yet" settings={settings} />;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32', '#ffffff', '#ffffff'];

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div 
        className="rounded-3xl p-12 shadow-2xl border-2"
        style={{
          backgroundColor: '#ffffff',
          borderColor: settings.colors.secondaryColor
        }}
      >
        {/* Title */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <Star className="w-12 h-12" style={{ color: settings.colors.primaryColor }} />
          <h1 
            className="text-5xl font-bold tracking-wide uppercase"
            style={{ color: settings.colors.primaryColor }}
          >
            Top 5 Cadets
          </h1>
          <Star className="w-12 h-12" style={{ color: settings.colors.primaryColor }} />
        </div>
        
        {/* Table Header */}
        <div 
          className="grid grid-cols-12 gap-4 p-6 rounded-t-xl font-bold text-lg mb-0"
          style={{ backgroundColor: settings.colors.secondaryColor, color: '#ffffff' }}
        >
          <div className="col-span-1 text-center">Rank</div>
          <div className="col-span-6">Cadet Name</div>
          <div className="col-span-3">Flight</div>
          <div className="col-span-2 text-right">Points</div>
        </div>
        
        {/* Leaderboard Rows */}
        <div className="border-x-2" style={{ borderColor: settings.colors.secondaryColor }}>
          {topCadets.map((cadet, index) => (
            <div
              key={cadet.name}
              className="grid grid-cols-12 gap-4 p-6 border-b-2 items-center"
              style={{
                backgroundColor: index % 2 === 0 ? settings.colors.accentColor : '#ffffff',
                borderColor: settings.colors.secondaryColor
              }}
            >
              <div 
                className="col-span-1 text-center text-3xl font-bold"
                style={{ color: settings.colors.primaryColor }}
              >
                {index < 3 ? ['🥇', '🥈', '🥉'][index] : `#${index + 1}`}
              </div>
              
              <div 
                className="col-span-6 text-2xl font-bold"
                style={{ color: settings.colors.primaryColor }}
              >
                {cadet.name}
              </div>
              
              <div 
                className="col-span-3 text-xl"
                style={{ color: settings.colors.primaryColor }}
              >
                Flight {formatFlight(cadet.flight)}
              </div>
              
              <div 
                className="col-span-2 text-right text-3xl font-bold"
                style={{ color: settings.colors.primaryColor }}
              >
                {cadet.points} pts
              </div>
            </div>
          ))}
        </div>
        
        {/* Table Footer */}
        <div 
          className="p-4 rounded-b-xl text-sm"
          style={{ backgroundColor: settings.colors.accentColor, color: settings.colors.primaryColor }}
        >
          Updated regularly
        </div>
      </div>
    </div>
  );
}

// Slide 4: Top 3 Flights
function SlideTop3Flights({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
  const topFlights = data.flightLeaderboard.slice(0, 3);

  if (topFlights.length === 0) {
    return <EmptySlide message="No flight leaderboard data yet" settings={settings} />;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div 
        className="rounded-3xl p-12 shadow-2xl border-2"
        style={{
          backgroundColor: '#ffffff',
          borderColor: settings.colors.secondaryColor
        }}
      >
        {/* Title */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <Trophy className="w-12 h-12" style={{ color: settings.colors.primaryColor }} />
          <h1 
            className="text-5xl font-bold tracking-wide uppercase"
            style={{ color: settings.colors.primaryColor }}
          >
            Top 3 Flights
          </h1>
          <Trophy className="w-12 h-12" style={{ color: settings.colors.primaryColor }} />
        </div>
        
        {/* Table Header */}
        <div 
          className="grid grid-cols-12 gap-4 p-6 rounded-t-xl font-bold text-lg mb-0"
          style={{ backgroundColor: settings.colors.secondaryColor, color: '#ffffff' }}
        >
          <div className="col-span-2 text-center">Rank</div>
          <div className="col-span-4">Flight</div>
          <div className="col-span-3">Cadets</div>
          <div className="col-span-3 text-right">Points</div>
        </div>
        
        {/* Leaderboard Rows */}
        <div className="border-x-2" style={{ borderColor: settings.colors.secondaryColor }}>
          {topFlights.map((flight, index) => (
            <div
              key={flight.flight}
              className="grid grid-cols-12 gap-4 p-6 border-b-2 items-center"
              style={{
                backgroundColor: index % 2 === 0 ? settings.colors.accentColor : '#ffffff',
                borderColor: settings.colors.secondaryColor
              }}
            >
              <div 
                className="col-span-2 text-center text-3xl font-bold"
                style={{ color: settings.colors.primaryColor }}
              >
                {['🥇', '🥈', '🥉'][index]}
              </div>
              
              <div 
                className="col-span-4 text-2xl font-bold"
                style={{ color: settings.colors.primaryColor }}
              >
                Flight {formatFlight(flight.flight)}
              </div>
              
              <div 
                className="col-span-3 text-xl"
                style={{ color: settings.colors.primaryColor }}
              >
                {flight.cadetCount ? `${flight.cadetCount} cadets` : 'No data'}
              </div>
              
              <div 
                className="col-span-3 text-right text-3xl font-bold"
                style={{ color: settings.colors.primaryColor }}
              >
                {flight.points} pts
              </div>
            </div>
          ))}
        </div>
        
        {/* Table Footer */}
        <div 
          className="p-4 rounded-b-xl text-sm"
          style={{ backgroundColor: settings.colors.accentColor, color: settings.colors.primaryColor }}
        >
          Updated regularly
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
    return <EmptySlide message="No recent activity yet" settings={settings} />;
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div 
        className="rounded-3xl p-12 shadow-2xl border-2"
        style={{
          backgroundColor: '#ffffff',
          borderColor: settings.colors.secondaryColor
        }}
      >
        {/* Title */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <TrendingUp className="w-12 h-12" style={{ color: settings.colors.primaryColor }} />
          <h1 
            className="text-5xl font-bold tracking-wide uppercase"
            style={{ color: settings.colors.primaryColor }}
          >
            Recent Activity
          </h1>
        </div>
        
        {/* Activity List */}
        <div className="space-y-3">
          {recentPoints.map((point, idx) => (
            <div
              key={point.id}
              className="rounded-lg p-4 border-l-4"
              style={{
                backgroundColor: idx % 2 === 0 ? settings.colors.accentColor : '#ffffff',
                borderColor: settings.colors.secondaryColor,
                color: settings.colors.primaryColor
              }}
            >
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 min-w-0">
                  {/* Cadet Name & Flight */}
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span 
                      className="text-2xl font-bold truncate"
                      style={{ color: settings.colors.primaryColor }}
                    >
                      {point.cadetName}
                    </span>
                    <span 
                      className="text-sm px-3 py-1 rounded-full font-medium"
                      style={{ 
                        backgroundColor: settings.colors.secondaryColor, 
                        color: '#ffffff' 
                      }}
                    >
                      Flight {formatFlight(point.flight)}
                    </span>
                    <span 
                      className="text-sm px-3 py-1 rounded-full font-medium"
                      style={{ 
                        backgroundColor: settings.colors.accentColor,
                        color: settings.colors.primaryColor
                      }}
                    >
                      {point.type}
                    </span>
                  </div>
                  
                  {/* Reason */}
                  <p 
                    className="text-lg mb-2"
                    style={{ color: settings.colors.primaryColor }}
                  >
                    {point.reason}
                  </p>
                  
                  {/* Date & Given By */}
                  <p 
                    className="text-sm"
                    style={{ color: `${settings.colors.primaryColor}99` }}
                  >
                    {new Date(point.date).toLocaleDateString('en-GB')} • by {point.givenBy}
                  </p>
                </div>
                
                {/* Points Badge */}
                <div 
                  className="text-2xl font-bold px-4 py-2 rounded-lg flex-shrink-0"
                  style={{ 
                    backgroundColor: point.points >= 0 ? '#d4edda' : '#f8d7da',
                    color: point.points >= 0 ? '#155724' : '#721c24'
                  }}
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
    return <EmptySlide message="No special achievements yet" settings={settings} />;
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div 
        className="rounded-3xl p-12 shadow-2xl border-2"
        style={{
          backgroundColor: '#ffffff',
          borderColor: settings.colors.secondaryColor
        }}
      >
        {/* Title */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <Medal className="w-12 h-12" style={{ color: settings.colors.primaryColor }} />
          <h1 
            className="text-5xl font-bold tracking-wide uppercase"
            style={{ color: settings.colors.primaryColor }}
          >
            Special Achievements
          </h1>
          <Medal className="w-12 h-12" style={{ color: settings.colors.primaryColor }} />
        </div>
        
        {/* Achievements */}
        <div className="space-y-6">
          {achievements.highestSingleAward && (
            <div 
              className="rounded-2xl p-8 border-l-4"
              style={{
                backgroundColor: settings.colors.accentColor,
                borderColor: settings.colors.secondaryColor,
                color: settings.colors.primaryColor
              }}
            >
              <div className="flex items-center gap-4 mb-4">
                <Trophy className="w-10 h-10" style={{ color: settings.colors.secondaryColor }} />
                <h2 
                  className="text-3xl font-bold"
                  style={{ color: settings.colors.secondaryColor }}
                >
                  Highest Single Award
                </h2>
              </div>
              <div 
                className="text-4xl font-bold mb-3"
                style={{ color: settings.colors.primaryColor }}
              >
                {achievements.highestSingleAward.cadetName}
              </div>
              <div 
                className="text-2xl mb-4"
                style={{ color: settings.colors.primaryColor }}
              >
                {achievements.highestSingleAward.reason}
              </div>
              <div 
                className="text-4xl font-bold"
                style={{ color: settings.colors.secondaryColor }}
              >
                +{achievements.highestSingleAward.points} points
              </div>
            </div>
          )}
          
          {achievements.mostAttendance && (
            <div 
              className="rounded-2xl p-8 border-l-4"
              style={{
                backgroundColor: '#ffffff',
                borderColor: settings.colors.secondaryColor,
                color: settings.colors.primaryColor
              }}
            >
              <div className="flex items-center gap-4 mb-4">
                <CalendarCheck className="w-10 h-10" style={{ color: settings.colors.secondaryColor }} />
                <h2 
                  className="text-3xl font-bold"
                  style={{ color: settings.colors.secondaryColor }}
                >
                  Most Attendance
                </h2>
              </div>
              <div 
                className="text-4xl font-bold mb-3"
                style={{ color: settings.colors.primaryColor }}
              >
                {achievements.mostAttendance.name}
              </div>
              <div 
                className="text-2xl"
                style={{ color: settings.colors.primaryColor }}
              >
                {achievements.mostAttendance.attendanceCount} sessions attended
              </div>
            </div>
          )}
          
          {achievements.mostConsistent && !achievements.mostAttendance && (
            <div 
              className="rounded-2xl p-8 border-l-4"
              style={{
                backgroundColor: settings.colors.accentColor,
                borderColor: settings.colors.secondaryColor,
                color: settings.colors.primaryColor
              }}
            >
              <div className="flex items-center gap-4 mb-4">
                <Award className="w-10 h-10" style={{ color: settings.colors.secondaryColor }} />
                <h2 
                  className="text-3xl font-bold"
                  style={{ color: settings.colors.secondaryColor }}
                >
                  Most Consistent
                </h2>
              </div>
              <div 
                className="text-4xl font-bold mb-3"
                style={{ color: settings.colors.primaryColor }}
              >
                {achievements.mostConsistent.name}
              </div>
              <div 
                className="text-2xl"
                style={{ color: settings.colors.primaryColor }}
              >
                Leading the way with dedication
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Slide: Flight Points Summary (left: flight totals, right: winning cadet/flight)
function SlideFlightPointsSummary({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
  const flightTotals = data.flightLeaderboard || [];
  const winningCadet = data.winningCadet;
  const winningFlight = data.winningFlight;

  return (
    <div className="w-full max-w-7xl mx-auto">
      <h1 
        className="text-6xl font-bold text-center mb-12 underline"
        style={{ color: settings.colors.primaryColor }}
      >
        Flight Points:
      </h1>
      
      <div className="grid grid-cols-2 gap-12">
        {/* Left: Flight Point Totals */}
        <div>
          <h2 
            className="text-4xl font-bold mb-8"
            style={{ color: settings.colors.primaryColor }}
          >
            Flight point totals:
          </h2>
          
          <div className="border-2" style={{ borderColor: settings.colors.secondaryColor }}>
            {/* Header */}
            <div 
              className="grid grid-cols-2 p-4 font-bold text-2xl"
              style={{ backgroundColor: settings.colors.secondaryColor, color: '#ffffff' }}
            >
              <div>Flight</div>
              <div className="text-right">Points</div>
            </div>
            
            {/* Rows */}
            {flightTotals.map((flight, index) => (
              <div
                key={flight.flight}
                className="grid grid-cols-2 p-4 text-2xl border-t-2"
                style={{
                  backgroundColor: index % 2 === 0 ? settings.colors.accentColor : '#ffffff',
                  borderColor: settings.colors.secondaryColor,
                  color: settings.colors.primaryColor
                }}
              >
                <div className="font-bold">{flight.flight} Flight</div>
                <div className="text-right font-bold">{flight.points}</div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Right: Who has the most points */}
        <div>
          <h2 
            className="text-4xl font-bold mb-8"
            style={{ color: settings.colors.primaryColor }}
          >
            Who has the most points:
          </h2>
          
          <div className="space-y-6">
            {/* Winning Cadet */}
            {winningCadet && (
              <div className="border-2" style={{ borderColor: settings.colors.secondaryColor }}>
                <div 
                  className="grid grid-cols-2 p-4 font-bold text-xl"
                  style={{ backgroundColor: settings.colors.secondaryColor, color: '#ffffff' }}
                >
                  <div>Winning cadet</div>
                  <div className="text-right">Points</div>
                </div>
                <div
                  className="grid grid-cols-2 p-4 text-2xl font-bold"
                  style={{
                    backgroundColor: '#ffffff',
                    color: settings.colors.primaryColor
                  }}
                >
                  <div>{winningCadet.name}</div>
                  <div className="text-right">{winningCadet.points}</div>
                </div>
              </div>
            )}
            
            {/* Winning Flight */}
            {winningFlight && (
              <div className="border-2" style={{ borderColor: settings.colors.secondaryColor }}>
                <div 
                  className="grid grid-cols-2 p-4 font-bold text-xl"
                  style={{ backgroundColor: settings.colors.secondaryColor, color: '#ffffff' }}
                >
                  <div>Flight</div>
                  <div className="text-right">Points</div>
                </div>
                <div
                  className="grid grid-cols-2 p-4 text-2xl font-bold"
                  style={{
                    backgroundColor: '#ffffff',
                    color: settings.colors.primaryColor
                  }}
                >
                  <div>{winningFlight.flight} Flight</div>
                  <div className="text-right">{winningFlight.points}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Slide: Complete Leaderboard (all cadets)
function SlideCompleteLeaderboard({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
  const leaderboard = data.cadetLeaderboard || [];

  if (leaderboard.length === 0) {
    return <EmptySlide message="No leaderboard data available" settings={settings} />;
  }

  return (
    <div className="w-full max-w-7xl mx-auto">
      <h1 
        className="text-5xl font-bold text-center mb-8"
        style={{ color: settings.colors.primaryColor }}
      >
        Complete Leaderboard
      </h1>
      
      <div className="border-2" style={{ borderColor: settings.colors.secondaryColor }}>
        {/* Header */}
        <div 
          className="grid grid-cols-5 gap-2 p-3 font-bold text-lg"
          style={{ backgroundColor: settings.colors.secondaryColor, color: '#ffffff' }}
        >
          <div className="text-center">Rank</div>
          <div className="col-span-2">Cadet Name</div>
          <div className="text-center">Flight</div>
          <div className="text-right">Points</div>
        </div>
        
        {/* Rows - scrollable if needed */}
        <div className="max-h-[60vh] overflow-y-auto">
          {leaderboard.map((cadet, index) => (
            <div
              key={cadet.name}
              className="grid grid-cols-5 gap-2 p-3 border-t text-lg"
              style={{
                backgroundColor: index % 2 === 0 ? settings.colors.accentColor : '#ffffff',
                borderColor: settings.colors.secondaryColor,
                color: settings.colors.primaryColor
              }}
            >
              <div className="text-center font-bold">{index + 1}</div>
              <div className="col-span-2 font-medium">{cadet.name}</div>
              <div className="text-center font-medium">{formatFlight(cadet.flight)}</div>
              <div className="text-right font-bold">{cadet.points}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Empty state component
function EmptySlide({ message, settings }: { message: string; settings?: PresentationSettings }) {
  const defaultSettings: PresentationSettings = {
    colors: {
      primaryColor: '#004B87',
      secondaryColor: '#5b9bd5',
      accentColor: '#dceaf6'
    },
    autoAdvance: true,
    advanceInterval: 8,
    enabledSlides: [true, true, true, true, true, true],
    customWinnerText: '',
    customTitleText: ''
  };

  const finalSettings = settings || defaultSettings;

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div 
        className="rounded-3xl border-2 p-16 text-center shadow-2xl"
        style={{
          backgroundColor: '#ffffff',
          borderColor: finalSettings.colors.secondaryColor
        }}
      >
        <div className="text-6xl mb-6">📊</div>
        <div 
          className="text-3xl font-medium"
          style={{ color: finalSettings.colors.primaryColor }}
        >
          {message}
        </div>
      </div>
    </div>
  );
}
