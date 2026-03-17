import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** If set, user must type this exact text to enable the confirm button */
  confirmText?: string;
  /** Label shown next to the typed-confirm input */
  confirmLabel?: string;
  /** Number of records affected — shown as a warning */
  affectedCount?: number;
  onConfirm: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  confirmLabel,
  affectedCount,
  onConfirm,
  destructive = true,
}: ConfirmDialogProps) {
  const [typedConfirm, setTypedConfirm] = useState('');

  const canConfirm = confirmText
    ? typedConfirm.trim().toUpperCase() === confirmText.toUpperCase()
    : true;

  const handleConfirm = () => {
    if (!canConfirm) return;
    setTypedConfirm('');
    onConfirm();
  };

  const handleCancel = () => {
    setTypedConfirm('');
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); else onOpenChange(v); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span>{description}</span>
            {affectedCount !== undefined && (
              <span className="block mt-2 text-amber-600 font-medium">
                This will affect {affectedCount} record(s).
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {confirmText && (
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-input">
              {confirmLabel || `Type "${confirmText}" to confirm`}
            </Label>
            <Input
              id="confirm-input"
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              placeholder={confirmText}
              autoComplete="off"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={destructive ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
