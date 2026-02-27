import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { formatFlight } from './ui/utils';
import { toast } from 'sonner';
import { Copy, KeyRound, UserPlus, Trash2, Pencil } from 'lucide-react';

interface AdminSignupsProps {
  accessToken: string;
  currentUserId: string;
  currentUserRole: string;
}

interface CadetEntry {
  id: string;
  name: string;
  flight: string;
  rank?: string;
}

interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: string;
  username: string;
  cadetId?: string;
  createdBy?: string;
  createdAt?: string;
}

interface CreatedCredentials {
  username: string;
  password: string;
  name: string;
  role: string;
  flight: string;
}

export default function AdminSignups({ accessToken, currentUserId, currentUserRole }: AdminSignupsProps) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [cadets, setCadets] = useState<CadetEntry[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Create account state
  const [selectedCadetId, setSelectedCadetId] = useState('');
  const [selectedRole, setSelectedRole] = useState('cadet');
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);

  // Reset password state
  const [resetCredentials, setResetCredentials] = useState<{ username: string; password: string; name: string } | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  // Role change state
  const [roleSelections, setRoleSelections] = useState<Record<string, string>>({});

  // Search filters
  const [accountSearch, setAccountSearch] = useState('');
  const [cadetSearch, setCadetSearch] = useState('');

  // Edit username state
  const [editingUsernameId, setEditingUsernameId] = useState<string | null>(null);
  const [editUsernameValue, setEditUsernameValue] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  // Generate username preview (mirrors server logic)
  function generateUsernamePreview(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s.-]/g, '')
      .replace(/\s+/g, '.')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 30);
  }

  const fetchData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [cadetsRes, usersRes] = await Promise.all([
        api.getCadets(),
        api.getUsers(),
      ]);

      const cadetList: CadetEntry[] = Array.isArray(cadetsRes) ? cadetsRes : [];
      setCadets(cadetList);

      const userList: UserAccount[] = (usersRes.users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        username: u.username || (u.email?.includes('@') ? u.email.split('@')[0] : u.email),
        cadetId: u.cadetId,
        createdBy: u.createdBy,
        createdAt: u.createdAt,
      }));
      setUsers(userList);
    } catch (e: any) {
      setFetchError(String(e));
      setCadets([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Get cadets that don't already have accounts
  const cadetIdsWithAccounts = new Set(users.map(u => u.cadetId).filter(Boolean));
  const availableCadets = cadets.filter(c => !cadetIdsWithAccounts.has(c.id));

  // Group available cadets by flight
  const flightGroups: Record<string, CadetEntry[]> = {};
  for (const c of availableCadets) {
    const key = c.flight || 'unknown';
    if (!flightGroups[key]) flightGroups[key] = [];
    flightGroups[key].push(c);
  }
  const flightOrder = ['1', '2', '3', '4', 'hq', 'unknown'];
  const sortedFlights = Object.keys(flightGroups).sort((a, b) => {
    const ai = flightOrder.indexOf(a);
    const bi = flightOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const handleCadetSelect = (cadetId: string) => {
    setSelectedCadetId(cadetId);
    setCredentials(null);
    const cadet = cadets.find(c => c.id === cadetId);
    if (cadet) {
      setSelectedRole(cadet.flight === 'hq' ? 'staff' : 'cadet');
    }
  };

  const handleCreateAccount = async () => {
    if (!selectedCadetId) {
      toast.error('Select a cadet first');
      return;
    }
    setCreating(true);
    setCredentials(null);
    try {
      const res = await api.createAccount({ cadetId: selectedCadetId, role: selectedRole });
      if (res.error) {
        toast.error(res.error + (res.username ? ` (existing username: ${res.username})` : ''));
        return;
      }
      const acct = res.account;
      setCredentials({
        username: acct.username,
        password: acct.password,
        name: acct.name,
        role: acct.role,
        flight: acct.flight,
      });
      toast.success(`Account created for ${acct.name}`);
      setSelectedCadetId('');
      fetchData();
    } catch (e: any) {
      toast.error('Failed to create account: ' + String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    setResettingId(userId);
    setResetCredentials(null);
    try {
      const res = await api.resetAccountPassword(userId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setResetCredentials({
        username: res.username,
        password: res.password,
        name: res.name,
      });
      toast.success(`Password reset for ${res.name}`);
    } catch (e: any) {
      toast.error('Failed to reset password: ' + String(e));
    } finally {
      setResettingId(null);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Delete account for "${userName}"? This cannot be undone.`)) return;
    try {
      const res = await api.deleteUser(userId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Account deleted for ${userName}`);
      fetchData();
    } catch (e: any) {
      toast.error('Failed to delete account: ' + String(e));
    }
  };

  const handleChangeRole = async (userId: string) => {
    const newRole = roleSelections[userId];
    if (!newRole) return;
    try {
      const res = await api.updateUserRole(userId, newRole);
      if (res?.error) throw new Error(res.error);
      toast.success('Role updated');
      fetchData();
    } catch (e: any) {
      toast.error('Failed to update role: ' + String(e));
    }
  };

  const handleChangeUsername = async (userId: string) => {
    const newUsername = editUsernameValue.trim().toLowerCase()
      .replace(/[^a-z0-9.\-]/g, '')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 30);
    if (!newUsername) {
      toast.error('Invalid username');
      return;
    }
    setSavingUsername(true);
    try {
      const res = await api.updateUsername(userId, newUsername);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Username updated');
      setEditingUsernameId(null);
      setEditUsernameValue('');
      fetchData();
    } catch (e: any) {
      toast.error('Failed to update username: ' + String(e));
    } finally {
      setSavingUsername(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied`);
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  const filteredUsers = users.filter(u => {
    if (!accountSearch) return true;
    const search = accountSearch.toLowerCase();
    return u.name.toLowerCase().includes(search) ||
           u.username.toLowerCase().includes(search) ||
           u.role.toLowerCase().includes(search);
  });

  return (
    <div className="space-y-6">
      {/* Create Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Create Account
          </CardTitle>
          <CardDescription>Create a new login account for a cadet or staff member</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium mb-1 block">Select Cadet</label>
                <Select value={selectedCadetId} onValueChange={handleCadetSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a cadet…" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 pb-2">
                      <Input
                        placeholder="Search cadets…"
                        value={cadetSearch}
                        onChange={(e) => setCadetSearch(e.target.value)}
                        className="h-8 text-sm"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    {sortedFlights.map(flight => {
                      const cadetsInFlight = flightGroups[flight]?.filter(c => {
                        if (!cadetSearch) return true;
                        return c.name.toLowerCase().includes(cadetSearch.toLowerCase());
                      }) || [];
                      if (cadetsInFlight.length === 0) return null;
                      return (
                        <div key={flight}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            {formatFlight(flight)}
                          </div>
                          {cadetsInFlight.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.rank ? `${c.rank} ` : ''}{c.name}
                            </SelectItem>
                          ))}
                        </div>
                      );
                    })}
                    {availableCadets.length === 0 && (
                      <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                        All cadets already have accounts
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Role</label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cadet">Cadet</SelectItem>
                    <SelectItem value="pointgiver">Point Giver</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="snco">Flight Point Lead</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Username preview */}
            {selectedCadetId && (() => {
              const cadet = cadets.find(c => c.id === selectedCadetId);
              if (!cadet) return null;
              const preview = generateUsernamePreview(cadet.name);
              return (
                <div className="text-sm text-muted-foreground">
                  Username will be: <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{preview || '—'}</code>
                </div>
              );
            })()}

            <Button onClick={handleCreateAccount} disabled={!selectedCadetId || creating}>
              {creating ? 'Creating…' : 'Create Account'}
            </Button>

            {credentials && (
              <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950 space-y-3">
                <div className="font-semibold text-green-800 dark:text-green-200">
                  Account created for {credentials.name}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Username</div>
                    <div className="flex items-center gap-2">
                      <code className="text-base font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded border">
                        {credentials.username}
                      </code>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(credentials.username, 'Username')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Password</div>
                    <div className="flex items-center gap-2">
                      <code className="text-base font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded border">
                        {credentials.password}
                      </code>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(credentials.password, 'Password')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(
                      `Username: ${credentials.username}\nPassword: ${credentials.password}`,
                      'Credentials'
                    )}
                  >
                    <Copy className="h-4 w-4 mr-1" /> Copy Both
                  </Button>
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-300 mt-2 flex items-center gap-1">
                  ⚠ Save these credentials now — the password cannot be viewed again.
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reset Password Result */}
      {resetCredentials && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950">
          <CardContent className="pt-4 space-y-3">
            <div className="font-semibold text-blue-800 dark:text-blue-200">
              New password for {resetCredentials.name}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Username</div>
                <div className="flex items-center gap-2">
                  <code className="text-base font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded border">
                    {resetCredentials.username}
                  </code>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(resetCredentials.username, 'Username')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">New Password</div>
                <div className="flex items-center gap-2">
                  <code className="text-base font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded border">
                    {resetCredentials.password}
                  </code>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(resetCredentials.password, 'Password')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(
                  `Username: ${resetCredentials.username}\nPassword: ${resetCredentials.password}`,
                  'Credentials'
                )}
              >
                <Copy className="h-4 w-4 mr-1" /> Copy Both
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResetCredentials(null)}>Dismiss</Button>
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
              ⚠ Save this password now — it cannot be viewed again.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Existing Accounts</CardTitle>
          <CardDescription>Manage user accounts, roles, and passwords</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Loading…</div>
          ) : fetchError ? (
            <div className="text-red-600">{fetchError}</div>
          ) : users.length === 0 ? (
            <div>No accounts found</div>
          ) : (
            <div className="space-y-4">
              <Input
                placeholder="Search accounts…"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="max-w-sm"
              />
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell>
                          {editingUsernameId === u.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editUsernameValue}
                                onChange={(e) => setEditUsernameValue(e.target.value)}
                                className="h-8 w-[160px] font-mono text-sm"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleChangeUsername(u.id);
                                  if (e.key === 'Escape') { setEditingUsernameId(null); setEditUsernameValue(''); }
                                }}
                                autoFocus
                              />
                              <Button size="sm" onClick={() => handleChangeUsername(u.id)} disabled={savingUsername}>
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingUsernameId(null); setEditUsernameValue(''); }}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <code className="text-sm font-mono">{u.username}</code>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => { setEditingUsernameId(u.id); setEditUsernameValue(u.username); }}
                                title="Edit username"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={roleSelections[u.id] || u.role}
                            onValueChange={(v) => setRoleSelections(prev => ({ ...prev, [u.id]: v }))}
                          >
                            <SelectTrigger className="w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cadet">Cadet</SelectItem>
                              <SelectItem value="pointgiver">Point Giver</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                              <SelectItem value="snco">Flight Point Lead</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {roleSelections[u.id] && roleSelections[u.id] !== u.role && (
                              <Button size="sm" onClick={() => handleChangeRole(u.id)}>
                                Save
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResetPassword(u.id)}
                              disabled={resettingId === u.id}
                              title="Generate new password"
                            >
                              <KeyRound className="h-4 w-4 mr-1" />
                              {resettingId === u.id ? 'Resetting…' : 'New Password'}
                            </Button>
                            {u.id !== currentUserId && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteUser(u.id, u.name)}
                                title="Permanently delete account"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="text-sm text-muted-foreground">
                {users.length} account{users.length !== 1 ? 's' : ''} total
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
