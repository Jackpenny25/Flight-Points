import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../../utils/api';
import { getToken, getUser } from '../../utils/auth';
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
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
};

type Suggestion = {
  id: string;
  title: string;
  description?: string | null;
  suggestedBy: string;
  suggestedByName: string;
  suggestedAt: string;
  status?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  voteCount: number;
  hasVoted: boolean;
};

type Cadet = {
  id: string;
  name: string;
  flight: string;
  isNco?: boolean;
};

export function Rewards({ userRole }: RewardsProps) {
  const canManageRewards = userRole === 'snco';
  const canSuggest = userRole !== 'snco';
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [cadets, setCadets] = useState<Cadet[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [title, setTitle] = useState('');
  const [howToWin, setHowToWin] = useState('');
  const [prize, setPrize] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editReward, setEditReward] = useState<Reward | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editHowToWin, setEditHowToWin] = useState('');
  const [editPrize, setEditPrize] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editWinnerName, setEditWinnerName] = useState('');

  // Winner inputs per reward
  const [winnerInputs, setWinnerInputs] = useState<Record<string, string>>({});
  const [winnerSavingId, setWinnerSavingId] = useState<string | null>(null);
  const [winnerSuggestions, setWinnerSuggestions] = useState<Record<string, Cadet[]>>({});
  const [editWinnerSuggestions, setEditWinnerSuggestions] = useState<Cadet[]>([]);

  // Suggestions & voting
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionTitle, setSuggestionTitle] = useState('');
  const [suggestionDescription, setSuggestionDescription] = useState('');
  const [suggestingSaving, setSuggestingSaving] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  
  // Moderation
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRewards();
    fetchCadets();
    fetchSuggestions();
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

  const fetchCadets = async () => {
    try {
      const data = await api.getCadets();
      setCadets(Array.isArray(data) ? data : []);
    } catch {
      // Cadets may fail for non-admin — that's OK
    }
  };

  const fetchSuggestions = async () => {
    setSuggestionsLoading(true);
    try {
      const data = await api.getRewardSuggestions();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch {
      // Might fail if table doesn't exist yet
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  // Cadet name matching (like PointsManager)
  const matchCadetByPartialName = useCallback((input: string): { cadet: Cadet; exact: boolean }[] => {
    if (cadets.length === 0 || !input.trim()) return [];
    const inputLower = input.trim().toLowerCase();

    // Exact match
    const exact = cadets.find(c => c.name.toLowerCase() === inputLower);
    if (exact) return [{ cadet: exact, exact: true }];

    // Partial match
    const inputParts = inputLower.split(/\s+/);
    const inputLastName = inputParts[0];

    const matches = cadets.filter(c => {
      const cadetNameLower = c.name.toLowerCase();
      return cadetNameLower.includes(inputLower) ||
        cadetNameLower.startsWith(inputLastName);
    });

    return matches.slice(0, 8).map(c => ({ cadet: c, exact: false }));
  }, [cadets]);

  const updateWinnerSuggestions = useCallback((rewardId: string, value: string) => {
    if (!value.trim() || value.trim().length < 2) {
      setWinnerSuggestions(prev => ({ ...prev, [rewardId]: [] }));
      return;
    }
    const matches = matchCadetByPartialName(value);
    setWinnerSuggestions(prev => ({ ...prev, [rewardId]: matches.map(m => m.cadet) }));
  }, [matchCadetByPartialName]);

  const updateEditWinnerSuggestions = useCallback((value: string) => {
    if (!value.trim() || value.trim().length < 2) {
      setEditWinnerSuggestions([]);
      return;
    }
    const matches = matchCadetByPartialName(value);
    setEditWinnerSuggestions(matches.map(m => m.cadet));
  }, [matchCadetByPartialName]);

  // Categorise rewards
  const { activeRewards, claimedRewards, previousRewards } = useMemo(() => {
    const now = Date.now();
    const active: Reward[] = [];
    const claimed: Reward[] = [];
    const previous: Reward[] = [];

    rewards.forEach((reward) => {
      const status = reward.status || 'active';
      if (status === 'claimed') {
        claimed.push(reward);
      } else {
        const expired = reward.endsAt ? new Date(reward.endsAt).getTime() < now : false;
        if (expired) {
          previous.push(reward);
        } else {
          active.push(reward);
        }
      }
    });

    // Sort active by end date ascending
    active.sort((a, b) => {
      const aEnd = a.endsAt ? new Date(a.endsAt).getTime() : Number.POSITIVE_INFINITY;
      const bEnd = b.endsAt ? new Date(b.endsAt).getTime() : Number.POSITIVE_INFINITY;
      return aEnd - bEnd;
    });

    // Sort claimed/previous by updated date descending
    claimed.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

    previous.sort((a, b) => {
      const aEnd = a.endsAt ? new Date(a.endsAt).getTime() : 0;
      const bEnd = b.endsAt ? new Date(b.endsAt).getTime() : 0;
      return bEnd - aEnd;
    });

    return { activeRewards: active, claimedRewards: claimed, previousRewards: previous };
  }, [rewards]);

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
        status: 'active',
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
    setEditWinnerSuggestions([]);
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
      const winnerName = editWinnerName.trim() || null;
      const newStatus = winnerName ? 'claimed' : (editReward.status || 'active');
      const data = {
        title: editTitle.trim(),
        howToWin: editHowToWin.trim(),
        prize: editPrize.trim(),
        endsAt: editEndsAt ? new Date(editEndsAt).toISOString() : null,
        winnerName,
        status: newStatus,
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
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
        status: 'claimed',
        updatedBy: getToken() || 'unknown',
      };
      const result = await api.updateReward(reward.id, data);
      if (result.error) throw new Error(result.error);
      setRewards((prev) => prev.map((r) => (r.id === reward.id ? result : r)));
      setWinnerInputs((prev) => {
        const copy = { ...prev };
        delete copy[reward.id];
        return copy;
      });
      toast.success('Winner saved — reward moved to claimed');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save winner');
    } finally {
      setWinnerSavingId(null);
    }
  };

  // Suggestions handlers
  const handleCreateSuggestion = async () => {
    if (!suggestionTitle.trim()) {
      toast.error('Please enter a suggestion title.');
      return;
    }
    setSuggestingSaving(true);
    try {
      const result = await api.createRewardSuggestion({
        title: suggestionTitle.trim(),
        description: suggestionDescription.trim() || undefined,
      });
      if (result.error) throw new Error(result.error);
      toast.success('Suggestion submitted!');
      setSuggestionTitle('');
      setSuggestionDescription('');
      setSuggestions(prev => [result, ...prev].sort((a, b) => b.voteCount - a.voteCount));
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit suggestion');
    } finally {
      setSuggestingSaving(false);
    }
  };

  const handleVote = async (suggestion: Suggestion) => {
    setVotingId(suggestion.id);
    try {
      const result = await api.voteRewardSuggestion(suggestion.id);
      if (result.error) throw new Error(result.error);
      setSuggestions(prev =>
        prev
          .map(s =>
            s.id === suggestion.id
              ? { ...s, voteCount: result.voteCount, hasVoted: result.voted }
              : s
          )
          .sort((a, b) => b.voteCount - a.voteCount)
      );
    } catch (error: any) {
      toast.error(error?.message || 'Failed to vote');
    } finally {
      setVotingId(null);
    }
  };

  const handleDeleteSuggestion = async (suggestion: Suggestion) => {
    if (!confirm(`Delete suggestion "${suggestion.title}"?`)) return;
    try {
      const result = await api.deleteRewardSuggestion(suggestion.id);
      if (result.error) throw new Error(result.error);
      toast.success('Suggestion deleted');
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete suggestion');
    }
  };

  const handleModerateSuggestion = async (suggestion: Suggestion, action: 'approve' | 'reject') => {
    setModeratingId(suggestion.id);
    try {
      const result = await api.moderateRewardSuggestion(suggestion.id, action);
      if (result.error) throw new Error(result.error);
      
      if (action === 'reject') {
        toast.success('Suggestion rejected');
        setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      } else {
        toast.success('Suggestion approved!');
        setSuggestions(prev =>
          prev.map(s =>
            s.id === suggestion.id
              ? { ...s, status: 'approved', reviewedAt: new Date().toISOString(), reviewedBy: 'snco' }
              : s
          )
        );
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to moderate suggestion');
    } finally {
      setModeratingId(null);
    }
  };

  const currentUser = getUser();

  // Winner name suggestion dropdown
  const renderCadetSuggestions = (
    cadetSuggestions: Cadet[],
    onSelect: (name: string) => void,
    onClear: () => void
  ) => {
    if (cadetSuggestions.length === 0) return null;
    return (
      <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
        {cadetSuggestions.map((cadet) => (
          <button
            key={cadet.id}
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 border-b border-slate-100 last:border-0"
            onClick={() => {
              onSelect(cadet.name);
              onClear();
            }}
          >
            <span className="font-medium text-slate-800">{cadet.name}</span>
            <span className="text-xs text-slate-500">Flight {cadet.flight === 'hq' ? 'HQ' : cadet.flight}</span>
          </button>
        ))}
      </div>
    );
  };

  const getStatusBadge = (reward: Reward) => {
    const status = reward.status || 'active';
    if (status === 'claimed') {
      return <Badge className="bg-amber-100 text-amber-800">Claimed</Badge>;
    }
    const expired = reward.endsAt ? new Date(reward.endsAt).getTime() < Date.now() : false;
    if (expired) {
      return <Badge className="bg-slate-200 text-slate-700">Expired</Badge>;
    }
    return <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>;
  };

  const renderRewardCard = (reward: Reward) => {
    const status = reward.status || 'active';
    const isClaimed = status === 'claimed';
    const expired = reward.endsAt ? new Date(reward.endsAt).getTime() < Date.now() : false;
    const isInactive = isClaimed || expired;
    const winnerValue = winnerInputs[reward.id] ?? reward.winnerName ?? '';
    const cadetMatches = winnerSuggestions[reward.id] || [];

    return (
      <Card key={reward.id} className="border-slate-200 shadow-sm">
        <CardHeader className={`rounded-t-lg ${isInactive ? 'bg-slate-50' : 'bg-gradient-to-r from-sky-50 to-blue-50'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isInactive ? 'bg-slate-200 text-slate-600' : 'bg-primary/10 text-primary'}`}>★</div>
              <div>
                <CardTitle className="text-lg text-slate-900">{reward.title}</CardTitle>
                <CardDescription className="text-slate-600">Ends {formatDate(reward.endsAt)}</CardDescription>
              </div>
            </div>
            {getStatusBadge(reward)}
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
              <p className={`text-base font-semibold ${isClaimed ? 'text-amber-700' : 'text-slate-900'}`}>
                {reward.winnerName || 'TBD'}
              </p>
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
              <div className="mt-3 relative">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Input
                      value={winnerValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWinnerInputs((prev) => ({ ...prev, [reward.id]: val }));
                        updateWinnerSuggestions(reward.id, val);
                      }}
                      placeholder="Start typing cadet name..."
                    />
                    {renderCadetSuggestions(
                      cadetMatches,
                      (name) => setWinnerInputs((prev) => ({ ...prev, [reward.id]: name })),
                      () => setWinnerSuggestions(prev => ({ ...prev, [reward.id]: [] }))
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => saveWinner(reward)}
                    disabled={winnerSavingId === reward.id}
                  >
                    {winnerSavingId === reward.id ? 'Saving...' : 'Save winner'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Active Rewards */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-t-lg">
          <CardTitle>Current Rewards</CardTitle>
          <CardDescription>See what is up for grabs and how to win.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-gray-600">Loading rewards...</div>
          ) : activeRewards.length === 0 ? (
            <div className="text-gray-600">No active rewards right now.</div>
          ) : (
            <div className="space-y-4">
              {activeRewards.map(renderRewardCard)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reward Suggestions & Voting */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-lg">
          <CardTitle>Reward Suggestions</CardTitle>
          <CardDescription>Suggest rewards you'd like to see and vote for your favourites.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Suggestion form (not for snco) */}
          {canSuggest && (
            <div className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
              <p className="text-sm font-medium text-slate-700">Suggest a reward</p>
              <Input
                value={suggestionTitle}
                onChange={(e) => setSuggestionTitle(e.target.value)}
                placeholder="What reward would you like?"
              />
              <Textarea
                value={suggestionDescription}
                onChange={(e) => setSuggestionDescription(e.target.value)}
                placeholder="Why should this be a reward? (optional)"
                rows={2}
              />
              <Button
                onClick={handleCreateSuggestion}
                disabled={suggestingSaving || !suggestionTitle.trim()}
                size="sm"
              >
                {suggestingSaving ? 'Submitting...' : 'Submit Suggestion'}
              </Button>
            </div>
          )}

          {/* Suggestions list */}
          {suggestionsLoading ? (
            <div className="text-gray-600">Loading suggestions...</div>
          ) : suggestions.length === 0 ? (
            <div className="text-gray-600 text-sm">No suggestions yet. Be the first to suggest a reward!</div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((suggestion) => {
                const canDelete =
                  canManageRewards ||
                  suggestion.suggestedBy === currentUser?.id;
                const isPending = suggestion.status === 'pending';
                const isApproved = suggestion.status === 'approved';
                
                return (
                  <div
                    key={suggestion.id}
                    className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${
                      isPending
                        ? 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {/* Vote button - hide for pending (not approved yet) */}
                    {isApproved && (
                      <button
                        className={`flex flex-col items-center min-w-[48px] rounded-md px-2 py-1 transition-colors ${
                          suggestion.hasVoted
                            ? 'bg-blue-100 text-blue-700 border border-blue-300'
                            : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-600'
                        }`}
                        onClick={() => handleVote(suggestion)}
                        disabled={votingId === suggestion.id}
                        title={suggestion.hasVoted ? 'Remove vote' : 'Vote for this'}
                      >
                        <span className="text-lg leading-none">{suggestion.hasVoted ? '▲' : '△'}</span>
                        <span className="text-sm font-bold">{suggestion.voteCount}</span>
                      </button>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800 truncate">{suggestion.title}</p>
                        {isPending && <Badge className="bg-yellow-600 text-white whitespace-nowrap">Pending</Badge>}
                      </div>
                      {suggestion.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{suggestion.description}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        Suggested by {suggestion.suggestedByName} · {formatDate(suggestion.suggestedAt)}
                      </p>
                    </div>

                    {/* Moderation buttons (SNCO only, for pending suggestions) */}
                    {canManageRewards && isPending && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 h-8 px-3"
                          onClick={() => handleModerateSuggestion(suggestion, 'approve')}
                          disabled={moderatingId === suggestion.id}
                        >
                          ✓ Approve
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 px-3"
                          onClick={() => handleModerateSuggestion(suggestion, 'reject')}
                          disabled={moderatingId === suggestion.id}
                        >
                          ✕ Reject
                        </Button>
                      </div>
                    )}

                    {/* Delete (if owner or snco, for non-pending or approved) */}
                    {canDelete && !isPending && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                        onClick={() => handleDeleteSuggestion(suggestion)}
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Claimed Rewards */}
      {claimedRewards.length > 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-amber-50 rounded-t-lg">
            <CardTitle>Claimed Rewards</CardTitle>
            <CardDescription>Rewards that have been won.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              {claimedRewards.map(renderRewardCard)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Previous / Expired Rewards */}
      {previousRewards.length > 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50 rounded-t-lg">
            <CardTitle>Previous Rewards</CardTitle>
            <CardDescription>Past rewards that have expired.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              {previousRewards.map(renderRewardCard)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Reward (admin only) */}
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

      {/* Edit Dialog */}
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
            <div className="space-y-2 relative">
              <label className="text-sm font-medium">Winner (optional — setting a winner marks as claimed)</label>
              <Input
                value={editWinnerName}
                onChange={(e) => {
                  setEditWinnerName(e.target.value);
                  updateEditWinnerSuggestions(e.target.value);
                }}
                placeholder="Start typing cadet name..."
              />
              {renderCadetSuggestions(
                editWinnerSuggestions,
                (name) => setEditWinnerName(name),
                () => setEditWinnerSuggestions([])
              )}
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
