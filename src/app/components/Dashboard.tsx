import { useState, useEffect } from 'react';
import TopNav from './TopNav';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { LogOut, Award, TrendingUp, Users, CalendarDays, Shield, FileSpreadsheet } from 'lucide-react';
import { PointsManager } from './PointsManager';
import { Leaderboards } from './Leaderboards';
import { CadetsManager } from './CadetsManager';
import { AttendanceManager } from './AttendanceManager';
import { DataIntegrity } from './DataIntegrity';
import { ReportsExport } from './ReportsExport';

interface DashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
}

export function Dashboard({ user, accessToken, onLogout }: DashboardProps) {
  const userRole = user?.user_metadata?.role || 'cadet';
  const userName = user?.user_metadata?.name || user?.email || 'User';
  
  const canGivePoints = userRole === 'pointgiver' || userRole === 'snco' || userRole === 'staff';
  const canManageCadets = userRole === 'snco' || userRole === 'staff';

  const tabCount = 1 + (canGivePoints ? 2 : 0) + (canManageCadets ? 3 : 0);

  const [activeTab, setActiveTab] = useState<string>('leaderboards');

  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail || {};
        const tab = detail.tab as string | undefined;
        if (!tab) return;

        // verify permissions before switching
        if (tab === 'points' && !canGivePoints) return;
        if (tab === 'attendance' && !canGivePoints) return;
        if ((tab === 'cadets' || tab === 'reports' || tab === 'integrity') && !canManageCadets) return;

        setActiveTab(tab);
      } catch (err) {
        // ignore
      }
    };

    window.addEventListener('navigateTab', handler as EventListener);
    return () => window.removeEventListener('navigateTab', handler as EventListener);
  }, [canGivePoints, canManageCadets]);

  // Admin unlock indicator + logo click unlock
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(
    typeof window !== 'undefined' && sessionStorage.getItem('adminPinVerified') === 'true'
  );
  const ADMIN_PIN = '5394';
  const ensureAdminPin = () => {
    if (sessionStorage.getItem('adminPinVerified') === 'true') return true;
    const pin = prompt('Enter 4-digit admin PIN');
    if (pin === ADMIN_PIN) {
      sessionStorage.setItem('adminPinVerified', 'true');
      setAdminUnlocked(true);
      return true;
    }
    return false;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-md border-b-2 border-primary/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="2427 Squadron"
                className="h-12 w-12 object-contain cursor-pointer"
                title="Click to unlock admin"
                onClick={() => ensureAdminPin()}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div>
                <h1 className="text-xl font-bold text-primary">2427 (Biggin Hill) Squadron</h1>
                <p className="text-sm text-muted-foreground">RAF Air Cadets - Flight Points</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded ml-2 ${adminUnlocked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {adminUnlocked ? 'Admin: Unlocked' : 'Admin: Locked'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{userName}</p>
                <p className="text-xs text-gray-500 capitalize">{userRole}</p>
              </div>
              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut className="size-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* taskbar below header */}
      {userRole !== 'cadet' && (
        <div className="mt-4">
          <TopNav active={activeTab} onSelect={(t) => setActiveTab(t)} />
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="space-y-6">
          <TabsContent value="leaderboards">
            <Leaderboards accessToken={accessToken} />
          </TabsContent>

          {canGivePoints && (
            <>
              <TabsContent value="points">
                <PointsManager accessToken={accessToken} userRole={userRole} />
              </TabsContent>

              <TabsContent value="attendance">
                <AttendanceManager accessToken={accessToken} userRole={userRole} />
              </TabsContent>
            </>
          )}

          {canManageCadets && (
            <>
              <TabsContent value="cadets">
                <CadetsManager accessToken={accessToken} />
              </TabsContent>

              <TabsContent value="reports">
                <ReportsExport accessToken={accessToken} userRole={userRole} />
              </TabsContent>

              <TabsContent value="integrity">
                <DataIntegrity accessToken={accessToken} />
              </TabsContent>
            </>
          )}

          {/* centered tab triggers underneath the content */}
          <div className="flex justify-center mt-6">
            <TabsList className="flex items-center gap-3">
              <TabsTrigger value="leaderboards">
                <TrendingUp className="size-4 mr-2" />
                Leaderboards
              </TabsTrigger>
              {canGivePoints && (
                <>
                  <TabsTrigger value="points">
                    <Award className="size-4 mr-2" />
                    Points
                  </TabsTrigger>
                  <TabsTrigger value="attendance">
                    <CalendarDays className="size-4 mr-2" />
                    Attendance
                  </TabsTrigger>
                </>
              )}
              {canManageCadets && (
                <>
                  <TabsTrigger value="cadets">
                    <Users className="size-4 mr-2" />
                    Cadets
                  </TabsTrigger>
                  <TabsTrigger value="reports">
                    <FileSpreadsheet className="size-4 mr-2" />
                    Reports
                  </TabsTrigger>
                  <TabsTrigger value="integrity">
                    <Shield className="size-4 mr-2" />
                    Integrity
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </div>
        </Tabs>
      </main>
    </div>
  );
}