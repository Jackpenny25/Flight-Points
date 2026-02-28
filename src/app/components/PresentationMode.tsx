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

/* ─── Theme — dark slate / gold / green ─── */
const T = {
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
export function PresentationMode({ onClose }: { onClose: () => void; settings?: unknown }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [stats, setStats] = useState<PresentationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
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

  /* ── Auto-advance ── */
  useEffect(() => {
    if (paused || loading) return;
    const id = setInterval(() => setSlide(s => (s + 1) % SLIDE_COUNT), AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [paused, loading]);

  /* ── Keyboard ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { exitAndClose(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { setSlide(s => (s + 1) % SLIDE_COUNT); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { setSlide(s => (s - 1 + SLIDE_COUNT) % SLIDE_COUNT); }
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
    <SlideFlightPoints key="fp" data={data} />,
    <SlidePodiumAndMonth key="pm" data={data} stats={stats} />,
    <SlideLeaderboard key="lb" data={data} />,
    <SlideRisingStars key="rs" stats={stats} />,
    <SlideFlightRace key="fr" data={data} />,
    <SlideWeeklyComparison key="wc" stats={stats} />,
    <SlideAttendanceStreaks key="as" stats={stats} />,
    <SlideRecentPoints key="rp" data={data} />,
    <SlideRewards key="rw" rewards={rewards} />,
  ];

  return (
    <div style={S.container}>
      {/* Current slide */}
      <div key={slide} style={S.slideWrap}>{slides[slide]}</div>

      {/* Bottom control bar — auto-hides after 3s of inactivity */}
      <div style={{
        ...S.bar,
        transform: barVisible ? 'translateY(0)' : 'translateY(100%)',
        opacity: barVisible ? 1 : 0,
        transition: 'transform 0.4s ease, opacity 0.4s ease',
      }}>
        <div style={S.barInner}>
          <button
            style={S.barBtn}
            onClick={() => setSlide(s => (s - 1 + SLIDE_COUNT) % SLIDE_COUNT)}
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
            onClick={() => setSlide(s => (s + 1) % SLIDE_COUNT)}
            title="Next slide (→)"
          >
            ▶
          </button>

          {/* Navigation dots */}
          <div style={S.dotsWrap}>
            {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
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
function SlideFlightPoints({ data }: { data: LeaderboardData | null }) {
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
              />
            </div>
          )}
          {flight && (
            <PPTable
              headers={['Winning Flight', 'Points']}
              rows={[[flightLabel(flight.flight), String(flight.points)]]}
              aligns={['left', 'right']}
              fontSize={34}
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
function SlidePodiumAndMonth({ data, stats }: { data: LeaderboardData | null; stats: PresentationStats | null }) {
  if (!data) return null;

  const entries = data.detailedLeaderboard && data.detailedLeaderboard.length > 0
    ? [...data.detailedLeaderboard]
    : data.cadetLeaderboard.map(c => ({ ...c, totalPoints: c.points }));

  entries.sort((a, b) => (b.totalPoints ?? b.points) - (a.totalPoints ?? a.points));

  // Group cadets by tied points to find medal positions (handling joint winners)
  const podiumGroups: Array<{ medal: number; cadets: typeof entries; points: number }> = [];
  let currentIdx = 0;
  let medalsAssigned = 0;
  while (currentIdx < entries.length && medalsAssigned < 3) {
    const currentPoints = entries[currentIdx].totalPoints ?? entries[currentIdx].points;
    const tiedCadets: typeof entries = [];
    let tempIdx = currentIdx;
    while (tempIdx < entries.length && (entries[tempIdx].totalPoints ?? entries[tempIdx].points) === currentPoints) {
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
                  position: 'relative' as const,
                }}>
                  {medalLabels[idx]}
                  {isJointWinner && (
                    <div style={{
                      position: 'absolute', top: 4, right: 6,
                      fontSize: 14, fontWeight: 'bold', color: '#1a1a1a',
                    }}>
                      ×{group.cadets.length}
                    </div>
                  )}
                </div>
                {/* Names — all joint winners */}
                <div style={{
                  fontSize: isJointWinner ? 20 : 28, fontWeight: 'bold', color: T.white,
                  fontFamily: FONT, textAlign: 'center' as const, maxWidth: 240,
                  lineHeight: 1.3,
                }}>
                  {group.cadets.map(c => c.name).join(', ')}
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
function SlideLeaderboard({ data }: { data: LeaderboardData | null }) {
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
            maxHeight: 'calc(100vh - 180px)', overflowY: 'auto',
          }}>
            <PPTable headers={headers} rows={toRows(left, 1)} aligns={aligns} fontSize={fontSize} compact />
          </div>
          {right.length > 0 && (
            <div style={{
              borderRadius: 8, overflow: 'hidden',
              maxHeight: 'calc(100vh - 180px)', overflowY: 'auto',
            }}>
              <PPTable headers={headers} rows={toRows(right, half + 1)} aligns={aligns} fontSize={fontSize} compact />
            </div>
          )}
        </div>
      </div>
    );
  }

  const fontSize = entries.length > 15 ? 17 : 20;

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
        maxHeight: 'calc(100vh - 180px)', overflowY: 'auto',
      }}>
        <PPTable headers={headers} rows={toRows(entries, 1)} aligns={aligns} fontSize={fontSize} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 4 — Rising Stars (top gainers this week)
   ═══════════════════════════════════════════════════════════════ */
function SlideRisingStars({ stats }: { stats: PresentationStats | null }) {
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
function SlideFlightRace({ data }: { data: LeaderboardData | null }) {
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
function SlideWeeklyComparison({ stats }: { stats: PresentationStats | null }) {
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
function SlideAttendanceStreaks({ stats }: { stats: PresentationStats | null }) {
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
              borderRadius: 16,
              padding: '28px 32px',
              marginBottom: 36,
              textAlign: 'center' as const,
            }}>
              <div style={{
                fontSize: 20, color: T.gold, fontFamily: FONT,
                textTransform: 'uppercase' as const, letterSpacing: 1.5,
                marginBottom: 12, fontWeight: 'bold',
              }}>
                🏆 Record Holder{recordHolders.length > 1 ? 's' : ''}
              </div>
              <div style={{
                fontSize: 32, fontWeight: 'bold', color: T.white,
                fontFamily: FONT, marginBottom: 8,
              }}>
                {recordHolders.map(h => h.name).join(', ')}
              </div>
              <div style={{
                fontSize: 28, color: T.gold, fontFamily: FONT, fontWeight: 'bold',
              }}>
                {recordStreak} {recordStreak === 1 ? 'night' : 'nights'} consecutive
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
function SlideRecentPoints({ data }: { data: LeaderboardData | null }) {
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
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 9 — Rewards (from database)
   ═══════════════════════════════════════════════════════════════ */
function SlideRewards({ rewards }: { rewards: Reward[] }) {
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
}: {
  headers: string[];
  rows: string[][];
  aligns?: Array<'left' | 'center' | 'right'>;
  fontSize?: number;
  compact?: boolean;
}) {
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
  @keyframes pres-fadeSlide {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pres-spin {
    to { transform: rotate(360deg); }
  }
`;
