import { useEffect, useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { getToken } from '../../utils/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';

interface RewardsProps {
  userRole: string;
}

type Reward = {
  id: string;
  title: string;
  howToWin: string;
  prize: string;
  endsAt?: string | null;
  winnerName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
};

export function Rewards({ userRole }: RewardsProps) {
  const canManageRewards = userRole === 'snco';
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [howToWin, setHowToWin] = useState('');
  const [prize, setPrize] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editReward, setEditReward] = useState<Reward | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editHowToWin, setEditHowToWin] = useState('');
  const [editPrize, setEditPrize] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editWinnerName, setEditWinnerName] = useState('');
  const [winnerInputs, setWinnerInputs] = useState<Record<string, string>>({});
  const [winnerSavingId, setWinnerSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRewards();
  }, []);

  const fetchRewards = async () => {
    setLoading(true);
    try {
      const data = await api.getRewards();
      setRewards(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to fetch rewards');
    } finally {
      setLoading(false);
    }
  };

  const sortedRewards = useMemo(() => {
    const now = Date.now();
    return [...rewards].sort((a, b) => {
      const aExpired = a.endsAt ? new Date(a.endsAt).getTime() < now : false;
      const bExpired = b.endsAt ? new Date(b.endsAt).getTime() < now : false;
      if (aExpired !== bExpired) return aExpired ? 1 : -1;
      const aEnd = a.endsAt ? new Date(a.endsAt).getTime() : Number.POSITIVE_INFINITY;
      const bEnd = b.endsAt ? new Date(b.endsAt).getTime() : Number.POSITIVE_INFINITY;
      if (aEnd !== bEnd) return aEnd - bEnd;
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCreated - aCreated;
    });
  }, [rewards]);

  const { activeRewards, previousRewards } = useMemo(() => {
    const now = Date.now();
    const active: Reward[] = [];
    const previous: Reward[] = [];
    sortedRewards.forEach((reward) => {
      const expired = reward.endsAt ? new Date(reward.endsAt).getTime() < now : false;
      if (expired) previous.push(reward);
      else active.push(reward);
    });
    return { activeRewards: active, previousRewards: previous };
  }, [sortedRewards]);

  const resetCreateForm = () => {
    setTitle('');
    setHowToWin('');
    setPrize('');
    setEndsAt('');
  };

  const handleCreate = async () => {
    if (!title.trim() || !howToWin.trim() || !prize.trim() || !endsAt.trim()) {
      toast.error('Please fill in the title, how to win, prize, and end date.');
      return;
    }
    setSaving(true);
    try {
      const data = {
        title: title.trim(),
        howToWin: howToWin.trim(),
        prize: prize.trim(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        createdBy: getToken() || 'unknown',
      };
      const result = await api.createReward(data);
      if (result.error) throw new Error(result.error);
      toast.success('Reward created');
      resetCreateForm();
      setRewards((prev) => [result, ...prev]);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create reward');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (reward: Reward) => {
    setEditReward(reward);
    setEditTitle(reward.title || '');
    setEditHowToWin(reward.howToWin || '');
    setEditPrize(reward.prize || '');
    setEditEndsAt(reward.endsAt ? new Date(reward.endsAt).toISOString().slice(0, 10) : '');
    setEditWinnerName(reward.winnerName || '');
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editReward) return;
    if (!editTitle.trim() || !editHowToWin.trim() || !editPrize.trim() || !editEndsAt.trim()) {
      toast.error('Please fill in the title, how to win, prize, and end date.');
      return;
    }
    setEditSaving(true);
    try {
      const data = {
        title: editTitle.trim(),
        howToWin: editHowToWin.trim(),
        prize: editPrize.trim(),
        endsAt: editEndsAt ? new Date(editEndsAt).toISOString() : null,
        winnerName: editWinnerName.trim() || null,
        updatedBy: getToken() || 'unknown',
      };
      const result = await api.updateReward(editReward.id, data);
      if (result.error) throw new Error(result.error);
      toast.success('Reward updated');
      setRewards((prev) => prev.map((r) => (r.id === editReward.id ? result : r)));
      setEditOpen(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update reward');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (reward: Reward) => {
    if (!canManageRewards) {
      toast.error('You are not authorized to delete rewards.');
      return;
    }
    if (!confirm(`Delete reward "${reward.title}"?`)) return;
    try {
      const result = await api.deleteReward(reward.id);
      if (result.error) throw new Error(result.error);
      toast.success('Reward deleted');
      setRewards((prev) => prev.filter((r) => r.id !== reward.id));
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete reward');
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return 'No end date set';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
  };

  const saveWinner = async (reward: Reward) => {
    if (!canManageRewards) {
      toast.error('You are not authorized to set winners.');
      return;
    }
    const winnerName = (winnerInputs[reward.id] ?? '').trim();
    if (!winnerName) {
      toast.error('Please enter a winner name.');
      return;
    }
    setWinnerSavingId(reward.id);
    try {
      const data = {
        title: reward.title,
        howToWin: reward.howToWin,
        prize: reward.prize,
        endsAt: reward.endsAt,
        winnerName,
        updatedBy: getToken() || 'unknown',
      };
      const result = await api.updateReward(reward.id, data);
      if (result.error) throw new Error(result.error);
      setRewards((prev) => prev.map((r) => (r.id === reward.id ? result : r)));
      toast.success('Winner saved');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save winner');
    } finally {
      setWinnerSavingId(null);
    }
  };

  const renderRewardCard = (reward: Reward) => {
    const expired = reward.endsAt ? new Date(reward.endsAt).getTime() < Date.now() : false;
    const winnerValue = winnerInputs[reward.id] ?? reward.winnerName ?? '';
    return (
      <Card key={reward.id} className="border-slate-200 shadow-sm">
        <CardHeader className={`rounded-t-lg ${expired ? 'bg-slate-50' : 'bg-gradient-to-r from-sky-50 to-blue-50'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${expired ? 'bg-slate-200 text-slate-600' : 'bg-primary/10 text-primary'}`}>★</div>
              <div>
                <CardTitle className="text-lg text-slate-900">{reward.title}</CardTitle>
                <CardDescription className="text-slate-600">Ends {formatDate(reward.endsAt)}</CardDescription>
              </div>
            </div>
            <Badge className={expired ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'}>
              {expired ? 'Previous' : 'Active'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Prize</p>
              <p className="text-base font-semibold text-slate-900">{reward.prize}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Winner</p>
              <p className="text-base font-semibold text-slate-900">{reward.winnerName || 'TBD'}</p>
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">How to win</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{reward.howToWin}</p>
          </div>
          {canManageRewards && (
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-700">Set winner</p>
                  <p className="text-xs text-slate-500">Only Flight Point Leads can update winners.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(reward)}>Edit</Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(reward)}>Delete</Button>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={winnerValue}
                  onChange={(e) =>
                    setWinnerInputs((prev) => ({
                      ...prev,
                      [reward.id]: e.target.value,
                    }))
                  }
                  placeholder="Winner name"
                />
                <Button
                  size="sm"
                  onClick={() => saveWinner(reward)}
                  disabled={winnerSavingId === reward.id}
                >
                  {winnerSavingId === reward.id ? 'Saving...' : 'Save winner'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-t-lg">
          <CardTitle>Current Rewards</CardTitle>
          <CardDescription>See what is up for grabs and how to win.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-gray-600">Loading rewards...</div>
          ) : activeRewards.length === 0 ? (
            <div className="text-gray-600">No rewards yet.</div>
          ) : (
            <div className="space-y-4">
              {activeRewards.map(renderRewardCard)}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50 rounded-t-lg">
          <CardTitle>Previous Rewards</CardTitle>
          <CardDescription>Past rewards and winners.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-gray-600">Loading rewards...</div>
          ) : previousRewards.length === 0 ? (
            <div className="text-gray-600">No previous rewards yet.</div>
          ) : (
            <div className="space-y-4">
              {previousRewards.map(renderRewardCard)}
            </div>
          )}
        </CardContent>
      </Card>
      {canManageRewards && (
        <Card>
          <CardHeader>
            <CardTitle>Create Reward</CardTitle>
            <CardDescription>Flight Point Leads can add and manage rewards.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Reward title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reward title" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Prize</label>
                <Input value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Prize" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">How to win</label>
                <Textarea value={howToWin} onChange={(e) => setHowToWin(e.target.value)} placeholder="How to win" rows={4} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Ends on</label>
                <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Saving...' : 'Create Reward'}</Button>
          </CardContent>
        </Card>
      )}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Reward</DialogTitle>
            <DialogDescription>Update the reward details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reward title</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Prize</label>
              <Input value={editPrize} onChange={(e) => setEditPrize(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">How to win</label>
              <Textarea value={editHowToWin} onChange={(e) => setEditHowToWin(e.target.value)} rows={4} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Ends on</label>
              <Input type="date" value={editEndsAt} onChange={(e) => setEditEndsAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Winner (optional)</label>
              <Input value={editWinnerName} onChange={(e) => setEditWinnerName(e.target.value)} placeholder="Winner name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={editSaving}>{editSaving ? 'Saving...' : 'Save changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
