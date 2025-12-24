import { useEffect, useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { projectId } from '../../../utils/supabase/info';

interface Notification {
  id: string;
  type: 'ticket_approved' | 'ticket_rejected' | 'ticket_comment';
  ticketId: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface Props {
  accessToken: string;
}

export function NotificationCenter({ accessToken }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/notifications`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      console.log('Fetch notifications response:', res.status, res.statusText);
      if (res.ok) {
        const data = await res.json();
        console.log('Notifications data:', data);
        setNotifications(data.notifications || []);
      } else {
        console.error('Fetch failed:', res.status, await res.text());
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 15000); // Poll every 15s
    return () => clearInterval(timer);
  }, [accessToken]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`https://${projectId}.supabase.co/functions/v1/server/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`https://${projectId}.supabase.co/functions/v1/server/notifications/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type: string) => {
    if (type === 'ticket_approved') return '✅';
    if (type === 'ticket_rejected') return '❌';
    return '💬';
  };

  return (
    <div ref={dropdownRef} className="relative">
      <Button 
        variant="ghost" 
        size="icon" 
        className="relative cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-red-600 text-white pointer-events-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg border border-gray-200 shadow-lg z-50">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
                Mark all read
              </Button>
            )}
          </div>
          <ScrollArea className="h-[400px]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-4 hover:bg-slate-50 cursor-pointer transition ${
                      !notif.read ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => {
                      if (!notif.read) markAsRead(notif.id);
                    }}
                  >
                    <div className="flex gap-3">
                      <div className="text-2xl">{getIcon(notif.type)}</div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm">{notif.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(notif.createdAt).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      {!notif.read && (
                        <div className="w-2 h-2 rounded-full bg-blue-600 mt-1"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
