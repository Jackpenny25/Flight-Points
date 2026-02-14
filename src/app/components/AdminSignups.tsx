import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { formatFlight } from './ui/utils';
import { api } from '../../../utils/api';
import { getCurrentUser } from '../../../utils/auth';

interface AdminSignupsProps {
  accessToken: string;
}

export default function AdminSignups({ accessToken }: AdminSignupsProps) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Array<any>>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pending, setPending] = useState<Array<{id:string;name:string;email:string;createdAt:string;flight?:string|null; existingAccounts?: Array<any> }>>([]);
  const [roleSelections, setRoleSelections] = useState<Record<string,string>>({});
  const [cadetSelections, setCadetSelections] = useState<Record<string,string>>({});
  const [nameSuggestions, setNameSuggestions] = useState<Record<string,string>>({});
  const [forceNameChange, setForceNameChange] = useState<Record<string,boolean>>({});
  const [cadets, setCadets] = useState<Array<{id:string;name:string;flight:string}>>([]);
  
  const [joinCodeInfo, setJoinCodeInfo] = useState<{joinCode:string|null;expiresAt:string|null;durationSeconds:number|null} | null>(null);
  const [duration, setDuration] = useState<number>(1); // in hours

  const fetchData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      // 1. Fetch pending signups
      const pendingRes = await api.getPendingSignups();
      if (pendingRes.error) throw new Error(pendingRes.error);
      setPending(pendingRes.signups || []);

      // 2. Fetch join code info
      const joinCodeRes = await api.getJoinCode?.();
      if (joinCodeRes) setJoinCodeInfo(joinCodeRes);

      // 3. Fetch all users for admin management
      const usersRes = await api.getUsers();
      if (usersRes.error) throw new Error(usersRes.error);
      setUsers((usersRes.users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        user_metadata: u.user_metadata || {},
        created_at: u.created_at
      })));
    } catch (e: any) {
      setFetchError(String(e));
      setPending([]);
      setJoinCodeInfo(null);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    if (!accessToken) {
      setFetchError('Missing access token — please sign in again');
      setLoading(false);
      return;
    }
    fetchData();
  }, [accessToken]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!confirm('Run data retention cleanup now? This will permanently delete records older than 4 years.')) return;
            try {
              // Replace with local API call if available
              const res = await api.cleanupRetention?.();
              if (!res?.ok) {
                alert('Cleanup failed: ' + (res?.error || res?.statusText));
                return;
              }
              alert('Cleanup completed. Deleted: ' + JSON.stringify(res?.deleted));
              fetchData();
            } catch (e) {
              console.error('Cleanup request failed', e);
              alert('Cleanup request failed');
            }
          }}
        >
          Run Retention Cleanup
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Join Code</CardTitle>
          <CardDescription>Generate a temporary code cadets must enter to request accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4 items-end">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Duration (hours)</div>
              <Input 
                type="number" 
                min="0.5" 
                step="0.5"
                value={duration} 
                onChange={(e) => setDuration(Math.max(0.5, Number(e.target.value)))
                }
                placeholder="1"
              />
            </div>
            <div className="flex justify-start sm:justify-end">
              <Button onClick={async ()=>{
                const res = await api.createJoinCode?.({ durationSeconds: Math.round(duration * 3600) });
                if (res?.ok) setJoinCodeInfo(res);
              }}>Create / Rotate Code</Button>
            </div>
          </div>

          <div className="mt-4 rounded-md border p-4 bg-muted/30">
            {joinCodeInfo?.joinCode ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-sm text-muted-foreground">Current Join Code</div>
                  <div className="text-2xl font-bold tracking-widest">{joinCodeInfo.joinCode}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Expires</div>
                  <div className="font-medium">{new Date(joinCodeInfo.expiresAt!).toLocaleString()}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No active join code. Create one above.</div>
            )}
          </div>
        </CardContent>
      </Card>
        <Card>
          <CardHeader>
            <CardTitle>Existing Accounts</CardTitle>
            <CardDescription>Manage Supabase accounts (role, username, flight etc.)</CardDescription>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <div className="text-sm text-muted-foreground">No managed accounts found</div>
            ) : (
              <div className="overflow-x-auto mb-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Flight</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{u.user_metadata?.name || '—'}</TableCell>
                        <TableCell>{u.user_metadata?.username || u.user_metadata?.name || '—'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select value={u.user_metadata?.role || 'cadet'} onValueChange={(v)=>{
                              // update local copy so UI shows selection
                              setUsers(prev=>prev.map(p=>p.id===u.id?{...p, user_metadata:{...p.user_metadata, role:v}}:p))
                            }}>
                              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cadet">Cadet</SelectItem>
                                <SelectItem value="pointgiver">Point Giver</SelectItem>
                                <SelectItem value="snco">Flight Point Lead</SelectItem>
                                <SelectItem value="staff">Staff</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell>{u.user_metadata?.flight || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={async ()=>{
                              if (!confirm(`Change role for ${u.email} to ${u.user_metadata?.role || 'cadet'}?`)) return;
                              try {
                                const res = await api.updateUserRole(u.id, u.user_metadata?.role || 'cadet');
                                if (res?.error) {
                                  alert('Update failed: ' + (res.error));
                                  return;
                                }
                                fetchData();
                                alert('User updated');
                              } catch (e:any) {
                                console.error('Update user failed', e);
                                alert('Update failed: ' + String(e));
                              }
                            }}>Save</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={pending.length > 0 ? 'border-red-500' : ''}>
        
          <CardHeader>
          <CardTitle>
            Pending Signups {pending.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-6 h-6 text-xs px-2 rounded-full bg-red-600 text-white">{pending.length}</span>
            )}
          </CardTitle>
          <CardDescription>Requests awaiting Flight Point Lead approval and role assignment</CardDescription>
        </CardHeader>
        <CardContent>
          {fetchError && (
            <div className="text-sm text-red-700 bg-red-50 p-3 rounded mb-4">Failed to load pending signups: {fetchError}</div>
          )}
          {loading ? (
            <div className="text-center text-muted-foreground py-6">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="text-sm text-muted-foreground">No pending requests</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Flight</TableHead>
                    <TableHead>Cadet Mapping</TableHead>
                    <TableHead>Suggested Name</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Existing Accounts</TableHead>
                    <TableHead className="text-right">Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                      </TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>{r.flight ? formatFlight(r.flight) : '—'}</TableCell>
                      <TableCell>
                        <div className="max-w-[220px]">
                          <Select value={cadetSelections[r.id] || ''} onValueChange={(v)=>setCadetSelections(prev=>({...prev,[r.id]:v}))}>
                            <SelectTrigger><SelectValue placeholder="Select cadet" /></SelectTrigger>
                                <SelectContent>
                              {(() => {
                                const matches = (cadets || []).filter(c => {
                                  const flightMatch = !r.flight || (String(c.flight).trim() === String(r.flight).trim());
                                  const nameMatch = String(c.name).toLowerCase().includes(String(r.name).toLowerCase());
                                  return flightMatch && nameMatch;
                                });
                                const list = matches.length === 0
                                  ? (cadets || []).filter(c => !r.flight || (String(c.flight).trim() === String(r.flight).trim()))
                                  : matches;
                                return list.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ));
                              })()}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2 max-w-[200px]">
                          <Input
                            placeholder="Corrected name..."
                            value={nameSuggestions[r.id] || ''}
                            onChange={(e) => setNameSuggestions(prev => ({...prev, [r.id]: e.target.value}))}
                            className="text-sm"
                          />
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={forceNameChange[r.id] || false}
                              onChange={(e) => setForceNameChange(prev => ({...prev, [r.id]: e.target.checked}))}
                              className="rounded"
                            />
                            Force change
                          </label>
                          {nameSuggestions[r.id] && (
                            <p className="text-xs text-amber-600">
                              {forceNameChange[r.id] ? '⚠️ User must change name' : 'ℹ️ Suggestion only'}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.existingAccounts && r.existingAccounts.length > 0 ? (
                          <div className="space-y-2">
                            {r.existingAccounts.map((a:any) => (
                              <div key={a.id} className="flex items-center justify-between bg-muted/20 p-2 rounded">
                                <div className="text-sm">{a.email}</div>
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={async ()=>{
                                    const password = window.prompt('Set a password for the existing account (leave blank to keep current):') || null;
                                    try {
                                      const res = await api.linkExistingAccount?.({ userId: a.id, role: roleSelections[r.id] || 'cadet', cadetId: cadetSelections[r.id], password });
                                      if (res?.error) {
                                        alert('Link failed: ' + (res.error));
                                        return;
                                      }
                                      fetchData();
                                    } catch (e:any) {
                                      console.error('Link failed', e);
                                      alert('Link failed: ' + String(e));
                                    }
                                  }}>Link</Button>
                                  <Button size="sm" variant="outline" onClick={async ()=>{
                                    const pass = window.prompt('Set a new password for this account (leave blank to cancel):');
                                    if (!pass) return;
                                    try {
                                      const res = await api.setUserPassword?.({ userId: a.id, password: pass });
                                      if (res?.error) {
                                        alert('Set password failed: ' + (res.error));
                                        return;
                                      }
                                      fetchData();
                                    } catch (e:any) {
                                      console.error('Set password failed', e);
                                    }
                                  }}>Set password</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <Select value={roleSelections[r.id] || 'cadet'} onValueChange={(v)=>setRoleSelections(prev=>({...prev,[r.id]:v}))}>
                            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cadet">Cadet</SelectItem>
                              <SelectItem value="pointgiver">Point Giver</SelectItem>
                              <SelectItem value="snco">Flight Point Lead</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" onClick={async ()=>{
                            const cadetId = cadetSelections[r.id];
                            if (!cadetId) {
                              alert('Please select a cadet to map this account to.');
                              return;
                            }
                            try {
                              const res = await api.approveUser(r.id, {
                                role: roleSelections[r.id] || 'cadet',
                                cadetId,
                                suggestedName: nameSuggestions[r.id]?.trim(),
                                forceNameChange: forceNameChange[r.id] || false
                              });
                              if (res?.error) {
                                alert('Approve failed: ' + (res.error));
                                return;
                              }
                              fetchData();
                            } catch (e:any) {
                              console.error('Approve request failed', e);
                              alert('Approve request failed: ' + String(e));
                            }
                          }}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={async ()=>{
                            try {
                              const res = await api.rejectUser?.(r.id);
                              if (res?.error) {
                                alert('Reject failed: ' + (res.error));
                                return;
                              }
                              fetchData();
                            } catch (e:any) {
                              console.error('Reject request failed', e);
                              alert('Reject request failed: ' + String(e));
                            }
                          }}>Reject</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}