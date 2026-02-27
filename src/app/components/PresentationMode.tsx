import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { api } from '../../utils/api';

/* ═══════════════════════════════════════════════════════════════
   PRESENTATION MODE
   Full-screen, PowerPoint-style slideshow for hall display.
   
   Slides:
     1. Flight Point Totals & Winners
     2. Complete Cadet Leaderboard (ordered by total points)
     3. Recent Points Activity
     4. Rewards (from database)
   
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

/* ─── Configuration ─── */
const SLIDE_COUNT = 4;
const AUTO_ADVANCE_MS = 15000; // 15 seconds per slide
const DATA_REFRESH_MS = 30000; // 30 seconds

/* ─── Theme ─── */
const T = {
  headerBlue: '#5b9bd5',
  lightBlue: '#dceaf6',
  darkBg: '#3d4f5f',
  text: '#1a1a1a',
  white: '#ffffff',
  border: '#000000',
};

/* ─── Font ─── */
const FONT = "'Aptos', 'Calibri', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const SLIDE_NAMES = [
  'Flight Points',
  'Leaderboard',
  'Recent Points',
  'Rewards',
];

/* ─── Flight sort order ─── */
const FLIGHT_ORDER: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, 'hq': 99 };

function flightSortKey(f: string): number {
  return FLIGHT_ORDER[f?.toLowerCase()] ?? 50;
}

/* ─── Helper ─── */
function flightLabel(f: string): string {
  if (!f) return 'Unknown';
  if (f.toLowerCase() === 'hq') return 'Staff / HQ Flight';
  return `${f} Flight`;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function PresentationMode({ onClose }: { onClose: () => void; settings?: unknown }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  /* ── Data ── */
  const fetchData = useCallback(async () => {
    try {
      const [leaderboard, rewardsData] = await Promise.all([
        api.getLeaderboards(),
        api.getRewards().catch(() => []),
      ]);
      setData(leaderboard);
      setRewards(Array.isArray(rewardsData) ? rewardsData : []);
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
        <div style={S.loadingWrap}>
          <div style={S.spinner} />
          <p style={{ color: '#555', fontSize: 28, marginTop: 24, fontFamily: FONT }}>
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
    <SlideLeaderboard key="lb" data={data} />,
    <SlideRecentPoints key="rp" data={data} />,
    <SlideRewards key="rw" rewards={rewards} />,
  ];

  return (
    <div style={S.container}>
      {/* Current slide */}
      <div key={slide} style={S.slideWrap}>{slides[slide]}</div>

      {/* Bottom control bar */}
      <div style={S.bar}>
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
                  width: i === slide ? 32 : 10,
                  height: 10,
                  borderRadius: 5,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  backgroundColor: i === slide ? T.headerBlue : 'rgba(255,255,255,0.4)',
                }}
              />
            ))}
          </div>

          <span style={S.slideNum}>{slide + 1} / {SLIDE_COUNT}</span>
          {paused && <span style={S.pauseLabel}>⏸ Paused</span>}

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
   Flights in chronological order (1, 2, 3). Black borders.
   ═══════════════════════════════════════════════════════════════ */
