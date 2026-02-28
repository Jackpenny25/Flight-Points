import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Play, Monitor, Keyboard, Clock, Settings } from 'lucide-react';
import { PresentationMode } from './PresentationMode';

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

/**
 * Presentation Editor — Landing page for the Presentation tab.
 * Shows duration controls for each slide + "Start Presentation" button.
 * Clicking the button launches PresentationMode as a fullscreen overlay.
 */
export function PresentationEditor() {
  const [showPresentation, setShowPresentation] = useState(false);
  const [slideDurations, setSlideDurations] = useState<number[]>([15, 15, 20, 15, 15, 15, 15, 15, 15]); // seconds per slide

  const setDuration = (slideIndex: number, duration: number) => {
    setSlideDurations(prev => {
      const next = [...prev];
      next[slideIndex] = duration;
      return next;
    });
  };

  const setAllDurations = (duration: number) => {
    setSlideDurations(Array(9).fill(duration));
  };

  if (showPresentation) {
    return <PresentationMode onClose={() => setShowPresentation(false)} slideDurations={slideDurations.map(d => d * 1000)} />;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Launch Card */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto bg-primary/10 rounded-full p-4 w-fit mb-2">
            <Monitor className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Presentation Mode</CardTitle>
          <CardDescription>
            Full-screen slideshow for hall display. Data refreshes automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-8 space-y-6">
          {/* Slide Duration Editor */}
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-muted-foreground" />
                <label className="text-sm font-medium">Slide Durations</label>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAllDurations(10)}
                  className="text-xs h-8"
                >
                  All 10s
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAllDurations(15)}
                  className="text-xs h-8"
                >
                  All 15s
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAllDurations(20)}
                  className="text-xs h-8"
                >
                  All 20s
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SLIDE_NAMES.map((name, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-muted-foreground mb-1">{idx + 1}. {name}</div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      step="1"
                      value={slideDurations[idx]}
                      onChange={(e) => setDuration(idx, Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div className="text-xs font-mono bg-background px-2 py-1 rounded min-w-fit">
                    {slideDurations[idx]}s
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/70">
              Note: Leaderboard auto-adjusts based on cadet count (typically 20-40 seconds)
            </p>
          </div>

          <Button
            size="lg"
            className="w-full h-14 text-lg gap-3 font-semibold"
            onClick={() => setShowPresentation(true)}
          >
            <Play className="w-5 h-5" />
            Start Presentation
          </Button>
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Slides */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Slides
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
              <li>Flight Point Totals &amp; Winners</li>
              <li>Top Cadets &amp; Flight of the Month</li>
              <li>Complete Cadet Leaderboard</li>
              <li>Rising Stars (weekly top earners)</li>
              <li>The Flight Race (bar chart)</li>
              <li>Weekly Comparison</li>
              <li>Attendance Streaks</li>
              <li>Recent Points Activity</li>
              <li>Rewards</li>
            </ol>
            <p className="text-xs text-muted-foreground/60 mt-3">
              Auto-advances based on durations above &middot; Data refreshes every 30 seconds
            </p>
          </CardContent>
        </Card>

        {/* Controls */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-muted-foreground" />
              Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">←</kbd>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">→</kbd>
                </div>
                <span>Navigate slides</span>
              </div>
              <div className="flex items-center gap-3">
                <kbd className="px-2.5 py-0.5 bg-muted rounded text-xs font-mono">Space</kbd>
                <span>Pause / Resume</span>
              </div>
              <div className="flex items-center gap-3">
                <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">Esc</kbd>
                <span>Exit presentation</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground/60 mt-3">
              Click the dots at the bottom to jump to any slide
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
