import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { createClient } from '@supabase/supabase-js';

interface TicketsProps {
  accessToken: string;
}

export function Tickets({ accessToken }: TicketsProps) {
  const [category, setCategory] = useState('Badge');
  const [description, setDescription] = useState('');
  // Removed requested points; SNCO/Staff will decide points on approval
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
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
      // Optional: upload file to Supabase Storage
      let uploadedUrl: string | null = null;
      if (file) {
        // Ensure bucket exists
        await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/storage/init`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {});

        const supabase = createClient(`https://${projectId}.supabase.co`, publicAnonKey, {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });
        const path = `tickets/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('ticket-evidence').upload(path, file, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('ticket-evidence').getPublicUrl(path);
        uploadedUrl = pub?.publicUrl || null;
      }

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ category, description, evidenceUrl: uploadedUrl || evidenceUrl }),
      });
      if (!res.ok) throw new Error('Submit failed');
      setDescription('');
      
      setEvidenceUrl('');
      setFile(null);
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
            <div>
                <label className="text-sm font-medium">Evidence</label>
                <div className="flex gap-2">
                  <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">You can upload a photo, or paste a link below.</p>
                <Input className="mt-2" type="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="Optional link to evidence" />
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
                    <TableHead>Evidence</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.createdAt).toLocaleDateString('en-GB')}</TableCell>
                      <TableCell>{t.category}</TableCell>
                      <TableCell className="max-w-[420px] truncate" title={t.description}>{t.description}</TableCell>
                      <TableCell>
                        {t.evidenceUrl ? (
                          <a href={t.evidenceUrl} target="_blank" rel="noreferrer" className="text-primary underline">View</a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
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
