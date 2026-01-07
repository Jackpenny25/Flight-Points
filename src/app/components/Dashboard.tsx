import { useState, useEffect } from 'react';
import TopNav from './TopNav';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { LogOut, Award, TrendingUp, Users, CalendarDays, Shield, FileSpreadsheet, FileText } from 'lucide-react';
import { PointsManager } from './PointsManager';
import { Leaderboards } from './Leaderboards';
import { AdminPointGivers } from './AdminPointGivers';
import { CadetsManager } from './CadetsManager';
import { AttendanceManager } from './AttendanceManager';
import { DataIntegrity } from './DataIntegrity';
import { ReportsExport } from './ReportsExport';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import AdminSignups from './AdminSignups';
import { MyPoints } from './MyPoints';
import { NotificationCenter } from './NotificationCenter';
import { Tickets } from './Tickets';
import { TicketsAdmin } from './TicketsAdmin';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';

interface DashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
}

export function Dashboard({ user, accessToken, onLogout }: DashboardProps) {
  const userRole = user?.user_metadata?.role || 'cadet';
  const userName = user?.user_metadata?.name || user?.email || 'User';
  const cadetName = user?.user_metadata?.cadetName;
  const suggestedName = user?.user_metadata?.suggestedName;
  const requireNameChange = user?.user_metadata?.requireNameChange === true;
  
  const canGivePoints = userRole === 'pointgiver' || userRole === 'snco' || userRole === 'staff';
  const canManageCadets = userRole === 'snco' || userRole === 'staff';

  // tabCount not currently used; remove to avoid premature reference

  const [activeTab, setActiveTab] = useState<string>('leaderboards');
  const [adminPendingCount, setAdminPendingCount] = useState<number>(0);
  const [ticketsCount, setTicketsCount] = useState<number>(0);
  
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
  const ADMIN_PIN = '5394';
  const [pinDialogOpen, setPinDialogOpen] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  const openPinDialog = () => {
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

  const submitPin = () => {
    if (pinInput === ADMIN_PIN) {
      sessionStorage.setItem('adminPinVerified', 'true');
      setAdminUnlocked(true);
      setPinDialogOpen(false);
      setPinError('');
      setPinInput('');
    } else {
      setPinError('Incorrect PIN');
    }
  };

  // Poll pending signup requests count for SNCO/Staff to show a badge on the NCO's tab
  useEffect(() => {
    if (!canManageCadets) return;
    const url = `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/data/signups-count`;
    let timer: any;
    const fetchCount = async () => {
      try {
        const res = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          }
        });
        const data = await res.json();
        console.log('Pending signups count:', data.count);
        if (typeof data.count === 'number') setAdminPendingCount(data.count);
      } catch (e) {
        console.error('Failed to fetch pending signups count:', e);
      }
    };
    fetchCount();
    timer = setInterval(fetchCount, 20000);
    return () => clearInterval(timer);
  }, [canManageCadets, accessToken]);

  // Poll open tickets count for SNCO/Staff to show a badge on the Tickets tab
  useEffect(() => {
    if (!canManageCadets) return;
    const url = `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/data/tickets-count`;
    let timer: any;
    const fetchCount = async () => {
      try {
        const res = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          }
        });
        const data = await res.json();
        console.log('Open tickets count:', data.count);
        if (typeof data.count === 'number') setTicketsCount(data.count);
      } catch (e) {
        console.error('Failed to fetch open tickets count:', e);
      }
    };
    fetchCount();
    timer = setInterval(fetchCount, 20000);
    return () => clearInterval(timer);
  }, [canManageCadets, accessToken]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-md border-b-2 border-primary/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <img
                src={adminUnlocked ? '/logo-black.jpg' : '/logo.png'}
                alt="2427 Squadron"
                className="h-12 w-12 object-contain cursor-pointer"
                title={adminUnlocked ? 'Click to lock admin' : 'Click to unlock admin'}
                onClick={() => (adminUnlocked ? lockAdmin() : openPinDialog())}
                onError={(e) => {
                  const step = e.currentTarget.getAttribute('data-failed') || '';
                  if (adminUnlocked) {
                    // Try JPG → JPEG → PNG → regular logo
                    if (step === '') {
                      e.currentTarget.setAttribute('data-failed', 'jpg');
                      e.currentTarget.src = '/logo-black.jpeg';
                      return;
                    }
                    if (step === 'jpg') {
                      e.currentTarget.setAttribute('data-failed', 'jpeg');
                      e.currentTarget.src = '/logo-black.png';
                      return;
                    }
                    if (step === 'jpeg') {
                      e.currentTarget.setAttribute('data-failed', 'png');
                      e.currentTarget.src = '/logo.png';
                      return;
                    }
                  }
                  // Hide if all fallbacks fail
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div>
                <h1 className="text-xl font-bold text-primary">2427 (Biggin Hill) Squadron</h1>
                <p className="text-sm text-muted-foreground">RAF Air Cadets - Flight Points</p>
              </div>
              {/* Admin text indicator removed; logo color indicates unlock state */}
            </div>
            <div className="flex items-center gap-4">
                {userRole === 'cadet' && <NotificationCenter accessToken={accessToken} />}
                <PrivacyPolicyModal />
                {/* Retention cleanup (staff/SNCO only) */}
                {canManageCadets && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (!confirm('Run data retention cleanup now? This will permanently delete records older than 4 years.')) return;
                      try {
                        const url = `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/retention/cleanup`;
                        const res = await fetch(url, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`,
                          }
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          alert('Cleanup failed: ' + (data.error || res.statusText));
                          return;
                        }
                        alert('Cleanup completed. Deleted: ' + JSON.stringify(data.deleted));
                      } catch (e) {
                        console.error('Cleanup request failed', e);
                        alert('Cleanup request failed');
                      }
                    }}
                  >
                    Run Retention Cleanup
                  </Button>
                )}
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

      {/* Admin PIN Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin Unlock</DialogTitle>
            <DialogDescription>Enter the 4-digit admin PIN to unlock actions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="PIN"
              maxLength={4}
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
            canManageCadets={canManageCadets}
            adminPendingCount={adminUnlocked && canManageCadets ? adminPendingCount : 0}
            ticketsCount={canManageCadets ? ticketsCount : 0}
            accessToken={accessToken}
          />
        </div>
      )}

      {/* Cadet navigation */}
      {userRole === 'cadet' && cadetName && (
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
              variant={activeTab === 'mypoints' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('mypoints')}
              className="flex-1"
            >
              <Award className="size-4 mr-2" />
              My Points
            </Button>
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
            <Leaderboards accessToken={accessToken} />
          </TabsContent>

          {/* Show My Points tab for cadets with cadetName */}
          {userRole === 'cadet' && cadetName && (
            <TabsContent value="mypoints">
              <MyPoints accessToken={accessToken} cadetName={cadetName} />
            </TabsContent>
          )}

          {/* Cadet tickets */}
          {userRole === 'cadet' && (
            <TabsContent value="tickets">
              <Tickets accessToken={accessToken} />
            </TabsContent>
          )}

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

              {adminUnlocked && (
                <TabsContent value="admin">
                  <AdminPointGivers accessToken={accessToken} />
                </TabsContent>
              )}

              {/* Admin tickets review (SNCO/Staff) */}
              <TabsContent value="tickets">
                <TicketsAdmin accessToken={accessToken} />
              </TabsContent>

              {adminUnlocked && (
                <TabsContent value="signups">
                  <AdminSignups accessToken={accessToken} />
                </TabsContent>
              )}
            </>
          )}

          {/* bottom tab triggers removed; use TopNav above */}
        </Tabs>
      </main>

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
                  const response = await fetch(
                    `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/auth/update-name`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                      },
                      body: JSON.stringify({ name: newName.trim() }),
                    }
                  );
                  
                  if (!response.ok) {
                    const error = await response.json();
                    setNameChangeError(error.error || 'Failed to update name');
                    return;
                  }
                  
                  // Success - reload to get updated user data
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