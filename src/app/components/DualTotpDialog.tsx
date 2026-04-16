import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { setAdminSafeguardToken } from '../../utils/adminSafeguard';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { ShieldAlert } from 'lucide-react';

interface DualTotpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onVerified: () => void | Promise<void>;
}

export function DualTotpDialog({
  open,
  onOpenChange,
  title,
  description,
  onVerified,
}: DualTotpDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [code1, setCode1] = useState('');
  const [code2, setCode2] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setCode1('');
      setCode2('');
      setChallengeToken('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  const handleStep1 = async () => {
    const trimmed = code1.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter a 6-digit authenticator code.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await api.dualTotpStep1(trimmed);
      if (!res?.success || !res?.challengeToken) {
        setError(res?.error || 'Verification failed.');
        return;
      }
      setChallengeToken(res.challengeToken);
      setStep(2);
    } catch (err: any) {
      setError(String(err?.message || err || 'Verification failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStep2 = async () => {
    const trimmed = code2.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter a 6-digit authenticator code.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await api.dualTotpStep2(trimmed, challengeToken);
      if (!res?.success || !res?.safeguardToken) {
        const errMsg = res?.error || 'Verification failed.';
        // If challenge expired, reset to step 1
        if (errMsg.toLowerCase().includes('challenge expired') || errMsg.toLowerCase().includes('restart from step 1')) {
          setStep(1);
          setCode1('');
          setCode2('');
          setChallengeToken('');
          setError('Challenge expired. Please start again with a new first code.');
          return;
        }
        setError(errMsg);
        return;
      }
      setAdminSafeguardToken(res.safeguardToken);
      // Close dialog first, then execute the action
      // so bulk operation errors show as toasts, not dialog errors
      onOpenChange(false);
      try {
        await onVerified();
      } catch {
        // onVerified handles its own errors via toasts
      }
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
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${step === 1 ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>
              {step === 1 ? '1' : '✓'}
            </span>
            <span className={step === 1 ? 'text-blue-700' : 'text-green-700'}>First code</span>
            <span className="text-muted-foreground mx-1">→</span>
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              2
            </span>
            <span className={step === 2 ? 'text-blue-700' : 'text-muted-foreground'}>Second code</span>
          </div>

          {step === 1 ? (
            <>
              <p className="text-sm text-muted-foreground">
                Enter the current 6-digit code from your authenticator app.
              </p>
              <Input
                value={code1}
                onChange={(e) => setCode1(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="First authenticator code"
                autoFocus
                maxLength={6}
                inputMode="numeric"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleStep1();
                  }
                }}
              />
            </>
          ) : (
            <>
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                First code accepted. Wait for your authenticator to show a <strong>new code</strong>, then enter it below.
              </div>
              <Input
                value={code2}
                onChange={(e) => setCode2(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Second authenticator code (different)"
                autoFocus
                maxLength={6}
                inputMode="numeric"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleStep2();
                  }
                }}
              />
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          {step === 1 ? (
            <Button onClick={handleStep1} disabled={submitting || code1.length !== 6}>
              {submitting ? 'Verifying…' : 'Verify First Code'}
            </Button>
          ) : (
            <Button onClick={handleStep2} disabled={submitting || code2.length !== 6}>
              {submitting ? 'Verifying…' : 'Verify & Confirm'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
