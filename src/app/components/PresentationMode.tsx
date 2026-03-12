import { useState, useEffect, useCallback, useRef, CSSProperties } from 'react';
import { api } from '../../utils/api';

/* ═══════════════════════════════════════════════════════════════
   PRESENTATION MODE
   Full-screen, PowerPoint-style slideshow for hall display.
   Dark slate / gold / green theme throughout.

   Slides:
     1. Flight Point Totals & Winners
     2. Top Cadets & Flight of the Month (combined)
     3. Complete Cadet Leaderboard
     4. Rising Stars (top gainers this week)
     5. Flight Race (bar chart — sorted by points)
     6. Weekly Comparison (this week vs last week)
     7. Attendance Streaks
     8. Recent Points Activity
     9. Rewards (from database)

   Controls:
     Arrow keys  – navigate slides
     Space       – pause / resume auto-advance
     Escape      – exit presentation
   ═══════════════════════════════════════════════════════════════ */

/* ─── Types ─── */
interface LeaderboardEntry {
  name: string;
  points: number;
  flight?: string;
  flightPoints?: number;
  attendancePoints?: number;
  totalPoints?: number;
}

interface LeaderboardData {
  winningCadet?: { name: string; points: number };
  winningFlight?: { flight: string; points: number };
  cadetLeaderboard: LeaderboardEntry[];
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
  detailedLeaderboard?: LeaderboardEntry[];
}

interface Reward {
  id: string;
  title: string;
  howToWin: string;
  prize: string;
  endsAt?: string | null;
  winnerName?: string | null;
}

interface PresentationStats {
  risingStars: Array<{ name: string; flight: string; weekPoints: number }>;
  thisWeekFlights: Array<{ flight: string; points: number }>;
  lastWeekFlights: Array<{ flight: string; points: number }>;
  attendanceStreaks: Array<{ name: string; streak: number }>;
  flightOfTheMonth: Array<{ month: string; flight: string; points: number }>;
}

/* ─── Configuration ─── */
const SLIDE_COUNT = 9;
const AUTO_ADVANCE_MS = 15000;
const DATA_REFRESH_MS = 30000;

/* ─── Base theme (control bar, loading, medals) ─── */
const BASE_THEME = {
  /* Backgrounds */
  darkBg: '#2d3a45',       // dark slate
  cardBg: 'rgba(255,255,255,0.06)',
  /* Accents */
  gold: '#FFD700',
  goldDim: '#d4af37',
  green: '#22c55e',
  greenDim: '#16a34a',
  red: '#ef4444',
  amber: '#f59e0b',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  /* Text */
  white: '#ffffff',
  textLight: 'rgba(255,255,255,0.85)',
  textMuted: 'rgba(255,255,255,0.5)',
  /* Table */
  headerBg: '#3d4f5f',
  rowEven: 'rgba(255,255,255,0.05)',
  rowOdd: 'rgba(255,255,255,0.02)',
  border: 'rgba(255,255,255,0.15)',
  borderStrong: 'rgba(255,255,255,0.25)',
};

const T = BASE_THEME;

/* ─── Per-slide colour themes (accessible, high-contrast palettes) ─── */
interface SlideTheme {
  bg: string; accent: string; accentDim: string; text: string; textMuted: string;
  headerBg: string; rowEven: string; rowOdd: string;
  border: string; borderStrong: string; cardBg: string;
  positive: string; negative: string;
}

const SLIDE_THEMES: SlideTheme[] = [
  /* 1 Navy + Cyan (lightened) */          { bg:'#1a2d42', accent:'#22d3ee', accentDim:'#06b6d4', text:'#e0f2fe', textMuted:'rgba(224,242,254,0.65)', headerBg:'#264a6e', rowEven:'rgba(34,211,238,0.12)', rowOdd:'rgba(34,211,238,0.05)', border:'rgba(34,211,238,0.25)', borderStrong:'rgba(34,211,238,0.4)', cardBg:'rgba(34,211,238,0.08)', positive:'#22d3ee', negative:'#fb923c' },
  /* 2 Emerald Light (from 3) */           { bg:'#1c2e40', accent:'#34d399', accentDim:'#10b981', text:'#e2e8f0', textMuted:'rgba(226,232,240,0.65)', headerBg:'#2a4a6a', rowEven:'rgba(52,211,153,0.12)', rowOdd:'rgba(52,211,153,0.05)', border:'rgba(52,211,153,0.25)', borderStrong:'rgba(52,211,153,0.4)', cardBg:'rgba(52,211,153,0.08)', positive:'#34d399', negative:'#fb923c' },
  /* 3 Slate + Emerald (lightened) */      { bg:'#1a2844', accent:'#34d399', accentDim:'#10b981', text:'#e2e8f0', textMuted:'rgba(226,232,240,0.65)', headerBg:'#2c4872', rowEven:'rgba(52,211,153,0.12)', rowOdd:'rgba(52,211,153,0.05)', border:'rgba(52,211,153,0.25)', borderStrong:'rgba(52,211,153,0.4)', cardBg:'rgba(52,211,153,0.08)', positive:'#34d399', negative:'#fb923c' },
  /* 4 Sky Blue Light (from 6) */          { bg:'#1c2638', accent:'#38bdf8', accentDim:'#0ea5e9', text:'#f1f5f9', textMuted:'rgba(241,245,249,0.65)', headerBg:'#2a3d55', rowEven:'rgba(56,189,248,0.12)', rowOdd:'rgba(56,189,248,0.05)', border:'rgba(56,189,248,0.25)', borderStrong:'rgba(56,189,248,0.4)', cardBg:'rgba(56,189,248,0.08)', positive:'#38bdf8', negative:'#fb923c' },
  /* 5 Teal + Orange (lightened) */        { bg:'#0e3f3e', accent:'#fb923c', accentDim:'#ea580c', text:'#ccfbf1', textMuted:'rgba(204,251,241,0.65)', headerBg:'#1e5e5a', rowEven:'rgba(251,146,60,0.12)', rowOdd:'rgba(251,146,60,0.05)', border:'rgba(251,146,60,0.25)', borderStrong:'rgba(251,146,60,0.4)', cardBg:'rgba(251,146,60,0.08)', positive:'#34d399', negative:'#f87171' },
  /* 6 Steel + Sky Blue (lightened) */     { bg:'#1a2538', accent:'#38bdf8', accentDim:'#0ea5e9', text:'#f1f5f9', textMuted:'rgba(241,245,249,0.65)', headerBg:'#2d4156', rowEven:'rgba(56,189,248,0.12)', rowOdd:'rgba(56,189,248,0.05)', border:'rgba(56,189,248,0.25)', borderStrong:'rgba(56,189,248,0.4)', cardBg:'rgba(56,189,248,0.08)', positive:'#38bdf8', negative:'#fb923c' },
  /* 7 Cyan Light (from 1) */              { bg:'#1c3248', accent:'#22d3ee', accentDim:'#06b6d4', text:'#e0f2fe', textMuted:'rgba(224,242,254,0.65)', headerBg:'#28506e', rowEven:'rgba(34,211,238,0.12)', rowOdd:'rgba(34,211,238,0.05)', border:'rgba(34,211,238,0.25)', borderStrong:'rgba(34,211,238,0.4)', cardBg:'rgba(34,211,238,0.08)', positive:'#22d3ee', negative:'#fb923c' },
  /* 8 Orange Light (from 5) */            { bg:'#162e2e', accent:'#fb923c', accentDim:'#ea580c', text:'#ccfbf1', textMuted:'rgba(204,251,241,0.65)', headerBg:'#204846', rowEven:'rgba(251,146,60,0.12)', rowOdd:'rgba(251,146,60,0.05)', border:'rgba(251,146,60,0.25)', borderStrong:'rgba(251,146,60,0.4)', cardBg:'rgba(251,146,60,0.08)', positive:'#34d399', negative:'#f87171' },
  /* 9 Electric Blue (lightened) */        { bg:'#141824', accent:'#60a5fa', accentDim:'#3b82f6', text:'#f1f5f9', textMuted:'rgba(241,245,249,0.65)', headerBg:'#253550', rowEven:'rgba(96,165,250,0.12)', rowOdd:'rgba(96,165,250,0.05)', border:'rgba(96,165,250,0.25)', borderStrong:'rgba(96,165,250,0.4)', cardBg:'rgba(96,165,250,0.08)', positive:'#60a5fa', negative:'#fca5a5' },
];

