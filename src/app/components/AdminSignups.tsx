import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { formatFlight } from './ui/utils';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface AdminSignupsProps {
  accessToken: string;
}

export default function AdminSignups({ accessToken }: AdminSignupsProps) {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pending, setPending] = useState<Array<{id:string;name:string;email:string;createdAt:string;flight?:string|null; existingAccounts?: Array<any> }>>([]);
  const [roleSelections, setRoleSelections] = useState<Record<string,string>>({});
  const [cadetSelections, setCadetSelections] = useState<Record<string,string>>({});
  const [nameSuggestions, setNameSuggestions] = useState<Record<string,string>>({});
  const [forceNameChange, setForceNameChange] = useState<Record<string,boolean>>({});
  const [cadets, setCadets] = useState<Array<{id:string;name:string;flight:string}>>([]);
  const [users, setUsers] = useState<Array<any>>([]);
  const [joinCodeInfo, setJoinCodeInfo] = useState<{joinCode:string|null;expiresAt:string|null;durationSeconds:number|null} | null>(null);
  const [duration, setDuration] = useState<number>(1); // in hours

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const fetchData = async () => {
    try {
      setFetchError(null);
      const reqRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/auth/requests`,
        { headers }
      );
      if (!reqRes.ok) {
        const errJson = await reqRes.json().catch(() => ({}));
        const msg = errJson?.error || reqRes.statusText || `Status ${reqRes.status}`;
        setFetchError(String(msg));
        setPending([]);
        setLoading(false);
        return;
      }
      const reqData = await reqRes.json();
      setPending((reqData.requests || []).sort((a:any,b:any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()));

      const cadRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/data/cadets`,
        { headers: { 'Authorization': `Bearer ${publicAnonKey}` } }
      );
      const cadData = await cadRes.json();
      setCadets((cadData.cadets || []).map((c:any)=>({ id: c.id, name: c.name, flight: c.flight })));

      const jcRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/admin/join-code`,
        { headers }
      );
      const jcData = await jcRes.json();
      if (jcRes.ok) setJoinCodeInfo(jcData);

      // Fetch existing Supabase users for admin management
      try {
        const usersRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/auth/users`,
          { headers }
        );
        const usersData = await usersRes.json();
        if (usersRes.ok) setUsers((usersData.users || []).map((u:any)=>({ id: u.id, email: u.email, user_metadata: u.user_metadata || {}, created_at: u.created_at })));
      } catch (e) {
        setUsers([]);
      }
    } catch (e) {
      setPending([]);
      setJoinCodeInfo(null);
      setCadets([]);
      setFetchError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="space-y-6">
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
                onChange={(e) => setDuration(Math.max(0.5, Number(e.target.value)))}
                placeholder="1"
              />
            </div>
            <div className="flex justify-start sm:justify-end">
              <Button onClick={async ()=>{
                const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/admin/join-code`,{
                  method:'POST', headers, body: JSON.stringify({ durationSeconds: Math.round(duration * 3600) })
                });
                const data = await res.json();
                if (res.ok) setJoinCodeInfo(data);
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

      <Card className={pending.length > 0 ? 'border-red-500' : ''}>
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
                      <TableCell>{u.user_metadata?.role || 'cadet'}</TableCell>
                      <TableCell>{u.user_metadata?.flight || '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={async ()=>{
                            // Prompt for editable fields
                            const newName = window.prompt('Name:', u.user_metadata?.name || '');
                            if (newName === null) return;
                            const newUsername = window.prompt('Username (login):', u.user_metadata?.username || u.user_metadata?.name || '');
                            if (newUsername === null) return;
                            const newRole = window.prompt('Role (cadet|pointgiver|snco|staff):', u.user_metadata?.role || 'cadet');
                            if (newRole === null) return;
                            const newFlight = window.prompt('Flight (optional):', u.user_metadata?.flight || '');
                            if (newFlight === null) return;
                            const newCadetId = window.prompt('Cadet ID to link (optional):', '');
                            const newPassword = window.prompt('Set new password (leave blank to keep current):', '');
                            try {
                              const body: any = { name: newName, username: newUsername, role: newRole, flight: newFlight };
                              if (newCadetId) body.cadetId = newCadetId;
                              if (newPassword) body.password = newPassword;
                              const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/auth/users/${u.id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
                              const data = await res.json().catch(()=>({}));
                              if (!res.ok) {
                                alert('Update failed: ' + (data.error || res.statusText));
                                return;
                              }
                              // refresh
                              fetchData();
                              alert('User updated');
                            } catch (e:any) {
                              console.error('Update user failed', e);
                              alert('Update failed: ' + String(e));
                            }
                          }}>Edit</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        <CardHeader>
          <CardTitle>
            Pending Signups {pending.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-6 h-6 text-xs px-2 rounded-full bg-red-600 text-white">{pending.length}</span>
            )}
          </CardTitle>
          <CardDescription>Requests awaiting SNCO approval and role assignment</CardDescription>
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
                              {(cadets || [])
                                .filter(c => {
                                  // Filter by flight if provided
                                  const flightMatch = !r.flight || (String(c.flight).trim() === String(r.flight).trim());
                                  // Then filter by name match (case-insensitive)
                                  const nameMatch = String(c.name).toLowerCase().includes(String(r.name).toLowerCase());
                                  return flightMatch && nameMatch;
                                })
                                // If no matches, show all cadets for that flight
                                .length === 0 
                                  ? (cadets || []).filter(c => !r.flight || (String(c.flight).trim() === String(r.flight).trim()))
                                  : (cadets || []).filter(c => {
                                      const flightMatch = !r.flight || (String(c.flight).trim() === String(r.flight).trim());
                                      const nameMatch = String(c.name).toLowerCase().includes(String(r.name).toLowerCase());
                                      return flightMatch && nameMatch;
                                    })
                                .map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
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
                                  <Button size="xs" onClick={async ()=>{
                                    const password = window.prompt('Set a password for the existing account (leave blank to keep current):') || null;
                                    try {
                                      const body: any = { userId: a.id, role: roleSelections[r.id] || 'cadet' };
                                      if (cadetSelections[r.id]) body.cadetId = cadetSelections[r.id];
                                      if (password) body.password = password;
                                      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/auth/requests/${r.id}/link`, { method: 'POST', headers, body: JSON.stringify(body) });
                                      const data = await res.json().catch(()=>({}));
                                      if (!res.ok) {
                                        alert('Link failed: ' + (data.error || res.statusText));
                                        return;
                                      }
                                      fetchData();
                                    } catch (e:any) {
                                      console.error('Link failed', e);
                                      alert('Link failed: ' + String(e));
                                    }
                                  }}>Link</Button>
                                  <Button size="xs" variant="outline" onClick={async ()=>{
                                    const pass = window.prompt('Set a new password for this account (leave blank to cancel):');
                                    if (!pass) return;
                                    try {
                                      const body = { userId: a.id, password: pass };
                                      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/auth/requests/${r.id}/link`, { method: 'POST', headers, body: JSON.stringify(body) });
                                      const data = await res.json().catch(()=>({}));
                                      if (!res.ok) {
                                        alert('Set password failed: ' + (data.error || res.statusText));
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
                              <SelectItem value="snco">SNCO</SelectItem>
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
                            const requestBody: any = { 
                              role: roleSelections[r.id] || 'cadet', 
                              cadetId 
                            };

                            // Include name suggestion if provided
                            if (nameSuggestions[r.id]?.trim()) {
                              requestBody.suggestedName = nameSuggestions[r.id].trim();
                              requestBody.forceNameChange = forceNameChange[r.id] || false;
                            }

                            try {
                              const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/auth/requests/${r.id}/approve`,{
                                method:'POST', headers, body: JSON.stringify(requestBody)
                              });
                              const data = await res.json().catch(()=>({}));
                              if (!res.ok) {
                                alert('Approve failed: ' + (data.error || res.statusText));
                                return;
                              }
                              // success
                              fetchData();
                            } catch (e:any) {
                              console.error('Approve request failed', e);
                              alert('Approve request failed: ' + String(e));
                            }
                          }}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={async ()=>{
                            try {
                              const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/auth/requests/${r.id}`,{
                                method:'DELETE', headers
                              });
                              const data = await res.json().catch(()=>({}));
                              if (!res.ok) {
                                alert('Reject failed: ' + (data.error || res.statusText));
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
