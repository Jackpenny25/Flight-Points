import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { projectId } from '../../../utils/supabase/info';

interface TicketsProps {
  accessToken: string;
}

export function Tickets({ accessToken }: TicketsProps) {
  const [category, setCategory] = useState('Badge');
  const [description, setDescription] = useState('');
  const [requestedPoints, setRequestedPoints] = useState<string>('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/tickets`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (e) {
      console.error('Fetch tickets error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    fetchTickets();
  }, [accessToken]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ category, description, requestedPoints: requestedPoints ? parseFloat(requestedPoints) : null, evidenceUrl }),
      });
      if (!res.ok) throw new Error('Submit failed');
      setDescription('');
      setRequestedPoints('');
      setEvidenceUrl('');
      fetchTickets();
    } catch (e) {
      console.error('Submit ticket error', e);
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { open: 'bg-blue-100 text-blue-800', approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800' };
    return <Badge variant="outline" className={map[s] || ''}>{s}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Request Points</CardTitle>
          <CardDescription>Submit a ticket if you believe you’re owed points (badges, courses, events, etc.).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4 max-w-2xl">
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Badge">Badge</SelectItem>
                  <SelectItem value="Course">Course</SelectItem>
                  <SelectItem value="Event">Event</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe what you earned and when" required />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Requested Points (optional)</label>
                <Input type="number" step="0.5" value={requestedPoints} onChange={(e) => setRequestedPoints(e.target.value)} placeholder="e.g. 5" />
              </div>
              <div>
                <label className="text-sm font-medium">Evidence URL (optional)</label>
                <Input type="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="Link to evidence (if any)" />
              </div>
            </div>
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Ticket'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Tickets</CardTitle>
          <CardDescription>Status of your previous requests</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-muted-foreground">Loading...</div>
          ) : tickets.length === 0 ? (
            <div className="py-6 text-muted-foreground">No tickets yet</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.createdAt).toLocaleDateString('en-GB')}</TableCell>
                      <TableCell>{t.category}</TableCell>
                      <TableCell className="max-w-[420px] truncate" title={t.description}>{t.description}</TableCell>
                      <TableCell>{t.requestedPoints ?? '-'}</TableCell>
                      <TableCell>{statusBadge(t.status)}</TableCell>
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