/* ─── Font ─── */
const FONT = "'Aptos', 'Calibri', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const SLIDE_NAMES = [
  'Flight Points',
  'Top Cadets',
  'Leaderboard',
  'Rising Cadets',
  'Flight Race',
  'Weekly Comparison',
  'Attendance Streaks',
  'Recent Points',
  'Rewards',
];

/* ─── Flight config ─── */
const FLIGHT_ORDER: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, 'hq': 99 };
const FLIGHT_COLORS: Record<string, string> = {
  '1': '#e74c3c',
  '2': '#3498db',
  '3': '#2ecc71',
  '4': '#f39c12',
  'hq': '#9b59b6',
};

function flightSortKey(f: string): number {
  return FLIGHT_ORDER[f?.toLowerCase()] ?? 50;
}

function flightLabel(f: string): string {
  if (!f) return 'Unknown';
  if (f.toLowerCase() === 'hq') return 'Staff / HQ';
  return `${f} Flight`;
}

function flightColor(f: string): string {
  return FLIGHT_COLORS[f?.toLowerCase()] ?? '#888';
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m) - 1]} ${y}`;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function PresentationMode({ onClose, slideDurations = [15000, 15000, 20000, 15000, 15000, 15000, 15000, 15000, 15000], leaderboardScrollMultiplier = 1 }: { onClose: () => void; slideDurations?: number[]; leaderboardScrollMultiplier?: number }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [stats, setStats] = useState<PresentationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [prevSlide, setPrevSlide] = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const barTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Data ── */
  const fetchData = useCallback(async () => {
    try {
      const [leaderboard, rewardsData, statsData] = await Promise.all([
        api.getLeaderboards(),
        api.getRewards().catch(() => []),
        api.getPresentationStats().catch(() => null),
      ]);
      setData(leaderboard);
      setRewards(Array.isArray(rewardsData) ? rewardsData : []);
      setStats(statsData);
    } catch (err) {
      console.error('Presentation: fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, DATA_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  /* ── Slide change with transition ── */
  const goToSlide = useCallback((next: number) => {
    setSlide(prev => {
      setPrevSlide(prev);
      setTransitioning(true);
      setTimeout(() => { setTransitioning(false); setPrevSlide(null); }, 600);
      return next;
    });
  }, []);

  /* ── Auto-advance ── */
  useEffect(() => {
    if (paused || loading) return;
    
    // Calculate duration for this slide
    // Slide 2 (leaderboard) has extended duration for table scrolling (unless < 12 cadets)
    let duration = slideDurations[slide] || slideDurations[0];
    if (slide === 2 && data?.cadetLeaderboard) {
      const cadets = data.detailedLeaderboard?.length || data.cadetLeaderboard?.length || 0;
      if (cadets > 12) {
        // ~2 seconds per 10 cadets for slow viewing, but advance at 85% to avoid blank screen
        const fullDuration = Math.max(30000, Math.ceil((cadets / 10) * 20000));
        duration = Math.round(fullDuration * leaderboardScrollMultiplier * 0.85);
      }
    }
    
    const id = setTimeout(() => goToSlide((slide + 1) % SLIDE_COUNT), duration);
    return () => clearTimeout(id);
  }, [paused, loading, slideDurations, slide, data, leaderboardScrollMultiplier, goToSlide]);

  /* ── Keyboard ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { exitAndClose(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { goToSlide((slide + 1) % SLIDE_COUNT); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { goToSlide((slide - 1 + SLIDE_COUNT) % SLIDE_COUNT); }
      else if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Auto-hide controls bar ── */
  useEffect(() => {
    const showBar = () => {
      setBarVisible(true);
      if (barTimerRef.current) clearTimeout(barTimerRef.current);
      barTimerRef.current = setTimeout(() => setBarVisible(false), 3000);
    };
    showBar();
    window.addEventListener('mousemove', showBar);
    window.addEventListener('mousedown', showBar);
    return () => {
      window.removeEventListener('mousemove', showBar);
      window.removeEventListener('mousedown', showBar);
      if (barTimerRef.current) clearTimeout(barTimerRef.current);
    };
  }, []);

  /* ── Fullscreen ── */
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const onFsChange = () => {};
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const exitAndClose = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onClose();
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div style={S.container}>
        <div style={{ ...S.loadingWrap, backgroundColor: T.darkBg }}>
          <div style={S.spinner} />
          <p style={{ color: T.textMuted, fontSize: 28, marginTop: 24, fontFamily: FONT }}>
            Loading presentation data…
          </p>
        </div>
        <style>{animations}</style>
      </div>
    );
  }

  /* ── Slides ── */
  const slides = [
    <SlideFlightPoints key="fp" data={data} theme={SLIDE_THEMES[0]} />,
    <SlidePodiumAndMonth key="pm" data={data} stats={stats} theme={SLIDE_THEMES[1]} />,
    <SlideLeaderboard key="lb" data={data} leaderboardScrollMultiplier={leaderboardScrollMultiplier} theme={SLIDE_THEMES[2]} />,
    <SlideRisingStars key="rs" stats={stats} theme={SLIDE_THEMES[3]} />,
    <SlideFlightRace key="fr" data={data} theme={SLIDE_THEMES[4]} />,
    <SlideWeeklyComparison key="wc" stats={stats} theme={SLIDE_THEMES[5]} />,
    <SlideAttendanceStreaks key="as" stats={stats} theme={SLIDE_THEMES[6]} />,
    <SlideRecentPoints key="rp" data={data} theme={SLIDE_THEMES[7]} />,
    <SlideRewards key="rw" rewards={rewards} theme={SLIDE_THEMES[8]} />,
  ];

  return (
    <div style={S.container}>
      {/* Previous slide (fading out) */}
      {prevSlide !== null && transitioning && (
        <div style={{ ...S.slideWrap, position: 'absolute' as const, top: 0, left: 0, animation: 'pres-fadeOut 0.6s ease-out forwards', zIndex: 1 }}>
          {slides[prevSlide]}
        </div>
      )}
      {/* Current slide (fading in) */}
      <div key={slide} style={{ ...S.slideWrap, animation: transitioning ? 'pres-fadeIn 0.6s ease-out' : 'none', zIndex: 2 }}>{slides[slide]}</div>
      <div style={{
        ...S.bar,
        transform: barVisible ? 'translateY(0)' : 'translateY(100%)',
        opacity: barVisible ? 1 : 0,
        transition: 'transform 0.4s ease, opacity 0.4s ease',
      }}>
        <div style={S.barInner}>
          <button
            style={S.barBtn}
            onClick={() => goToSlide((slide - 1 + SLIDE_COUNT) % SLIDE_COUNT)}
            title="Previous slide (←)"
          >
            ◀
          </button>
          <button
            style={S.barBtn}
            onClick={() => setPaused(p => !p)}
            title={paused ? 'Resume (Space)' : 'Pause (Space)'}
          >
            {paused ? '▶' : '⏸'}
          </button>
          <button
            style={S.barBtn}
            onClick={() => goToSlide((slide + 1) % SLIDE_COUNT)}
            title="Next slide (→)"
          >
            ▶
          </button>

          {/* Navigation dots */}
          <div style={S.dotsWrap}>
            {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
              <button
                key={i}
                onClick={() => goToSlide(i)}
                title={SLIDE_NAMES[i]}
                style={{
                  width: i === slide ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  backgroundColor: i === slide ? T.gold : 'rgba(255,255,255,0.3)',
                }}
              />
            ))}
          </div>

          <span style={S.slideNum}>{slide + 1} / {SLIDE_COUNT}</span>
          {paused && <span style={{ ...S.pauseLabel, color: T.gold }}>⏸ Paused</span>}

          <button style={S.closeBtn} onClick={exitAndClose} title="Exit presentation (Esc)">
            ✕
          </button>
        </div>
      </div>

      <style>{animations}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 1 — Flight Points Summary
   ═══════════════════════════════════════════════════════════════ */
function SlideFlightPoints({ data, theme }: { data: LeaderboardData | null; theme: SlideTheme }) {
  const T = { ...BASE_THEME, darkBg: theme.bg, gold: theme.accent, goldDim: theme.accentDim, textLight: theme.text, white: theme.text, textMuted: theme.textMuted, headerBg: theme.headerBg, rowEven: theme.rowEven, rowOdd: theme.rowOdd, border: theme.border, borderStrong: theme.borderStrong, cardBg: theme.cardBg, green: theme.positive, greenDim: theme.positive + 'bb', red: theme.negative };
  if (!data) return null;
  const flights = [...(data.flightLeaderboard || [])].sort((a, b) => flightSortKey(a.flight) - flightSortKey(b.flight));
  const cadet = data.winningCadet;
  const flight = data.winningFlight;

  return (
    <div style={{ ...S.slide, backgroundColor: T.darkBg, padding: '36px 48px 70px', justifyContent: 'flex-start' }}>
      <h1 style={{
        fontSize: 64, fontWeight: 'bold', textAlign: 'center' as const,
        color: T.gold, marginBottom: 32, fontFamily: FONT,
      }}>
        Flight Points
      </h1>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56,
        maxWidth: 1500, width: '100%', margin: '0 auto', flex: 1,
        alignContent: 'start',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' as const }}>
          <h2 style={{ fontSize: 40, fontWeight: 'bold', color: T.textLight, marginBottom: 20, fontFamily: FONT }}>
            Flight Point Totals
          </h2>
          <PPTable
            headers={['Flight', 'Points']}
            rows={flights.map(f => [flightLabel(f.flight), String(f.points)])}
            aligns={['left', 'right']}
            fontSize={34}
            theme={theme}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' as const }}>
          <h2 style={{ fontSize: 40, fontWeight: 'bold', color: T.textLight, marginBottom: 20, fontFamily: FONT }}>
            Who Has the Most Points
          </h2>
          {cadet && (
            <div style={{ marginBottom: 28 }}>
              <PPTable
                headers={['Winning Cadet', 'Points']}
                rows={[[cadet.name, String(cadet.points)]]}
                aligns={['left', 'right']}
                fontSize={34}
                theme={theme}
              />
            </div>
          )}
          {flight && (
            <PPTable
              headers={['Winning Flight', 'Points']}
              rows={[[flightLabel(flight.flight), String(flight.points)]]}
              aligns={['left', 'right']}
              fontSize={34}
              theme={theme}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 2 — Top 3 Podium + Flight of the Month (combined)
   1st place = tallest podium. Handles joint winners (ties).
   ═══════════════════════════════════════════════════════════════ */
function SlidePodiumAndMonth({ data, stats, theme }: { data: LeaderboardData | null; stats: PresentationStats | null; theme: SlideTheme }) {
  const T = { ...BASE_THEME, darkBg: theme.bg, gold: theme.accent, goldDim: theme.accentDim, textLight: theme.text, white: theme.text, textMuted: theme.textMuted, headerBg: theme.headerBg, rowEven: theme.rowEven, rowOdd: theme.rowOdd, border: theme.border, borderStrong: theme.borderStrong, cardBg: theme.cardBg, green: theme.positive, greenDim: theme.positive + 'bb', red: theme.negative };
  if (!data) return null;

  const entries = data.detailedLeaderboard && data.detailedLeaderboard.length > 0
    ? [...data.detailedLeaderboard]
    : data.cadetLeaderboard.map(c => ({ ...c, totalPoints: c.points }));

  entries.sort((a, b) => (b.totalPoints ?? b.points) - (a.totalPoints ?? a.points));

  // Group cadets by tied points to find medal positions (handling joint winners, max 5 per position)
  const podiumGroups: Array<{ medal: number; cadets: typeof entries; points: number }> = [];
  let currentIdx = 0;
  let medalsAssigned = 0;
  while (currentIdx < entries.length && medalsAssigned < 3) {
    const currentPoints = entries[currentIdx].totalPoints ?? entries[currentIdx].points;
    const tiedCadets: typeof entries = [];
    let tempIdx = currentIdx;
    // Collect all with same points, but max 5
    while (tempIdx < entries.length && (entries[tempIdx].totalPoints ?? entries[tempIdx].points) === currentPoints && tiedCadets.length < 5) {
      tiedCadets.push(entries[tempIdx]);
      tempIdx++;
    }
    podiumGroups.push({ medal: medalsAssigned + 1, cadets: tiedCadets, points: currentPoints });
    currentIdx = tempIdx;
    medalsAssigned++;
  }

  const medalColors = [T.gold, T.silver, T.bronze];
  const medalLabels = ['1st', '2nd', '3rd'];
  const podiumHeights = [340, 260, 210];
  // Display order: 2nd, 1st, 3rd (1st in the centre)
  const displayOrder = podiumGroups.length >= 3 ? [1, 0, 2] : podiumGroups.length === 2 ? [1, 0] : [0];

  const months = stats?.flightOfTheMonth || [];

  return (
    <div style={{ ...S.slide, backgroundColor: T.darkBg, padding: '24px 60px 70px', justifyContent: 'flex-start' }}>
      <h1 style={{
        fontSize: 56, fontWeight: 'bold', color: T.gold,
        textAlign: 'center' as const, marginBottom: 12, fontFamily: FONT,
      }}>
        Top Cadets
      </h1>

      {/* Podium — pushed to top */}
      {podiumGroups.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          gap: 36, flex: 1, paddingBottom: 16,
        }}>
          {displayOrder.map(idx => {
            const group = podiumGroups[idx];
            if (!group) return null;
            const color = medalColors[idx] || '#888';
            const height = podiumHeights[idx] || 180;
            const isJointWinner = group.cadets.length > 1;
            return (
              <div key={idx} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              }}>
                {/* Medal circle */}
                <div style={{
                  width: 96, height: 96, borderRadius: '50%',
                  backgroundColor: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 34, fontWeight: 'bold', color: '#1a1a1a',
                  fontFamily: FONT,
                  boxShadow: `0 4px 24px ${color}88`,
                }}>
                  {medalLabels[idx]}
                </div>
                {/* Names — all joint winners (display vertically if many) */}
                <div style={{
                  fontSize: group.cadets.length > 2 ? 18 : group.cadets.length > 1 ? 20 : 28,
                  fontWeight: 'bold', color: T.white,
                  fontFamily: FONT, textAlign: 'center' as const, maxWidth: 240,
                  lineHeight: 1.3,
                }}>
                  {group.cadets.length <= 2
                    ? group.cadets.map(c => c.name).join(', ')
                    : group.cadets.map((c, ci) => (
                      <div key={ci} style={{ whiteSpace: 'normal' as const }}>
                        {c.name}
                      </div>
                    ))}
                </div>
                {/* Points */}
                <div style={{
                  fontSize: 22, color: T.textMuted, fontFamily: FONT,
                }}>
                  {group.points} pts
                </div>
                {/* Podium block */}
                <div style={{
                  width: 190, height,
                  background: `linear-gradient(180deg, ${color}, ${color}88)`,
                  borderRadius: '14px 14px 0 0',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                  paddingTop: 20, fontSize: 52, fontWeight: 'bold',
                  color: '#1a1a1a', fontFamily: FONT,
                  boxShadow: `0 -4px 24px ${color}44`,
                }}>
                  {idx + 1}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Flight of the Month — compact cards row */}
      {months.length > 0 && (
        <div style={{ width: '100%', maxWidth: 1300, marginTop: 4 }}>
          <h2 style={{
            fontSize: 26, fontWeight: 'bold', color: T.gold,
            textAlign: 'center' as const, marginBottom: 14, fontFamily: FONT,
            textTransform: 'uppercase' as const, letterSpacing: 2,
          }}>
            Flight of the Month
          </h2>
          <div style={{
            display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' as const,
          }}>
            {months.slice(0, 6).map((m, i) => {
              const color = flightColor(m.flight);
              const isCurrent = i === 0;
              return (
                <div key={i} style={{
                  backgroundColor: T.cardBg,
                  border: isCurrent ? `2px solid ${T.gold}` : `1px solid ${T.border}`,
                  borderRadius: 12, padding: '14px 28px',
                  textAlign: 'center' as const, minWidth: 160,
                  boxShadow: isCurrent ? `0 0 16px ${T.gold}33` : 'none',
                }}>
                  <div style={{
                    fontSize: 14, color: T.textMuted,
                    fontFamily: FONT, marginBottom: 4, textTransform: 'uppercase' as const,
                    letterSpacing: 1,
                  }}>
                    {monthLabel(m.month)}
                  </div>
                  <div style={{
                    fontSize: 24, fontWeight: 'bold', color,
                    fontFamily: FONT,
                  }}>
                    {flightLabel(m.flight)}
                  </div>
                  <div style={{
                    fontSize: 16, color: T.textMuted, fontFamily: FONT,
                  }}>
                    {m.points} pts
                  </div>
                  {isCurrent && (
                    <div style={{
                      marginTop: 4, fontSize: 12, color: T.gold,
                      fontWeight: 'bold', fontFamily: FONT,
                      textTransform: 'uppercase' as const, letterSpacing: 2,
                    }}>
                      Current
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 3 — Complete Leaderboard
   Single table by default; splits if > 20 cadets.
   ═══════════════════════════════════════════════════════════════ */
function SlideLeaderboard({ data, leaderboardScrollMultiplier = 1, theme }: { data: LeaderboardData | null; leaderboardScrollMultiplier?: number; theme: SlideTheme }) {
  const T = { ...BASE_THEME, darkBg: theme.bg, gold: theme.accent, goldDim: theme.accentDim, textLight: theme.text, white: theme.text, textMuted: theme.textMuted, headerBg: theme.headerBg, rowEven: theme.rowEven, rowOdd: theme.rowOdd, border: theme.border, borderStrong: theme.borderStrong, cardBg: theme.cardBg, green: theme.positive, greenDim: theme.positive + 'bb', red: theme.negative };
  if (!data) return null;

  const entries: LeaderboardEntry[] = data.detailedLeaderboard && data.detailedLeaderboard.length > 0
    ? [...data.detailedLeaderboard]
    : data.cadetLeaderboard.map(c => ({
        ...c, flightPoints: c.points, attendancePoints: 0, totalPoints: c.points,
      }));

  entries.sort((a, b) => (b.totalPoints ?? b.points) - (a.totalPoints ?? a.points));

  const useTwoColumns = entries.length > 20;
  const headers = ['Rank', 'Cadet Name', 'Points', 'Attendance', 'Total'];
  const aligns: Array<'left' | 'center' | 'right'> = ['center', 'left', 'center', 'center', 'center'];

  const toRows = (list: LeaderboardEntry[], startRank: number) =>
    list.map((e, i) => [
      String(startRank + i),
      e.name,
      String(e.flightPoints ?? e.points),
      String(e.attendancePoints ?? 0),
      String(e.totalPoints ?? e.points),
    ]);

  if (useTwoColumns) {
    const half = Math.ceil(entries.length / 2);
    const left = entries.slice(0, half);
    const right = entries.slice(half);
    const maxRows = Math.max(left.length, right.length);
    const fontSize = maxRows > 25 ? 13 : maxRows > 20 ? 14 : 16;

    return (
      <div style={{ ...S.slide, backgroundColor: T.darkBg, padding: '40px 48px 60px' }}>
        <h1 style={{
          fontSize: 48, fontWeight: 'bold', color: T.gold,
          textAlign: 'center' as const, marginBottom: 24, fontFamily: FONT,
        }}>
          Cadet Leaderboard
        </h1>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32,
          width: '100%', flex: 1, alignContent: 'start',
        }}>
          <div style={{
            borderRadius: 8, overflow: 'hidden',
            maxHeight: 'calc(100vh - 180px)',
          }}>
            <PPTable headers={headers} rows={toRows(left, 1)} aligns={aligns} fontSize={fontSize} compact theme={theme} />
          </div>
          {right.length > 0 && (
            <div style={{
              borderRadius: 8, overflow: 'hidden',
              maxHeight: 'calc(100vh - 180px)',
            }}>
              <PPTable headers={headers} rows={toRows(right, half + 1)} aligns={aligns} fontSize={fontSize} compact theme={theme} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const fontSize = entries.length > 15 ? 17 : 20;
  // Estimate scroll duration: ~2 seconds per 10 rows for slow viewing
  // Apply multiplier: 0.5x = 2x faster, 2x = 2x slower
  const scrollDuration = Math.max(30, Math.ceil((entries.length / 10) * 20 * leaderboardScrollMultiplier));

  return (
    <div style={{ ...S.slide, backgroundColor: T.darkBg, padding: '40px 80px 60px' }}>
      <h1 style={{
        fontSize: 48, fontWeight: 'bold', color: T.gold,
        textAlign: 'center' as const, marginBottom: 28, fontFamily: FONT,
      }}>
        Cadet Leaderboard
      </h1>
      <div style={{
        borderRadius: 8, overflow: 'hidden',
        maxWidth: 960, width: '100%', margin: '0 auto',
        maxHeight: 'calc(100vh - 180px)',
        position: 'relative' as const,
      }}>
        <div style={{
          animation: `tableScroll ${scrollDuration}s linear forwards`,
        }}>
          <PPTable headers={headers} rows={toRows(entries, 1)} aligns={aligns} fontSize={fontSize} theme={theme} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 4 — Rising Stars (top gainers this week)
   ═══════════════════════════════════════════════════════════════ */
function SlideRisingStars({ stats, theme }: { stats: PresentationStats | null; theme: SlideTheme }) {
  const T = { ...BASE_THEME, darkBg: theme.bg, gold: theme.accent, goldDim: theme.accentDim, textLight: theme.text, white: theme.text, textMuted: theme.textMuted, headerBg: theme.headerBg, rowEven: theme.rowEven, rowOdd: theme.rowOdd, border: theme.border, borderStrong: theme.borderStrong, cardBg: theme.cardBg, green: theme.positive, greenDim: theme.positive + 'bb', red: theme.negative };
  // Use monthly risers if available, else fall back to weekly
  const stars = (stats as any)?.risingCadets?.length > 0
    ? (stats as any).risingCadets as Array<{ name: string; flight: string; monthPoints: number }>
    : null;
  const weekStars = stats?.risingStars || [];

  // Normalise into common shape
  const items = stars
    ? stars.map(s => ({ name: s.name, flight: s.flight, points: s.monthPoints }))
    : weekStars.map(s => ({ name: s.name, flight: s.flight, points: s.weekPoints }));

  const periodLabel = stars ? 'Top point earners this month' : 'Top point earners this month';

  // Colour for 4th+ place — cornflower blue
  const fourthPlus = '#6495ED';
  const fourthPlusDim = '#4a75c7';

  return (
    <div style={{ ...S.slide, backgroundColor: T.darkBg, padding: '36px 60px 70px' }}>
      <h1 style={{
        fontSize: 56, fontWeight: 'bold', color: T.gold,
        textAlign: 'center' as const, marginBottom: 8, fontFamily: FONT,
      }}>
        Rising Cadets
      </h1>
      <p style={{
        fontSize: 24, color: T.textMuted, textAlign: 'center' as const,
        marginBottom: 32, fontFamily: FONT,
      }}>
        {periodLabel}
      </p>

      {items.length === 0 ? (
        <p style={{ fontSize: 28, color: T.textMuted, fontFamily: FONT, textAlign: 'center' as const }}>
          No points awarded this month yet.
        </p>
      ) : (
        <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
          {items.slice(0, 10).map((s, i) => {
            const maxPts = items[0]?.points || 1;
            const pct = Math.max(8, (s.points / maxPts) * 100);
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 20,
                marginBottom: 14, fontFamily: FONT,
              }}>
                <span style={{
                  fontSize: 28, fontWeight: 'bold', color: T.textLight,
                  width: 44, textAlign: 'right' as const,
                }}>
                  {i + 1}.
                </span>
                <span style={{
                  fontSize: 28, fontWeight: 'bold', color: T.white,
                  width: 260, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}>
                  {s.name}
                </span>
                <div style={{
                  flex: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.08)',
                  borderRadius: 8, overflow: 'hidden', position: 'relative' as const,
                }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    background: i === 0
                      ? `linear-gradient(90deg, ${T.gold}, ${T.goldDim})`
                      : i === 1
                        ? `linear-gradient(90deg, ${T.silver}, #a8a8a8)`
                        : i === 2
                          ? `linear-gradient(90deg, ${T.bronze}, #b06828)`
                          : `linear-gradient(90deg, ${fourthPlus}, ${fourthPlusDim})`,
                    borderRadius: 8,
                    transition: 'width 0.5s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    paddingRight: 14,
                  }}>
                    <span style={{
                      fontSize: 22, fontWeight: 'bold',
                      color: i < 3 ? '#1a1a1a' : '#fff',
                    }}>
                      {s.points} pts
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 5 — Flight Race (sorted by most points at top)
   ═══════════════════════════════════════════════════════════════ */
