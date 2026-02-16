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
  enabledSlides: {
    flightPoints: boolean;
    recentActivity: boolean;
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
  tableScale: number; // Scale multiplier for table sizes (0.5 - 1.5)
  elementColors: {
    tableHeaderBg?: string;
    tableRowAlt?: string;
    textColor?: string;
    recentActivityBg?: string;
  };
  // Individual slide customization
  slideCustomization?: {
    flightPoints?: {
      title?: string;
      leftTableTitle?: string;
      rightTableTitle?: string;
      leftTableScale?: number;
      rightTableScale?: number;
      titleFontSize?: number;
      sectionTitleFontSize?: number;
      tableFontSize?: number;
    };
    recentActivity?: {
      title?: string;
      rowCount?: number;
      tableFontSize?: number;
      titleFontSize?: number;
    };
    completeLeaderboard?: {
      title?: string;
      tableFontSize?: number;
      titleFontSize?: number;
    };
  };
}

const DEFAULT_SETTINGS: PresentationSettings = {
  slideDuration: 10,
  dataRefreshInterval: 30,
  enabledSlides: {
    flightPoints: true,
    recentActivity: true,
    completeLeaderboard: true,
  },
  customText: {
    squadronName: '2427 (Biggin Hill) Squadron',
    headerSubtitle: 'RAF Air Cadets',
  },
  colors: {
    primaryColor: '#004B87',
    secondaryColor: '#5b9bd5',
    accentColor: '#dceaf6',
  },
  tableScale: 1,
  elementColors: {},
  slideCustomization: {
    flightPoints: {
      title: 'Flight points:',
      leftTableTitle: 'Flight point totals:',
      rightTableTitle: 'Who has the most points:',
      leftTableScale: 1,
      rightTableScale: 1,
      titleFontSize: 60,
      sectionTitleFontSize: 40,
      tableFontSize: 24,
    },
    recentActivity: {
      title: 'Who Got Points Recently',
      rowCount: 12,
      tableFontSize: 16,
      titleFontSize: 50,
    },
    completeLeaderboard: {
      title: 'Complete Leaderboard',
      tableFontSize: 16,
      titleFontSize: 50,
    },
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
    if (propSettings) {
      // Merge propSettings with defaults
      return {
        ...DEFAULT_SETTINGS,
        ...propSettings,
        enabledSlides: { ...DEFAULT_SETTINGS.enabledSlides, ...(propSettings.enabledSlides || {}) },
        customText: { ...DEFAULT_SETTINGS.customText, ...(propSettings.customText || {}) },
        colors: { ...DEFAULT_SETTINGS.colors, ...(propSettings.colors || {}) },
        elementColors: { ...DEFAULT_SETTINGS.elementColors, ...(propSettings.elementColors || {}) },
        slideCustomization: {
          flightPoints: { ...DEFAULT_SETTINGS.slideCustomization!.flightPoints, ...(propSettings.slideCustomization?.flightPoints || {}) },
          recentActivity: { ...DEFAULT_SETTINGS.slideCustomization!.recentActivity, ...(propSettings.slideCustomization?.recentActivity || {}) },
          completeLeaderboard: { ...DEFAULT_SETTINGS.slideCustomization!.completeLeaderboard, ...(propSettings.slideCustomization?.completeLeaderboard || {}) },
        },
      };
    }
    const saved = localStorage.getItem('presentationSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure all properties exist
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          enabledSlides: { ...DEFAULT_SETTINGS.enabledSlides, ...(parsed.enabledSlides || {}) },
          customText: { ...DEFAULT_SETTINGS.customText, ...(parsed.customText || {}) },
          colors: { ...DEFAULT_SETTINGS.colors, ...(parsed.colors || {}) },
          elementColors: { ...DEFAULT_SETTINGS.elementColors, ...(parsed.elementColors || {}) },
          slideCustomization: {
            flightPoints: { ...DEFAULT_SETTINGS.slideCustomization!.flightPoints, ...(parsed.slideCustomization?.flightPoints || {}) },
            recentActivity: { ...DEFAULT_SETTINGS.slideCustomization!.recentActivity, ...(parsed.slideCustomization?.recentActivity || {}) },
            completeLeaderboard: { ...DEFAULT_SETTINGS.slideCustomization!.completeLeaderboard, ...(parsed.slideCustomization?.completeLeaderboard || {}) },
          },
        };
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

  // Get only enabled slides
  const enabledSlidesList = SLIDES.filter(slide => settings.enabledSlides[slide as keyof typeof settings.enabledSlides]);

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
    const enabledCount = enabledSlidesList.length;
    if (enabledCount === 0) return;
    
    const slideInterval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % enabledCount);
    }, SLIDE_DURATION);
    
    return () => clearInterval(slideInterval);
  }, [isPaused, loading, enabledSlidesList.length]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const enabledCount = enabledSlidesList.length;
      if (enabledCount === 0) return;
      
      switch (e.key) {
        case 'Escape':
          exitFullscreen();
          onClose();
          break;
        case 'ArrowLeft':
          setCurrentSlide(prev => (prev - 1 + enabledCount) % enabledCount);
          break;
        case 'ArrowRight':
          setCurrentSlide(prev => (prev + 1) % enabledCount);
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

    if (enabledSlidesList.length === 0) {
      return (
        <div className="flex items-center justify-center w-full h-full">
          <div className="text-gray-500 text-5xl font-light">No slides enabled</div>
        </div>
      );
    }

    const slideType = enabledSlidesList[currentSlide];
    
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
        {Array.from({ length: enabledSlidesList.length }).map((_, index) => (
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
        {currentSlide + 1} / {enabledSlidesList.length}
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentSlide(prev => (prev - 1 + enabledSlidesList.length) % enabledSlidesList.length)}
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
          onClick={() => setCurrentSlide(prev => (prev + 1) % enabledSlidesList.length)}
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
  const headerBg = settings.elementColors?.tableHeaderBg || settings.colors.secondaryColor;
  const rowAltBg = settings.elementColors?.tableRowAlt || settings.colors.accentColor;
  const textCol = settings.elementColors?.textColor || settings.colors.primaryColor;
  
  // Individual slide customization
  const custom = settings.slideCustomization?.flightPoints || DEFAULT_SETTINGS.slideCustomization!.flightPoints!;
  const titleText = custom.title || 'Flight points:';
  const leftTitle = custom.leftTableTitle || 'Flight point totals:';
  const rightTitle = custom.rightTableTitle || 'Who has the most points:';
  const leftScale = custom.leftTableScale || 1;
  const rightScale = custom.rightTableScale || 1;
  const titleSize = custom.titleFontSize || 60;
  const sectionTitleSize = custom.sectionTitleFontSize || 40;
  const tableSize = custom.tableFontSize || 24;

  return (
    <div className="w-full max-w-7xl mx-auto" style={{ transform: `scale(${settings.tableScale || 1})`, transformOrigin: 'center' }}>
      <h1 
        className="font-bold text-center mb-12"
        style={{ color: textCol, textDecoration: 'underline', fontSize: `${titleSize}px` }}
      >
        {titleText}
      </h1>
      
      <div className="grid grid-cols-2 gap-12">
        {/* LEFT: Flight Point Totals */}
        <div style={{ transform: `scale(${leftScale})`, transformOrigin: 'top left' }}>
          <h2 
            className="font-bold mb-6"
            style={{ color: textCol, fontSize: `${sectionTitleSize}px` }}
          >
            {leftTitle}
          </h2>
          
          <table className="w-full border-2" style={{ borderColor: headerBg }}>
            <thead>
              <tr style={{ backgroundColor: headerBg }}>
                <th className="p-3 text-left text-white font-bold" style={{ fontSize: `${tableSize}px` }}>Flight</th>
                <th className="p-3 text-right text-white font-bold" style={{ fontSize: `${tableSize}px` }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {flightTotals.map((flight, idx) => (
                <tr
                  key={flight.flight}
                  style={{
                    backgroundColor: idx % 2 === 0 ? rowAltBg : '#ffffff',
                    borderTop: `2px solid ${headerBg}`
                  }}
                >
                  <td 
                    className="p-3 text-left font-bold"
                    style={{ color: textCol, fontSize: `${tableSize}px` }}
                  >
                    {flight.flight} Flight
                  </td>
                  <td 
                    className="p-3 text-right font-bold"
                    style={{ color: textCol, fontSize: `${tableSize}px` }}
                  >
                    {flight.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* RIGHT: Who has the most points */}
        <div style={{ transform: `scale(${rightScale})`, transformOrigin: 'top right' }}>
          <h2 
            className="font-bold mb-6"
            style={{ color: textCol, fontSize: `${sectionTitleSize}px` }}
          >
            {rightTitle}
          </h2>
          
          <div className="space-y-6">
            {/* Winning Cadet */}
            {winningCadet && (
              <table className="w-full border-2" style={{ borderColor: headerBg }}>
                <thead>
                  <tr style={{ backgroundColor: headerBg }}>
                    <th className="p-3 text-left text-white font-bold" style={{ fontSize: `${tableSize * 0.85}px` }}>Winning cadet</th>
                    <th className="p-3 text-right text-white font-bold" style={{ fontSize: `${tableSize * 0.85}px` }}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ backgroundColor: '#ffffff' }}>
                    <td 
                      className="p-3 text-left font-bold"
                      style={{ color: textCol, fontSize: `${tableSize}px` }}
                    >
                      {winningCadet.name}
                    </td>
                    <td 
                      className="p-3 text-right font-bold"
                      style={{ color: textCol, fontSize: `${tableSize}px` }}
                    >
                      {winningCadet.points}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            
            {/* Winning Flight */}
            {winningFlight && (
              <table className="w-full border-2" style={{ borderColor: headerBg }}>
                <thead>
                  <tr style={{ backgroundColor: headerBg }}>
                    <th className="p-3 text-left text-white font-bold" style={{ fontSize: `${tableSize * 0.85}px` }}>Flight</th>
                    <th className="p-3 text-right text-white font-bold" style={{ fontSize: `${tableSize * 0.85}px` }}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ backgroundColor: '#ffffff' }}>
                    <td 
                      className="p-3 text-left font-bold"
                      style={{ color: textCol, fontSize: `${tableSize}px` }}
                    >
                      {winningFlight.flight} Flight
                    </td>
                    <td 
                      className="p-3 text-right font-bold"
                      style={{ color: textCol, fontSize: `${tableSize}px` }}
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
  const bgColor = settings.elementColors?.recentActivityBg || '#4a7a8f';
  const headerBg = settings.elementColors?.tableHeaderBg || settings.colors.secondaryColor;
  const rowAltBg = settings.elementColors?.tableRowAlt || settings.colors.accentColor;
  const textCol = settings.elementColors?.textColor || settings.colors.primaryColor;
  
  // Individual slide customization
  const custom = settings.slideCustomization?.recentActivity || DEFAULT_SETTINGS.slideCustomization!.recentActivity!;
  const titleText = custom.title || 'Who Got Points Recently';
  const rowCount = custom.rowCount || 12;
  const tableSize = custom.tableFontSize || 16;
  const titleSize = custom.titleFontSize || 50;
  
  const recentPoints = data.recentPoints.slice(0, rowCount);

  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-center px-12"
      style={{ backgroundColor: bgColor }}
    >
      <div style={{ transform: `scale(${settings.tableScale || 1})`, transformOrigin: 'center' }}>
        <h1 
          className="font-bold text-white mb-8"
          style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.3)', fontSize: `${titleSize}px` }}
        >
          {titleText}
        </h1>

        <div 
          className="w-full max-w-5xl rounded-lg overflow-hidden border-4"
          style={{ backgroundColor: '#ffffff', borderColor: textCol }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: headerBg }}>
                <th className="p-4 text-left text-white font-bold" style={{ fontSize: `${tableSize}px` }}>Date</th>
                <th className="p-4 text-left text-white font-bold" style={{ fontSize: `${tableSize}px` }}>Name</th>
                <th className="p-4 text-left text-white font-bold" style={{ fontSize: `${tableSize}px` }}>Reason</th>
                <th className="p-4 text-right text-white font-bold" style={{ fontSize: `${tableSize}px` }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {recentPoints.map((point, idx) => (
                <tr
                  key={point.id}
                  style={{
                    backgroundColor: idx % 2 === 0 ? rowAltBg : '#ffffff',
                    borderBottom: idx < recentPoints.length - 1 ? `1px solid ${rowAltBg}` : 'none'
                  }}
                >
                  <td 
                    className="p-4 text-left font-medium"
                    style={{ color: textCol, fontSize: `${tableSize}px` }}
                  >
                    {new Date(point.date).toLocaleDateString('en-GB')}
                  </td>
                  <td 
                    className="p-4 text-left font-medium"
                    style={{ color: textCol, fontSize: `${tableSize}px` }}
                  >
                    {point.cadetName}
                  </td>
                  <td 
                    className="p-4 text-left font-medium"
                    style={{ color: textCol, fontSize: `${tableSize}px` }}
                  >
                    {point.reason}
                  </td>
                  <td 
                    className="p-4 text-right font-bold"
                    style={{ color: textCol, fontSize: `${tableSize * 1.125}px` }}
                  >
                    {point.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// SLIDE 3: Complete Leaderboard
function SlideCompleteLeaderboard({ data, settings }: { data: LeaderboardData; settings: PresentationSettings }) {
  const leaderboard = data.cadetLeaderboard || [];
  const headerBg = settings.elementColors?.tableHeaderBg || settings.colors.secondaryColor;
  const rowAltBg = settings.elementColors?.tableRowAlt || settings.colors.accentColor;
  const textCol = settings.elementColors?.textColor || settings.colors.primaryColor;
  
  // Individual slide customization
  const custom = settings.slideCustomization?.completeLeaderboard || DEFAULT_SETTINGS.slideCustomization!.completeLeaderboard!;
  const titleText = custom.title || 'Complete Leaderboard';
  const tableSize = custom.tableFontSize || 16;
  const titleSize = custom.titleFontSize || 50;

  if (leaderboard.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full text-4xl" style={{ color: textCol }}>
        Loading leaderboard...
      </div>
    );
  }

  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: '#ffffff' }}
    >
      <div style={{ transform: `scale(${settings.tableScale || 1})`, transformOrigin: 'center', width: '100%', maxWidth: '1280px' }}>
        <h1 
          className="font-bold mb-8 text-center"
          style={{ color: textCol, fontSize: `${titleSize}px` }}
        >
          {titleText}
        </h1>

        <div 
          className="w-full rounded-lg overflow-hidden border-2"
          style={{ borderColor: headerBg, maxHeight: '70vh', overflowY: 'auto' }}
        >
          <table className="w-full">
            <thead style={{ position: 'sticky', top: 0 }}>
              <tr style={{ backgroundColor: headerBg }}>
                <th className="p-3 text-center text-white font-bold" style={{ fontSize: `${tableSize}px` }}>Rank</th>
                <th className="p-3 text-left text-white font-bold" style={{ fontSize: `${tableSize}px` }}>Cadet Name</th>
                <th className="p-3 text-center text-white font-bold" style={{ fontSize: `${tableSize}px` }}>Flight points</th>
                <th className="p-3 text-center text-white font-bold" style={{ fontSize: `${tableSize}px` }}>Attendance</th>
                <th className="p-3 text-center text-white font-bold" style={{ fontSize: `${tableSize}px` }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((cadet, idx) => (
                <tr
                  key={cadet.name}
                  style={{
                    backgroundColor: idx % 2 === 0 ? rowAltBg : '#ffffff',
                    borderBottom: `1px solid ${headerBg}`
                  }}
                >
                  <td 
                    className="p-3 text-center font-bold"
                    style={{ color: textCol, fontSize: `${tableSize}px` }}
                  >
                    {idx + 1}
                  </td>
                  <td 
                    className="p-3 text-left font-medium"
                    style={{ color: textCol, fontSize: `${tableSize}px` }}
                  >
                    {cadet.name}
                  </td>
                  <td 
                    className="p-3 text-center font-medium"
                    style={{ color: textCol, fontSize: `${tableSize}px` }}
                  >
                    {cadet.points}
                  </td>
                  <td 
                    className="p-3 text-center font-medium"
                    style={{ color: textCol, fontSize: `${tableSize}px` }}
                  >
                    0
                  </td>
                  <td 
                    className="p-3 text-center font-bold"
                    style={{ color: textCol, fontSize: `${tableSize}px` }}
                  >
                    {cadet.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
