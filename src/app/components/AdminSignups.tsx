import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { formatFlight } from './ui/utils';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { AdminPinManager } from './AdminPinManager';
import { toast } from 'sonner';

// NOTE: AdminSignups component requires the following API methods to be implemented:
// - api.getPendingSignups()
// - api.getJoinCode()
// - api.getUsers()
// - api.approveUser(userId, data)
// - api.updateUserRole(userId, role)
// - api.createJoinCode({ durationSeconds })
// These methods are not yet available in the local API and need to be added.

interface PendingSignup {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  flight?: string | null;
}

interface User {
  id: string;
  email: string;
  user_metadata: any;
  created_at: string;
}
interface JoinCodeInfo {
  joinCode: string | null;
  expiresAt: string | null;
  durationSeconds: number | null;
}

export default function AdminSignups({ accessToken, currentUserId, currentUserRole }: AdminSignupsProps) {
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

  const handleApproveUser = async (userId: string) => {
    try {
      const res = await api.approveUser(userId);
      if (res?.error) throw new Error(res.error);
      toast.success('User approved');
      fetchData();
    } catch (e: any) {
      toast.error('Failed to approve user: ' + String(e));
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      const res = await api.updateUserRole(userId, newRole);
      if (res?.error) throw new Error(res.error);
      toast.success('Role updated');
      fetchData();
    } catch (e: any) {
      toast.error('Failed to update role: ' + String(e));
    }
  };

  const handleUpdateJoinCode = async (durationHours: number) => {
    try {
      const res = await api.createJoinCode?.({ durationSeconds: Math.round(durationHours * 3600) });
      if (res?.error) throw new Error(res.error);
      setJoinCodeInfo(res);
      toast.success('Join code updated');
    } catch (e: any) {
      toast.error('Failed to update join code: ' + String(e));
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <AdminPinManager accessToken={accessToken} userId={currentUserId} userRole={currentUserRole} />

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!confirm('Run data retention cleanup now? This will permanently delete records older than 4 years.')) return;
            try {
              const url = `https://${projectId}.supabase.co/functions/v1/server/retention/cleanup`;
              const res = await fetch(url, { method: 'POST', headers: makeHeaders() });
              const data = await res.json();
              if (!res.ok) {
                alert('Cleanup failed: ' + (data.error || res.statusText));
                return;
              }
              alert('Cleanup completed. Deleted: ' + JSON.stringify(data.deleted));
              // refresh list after cleanup
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
          <CardTitle>Join Code Management</CardTitle>
          <CardDescription>Create time-limited join codes for new signups</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input type="number" placeholder="Duration (hours)" className="w-32" onChange={(e) => handleUpdateJoinCode(parseFloat(e.target.value) || 1)} />
              <Button onClick={() => handleUpdateJoinCode(1)}>Generate Code</Button>
            </div>
            {joinCodeInfo?.joinCode && (
              <div className="p-4 border rounded bg-muted">
                <div className="text-sm font-medium">Current Join Code:</div>
                <div className="font-mono text-lg">{joinCodeInfo.joinCode}</div>
                <div className="text-sm text-muted-foreground mt-2">
                  Expires: {joinCodeInfo.expiresAt ? new Date(joinCodeInfo.expiresAt).toLocaleString() : 'N/A'}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pending Signups</CardTitle>
          <CardDescription>Requests awaiting approval</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Loading…</div>
          ) : fetchError ? (
            <div className="text-red-600">{fetchError}</div>
          ) : pending.length === 0 ? (
            <div>No pending requests</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Flight</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.flight || '—'}</TableCell>
                    <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => handleApproveUser(r.id)}>Approve</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Existing Accounts</CardTitle>
          <CardDescription>Manage user roles</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Loading…</div>
          ) : fetchError ? (
            <div className="text-red-600">{fetchError}</div>
          ) : users.length === 0 ? (
            <div>No managed accounts found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.user_metadata?.name || '—'}</TableCell>
                    <TableCell>
                      <Select value={u.user_metadata?.role || 'cadet'} onValueChange={(v) => setRoleSelections(prev => ({ ...prev, [u.id]: v }))}>
                        <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cadet">Cadet</SelectItem>
                          <SelectItem value="pointgiver">Point Giver</SelectItem>
                          <SelectItem value="snco">Flight Point Lead</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => handleChangeRole(u.id, roleSelections[u.id] || u.user_metadata?.role || 'cadet')}>Save</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
