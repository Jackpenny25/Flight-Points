import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert, AlertDescription } from './ui/alert';
import { api } from '../../utils/api';

interface AdminPinManagerProps {
  accessToken: string;
  userId: string;
  userRole: string;
}

export function AdminPinManager({ accessToken, userId, userRole }: AdminPinManagerProps) {
  const [pinStatus, setPinStatus] = useState<{ is_default: boolean; last_changed: string | null; has_pin: boolean } | null>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leadUsers, setLeadUsers] = useState<Array<{ id: string; email: string; name: string; role: string }>>([]);

  const isLead = userRole === 'snco' || userRole === 'staff';

  const headers = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return h;
  }, [accessToken]);

  const fetchStatus = async () => {
    try {
      const res = await api.getPinStatus();
      setPinStatus(res);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  };

  const fetchLeadUsers = async () => {
    if (!isLead) return;
    try {
      const res = await api.getUsers();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const list = (data.users || [])
        .map((u: any) => ({
          id: u.id,
          email: u.email,
          name: u.user_metadata?.name || u.email || 'Unknown',
          role: String(u.user_metadata?.role || 'cadet').toLowerCase(),
        }))
        .filter((u: any) => u.role === 'snco' || u.role === 'staff');
      setLeadUsers(list);
    } catch {
      setLeadUsers([]);
    }
  };

  useEffect(() => {
    if (!accessToken || !userId) return;
    fetchStatus();
    fetchLeadUsers();
  }, [accessToken, userId, userRole]);

  const changePin = async () => {
    setError(null);
    setMessage(null);

    if (!/^\d{6}$/.test(newPin)) {
      setError('New PIN must be exactly 6 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('New PIN and confirm PIN do not match.');
      return;
    }

    setSaving(true);
    try {
      const res = await api.changePin(userId, currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setMessage('PIN updated successfully.');
      await fetchStatus();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const resetPin = async (targetUserId: string, targetName: string) => {
    if (!confirm(`Reset PIN for ${targetName}?`)) return;
    try {
      const res = await api.resetPin(targetUserId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Reset failed: ${data?.error || res.statusText}`);
        return;
      }
      alert(`Temporary PIN for ${targetName}: ${data.new_pin}\n\nShow this once only and ask them to change it immediately.`);
      if (targetUserId === userId) await fetchStatus();
    } catch (e: any) {
      alert(`Reset failed: ${String(e?.message || e)}`);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Admin PIN</CardTitle>
          <CardDescription>
            Enter the 6-digit admin PIN to unlock actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pinStatus?.is_default && (
            <Alert>
              <AlertDescription>
                You are still using a default PIN. Change it now.
              </AlertDescription>
            </Alert>
          )}

          {message && <div className="text-sm text-green-700">{message}</div>}
          {error && <div className="text-sm text-red-700">{error}</div>}

          <div className="grid sm:grid-cols-3 gap-3">
            <Input
              type="password"
              inputMode="numeric"
              placeholder="Current PIN"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Input
              type="password"
              inputMode="numeric"
              placeholder="New PIN (6 digits)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Input
              type="password"
              inputMode="numeric"
              placeholder="Confirm new PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={changePin} disabled={saving}>{saving ? 'Saving...' : 'Change PIN'}</Button>
          </div>
        </CardContent>
      </Card>

      {isLead && (
        <Card>
          <CardHeader>
            <CardTitle>Reset Lead PINs</CardTitle>
            <CardDescription>Reset SNCO/Staff PINs and share temporary PINs once.</CardDescription>
          </CardHeader>
          <CardContent>
            {leadUsers.length === 0 ? (
              <div className="text-sm text-muted-foreground">No Flight Point Lead/Staff accounts found.</div>
            ) : (
              <div className="space-y-2">
                {leadUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded border p-2">
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email} • {u.role === 'snco' ? 'Flight Point Lead' : 'Staff'}</div>
                    </div>
                    <Button variant="outline" onClick={() => resetPin(u.id, u.name)}>Reset PIN</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
