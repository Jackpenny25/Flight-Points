import { useState, useEffect } from 'react';
import TopNav from './TopNav';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { LogOut, Award, TrendingUp, Users, CalendarDays, Shield, FileSpreadsheet, FileText, Gift, Presentation } from 'lucide-react';
import { PointsManager } from './PointsManager';
import { Leaderboards } from './Leaderboards';
import { AdminPointGivers } from './AdminPointGivers';
import { CadetsManager } from './CadetsManager';
import { AttendanceManager } from './AttendanceManager';
import { DataIntegrity } from './DataIntegrity';
import { ReportsExport } from './ReportsExport';
import { api } from '../../utils/api';
import { logout } from '../../utils/auth';
import { exportAllCsvs } from './downloadCsvUtil';
import AdminSignups from './AdminSignups';
import { MyPoints } from './MyPoints';
import { NotificationCenter } from './NotificationCenter';
import { Tickets } from './Tickets';
import { TicketsAdmin } from './TicketsAdmin';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { Rewards } from './Rewards';
import { PresentationEditor } from './PresentationEditor';
import { PresentationMode } from './PresentationMode';

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
        : (userRole.charAt(0).toUpperCase() + userRole.slice(1));
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
  const [pinDialogOpen, setPinDialogOpen] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  const [downloadDialogOpen, setDownloadDialogOpen] = useState<boolean>(false);
  const [downloadLoading, setDownloadLoading] = useState<boolean>(false);
  const [showMyRoleEditor, setShowMyRoleEditor] = useState<boolean>(false);
  const [myRoleSelection, setMyRoleSelection] = useState<string>(userRole);
  const [myRoleSaving, setMyRoleSaving] = useState<boolean>(false);
  const [useAdminPin, setUseAdminPin] = useState<boolean>(false);
  const [adminPinInput, setAdminPinInput] = useState<string>('');
  const [temporaryRole, setTemporaryRole] = useState<boolean>(false);
  const [tempDurationMinutes, setTempDurationMinutes] = useState<number>(30);

  const saveMyRole = async () => {
    if (!accessToken) { alert('Missing access token'); return }
    if (!user?.id) { alert('Missing user id'); return }
    if (myRoleSelection === userRole) { setShowMyRoleEditor(false); return }
    setMyRoleSaving(true)
    try {
      let res;
      // Replace with local API call
      res = await api.changeUserRole(user.id, myRoleSelection);
      if (!res || res.error) {
        alert('Failed to update role: ' + (res?.error || 'Unknown error'));
        return;
      }
      alert('Role updated. Please sign out and sign in to refresh permissions.');
      setShowMyRoleEditor(false);
    } catch (e:any) {
      console.error('Save role failed', e);
      alert('Save failed: ' + String(e));
    } finally {
      setMyRoleSaving(false);
    }
  }

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

  // Poll pending signup requests count for Flight Point Leads/Staff to show a badge on the NCO's tab
  useEffect(() => {
    if (!canManageCadets) return;
    let timer: any;
    const fetchCount = async () => {
      try {
        const res = await api.getPendingSignupsCount?.();
        if (typeof res?.count === 'number') setAdminPendingCount(res.count);
      } catch (e) {
        console.error('Failed to fetch pending signups count:', e);
      }
    };
    fetchCount();
    timer = setInterval(fetchCount, 20000);
    return () => clearInterval(timer);
  }, [canManageCadets, accessToken]);

  // Open download confirmation dialog when navigation requests the download tab
  useEffect(() => {
    if (activeTab === 'download') {
      setDownloadDialogOpen(true);
      // reset tab selection back to leaderboards so UI doesn't stay on a phantom tab
      setActiveTab('leaderboards');
    }
  }, [activeTab]);

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
                {userRole === 'snco' && adminUnlocked ? (
                  // Flight Point Leads in admin mode can open the role-change panel
                  <div className="text-xs text-gray-500 space-y-1">
                    <div>
                      <span className="text-left">{displayRole}</span>
                    </div>
                    <div>
                      {!showMyRoleEditor ? (
                        <button onClick={() => { setMyRoleSelection(userRole); setShowMyRoleEditor(true) }} className="text-[11px] text-primary underline">Change my role</button>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Select value={myRoleSelection} onValueChange={(v)=>setMyRoleSelection(v)}>
                              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cadet">Cadet</SelectItem>
                                <SelectItem value="pointgiver">Point Giver</SelectItem>
                                <SelectItem value="snco">Flight Point Lead</SelectItem>
                                <SelectItem value="staff">Staff</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button size="sm" onClick={saveMyRole} disabled={myRoleSaving}>{myRoleSaving ? 'Saving...' : 'Save'}</Button>
                            <Button variant="outline" size="sm" onClick={() => setShowMyRoleEditor(false)}>Cancel</Button>
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-xs">
                              <input type="checkbox" checked={temporaryRole} onChange={(e)=>setTemporaryRole(e.target.checked)} /> Temporary role
                            </label>
                            <label className="flex items-center gap-2 text-xs">
                              <input type="checkbox" checked={useAdminPin} onChange={(e)=>setUseAdminPin(e.target.checked)} /> Use admin PIN
                            </label>
                          </div>

                          {temporaryRole && (
                            <div className="flex items-center gap-2 text-xs">
                              <label>Duration (minutes)</label>
                              <input type="number" min={1} value={tempDurationMinutes} onChange={(e)=>setTempDurationMinutes(Math.max(1, Number(e.target.value)))} className="w-20 p-1 rounded border" />
                            </div>
                          )}

                          {useAdminPin && (
                            <div className="flex items-center gap-2 text-xs">
                              <label>Admin PIN</label>
                              <input type="password" value={adminPinInput} onChange={(e)=>setAdminPinInput(e.target.value)} className="w-32 p-1 rounded border" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">{displayRole}</p>
                )}
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

      {/* Download confirmation dialog (admin tab) */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download CSVs</DialogTitle>
            <DialogDescription>Export cadets, points and attendance as CSV files. Do you want to continue?</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">This will download CSV files for points, attendance and cadet totals. Keep your browser's popup/downloads enabled.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)} disabled={downloadLoading}>Cancel</Button>
            <Button onClick={async () => {
              try {
                setDownloadLoading(true)
                const res = await exportAllCsvs(accessToken)
                if (res && res.topCadet) {
                  alert(`Exported CSVs. Top cadet: ${res.topCadet.name} (${res.topCadet.totalPoints} points)`)
                } else {
                  alert('Exported CSVs')
                }
              } catch (err: any) {
                console.error(err)
                alert(err?.message || 'Failed to download CSVs. See console for details.')
              } finally {
                setDownloadLoading(false)
                setDownloadDialogOpen(false)
              }
            }} disabled={downloadLoading}>{downloadLoading ? 'Downloading...' : 'Download'}</Button>
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
              variant={activeTab === 'rewards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('rewards')}
              className="flex-1"
            >
              <Gift className="size-4 mr-2" />
              Rewards
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
            <Leaderboards />
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

          {/* Cadet tickets */}
          {userRole === 'cadet' && (
            <TabsContent value="tickets">
              <Tickets accessToken={accessToken} />
            </TabsContent>
          )}

          {canGivePoints && (
            <>
              <TabsContent value="points">
                <PointsManager userRole={userRole} />
              </TabsContent>

              <TabsContent value="attendance">
                <AttendanceManager userRole={userRole} />
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

              {/* Admin tickets review (Flight Point Leads/Staff) */}
              <TabsContent value="tickets">
                <TicketsAdmin accessToken={accessToken} />
              </TabsContent>

              {adminUnlocked && (
                <TabsContent value="signups">
                  <AdminSignups accessToken={accessToken} currentUserId={user.id} currentUserRole={userRole} />
                </TabsContent>
              )}

              <>
                <TabsContent value="presentationeditor">
                  <PresentationEditor />
                </TabsContent>
                
                <TabsContent value="presentation" className="h-[calc(100vh-200px)]">
                  <Presentation />
                </TabsContent>
              </>
            </>
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