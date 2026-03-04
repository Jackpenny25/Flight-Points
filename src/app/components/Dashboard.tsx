import { useState, useEffect } from 'react';
import TopNav from './TopNav';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { LogOut, Award, TrendingUp, Users, CalendarDays, Shield, FileText, Gift } from 'lucide-react';
import { PointsManager } from './PointsManager';
import { Leaderboards } from './Leaderboards';
import { AdminPointGivers } from './AdminPointGivers';
import { CadetsManager } from './CadetsManager';
import { AttendanceManager } from './AttendanceManager';
import { DataIntegrity } from './DataIntegrity';
import { ReportsExport } from './ReportsExport';
import { api } from '../../utils/api';
import { logout } from '../../utils/auth';
import AdminSignups from './AdminSignups';
import { MyPoints } from './MyPoints';
import { MyAttendance } from './MyAttendance';
import { NotificationCenter } from './NotificationCenter';
import { Tickets } from './Tickets';
import { TicketsAdmin } from './TicketsAdmin';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { Rewards } from './Rewards';
import { PresentationEditor } from './PresentationEditor';
// PresentationMode is launched from within PresentationEditor

interface DashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
}

export function Dashboard({ user, accessToken, onLogout }: DashboardProps) {
  const userRole = user?.user_metadata?.role || 'cadet';
  const canUseAdminPin = ['snco', 'flight point lead', 'flight_point_lead'].includes(String(userRole).toLowerCase());
  const userName = user?.user_metadata?.name || user?.email || 'User';
  // Map internal role values to user-facing labels
  const displayRole = userRole === 'snco'
    ? 'Flight Point Lead'
    : userRole === 'pointgiver'
      ? 'Point Giver'
      : userRole === 'staff'
        ? 'Staff'
        : userRole === 'presentation'
          ? 'Presentation'
          : (userRole.charAt(0).toUpperCase() + userRole.slice(1));
  const cadetName = user?.user_metadata?.cadetName;
  const suggestedName = user?.user_metadata?.suggestedName;
  const requireNameChange = user?.user_metadata?.requireNameChange === true;
  
  const canGivePoints = userRole === 'pointgiver' || userRole === 'snco' || userRole === 'staff';
  const canMarkAttendance = userRole === 'pointgiver' || userRole === 'snco';
  const canManageCadets = userRole === 'snco';

  // tabCount not currently used; remove to avoid premature reference

  const [activeTab, setActiveTab] = useState<string>(userRole === 'presentation' ? 'presentation' : 'leaderboards');
  const [adminPendingCount, setAdminPendingCount] = useState<number>(0);
  const [ticketsCount, setTicketsCount] = useState<number>(0);
  const [integrityCheckCount, setIntegrityCheckCount] = useState<number>(0);
  const [rewardsCount, setRewardsCount] = useState<number>(0);
  const [pointsCount, setPointsCount] = useState<number>(0);
  
  // Name change dialog state
  const [nameChangeDialogOpen, setNameChangeDialogOpen] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>(suggestedName || userName);
  const [nameChangeError, setNameChangeError] = useState<string>('');

  useEffect(() => {
    // Show name change dialog if admin requires it or suggests it
    if (suggestedName && !sessionStorage.getItem('nameChangeDismissed')) {
      setNameChangeDialogOpen(true);
    }
  }, [suggestedName]);


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
  const [pinDialogOpen, setPinDialogOpen] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');



  const openPinDialog = () => {
    if (!canUseAdminPin) {
      alert('Only Flight Point Leads can unlock admin PIN actions.');
      return;
    }
    if (adminUnlocked) return;
    setPinError('');
    setPinInput('');
    setPinDialogOpen(true);
  };

  const lockAdmin = () => {
    if (!adminUnlocked) return;
    sessionStorage.removeItem('adminPinVerified');
    setAdminUnlocked(false);
  };

  const submitPin = async () => {
    try {
      if (!accessToken || !user?.id) {
        setPinError('You must be signed in to verify PIN');
        return;
      }
      const data = await api.verifyPin(pinInput);
      if (!data?.success) {
        const err = String(data?.message || data?.error || 'Incorrect PIN');
        if (err.toLowerCase().includes('expired token') || err.toLowerCase().includes('invalid or expired token')) {
          logout();
          setPinDialogOpen(false);
          alert('Your session expired. Please sign in again.');
          onLogout();
          return;
        }
        setPinError(err);
        return;
      }
      sessionStorage.setItem('adminPinVerified', 'true');
      setAdminUnlocked(true);
      setPinDialogOpen(false);
      setPinError('');
      setPinInput('');
    } catch (e: any) {
      setPinError(String(e?.message || e));
    }
  };

  // Poll open tickets count for Flight Point Leads/Staff to show a badge on the Tickets tab
  useEffect(() => {
    if (!canManageCadets) return;
    let timer: any;
    const fetchCount = async () => {
      try {
        const res = await api.getTicketsCount?.();
        if (typeof res?.count === 'number') setTicketsCount(res.count);
      } catch (e) {
        console.error('Failed to fetch open tickets count:', e);
      }
    };
    fetchCount();
    timer = setInterval(fetchCount, 120000);
    return () => clearInterval(timer);
  }, [canManageCadets, accessToken]);

  // Poll integrity check count for Flight Point Leads to show a badge on the Integrity tab
  useEffect(() => {
    if (!canManageCadets) return;
    let timer: any;
    const fetchCount = async () => {
      try {
        const res = await api.getIntegrityCheckCount?.();
        if (typeof res?.count === 'number') setIntegrityCheckCount(res.count);
      } catch (e) {
        console.error('Failed to fetch integrity check count:', e);
      }
    };
    fetchCount();
    timer = setInterval(fetchCount, 120000);
    return () => clearInterval(timer);
  }, [canManageCadets, accessToken]);

  // Poll active rewards count for all users to show a badge on the Rewards tab
  useEffect(() => {
    let timer: any;
    const fetchCount = async () => {
      try {
        const res = await api.getActiveRewardsCount?.();
        if (typeof res?.count === 'number') setRewardsCount(res.count);
      } catch (e) {
        console.error('Failed to fetch active rewards count:', e);
      }
    };
    fetchCount();
    timer = setInterval(fetchCount, 120000);
    return () => clearInterval(timer);
  }, [accessToken]);

  // Poll recent points count for point givers/SNOs to show a badge on the Points tab
  useEffect(() => {
    if (!canGivePoints) return;
    let timer: any;
    const fetchCount = async () => {
      try {
        const res = await api.getRecentPointsCount?.();
        if (typeof res?.count === 'number') setPointsCount(res.count);
      } catch (e) {
        console.error('Failed to fetch recent points count:', e);
      }
    };
    fetchCount();
    timer = setInterval(fetchCount, 120000);
    return () => clearInterval(timer);
  }, [canGivePoints, accessToken]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-md border-b-2 border-primary/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <img
                src={`${import.meta.env.BASE_URL}${adminUnlocked ? 'logo-black.jpg' : 'logo.png'}`}
                alt="Flight Points Logo"
                className={`h-12 w-12 object-contain ${canUseAdminPin ? 'cursor-pointer' : ''}`}
                title={canUseAdminPin ? (adminUnlocked ? 'Click to lock admin' : 'Click to unlock admin') : 'Admin unlock available for Flight Point Leads only'}
                onClick={() => {
                  if (!canUseAdminPin) return;
                  return adminUnlocked ? lockAdmin() : openPinDialog();
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div>
                <h1 className="text-xl font-bold text-primary">Flight Points</h1>
              </div>
              {/* Admin text indicator removed; logo color indicates unlock state */}
            </div>
            <div className="flex items-center gap-4">
                {userRole === 'cadet' && <NotificationCenter accessToken={accessToken} />}
                {/* Retention cleanup moved to Signups tab (admin only) */}
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{userName}</p>
                <p className="text-xs text-gray-500">{displayRole}</p>
              </div>
              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut className="size-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Admin PIN Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin Unlock</DialogTitle>
            <DialogDescription>Enter the 6-digit admin PIN to unlock actions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="PIN"
              maxLength={6}
              inputMode="numeric"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitPin();
                }
              }}
            />
            {pinError && <p className="text-sm text-red-600">{pinError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitPin}>Unlock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* taskbar below header */}
      {userRole !== 'cadet' && (
        <div className="mt-4">
          <TopNav 
            active={activeTab} 
            onSelect={(t) => setActiveTab(t)} 
            showAdmin={canManageCadets && adminUnlocked}
            canGivePoints={canGivePoints}
            canMarkAttendance={canMarkAttendance}
            canManageCadets={canManageCadets}
            isPresentationRole={userRole === 'presentation'}
            adminPendingCount={adminUnlocked && canManageCadets ? adminPendingCount : 0}
            ticketsCount={canManageCadets ? ticketsCount : 0}
            integrityCheckCount={canManageCadets ? integrityCheckCount : 0}
            rewardsCount={rewardsCount}
            pointsCount={canGivePoints ? pointsCount : 0}
            accessToken={accessToken}
          />
        </div>
      )}

      {/* Cadet navigation */}
      {userRole === 'cadet' && (
        <div className="mt-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-2 bg-white p-2 rounded-lg shadow-sm border">
            <Button
              variant={activeTab === 'leaderboards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('leaderboards')}
              className="flex-1"
            >
              <TrendingUp className="size-4 mr-2" />
              Leaderboards
            </Button>
            <Button
              variant={activeTab === 'rewards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('rewards')}
              className="flex-1"
            >
              <Gift className="size-4 mr-2" />
              Rewards
            </Button>
            {cadetName && (
              <Button
                variant={activeTab === 'mypoints' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('mypoints')}
                className="flex-1"
              >
                <Award className="size-4 mr-2" />
                My Points
              </Button>
            )}
            {cadetName && (
              <Button
                variant={activeTab === 'myattendance' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('myattendance')}
                className="flex-1"
              >
                <CalendarDays className="size-4 mr-2" />
                My Attendance
              </Button>
            )}
            <Button
              variant={activeTab === 'tickets' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('tickets')}
              className="flex-1"
            >
              <FileText className="size-4 mr-2" />
              Tickets
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="space-y-6">
          <TabsContent value="leaderboards">
            <Leaderboards userRole={userRole} />
          </TabsContent>

          <TabsContent value="rewards">
            <Rewards userRole={userRole} />
          </TabsContent>

          {/* Show My Points tab for cadets with cadetName */}
          {userRole === 'cadet' && cadetName && (
            <TabsContent value="mypoints">
              <MyPoints accessToken={accessToken} cadetName={cadetName} />
            </TabsContent>
          )}

          {/* My Attendance for cadets */}
          {userRole === 'cadet' && cadetName && (
            <TabsContent value="myattendance">
              <MyAttendance cadetName={cadetName} />
            </TabsContent>
          )}

          {/* Cadet tickets */}
          {userRole === 'cadet' && (
            <TabsContent value="tickets">
              <Tickets accessToken={accessToken} />
            </TabsContent>
          )}

          {canGivePoints && (
            <TabsContent value="points">
              <PointsManager userRole={userRole} />
            </TabsContent>
          )}

          {canMarkAttendance && (
            <TabsContent value="attendance">
              <AttendanceManager userRole={userRole} />
            </TabsContent>
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

              {adminUnlocked && (
                <TabsContent value="admin">
                  <AdminPointGivers accessToken={accessToken} />
                </TabsContent>
              )}

              {/* Admin tickets review (Flight Point Leads/Staff) */}
              <TabsContent value="tickets">
                <TicketsAdmin accessToken={accessToken} />
              </TabsContent>

              {adminUnlocked && (
                <TabsContent value="signups">
                  <AdminSignups accessToken={accessToken} currentUserId={user.id} currentUserRole={userRole} />
                </TabsContent>
              )}

              <TabsContent value="presentation">
                <PresentationEditor />
              </TabsContent>
            </>
          )}

          {/* Presentation-only role */}
          {userRole === 'presentation' && (
            <TabsContent value="presentation">
              <PresentationEditor />
            </TabsContent>
          )}

          {/* bottom tab triggers removed; use TopNav above */}
        </Tabs>
      </main>

      {/* Footer: Privacy Policy moved here to avoid header crowding */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="text-center">
          <PrivacyPolicyModal />
        </div>
      </div>

      {/* Role change panel removed — only inline role-change remains */}

      {/* Name Change Dialog */}
      <Dialog open={nameChangeDialogOpen} onOpenChange={(open) => {
        if (!requireNameChange) {
          // Allow dismissing if it's just a suggestion
          setNameChangeDialogOpen(open);
          if (!open) sessionStorage.setItem('nameChangeDismissed', 'true');
        }
      }}>
        <DialogContent className={requireNameChange ? "sm:max-w-md" : "sm:max-w-md"}>
          <DialogHeader>
            <DialogTitle>
              {requireNameChange ? '⚠️ Name Change Required' : '💡 Name Suggestion'}
            </DialogTitle>
            <DialogDescription>
              {requireNameChange ? (
                <>
                  An admin has requested that you change your username to follow the correct format.
                  <br /><br />
                  <strong>Required format:</strong> "Surname Initial" (e.g., Smith J, Penny J)
                </>
              ) : (
                <>
                  An admin has suggested a corrected version of your username.
                  <br /><br />
                  <strong>Suggested format:</strong> "Surname Initial" (e.g., Smith J, Penny J)
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Current name: <strong>{userName}</strong></p>
              {suggestedName && (
                <p className="text-sm text-green-700 mb-2">Admin suggestion: <strong>{suggestedName}</strong></p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Username</label>
              <Input
                placeholder="Enter corrected name..."
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setNameChangeError('');
                }}
              />
              {nameChangeError && (
                <p className="text-sm text-red-600">{nameChangeError}</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            {!requireNameChange && (
              <Button
                variant="outline"
                onClick={() => {
                  setNameChangeDialogOpen(false);
                  sessionStorage.setItem('nameChangeDismissed', 'true');
                }}
              >
                Dismiss
              </Button>
            )}
            <Button
              onClick={async () => {
                if (!newName.trim()) {
                  setNameChangeError('Please enter a name');
                  return;
                }
                try {
                  const response = await api.updateUserName?.(user.id, newName.trim());
                  if (!response || response.error) {
                    setNameChangeError(response?.error || 'Failed to update name');
                    return;
                  }
                  alert('Name updated successfully! Please log in again.');
                  onLogout();
                } catch (err) {
                  console.error('Name update error:', err);
                  setNameChangeError('Failed to update name');
                }
              }}
            >
              Update Name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default Dashboard;