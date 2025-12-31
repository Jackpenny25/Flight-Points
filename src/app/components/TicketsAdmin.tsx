import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { MessageSquare } from 'lucide-react';
import { projectId } from '../../../utils/supabase/info';
import { toast } from 'sonner';

interface Props { accessToken: string; }

export function TicketsAdmin({ accessToken }: Props) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<Record<string, {points: string; reason: string}>>({});
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [commentText, setCommentText] = useState('');

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/tickets`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setTickets((data.tickets || []).filter((t: any) => t).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (e) {
      console.error('Fetch tickets error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (accessToken) fetchTickets(); }, [accessToken]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    try {
      const st = actionState[id] || { points: '', reason: '' };
      const body: any = { action };
      if (action === 'approve') {
        if (!st.reason || !st.reason.trim()) {
          toast.error('Please enter a reason to approve');
          return;
        }
        const pts = parseFloat(st.points);
        if (!isFinite(pts) || pts <= 0) {
          toast.error('Please enter a valid points amount (> 0)');
          return;
        }
        body.points = pts;
        body.reason = st.reason.trim();
      } else {
        body.reason = st.reason || 'Rejected';
      }
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/tickets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Action failed');
      await fetchTickets();
    } catch (e) {
      console.error('Action error', e);
    }
  };

  const badge = (s: string) => {
    const map: Record<string, string> = { open: 'bg-blue-100 text-blue-800', approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800' };
    return <Badge variant="outline" className={map[s] || ''}>{s}</Badge>;
  };

  const addComment = async () => {
    if (!commentText.trim() || !selectedTicket) return;
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/tickets/${selectedTicket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'comment', comment: commentText }),
      });
      if (!res.ok) throw new Error('Failed to add comment');
      toast.success('Comment added');
      setCommentText('');
      await fetchTickets();
      // Update selected ticket with new data
      const updated = tickets.find(t => t.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated);
    } catch (e) {
      console.error('Comment error', e);
      toast.error('Failed to add comment');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cadet Tickets</CardTitle>
          <CardDescription>Review and decide on point requests</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-muted-foreground">Loading...</div>
          ) : tickets.length === 0 ? (
            <div className="py-6 text-muted-foreground">No tickets</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Cadet</TableHead>
                    <TableHead>Flight</TableHead>
                      <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Comments</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.createdAt).toLocaleDateString('en-GB')}</TableCell>
                      <TableCell>{t.cadetName}</TableCell>
                      <TableCell>{t.flight || '-'}</TableCell>
                      <TableCell>{t.type || 'Request'}</TableCell>
                      <TableCell>{t.category}</TableCell>
                      <TableCell className="max-w-[360px] truncate" title={t.description}>{t.description}</TableCell>
                      <TableCell>
                        {t.evidenceUrl ? (
                          <a href={t.evidenceUrl} target="_blank" rel="noreferrer" className="text-primary underline">View</a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedTicket(t)}>
                          <MessageSquare className="w-4 h-4 mr-1" />
                          {(t.comments || []).length}
                        </Button>
                      </TableCell>
                      <TableCell>{badge(t.status)}</TableCell>
                      <TableCell className="text-right">
                        {t.status === 'open' ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              {t.type === 'Issue' ? (
                                <Input placeholder="Reason (required)" value={actionState[t.id]?.reason || ''} onChange={(e) => setActionState({ ...actionState, [t.id]: { ...(actionState[t.id]||{}), reason: e.target.value } })} />
                              ) : (
                                <>
                                  <Input type="number" min={1} step={1} placeholder="Points (required)" className="w-32" value={actionState[t.id]?.points || ''} onChange={(e) => setActionState({ ...actionState, [t.id]: { ...(actionState[t.id]||{}), points: e.target.value } })} />
                                  <Input placeholder="Reason (required)" value={actionState[t.id]?.reason || ''} onChange={(e) => setActionState({ ...actionState, [t.id]: { ...(actionState[t.id]||{}), reason: e.target.value } })} />
                                </>
                              )}
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" onClick={() => act(t.id, 'approve')}>Approve</Button>
                              <Button size="sm" variant="outline" onClick={() => act(t.id, 'reject')}>Reject</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">{t.decisionReason || '-'}</div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comments Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ticket: {selectedTicket?.category}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">From: {selectedTicket?.cadetName}</p>
              <p className="text-sm mt-2">{selectedTicket?.description}</p>
            </div>
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Comments ({(selectedTicket?.comments || []).length})</h4>
              <div className="space-y-3 max-h-60 overflow-y-auto mb-4">
                {(selectedTicket?.comments || []).map((comment: any) => (
                  <div key={comment.id} className="bg-slate-50 p-3 rounded">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span className="font-medium">{comment.author}</span>
                      <span>{new Date(comment.createdAt).toLocaleString('en-GB')}</span>
                    </div>
                    <p className="text-sm">{comment.text}</p>
                  </div>
                ))}
                {(selectedTicket?.comments || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No comments yet</p>
                )}
              </div>
              <div className="flex gap-2">
                <Textarea 
                  placeholder="Add a comment..." 
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={2}
                />
                <Button onClick={addComment} disabled={!commentText.trim()}>
                  Send
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
