import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { projectId } from '../../../utils/supabase/info';

interface Props { accessToken: string; }

export function TicketsAdmin({ accessToken }: Props) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<Record<string, {points: string; reason: string}>>({});

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/tickets`, {
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
        if (st.points) body.points = parseFloat(st.points);
        body.reason = st.reason || undefined;
      } else {
        body.reason = st.reason || 'Rejected';
      }
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/tickets/${id}`, {
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
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Evidence</TableHead>
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
                      <TableCell>{t.category}</TableCell>
                      <TableCell className="max-w-[360px] truncate" title={t.description}>{t.description}</TableCell>
                      <TableCell>
                        {t.evidenceUrl ? (
                          <a href={t.evidenceUrl} target="_blank" rel="noreferrer" className="text-primary underline">View</a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{badge(t.status)}</TableCell>
                      <TableCell className="text-right">
                        {t.status === 'open' ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input placeholder="Points" className="w-24" value={actionState[t.id]?.points || ''} onChange={(e) => setActionState({ ...actionState, [t.id]: { ...(actionState[t.id]||{}), points: e.target.value } })} />
                              <Input placeholder="Reason (optional)" value={actionState[t.id]?.reason || ''} onChange={(e) => setActionState({ ...actionState, [t.id]: { ...(actionState[t.id]||{}), reason: e.target.value } })} />
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
    </div>
  );
}
