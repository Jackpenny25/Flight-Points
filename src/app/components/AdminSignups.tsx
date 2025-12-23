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
  const [pending, setPending] = useState<Array<{id:string;name:string;email:string;createdAt:string;flight?:string|null}>>([]);
  const [roleSelections, setRoleSelections] = useState<Record<string,string>>({});
  const [cadetSelections, setCadetSelections] = useState<Record<string,string>>({});
  const [cadets, setCadets] = useState<Array<{id:string;name:string;flight:string}>>([]);
  const [joinCodeInfo, setJoinCodeInfo] = useState<{joinCode:string|null;expiresAt:string|null;durationSeconds:number|null} | null>(null);
  const [duration, setDuration] = useState<number>(1); // in hours

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const fetchData = async () => {
    try {
      const reqRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/auth/requests`,
        { headers }
      );
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
    } catch (e) {
      setPending([]);
      setJoinCodeInfo(null);
      setCadets([]);
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
          <CardTitle>
            Pending Signups {pending.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-6 h-6 text-xs px-2 rounded-full bg-red-600 text-white">{pending.length}</span>
            )}
          </CardTitle>
          <CardDescription>Requests awaiting SNCO approval and role assignment</CardDescription>
        </CardHeader>
        <CardContent>
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
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell>
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
                      <TableCell className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</TableCell>
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
                            await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/auth/requests/${r.id}/approve`,{
                              method:'POST', headers, body: JSON.stringify({ role: roleSelections[r.id] || 'cadet', cadetId })
                            });
                            fetchData();
                          }}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={async ()=>{
                            await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/auth/requests/${r.id}`,{
                              method:'DELETE', headers
                            });
                            fetchData();
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