function SlideFlightRace({ data, theme }: { data: LeaderboardData | null; theme: SlideTheme }) {
  const T = { ...BASE_THEME, darkBg: theme.bg, gold: theme.accent, goldDim: theme.accentDim, textLight: theme.text, white: theme.text, textMuted: theme.textMuted, headerBg: theme.headerBg, rowEven: theme.rowEven, rowOdd: theme.rowOdd, border: theme.border, borderStrong: theme.borderStrong, cardBg: theme.cardBg, green: theme.positive, greenDim: theme.positive + 'bb', red: theme.negative };
  if (!data) return null;
  const flights = [...(data.flightLeaderboard || [])]
    .filter(f => f.flight?.toLowerCase() !== 'hq')
    .sort((a, b) => b.points - a.points); // Most points at top

  const maxPts = Math.max(...flights.map(f => f.points), 1);

  return (
    <div style={{ ...S.slide, backgroundColor: T.darkBg, padding: '48px 80px 60px' }}>
      <h1 style={{
        fontSize: 52, fontWeight: 'bold', color: T.gold,
        textAlign: 'center' as const, marginBottom: 48, fontFamily: FONT,
      }}>
        The Flight Race
      </h1>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 28,
        maxWidth: 1000, width: '100%', margin: '0 auto', flex: 1,
        justifyContent: 'center',
      }}>
        {flights.map((f, i) => {
          const pct = Math.max(5, (f.points / maxPts) * 100);
          const color = flightColor(f.flight);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <span style={{
                fontSize: 28, fontWeight: 'bold', color: T.white,
                width: 120, textAlign: 'right' as const, fontFamily: FONT,
              }}>
                {flightLabel(f.flight)}
              </span>
              <div style={{
                flex: 1, height: 56, backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 10, overflow: 'hidden', position: 'relative' as const,
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                  borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  paddingRight: 16,
                  boxShadow: `0 2px 12px ${color}66`,
                  transition: 'width 0.6s ease',
                }}>
                  <span style={{
                    fontSize: 24, fontWeight: 'bold', color: '#fff',
                    fontFamily: FONT,
                    textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }}>
                    {f.points} pts
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 6 — Weekly Comparison (this week vs last week)
   ═══════════════════════════════════════════════════════════════ */
function SlideWeeklyComparison({ stats, theme }: { stats: PresentationStats | null; theme: SlideTheme }) {
  const T = { ...BASE_THEME, darkBg: theme.bg, gold: theme.accent, goldDim: theme.accentDim, textLight: theme.text, white: theme.text, textMuted: theme.textMuted, headerBg: theme.headerBg, rowEven: theme.rowEven, rowOdd: theme.rowOdd, border: theme.border, borderStrong: theme.borderStrong, cardBg: theme.cardBg, green: theme.positive, greenDim: theme.positive + 'bb', red: theme.negative };
  const thisWeek = stats?.thisWeekFlights || [];
  const lastWeek = stats?.lastWeekFlights || [];

  const allFlights = new Set([...thisWeek.map(f => f.flight), ...lastWeek.map(f => f.flight)]);
  const rows = [...allFlights]
    .filter(f => f?.toLowerCase() !== 'hq')
    .sort((a, b) => flightSortKey(a) - flightSortKey(b))
    .map(flight => {
      const tw = thisWeek.find(f => f.flight === flight)?.points ?? 0;
      const lw = lastWeek.find(f => f.flight === flight)?.points ?? 0;
      const diff = tw - lw;
      return { flight, thisWeek: tw, lastWeek: lw, diff };
    });

  return (
    <div style={{ ...S.slide, backgroundColor: T.darkBg, padding: '48px 80px 60px' }}>
      <h1 style={{
        fontSize: 48, fontWeight: 'bold', color: T.gold,
        textAlign: 'center' as const, marginBottom: 8, fontFamily: FONT,
      }}>
        Weekly Comparison
      </h1>
      <p style={{
        fontSize: 20, color: T.textMuted, textAlign: 'center' as const,
        marginBottom: 32, fontFamily: FONT,
      }}>
        This week vs last week
      </p>

      <div style={{ maxWidth: 900, width: '100%', margin: '0 auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: `2px solid ${T.borderStrong}` }}>
          <thead>
            <tr>
              {['Flight', 'Last Week', 'This Week', 'Change'].map((h, i) => (
                <th key={i} style={{
                  backgroundColor: T.headerBg, color: T.gold,
                  fontWeight: 'bold', fontSize: 24, padding: '14px 18px',
                  textAlign: i === 0 ? 'left' : 'center' as const,
                  fontFamily: FONT, borderRight: i < 3 ? `1px solid ${T.border}` : 'none',
                  borderBottom: `2px solid ${T.borderStrong}`,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                <td style={{
                  backgroundColor: ri % 2 === 0 ? T.rowEven : T.rowOdd,
                  fontSize: 24, fontWeight: 'bold', padding: '14px 18px',
                  borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
                  fontFamily: FONT, color: T.white,
                }}>
                  {flightLabel(r.flight)}
                </td>
                <td style={{
                  backgroundColor: ri % 2 === 0 ? T.rowEven : T.rowOdd,
                  fontSize: 24, textAlign: 'center' as const, padding: '14px 18px',
                  borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
                  fontFamily: FONT, color: T.textLight,
                }}>
                  {r.lastWeek}
                </td>
                <td style={{
                  backgroundColor: ri % 2 === 0 ? T.rowEven : T.rowOdd,
                  fontSize: 24, fontWeight: 'bold', textAlign: 'center' as const,
                  padding: '14px 18px',
                  borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
                  fontFamily: FONT, color: T.white,
                }}>
                  {r.thisWeek}
                </td>
                <td style={{
                  backgroundColor: ri % 2 === 0 ? T.rowEven : T.rowOdd,
                  fontSize: 24, fontWeight: 'bold', textAlign: 'center' as const,
                  padding: '14px 18px',
                  borderTop: `1px solid ${T.border}`,
                  fontFamily: FONT,
                  color: r.diff > 0 ? T.green : r.diff < 0 ? T.red : T.textMuted,
                }}>
                  {r.diff > 0 ? `▲ +${r.diff}` : r.diff < 0 ? `▼ ${r.diff}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 7 — Attendance Streaks
   Shows current streaks and the record holder(s) for longest streak.
   ═══════════════════════════════════════════════════════════════ */
function SlideAttendanceStreaks({ stats, theme }: { stats: PresentationStats | null; theme: SlideTheme }) {
  const T = { ...BASE_THEME, darkBg: theme.bg, gold: theme.accent, goldDim: theme.accentDim, textLight: theme.text, white: theme.text, textMuted: theme.textMuted, headerBg: theme.headerBg, rowEven: theme.rowEven, rowOdd: theme.rowOdd, border: theme.border, borderStrong: theme.borderStrong, cardBg: theme.cardBg, green: theme.positive, greenDim: theme.positive + 'bb', red: theme.negative };
  const streaks = stats?.attendanceStreaks || [];
  const top = streaks.slice(0, 8);

  // Find the record holder(s) — longest streak (could be tied)
  const recordStreak = streaks.length > 0 ? Math.max(...streaks.map(s => s.streak)) : 0;
  const recordHolders = streaks.filter(s => s.streak === recordStreak);

  return (
    <div style={{ ...S.slide, backgroundColor: T.darkBg, padding: '48px 80px 60px', justifyContent: 'flex-start' }}>
      <h1 style={{
        fontSize: 48, fontWeight: 'bold', color: T.gold,
        textAlign: 'center' as const, marginBottom: 8, fontFamily: FONT,
      }}>
        Attendance Streaks
      </h1>
      <p style={{
        fontSize: 20, color: T.textMuted, textAlign: 'center' as const,
        marginBottom: 32, fontFamily: FONT,
      }}>
        Most consecutive parade nights attended
      </p>

      {streaks.length === 0 ? (
        <p style={{ fontSize: 24, color: T.textMuted, fontFamily: FONT, textAlign: 'center' as const }}>
          No attendance data yet.
        </p>
      ) : (
        <>
          {/* Record Holder Section */}
          {recordHolders.length > 0 && recordStreak > 0 && (
            <div style={{
              backgroundColor: 'rgba(255,215,0,0.12)',
              border: `2px solid ${T.gold}`,
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 24,
              textAlign: 'center' as const,
            }}>
              <div style={{
                fontSize: 16, color: T.gold, fontFamily: FONT,
                textTransform: 'uppercase' as const, letterSpacing: 1,
                marginBottom: 8, fontWeight: 'bold',
              }}>
                🏆 Record Holder{recordHolders.length > 1 ? 's' : ''}
              </div>
              <div style={{
                fontSize: 22, fontWeight: 'bold', color: T.white,
                fontFamily: FONT, marginBottom: 4, lineHeight: 1.4,
              }}>
                {recordHolders.map(h => h.name).join(', ')}
              </div>
              <div style={{
                fontSize: 18, color: T.gold, fontFamily: FONT, fontWeight: 'bold',
              }}>
                {recordStreak} {recordStreak === 1 ? 'night' : 'nights'}
              </div>
            </div>
          )}

          {/* Current Top Streaks */}
          <div style={{ maxWidth: 800, width: '100%', margin: '0 auto' }}>
            <h2 style={{
              fontSize: 24, color: T.textLight, fontFamily: FONT,
              marginBottom: 20, textAlign: 'left' as const,
            }}>
              Current Top Streaks
            </h2>
            {top.map((s, i) => {
              const maxStreak = top[0]?.streak || 1;
              const pct = Math.max(10, (s.streak / maxStreak) * 100);
              const isRecord = s.streak === recordStreak;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  marginBottom: 12, fontFamily: FONT,
                  opacity: isRecord ? 1 : 0.8,
                }}>
                  <span style={{
                    fontSize: 24, fontWeight: 'bold', color: T.white,
                    width: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                  }}>
                    {s.name}
                  </span>
                  <div style={{
                    flex: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.08)',
                    borderRadius: 8, overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${pct}%`, height: '100%',
                      background: isRecord
                        ? `linear-gradient(90deg, ${T.gold}, ${T.goldDim})`
                        : i === 0
                        ? `linear-gradient(90deg, ${T.green}, ${T.greenDim})`
                        : `linear-gradient(90deg, ${T.green}, ${T.greenDim})`,
                      borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                      paddingRight: 14,
                    }}>
                      <span style={{
                        fontSize: 20, fontWeight: 'bold', color: isRecord ? '#1a1a1a' : '#fff',
                        textShadow: isRecord ? 'none' : '0 1px 2px rgba(0,0,0,0.3)',
                      }}>
                        {s.streak} {s.streak === 1 ? 'night' : 'nights'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 8 — Recent Points
   ═══════════════════════════════════════════════════════════════ */
function SlideRecentPoints({ data, theme }: { data: LeaderboardData | null; theme: SlideTheme }) {
  const T = { ...BASE_THEME, darkBg: theme.bg, gold: theme.accent, goldDim: theme.accentDim, textLight: theme.text, white: theme.text, textMuted: theme.textMuted, headerBg: theme.headerBg, rowEven: theme.rowEven, rowOdd: theme.rowOdd, border: theme.border, borderStrong: theme.borderStrong, cardBg: theme.cardBg, green: theme.positive, greenDim: theme.positive + 'bb', red: theme.negative };
  if (!data) return null;
  const recent = data.recentPoints.slice(0, 10);

  return (
    <div style={{ ...S.slide, backgroundColor: T.darkBg, padding: '48px 80px 60px' }}>
      <h1 style={{
        fontSize: 48, fontWeight: 'bold', color: T.gold,
        textAlign: 'center' as const, marginBottom: 32, fontFamily: FONT,
      }}>
        Who Got Points Recently
      </h1>
      <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        <PPTable
          headers={['Date', 'Name', 'Reason', 'Points']}
          rows={recent.map(p => [
            new Date(p.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
            p.cadetName,
            p.reason || '—',
            String(p.points),
          ])}
          aligns={['left', 'left', 'left', 'right']}
          fontSize={22}
          theme={theme}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 9 — Rewards (from database)
   ═══════════════════════════════════════════════════════════════ */
function SlideRewards({ rewards, theme }: { rewards: Reward[]; theme: SlideTheme }) {
  const T = { ...BASE_THEME, darkBg: theme.bg, gold: theme.accent, goldDim: theme.accentDim, textLight: theme.text, white: theme.text, textMuted: theme.textMuted, headerBg: theme.headerBg, rowEven: theme.rowEven, rowOdd: theme.rowOdd, border: theme.border, borderStrong: theme.borderStrong, cardBg: theme.cardBg, green: theme.positive, greenDim: theme.positive + 'bb', red: theme.negative };
  const now = Date.now();
  const activeRewards = rewards.filter(r => {
    if (!r.endsAt) return true;
    return new Date(r.endsAt).getTime() >= now;
  });

  return (
    <div style={{ ...S.slide, backgroundColor: T.darkBg, padding: '48px 80px 60px' }}>
      <h1 style={{
        fontSize: 48, fontWeight: 'bold', color: T.gold,
        textAlign: 'center' as const, marginBottom: 32, fontFamily: FONT,
      }}>
        Rewards
      </h1>

      {activeRewards.length === 0 ? (
        <p style={{ fontSize: 28, color: T.textMuted, fontFamily: FONT }}>No active rewards at the moment.</p>
      ) : (
        <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
          <PPTable
            headers={['Reward', 'How to Win', 'Prize']}
            rows={activeRewards.map(r => [
              r.title || '—',
              r.howToWin || '—',
              r.prize || '—',
            ])}
            aligns={['left', 'left', 'left']}
            fontSize={24}
            theme={theme}
          />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   REUSABLE TABLE — Dark theme with slate/gold styling
   ═══════════════════════════════════════════════════════════════ */
function PPTable({
  headers,
  rows,
  aligns,
  fontSize = 22,
  compact = false,
  theme,
}: {
  headers: string[];
  rows: string[][];
  aligns?: Array<'left' | 'center' | 'right'>;
  fontSize?: number;
  compact?: boolean;
  theme?: SlideTheme;
}) {
  const T = theme ? { ...BASE_THEME, darkBg: theme.bg, gold: theme.accent, goldDim: theme.accentDim, textLight: theme.text, white: theme.text, textMuted: theme.textMuted, headerBg: theme.headerBg, rowEven: theme.rowEven, rowOdd: theme.rowOdd, border: theme.border, borderStrong: theme.borderStrong, cardBg: theme.cardBg, green: theme.positive, greenDim: theme.positive + 'bb', red: theme.negative } : BASE_THEME;
  const pad = compact ? '6px 12px' : '14px 18px';

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', border: `2px solid ${T.borderStrong}` }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{
              backgroundColor: T.headerBg,
              color: T.gold,
              fontWeight: 'bold',
              fontSize,
              padding: pad,
              textAlign: aligns?.[i] || 'left',
              whiteSpace: 'nowrap' as const,
              fontFamily: FONT,
              borderRight: i < headers.length - 1 ? `1px solid ${T.border}` : 'none',
              borderBottom: `2px solid ${T.borderStrong}`,
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length > 0 ? rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} style={{
                backgroundColor: ri % 2 === 0 ? T.rowEven : T.rowOdd,
                color: T.textLight,
                fontSize,
                fontWeight: ci === 0 || ci === row.length - 1 ? 'bold' : 'normal',
                padding: pad,
                textAlign: aligns?.[ci] || 'left',
                borderTop: `1px solid ${T.border}`,
                borderRight: ci < row.length - 1 ? `1px solid ${T.border}` : 'none',
                fontFamily: FONT,
              }}>
                {cell}
              </td>
            ))}
          </tr>
        )) : (
          <tr>
            <td
              colSpan={headers.length}
              style={{ padding: 24, textAlign: 'center' as const, color: T.textMuted, fontSize: fontSize - 2, fontFamily: FONT }}
            >
              No data available
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════ */
const S: Record<string, CSSProperties> = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    overflow: 'hidden',
    fontFamily: FONT,
    backgroundColor: T.darkBg,
  },
  slideWrap: {
    width: '100vw',
    height: '100vh',
    animation: 'pres-fadeSlide 0.5s ease-out',
  },
  slide: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 80px 60px',
    boxSizing: 'border-box',
    overflow: 'hidden',
    fontFamily: FONT,
  },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  spinner: {
    width: 48,
    height: 48,
    border: `4px solid ${T.border}`,
    borderTopColor: T.gold,
    borderRadius: '50%',
    animation: 'pres-spin 0.8s linear infinite',
  },
  bar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: 'rgba(0,0,0,0.88)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100000,
    backdropFilter: 'blur(8px)',
  },
  barInner: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    maxWidth: 900,
    width: '100%',
    padding: '0 24px',
  },
  barBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  dotsWrap: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
    marginLeft: 12,
  },
  slideNum: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginLeft: 'auto',
    fontVariantNumeric: 'tabular-nums',
  },
  pauseLabel: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    border: '1px solid rgba(220,50,50,0.5)',
    backgroundColor: 'rgba(220,50,50,0.25)',
    color: '#fff',
    fontSize: 18,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    transition: 'background-color 0.2s',
  },
};

/* ─── Animations ─── */
const animations = `
  @keyframes pres-fadeIn {
    from { opacity: 0; transform: scale(1.02); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes pres-fadeOut {
    from { opacity: 1; transform: scale(1); }
    to   { opacity: 0; transform: scale(0.98); }
  }
  @keyframes pres-fadeSlide {
    from { 
      opacity: 0; 
      transform: translateY(20px) scale(0.98);
    }
    to   { 
      opacity: 1; 
      transform: translateY(0) scale(1);
    }
  }
  @keyframes pres-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes tableScroll {
    0% { transform: translateY(0); }
    100% { transform: translateY(-85%); }
  }
`;
