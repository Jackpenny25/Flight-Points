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
import { EffectivePermissions } from './EffectivePermissions';
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
import { getEffectivePermissions } from '../../utils/permissions';
// PresentationMode is launched from within PresentationEditor

interface DashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
}

export function Dashboard({ user, accessToken, onLogout }: DashboardProps) {
  const userRole = user?.user_metadata?.role || 'cadet';
  const effectivePermissions = getEffectivePermissions(userRole, user?.user_metadata?.permissions || {});

  const canUseAdminPin = effectivePermissions.actions.unlockAdmin;
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

  const canViewLeaderboards = effectivePermissions.tabs.leaderboards;
  const canViewRewards = effectivePermissions.tabs.rewards;
  const canViewPoints = effectivePermissions.tabs.points;
  const canViewAttendance = effectivePermissions.tabs.attendance;
  const canViewCadets = effectivePermissions.tabs.cadets;
  const canViewReports = effectivePermissions.tabs.reports;
  const canViewIntegrity = effectivePermissions.tabs.integrity;
  const canViewTickets = effectivePermissions.tabs.tickets;
  const canViewAdmin = effectivePermissions.tabs.admin;
  const canViewSignups = effectivePermissions.tabs.signups;
  const canViewPresentation = effectivePermissions.tabs.presentation;
  const canViewMyPoints = effectivePermissions.tabs.mypoints;
  const canViewMyAttendance = effectivePermissions.tabs.myattendance;

  const canGivePoints = effectivePermissions.actions.givePoints;
  const canEditPoints = effectivePermissions.actions.editPoints;
  const canDeletePoints = effectivePermissions.actions.deletePoints;
  const canMarkAttendance = effectivePermissions.actions.markAttendance;
  const canEditAttendance = effectivePermissions.actions.editAttendance;
  const canDeleteAttendanceSessions = effectivePermissions.actions.deleteAttendanceSessions;
  const canManageCadets = effectivePermissions.actions.manageCadets;
  const canManageAccounts = effectivePermissions.actions.manageAccounts;

  const adminFeatureEnabled = canManageCadets || canViewAdmin || canViewSignups || canViewReports || canViewIntegrity || canViewPresentation || canViewTickets;

  // tabCount not currently used; remove to avoid premature reference

  const initialTab = canViewPresentation && userRole === 'presentation'
    ? 'presentation'
    : canViewLeaderboards
      ? 'leaderboards'
      : canViewRewards
        ? 'rewards'
        : canViewTickets
          ? 'tickets'
          : 'leaderboards';
  const [activeTab, setActiveTab] = useState<string>(initialTab);
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
        if (tab === 'leaderboards' && !canViewLeaderboards) return;
        if (tab === 'rewards' && !canViewRewards) return;
        if (tab === 'points' && !canViewPoints) return;
        if (tab === 'attendance' && !canViewAttendance) return;
        if (tab === 'tickets' && !canViewTickets) return;
        if (tab === 'cadets' && !canViewCadets) return;
        if (tab === 'reports' && !canViewReports) return;
        if (tab === 'integrity' && !canViewIntegrity) return;
        if (tab === 'admin' && !canViewAdmin) return;
        if (tab === 'signups' && !canViewSignups) return;
        if (tab === 'presentation' && !canViewPresentation) return;
        if (tab === 'mypoints' && !canViewMyPoints) return;
        if (tab === 'myattendance' && !canViewMyAttendance) return;

        setActiveTab(tab);
      } catch (err) {
        // ignore
      }
    };

    window.addEventListener('navigateTab', handler as EventListener);
    return () => window.removeEventListener('navigateTab', handler as EventListener);
  }, [canViewLeaderboards, canViewRewards, canViewPoints, canViewAttendance, canViewTickets, canViewCadets, canViewReports, canViewIntegrity, canViewAdmin, canViewSignups, canViewPresentation, canViewMyPoints, canViewMyAttendance]);

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
    if (!canViewTickets) return;
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
  }, [canViewTickets, accessToken]);

  // Poll integrity check count for Flight Point Leads to show a badge on the Integrity tab
  useEffect(() => {
    if (!canViewIntegrity) return;
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
  }, [canViewIntegrity, accessToken]);

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
    if (!canViewPoints) return;
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
  }, [canViewPoints, accessToken]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-md border-b-2 border-primary/20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center min-h-[3.5rem] sm:min-h-[4rem] py-2 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <img
                src={`${import.meta.env.BASE_URL}${adminUnlocked ? 'logo-black.jpg' : 'logo.png'}`}
                alt="Flight Points Logo"
                className={`h-9 w-9 sm:h-12 sm:w-12 object-contain ${canUseAdminPin ? 'cursor-pointer' : ''}`}
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
                <h1 className="text-base sm:text-xl font-bold text-primary">Flight Points</h1>
              </div>
              {/* Admin text indicator removed; logo color indicates unlock state */}
            </div>
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                {userRole === 'cadet' && <NotificationCenter accessToken={accessToken} />}
                {/* Retention cleanup moved to Signups tab (admin only) */}
              <div className="text-right min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{userName}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">{displayRole}</p>
              </div>
              <Button variant="outline" size="sm" onClick={onLogout} className="flex-shrink-0 px-2 sm:px-3">
                <LogOut className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">Logout</span>
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
            showAdmin={adminFeatureEnabled && adminUnlocked}
            canViewLeaderboards={canViewLeaderboards}
            canViewRewards={canViewRewards}
            canViewTickets={canViewTickets}
            canViewReports={canViewReports}
            canViewIntegrity={canViewIntegrity}
            canViewPresentation={canViewPresentation}
            canViewAdmin={canViewAdmin}
            canViewSignups={canViewSignups}
            canGivePoints={canGivePoints}
            canMarkAttendance={canMarkAttendance}
            canManageCadets={canManageCadets}
            isPresentationRole={userRole === 'presentation'}
            adminPendingCount={adminUnlocked && canViewSignups ? adminPendingCount : 0}
            ticketsCount={canViewTickets ? ticketsCount : 0}
            integrityCheckCount={canViewIntegrity ? integrityCheckCount : 0}
            rewardsCount={canViewRewards ? rewardsCount : 0}
            pointsCount={canViewPoints ? pointsCount : 0}
            accessToken={accessToken}
          />
        </div>
      )}

      {/* Cadet navigation */}
      {userRole === 'cadet' && (
        <div className="mt-4 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 bg-white p-1.5 sm:p-2 rounded-lg shadow-sm border">
            {canViewLeaderboards && (
            <Button
              variant={activeTab === 'leaderboards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('leaderboards')}
              className="px-2 sm:px-3 text-[11px] sm:text-sm"
            >
              <TrendingUp className="size-3.5 sm:size-4 mr-1 sm:mr-2" />
              Leaderboards
            </Button>
            )}
            {canViewRewards && (
            <Button
              variant={activeTab === 'rewards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('rewards')}
              className="px-2 sm:px-3 text-[11px] sm:text-sm"
            >
              <Gift className="size-3.5 sm:size-4 mr-1 sm:mr-2" />
              Rewards
            </Button>
            )}
            {cadetName && canViewMyPoints && (
              <Button
                variant={activeTab === 'mypoints' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('mypoints')}
                className="px-2 sm:px-3 text-[11px] sm:text-sm"
              >
                <Award className="size-3.5 sm:size-4 mr-1 sm:mr-2" />
                Points
              </Button>
            )}
            {cadetName && canViewMyAttendance && (
              <Button
                variant={activeTab === 'myattendance' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('myattendance')}
                className="px-2 sm:px-3 text-[11px] sm:text-sm"
              >
                <CalendarDays className="size-3.5 sm:size-4 mr-1 sm:mr-2" />
                Attendance
              </Button>
            )}
            {canViewTickets && (
            <Button
              variant={activeTab === 'tickets' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('tickets')}
              className="px-2 sm:px-3 text-[11px] sm:text-sm"
            >
              <FileText className="size-3.5 sm:size-4 mr-1 sm:mr-2" />
              Tickets
            </Button>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="space-y-6">
          {canViewLeaderboards && <TabsContent value="leaderboards">
            <Leaderboards userRole={userRole} />
          </TabsContent>}

          {canViewRewards && <TabsContent value="rewards">
            <Rewards userRole={userRole} />
          </TabsContent>}

          {/* Show My Points tab for cadets with cadetName */}
          {userRole === 'cadet' && cadetName && canViewMyPoints && (
            <TabsContent value="mypoints">
              <MyPoints accessToken={accessToken} cadetName={cadetName} />
            </TabsContent>
          )}

          {/* My Attendance for cadets */}
          {userRole === 'cadet' && cadetName && canViewMyAttendance && (
            <TabsContent value="myattendance">
              <MyAttendance cadetName={cadetName} />
            </TabsContent>
          )}

          {/* Cadet tickets */}
          {userRole === 'cadet' && canViewTickets && (
            <TabsContent value="tickets">
              <Tickets accessToken={accessToken} />
            </TabsContent>
          )}

          {canViewPoints && (
            <TabsContent value="points">
              <PointsManager
                userRole={userRole}
                canEditPoints={canEditPoints}
                canDeletePoints={canDeletePoints}
                canViewRecentPoints={canEditPoints || canDeletePoints}
                canUseAdminPin={canUseAdminPin}
              />
            </TabsContent>
          )}

          {canViewAttendance && (
            <TabsContent value="attendance">
              <AttendanceManager
                userRole={userRole}
                canDeleteBulk={canDeleteAttendanceSessions}
                canViewRecentSessions={canEditAttendance || canDeleteAttendanceSessions}
                canEditSavedAttendance={canEditAttendance}
              />
            </TabsContent>
          )}

          {adminFeatureEnabled && (
            <>
              {canViewCadets && <TabsContent value="cadets">
                <CadetsManager accessToken={accessToken} />
              </TabsContent>}

              {canViewReports && <TabsContent value="reports">
                <ReportsExport accessToken={accessToken} userRole={userRole} />
              </TabsContent>}

              {canViewIntegrity && <TabsContent value="integrity">
                <div className="space-y-6">
                  <DataIntegrity accessToken={accessToken} />
                  <EffectivePermissions />
                </div>
              </TabsContent>}

              {adminUnlocked && canViewAdmin && (
                <TabsContent value="admin">
                  <AdminPointGivers accessToken={accessToken} />
                </TabsContent>
              )}

              {/* Admin tickets review (Flight Point Leads/Staff) */}
              {canViewTickets && <TabsContent value="tickets">
                <TicketsAdmin accessToken={accessToken} />
              </TabsContent>}

              {adminUnlocked && canViewSignups && canManageAccounts && (
                <TabsContent value="signups">
                  <AdminSignups accessToken={accessToken} currentUserId={user.id} currentUserRole={userRole} />
                </TabsContent>
              )}

              {canViewPresentation && <TabsContent value="presentation">
                <PresentationEditor />
              </TabsContent>}
            </>
          )}

          {/* Presentation-only role */}
          {userRole === 'presentation' && canViewPresentation && (
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
                  <strong>Required format:</strong> "Surname Initial" (e.g., Surname A)
                </>
              ) : (
                <>
                  An admin has suggested a corrected version of your username.
                  <br /><br />
                  <strong>Suggested format:</strong> "Surname Initial" (e.g., Surname A)
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