function SlideFlightPoints({ data }: { data: LeaderboardData | null }) {
  if (!data) return null;
  // Sort flights in order: 1, 2, 3, 4, hq
  const flights = [...(data.flightLeaderboard || [])].sort((a, b) => flightSortKey(a.flight) - flightSortKey(b.flight));
  const cadet = data.winningCadet;
  const flight = data.winningFlight;

  return (
    <div style={{ ...S.slide, backgroundColor: T.white }}>
      <h1 style={{
        fontSize: 56, fontWeight: 'bold', textAlign: 'center' as const,
        color: T.text, textDecoration: 'underline', marginBottom: 48, fontFamily: FONT,
      }}>
        Flight Points
      </h1>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64,
        maxWidth: 1200, width: '100%', margin: '0 auto',
      }}>
        {/* LEFT — Flight Point Totals */}
        <div>
          <h2 style={{ fontSize: 32, fontWeight: 'bold', color: T.text, marginBottom: 20, fontFamily: FONT }}>
            Flight Point Totals
          </h2>
          <PPTable
            headers={['Flight', 'Points']}
            rows={flights.map(f => [flightLabel(f.flight), String(f.points)])}
            aligns={['left', 'right']}
            fontSize={24}
          />
        </div>

        {/* RIGHT — Who has the most points */}
        <div>
          <h2 style={{ fontSize: 32, fontWeight: 'bold', color: T.text, marginBottom: 20, fontFamily: FONT }}>
            Who Has the Most Points
          </h2>
          {cadet && (
            <div style={{ marginBottom: 24 }}>
              <PPTable
                headers={['Winning Cadet', 'Points']}
                rows={[[cadet.name, String(cadet.points)]]}
                aligns={['left', 'right']}
                fontSize={24}
              />
            </div>
          )}
          {flight && (
            <PPTable
              headers={['Winning Flight', 'Points']}
              rows={[[flightLabel(flight.flight), String(flight.points)]]}
              aligns={['left', 'right']}
              fontSize={24}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 2 — Complete Leaderboard
   All cadets ordered by total points (descending).
   Columns: Rank, Name, Points (given), Attendance, Total
   Two-column layout for large lists.
   ═══════════════════════════════════════════════════════════════ */
function SlideLeaderboard({ data }: { data: LeaderboardData | null }) {
  if (!data) return null;

  // Use detailed breakdown if server provides it, otherwise fall back
  const entries: LeaderboardEntry[] = data.detailedLeaderboard && data.detailedLeaderboard.length > 0
    ? [...data.detailedLeaderboard]
    : data.cadetLeaderboard.map(c => ({
        ...c,
        flightPoints: c.points,
        attendancePoints: 0,
        totalPoints: c.points,
      }));

  // Sort by total points descending
  entries.sort((a, b) => (b.totalPoints ?? b.points) - (a.totalPoints ?? a.points));

  const half = Math.ceil(entries.length / 2);
  const left = entries.slice(0, half);
  const right = entries.slice(half);

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

  // Scale font based on how many cadets
  const maxRows = Math.max(left.length, right.length);
  const fontSize = maxRows > 25 ? 13 : maxRows > 20 ? 14 : maxRows > 15 ? 16 : 18;

  return (
    <div style={{ ...S.slide, backgroundColor: T.darkBg, padding: '40px 48px 100px' }}>
      <h1 style={{
        fontSize: 48, fontWeight: 'bold', color: T.white,
        textAlign: 'center' as const, marginBottom: 24, fontFamily: FONT,
      }}>
        Cadet Leaderboard
      </h1>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32,
        width: '100%', flex: 1, alignContent: 'start',
      }}>
        {/* Left table */}
        <div style={{
          backgroundColor: T.white, borderRadius: 8, overflow: 'hidden',
          maxHeight: 'calc(100vh - 200px)', overflowY: 'auto',
        }}>
          <PPTable headers={headers} rows={toRows(left, 1)} aligns={aligns} fontSize={fontSize} compact />
        </div>
        {/* Right table */}
        {right.length > 0 && (
          <div style={{
            backgroundColor: T.white, borderRadius: 8, overflow: 'hidden',
            maxHeight: 'calc(100vh - 200px)', overflowY: 'auto',
          }}>
            <PPTable
              headers={headers}
              rows={toRows(right, half + 1)}
              aligns={aligns}
              fontSize={fontSize}
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 3 — Recent Points
   ═══════════════════════════════════════════════════════════════ */
function SlideRecentPoints({ data }: { data: LeaderboardData | null }) {
  if (!data) return null;
  const recent = data.recentPoints.slice(0, 15);

  return (
    <div style={{ ...S.slide, backgroundColor: T.white }}>
      <h1 style={{
        fontSize: 48, fontWeight: 'bold', color: T.text,
        textAlign: 'center' as const, marginBottom: 40, textDecoration: 'underline', fontFamily: FONT,
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
          fontSize={20}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SLIDE 4 — Rewards (from database)
   Shows each active reward: title, how to win, prize.
   ═══════════════════════════════════════════════════════════════ */
function SlideRewards({ rewards }: { rewards: Reward[] }) {
  // Filter out expired rewards
  const now = Date.now();
  const activeRewards = rewards.filter(r => {
    if (!r.endsAt) return true;
    return new Date(r.endsAt).getTime() >= now;
  });

  return (
    <div style={{ ...S.slide, backgroundColor: T.white }}>
      <h1 style={{
        fontSize: 48, fontWeight: 'bold', color: T.text,
        textAlign: 'center' as const, marginBottom: 40, textDecoration: 'underline', fontFamily: FONT,
      }}>
        Rewards
      </h1>

      {activeRewards.length === 0 ? (
        <p style={{ fontSize: 28, color: '#999', fontFamily: FONT }}>No active rewards at the moment.</p>
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
            fontSize={22}
          />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   REUSABLE TABLE — Formal style with thin black borders
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
  const pad = compact ? '6px 12px' : '12px 16px';

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', border: `2px solid ${T.border}` }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{
              backgroundColor: T.headerBlue,
              color: T.white,
              fontWeight: 'bold',
              fontSize,
              padding: pad,
              textAlign: aligns?.[i] || 'left',
              whiteSpace: 'nowrap' as const,
              fontFamily: FONT,
              borderRight: i < headers.length - 1 ? `1px solid ${T.border}` : 'none',
              borderBottom: `2px solid ${T.border}`,
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
                backgroundColor: ri % 2 === 0 ? T.lightBlue : T.white,
                color: T.text,
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
              style={{ padding: 24, textAlign: 'center' as const, color: '#999', fontSize: fontSize - 2, fontFamily: FONT }}
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
    backgroundColor: '#000',
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
    padding: '60px 80px 100px',
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
    backgroundColor: T.white,
  },
  spinner: {
    width: 48,
    height: 48,
    border: `4px solid ${T.lightBlue}`,
    borderTopColor: T.headerBlue,
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
    gap: 6,
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
    color: '#f59e0b',
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
