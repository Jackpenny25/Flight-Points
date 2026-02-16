import { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';
import { formatFlight } from './ui/utils';
import { X, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { Button } from './ui/button';

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

interface PresentationSettings {
  slideDuration: number;
  dataRefreshInterval: number;
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
  customText: {
    squadronName: '2427 (Biggin Hill) Squadron',
    headerSubtitle: 'RAF Air Cadets',
  },
  colors: {
    primaryColor: '#004B87',
    secondaryColor: '#5b9bd5',
    accentColor: '#dceaf6',
  },
};

const SLIDES = ['flightPoints', 'recentActivity', 'completeLeaderboard'] as const;
type SlideType = typeof SLIDES[number];

export function PresentationMode({ 
  onClose, 
  settings: propSettings 
}: { 
  onClose: () => void;
  settings?: PresentationSettings;
}) {
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
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const SLIDE_DURATION = settings.slideDuration * 1000;
  const DATA_REFRESH_INTERVAL = settings.dataRefreshInterval * 1000;

  // Fetch leaderboard data
  const fetchData = useCallback(async () => {
    try {
      const result = await api.getLeaderboards();
      setData(result);
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
      setCurrentSlide(prev => (prev + 1) % SLIDES.length);
    }, SLIDE_DURATION);
    
    return () => clearInterval(slideInterval);
  }, [isPaused, loading]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          exitFullscreen();
          onClose();
          break;
        case 'ArrowLeft':
          setCurrentSlide(prev => (prev - 1 + SLIDES.length) % SLIDES.length);
          break;
        case 'ArrowRight':
          setCurrentSlide(prev => (prev + 1) % SLIDES.length);
          break;
        case ' ':
          e.preventDefault();
          setIsPaused(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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

    const slideType = SLIDES[currentSlide];
    
    switch (slideType) {
      case 'flightPoints':
        return <SlideFlightPoints data={data} settings={settings} />;
      case 'recentActivity':
        return <SlideRecentActivity data={data} settings={settings} />;
      case 'completeLeaderboard':
        return <SlideCompleteLeaderboard data={data} settings={settings} />;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-hidden bg-white"
    >
      {/* Squadron Header */}
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
        {Array.from({ length: SLIDES.length }).map((_, index) => (
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
        {currentSlide + 1} / {SLIDES.length}
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentSlide(prev => (prev - 1 + SLIDES.length) % SLIDES.length)}
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
          onClick={() => setCurrentSlide(prev => (prev + 1) % SLIDES.length)}
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

// SLIDE 1: Flight Points Summary
function SlideFlightPoints({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
  const flightTotals = data.flightLeaderboard || [];
  const winningCadet = data.winningCadet;
  const winningFlight = data.winningFlight;

  return (
    <div className="w-full max-w-7xl mx-auto">
      <h1 
        className="text-6xl font-bold text-center mb-12"
        style={{ color: settings.colors.primaryColor, textDecoration: 'underline' }}
      >
        Flight points:
      </h1>
      
      <div className="grid grid-cols-2 gap-12">
        {/* LEFT: Flight Point Totals */}
        <div>
          <h2 
            className="text-4xl font-bold mb-6"
            style={{ color: settings.colors.primaryColor }}
          >
            Flight point totals:
          </h2>
          
          <table className="w-full border-2" style={{ borderColor: settings.colors.secondaryColor }}>
            <thead>
              <tr style={{ backgroundColor: settings.colors.secondaryColor }}>
                <th className="p-3 text-left text-white font-bold text-2xl">Flight</th>
                <th className="p-3 text-right text-white font-bold text-2xl">Points</th>
              </tr>
            </thead>
            <tbody>
              {flightTotals.map((flight, idx) => (
                <tr
                  key={flight.flight}
                  style={{
                    backgroundColor: idx % 2 === 0 ? settings.colors.accentColor : '#ffffff',
                    borderTop: `2px solid ${settings.colors.secondaryColor}`
                  }}
                >
                  <td 
                    className="p-3 text-left text-2xl font-bold"
                    style={{ color: settings.colors.primaryColor }}
                  >
                    {flight.flight} Flight
                  </td>
                  <td 
                    className="p-3 text-right text-2xl font-bold"
                    style={{ color: settings.colors.primaryColor }}
                  >
                    {flight.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* RIGHT: Who has the most points */}
        <div>
          <h2 
            className="text-4xl font-bold mb-6"
            style={{ color: settings.colors.primaryColor }}
          >
            Who has the most points:
          </h2>
          
          <div className="space-y-6">
            {/* Winning Cadet */}
            {winningCadet && (
              <table className="w-full border-2" style={{ borderColor: settings.colors.secondaryColor }}>
                <thead>
                  <tr style={{ backgroundColor: settings.colors.secondaryColor }}>
                    <th className="p-3 text-left text-white font-bold text-xl">Winning cadet</th>
                    <th className="p-3 text-right text-white font-bold text-xl">Points</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ backgroundColor: '#ffffff' }}>
                    <td 
                      className="p-3 text-left text-2xl font-bold"
                      style={{ color: settings.colors.primaryColor }}
                    >
                      {winningCadet.name}
                    </td>
                    <td 
                      className="p-3 text-right text-2xl font-bold"
                      style={{ color: settings.colors.primaryColor }}
                    >
                      {winningCadet.points}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            
            {/* Winning Flight */}
            {winningFlight && (
              <table className="w-full border-2" style={{ borderColor: settings.colors.secondaryColor }}>
                <thead>
                  <tr style={{ backgroundColor: settings.colors.secondaryColor }}>
                    <th className="p-3 text-left text-white font-bold text-xl">Flight</th>
                    <th className="p-3 text-right text-white font-bold text-xl">Points</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ backgroundColor: '#ffffff' }}>
                    <td 
                      className="p-3 text-left text-2xl font-bold"
                      style={{ color: settings.colors.primaryColor }}
                    >
                      {winningFlight.flight} Flight
                    </td>
                    <td 
                      className="p-3 text-right text-2xl font-bold"
                      style={{ color: settings.colors.primaryColor }}
                    >
                      {winningFlight.points}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// SLIDE 2: Who Got Points Recently
function SlideRecentActivity({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
  const recentPoints = data.recentPoints.slice(0, 12); // Show top 12 recent

  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-center px-12"
      style={{ backgroundColor: '#4a7a8f' }}
    >
      <h1 
        className="text-5xl font-bold text-white mb-8"
        style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}
      >
        Who Got Points Recently
      </h1>

      <div 
        className="w-full max-w-5xl rounded-lg overflow-hidden border-4"
        style={{ backgroundColor: '#ffffff', borderColor: settings.colors.primaryColor }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: settings.colors.secondaryColor }}>
              <th className="p-4 text-left text-white font-bold text-lg">Date</th>
              <th className="p-4 text-left text-white font-bold text-lg">Name</th>
              <th className="p-4 text-left text-white font-bold text-lg">Reason</th>
              <th className="p-4 text-right text-white font-bold text-lg">Points</th>
            </tr>
          </thead>
          <tbody>
            {recentPoints.map((point, idx) => (
              <tr
                key={point.id}
                style={{
                  backgroundColor: idx % 2 === 0 ? settings.colors.accentColor : '#ffffff',
                  borderBottom: idx < recentPoints.length - 1 ? `1px solid ${settings.colors.accentColor}` : 'none'
                }}
              >
                <td 
                  className="p-4 text-left font-medium"
                  style={{ color: settings.colors.primaryColor }}
                >
                  {new Date(point.date).toLocaleDateString('en-GB')}
                </td>
                <td 
                  className="p-4 text-left font-medium"
                  style={{ color: settings.colors.primaryColor }}
                >
                  {point.cadetName}
                </td>
                <td 
                  className="p-4 text-left font-medium"
                  style={{ color: settings.colors.primaryColor }}
                >
                  {point.reason}
                </td>
                <td 
                  className="p-4 text-right font-bold text-lg"
                  style={{ color: settings.colors.primaryColor }}
                >
                  {point.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// SLIDE 3: Complete Leaderboard
function SlideCompleteLeaderboard({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
  const leaderboard = data.cadetLeaderboard || [];

  if (leaderboard.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full text-4xl" style={{ color: settings.colors.primaryColor }}>
        Loading leaderboard...
      </div>
    );
  }

  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: '#ffffff' }}
    >
      <h1 
        className="text-5xl font-bold mb-8"
        style={{ color: settings.colors.primaryColor }}
      >
        Complete Leaderboard
      </h1>

      <div 
        className="w-full max-w-6xl rounded-lg overflow-hidden border-2"
        style={{ borderColor: settings.colors.secondaryColor, maxHeight: '70vh', overflowY: 'auto' }}
      >
        <table className="w-full">
          <thead style={{ position: 'sticky', top: 0 }}>
            <tr style={{ backgroundColor: settings.colors.secondaryColor }}>
              <th className="p-3 text-center text-white font-bold text-base">Rank</th>
              <th className="p-3 text-left text-white font-bold text-base">Cadet Name</th>
              <th className="p-3 text-center text-white font-bold text-base">Flight points</th>
              <th className="p-3 text-center text-white font-bold text-base">Attendance</th>
              <th className="p-3 text-center text-white font-bold text-base">Total</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((cadet, idx) => (
              <tr
                key={cadet.name}
                style={{
                  backgroundColor: idx % 2 === 0 ? settings.colors.accentColor : '#ffffff',
                  borderBottom: `1px solid ${settings.colors.secondaryColor}`
                }}
              >
                <td 
                  className="p-3 text-center font-bold text-base"
                  style={{ color: settings.colors.primaryColor }}
                >
                  {idx + 1}
                </td>
                <td 
                  className="p-3 text-left font-medium text-base"
                  style={{ color: settings.colors.primaryColor }}
                >
                  {cadet.name}
                </td>
                <td 
                  className="p-3 text-center font-medium text-base"
                  style={{ color: settings.colors.primaryColor }}
                >
                  {cadet.points}
                </td>
                <td 
                  className="p-3 text-center font-medium text-base"
                  style={{ color: settings.colors.primaryColor }}
                >
                  0
                </td>
                <td 
                  className="p-3 text-center font-bold text-base"
                  style={{ color: settings.colors.primaryColor }}
                >
                  {cadet.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
