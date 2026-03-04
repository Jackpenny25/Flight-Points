import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { MessageSquare } from 'lucide-react';
import { api } from '../../utils/api';
import { toast } from 'sonner';

interface TicketsProps {
  accessToken: string;
}

export function Tickets({ accessToken }: TicketsProps) {
  const [category, setCategory] = useState('Badge');
  const [type, setType] = useState<'Request'|'Issue'>('Request');
  const [description, setDescription] = useState('');
  // Removed requested points; Flight Point Leads/Staff will decide points on approval
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [commentText, setCommentText] = useState('');

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = await api.getTickets();
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
      // Optional: upload file to server-managed storage
      let uploadedUrl: string | null = null;
      if (file) {
        // Upload via server to bypass Storage RLS
        const fd = new FormData();
        fd.append('file', file);
        const upData = await api.uploadTicketEvidence(fd);
        uploadedUrl = upData.url || null;
      }

      const result = await api.createTicket({ type, category, description, evidenceUrl: uploadedUrl || evidenceUrl });
      if (result?.error) {
        toast.error(`Failed: ${result.detail || result.error}`);
        return;
      }
      toast.success('Ticket submitted');
      setDescription('');
      setEvidenceUrl('');
      setFile(null);
      fetchTickets();
    } catch (e) {
      console.error('Submit ticket error', e);
      toast.error('Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { open: 'bg-[#00247D]/10 text-[#00247D]', approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800' };
    return <Badge variant="outline" className={map[s] || ''}>{s}</Badge>;
  };

  const addComment = async () => {
    if (!commentText.trim() || !selectedTicket) return;
    try {
      await api.updateTicket(selectedTicket.id, { action: 'comment', comment: commentText });
      toast.success('Comment added');
      setCommentText('');
      await fetchTickets();
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
          <CardTitle>Request Points</CardTitle>
          <CardDescription>Submit a ticket if you believe you’re owed points (badges, courses, events, etc.).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4 max-w-2xl">
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Request">Point Request</SelectItem>
                  <SelectItem value="Issue">Report Issue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {type === 'Request' ? (
                    <>
                      <SelectItem value="Badge">Badge</SelectItem>
                      <SelectItem value="Course">Course</SelectItem>
                      <SelectItem value="Event">Event</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="Broken">Broken / Not working</SelectItem>
                      <SelectItem value="Missing">Missing / Lost</SelectItem>
                      <SelectItem value="Website">Website / App issue</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </>
                  )}
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
                    <TableHead>Comments</TableHead>
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
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedTicket(t)}>
                          <MessageSquare className="w-4 h-4 mr-1" />
                          {(t.comments || []).length}
                        </Button>
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

      {/* Comments Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ticket: {selectedTicket?.category}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Your ticket "{selectedTicket?.category}"</p>
              <p className="text-sm mt-2">{selectedTicket?.description}</p>
            </div>
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Comments & Updates ({(selectedTicket?.comments || []).length})</h4>
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
                  <p className="text-sm text-muted-foreground">No comments yet. Check back later for updates!</p>
                )}
              </div>
              <div className="flex gap-2">
                <Textarea 
                  placeholder="Add a comment or question..." 
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
