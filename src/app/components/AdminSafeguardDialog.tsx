import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { setAdminSafeguardToken } from '../../utils/adminSafeguard';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';

interface AdminSafeguardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onVerified: () => void | Promise<void>;
}

export function AdminSafeguardDialog({
  open,
  onOpenChange,
  title,
  description,
  onVerified,
}: AdminSafeguardDialogProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setCode('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed) && trimmed.length < 24) {
      setError('Enter a 6-digit authenticator code or your long backup code.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await api.verifyAdminCode(trimmed);
      if (!res?.success || !res?.safeguardToken) {
        setError(res?.error || 'Verification failed.');
        return;
      }
      setAdminSafeguardToken(res.safeguardToken);
      await onVerified();
      onOpenChange(false);
    } catch (err: any) {
      setError(String(err?.message || err || 'Verification failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.slice(0, 128))}
            placeholder="Authenticator code or backup code"
            autoFocus
            maxLength={128}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleVerify();
              }
            }}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleVerify} disabled={submitting}>{submitting ? 'Verifying…' : 'Verify & Continue'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}