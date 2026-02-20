// src/utils/api.ts
import { getToken } from './auth';

const API_URL = 'https://flightpoints.uk/api';

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {
      error: `Non-JSON response (${response.status})`,
      status: response.status,
      raw: text?.slice(0, 300) || null,
    };
  }
}

function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  };
  return fetch(`${API_URL}${url}`, { ...options, headers });
}

// Data interfaces
export interface Cadet { id: string; name: string; [key: string]: any; }
export interface Point { id: string; [key: string]: any; }
export interface Attendance { id: string; [key: string]: any; }

export const api = {
  // Cadets
  getCadets: () => fetchWithAuth('/data/cadets', { method: 'GET' }).then(r => r.json()),
  createCadet: (data: Partial<Cadet>) => fetchWithAuth('/data/cadets', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updateCadet: (id: string, data: Partial<Cadet>) => fetchWithAuth(`/data/cadets/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deleteCadet: (id: string) => fetchWithAuth(`/data/cadets/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Points
  getPoints: () => fetchWithAuth('/data/points', { method: 'GET' }).then(r => r.json()),
  createPoint: (data: Partial<Point>) => fetchWithAuth('/data/points', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updatePoint: (id: string, data: Partial<Point>) => fetchWithAuth(`/data/points/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deletePoint: (id: string) => fetchWithAuth(`/data/points/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Attendance
  getAttendance: () => fetchWithAuth('/data/attendance', { method: 'GET' }).then(r => r.json()),
  createAttendance: (data: Partial<Attendance>) => fetchWithAuth('/data/attendance', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updateAttendance: (id: string, data: Partial<Attendance>) => fetchWithAuth(`/data/attendance/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deleteAttendance: (id: string) => fetchWithAuth(`/data/attendance/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Rewards
  getRewards: () => fetchWithAuth('/data/rewards', { method: 'GET' }).then(r => r.json()),
  createReward: (data: any) => fetchWithAuth('/data/rewards', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updateReward: (id: string, data: any) => fetchWithAuth(`/data/rewards/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deleteReward: (id: string) => fetchWithAuth(`/data/rewards/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Other endpoints
  getLeaderboards: () => fetchWithAuth('/leaderboards', { method: 'GET' }).then(r => r.json()),
  getReports: () => fetchWithAuth('/reports', { method: 'GET' }).then(r => r.json()),
  runIntegrityCheck: () => fetchWithAuth('/integrity-check', { method: 'GET' }).then(r => r.json()),
  getAttendanceSummary: () => fetchWithAuth('/attendance-summary', { method: 'GET' }).then(r => r.json()),
  
  // Admin Point Givers
  getPointGivers: () => fetchWithAuth('/admin/point-givers', { method: 'GET' }).then(r => r.json()),
  
  // Tickets
  getTickets: () => fetchWithAuth('/tickets', { method: 'GET' }).then(r => r.json()),
  createTicket: (data: any) => fetchWithAuth('/tickets', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updateTicket: (id: string, data: any) => fetchWithAuth(`/tickets/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deleteTicket: (id: string) => fetchWithAuth(`/tickets/${id}`, { method: 'DELETE' }).then(r => r.json()),
  uploadTicketEvidence: (formData: FormData) => {
    const token = getToken();
    return fetch(`${API_URL}/upload/ticket-evidence`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json());
  },
  
  // Notifications
  getNotifications: () => fetchWithAuth('/notifications', { method: 'GET' }).then(r => r.json()),
  markNotificationRead: (id: string) => fetchWithAuth(`/notifications/${id}/read`, { method: 'POST' }).then(r => r.json()),
  markAllNotificationsRead: () => fetchWithAuth('/notifications/read-all', { method: 'POST' }).then(r => r.json()),
  
  // User's own points
  getMyPoints: (cadetName: string) => fetchWithAuth(`/data/my-points?name=${encodeURIComponent(cadetName)}`, { method: 'GET' }).then(r => r.json()),
  
  // CSV Export
  exportCsv: (type: string) => fetchWithAuth(`/export/${type}`, { method: 'GET' }).then(r => r.blob()),
  
  // Auth helpers
  lookupEmail: (username: string) => fetch(`${API_URL}/auth/lookup-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  }).then(r => r.json()),
  
  requestSignup: (data: { email: string; password: string; name: string; joinCode: string; flight: string }) => 
    fetch(`${API_URL}/auth/request-signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(parseJsonSafe),

  // Admin Signups
  getPendingSignups: () => fetchWithAuth('/auth/requests', { method: 'GET' })
    .then(parseJsonSafe)
    .then((res) => ({ ...res, signups: res?.signups || res?.requests || [] })),
  getJoinCode: () => fetchWithAuth('/admin/join-code', { method: 'GET' }).then(parseJsonSafe),
  createJoinCode: (data: { durationSeconds: number }) =>
    fetchWithAuth('/admin/join-code', { method: 'POST', body: JSON.stringify(data) }).then(parseJsonSafe),
  getUsers: () => fetchWithAuth('/auth/users', { method: 'GET' }).then(parseJsonSafe),
  approveUser: (userId: string, data: Record<string, any> = {}) =>
    fetchWithAuth(`/auth/requests/${encodeURIComponent(userId)}/approve`, { method: 'POST', body: JSON.stringify(data) }).then(parseJsonSafe),
  updateUserRole: (userId: string, role: string) =>
    fetchWithAuth(`/auth/users/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify({ role }) }).then(parseJsonSafe),
  getPendingSignupsCount: () =>
    fetchWithAuth('/auth/requests-count', { method: 'GET' })
      .then(async (r) => {
        const primary = await parseJsonSafe(r);
        if (r.ok) return primary;
        const fallback = await fetchWithAuth('/data/signups-count', { method: 'GET' });
        return parseJsonSafe(fallback);
      }),
  
  // Cleanup retention
  cleanupRetention: () => fetchWithAuth('/admin/cleanup-retention', { method: 'POST' }).then(r => r.json()),
  
  // Verify PIN
  verifyPin: (pin: string) => fetchWithAuth('/admin/verify-pin', { method: 'POST', body: JSON.stringify({ pin }) }).then(r => r.json()),
  
  // Added missing methods for getPinStatus, changeUserRole, getTicketsCount, and updateUserName
  getPinStatus: () => fetchWithAuth('/admin/pin-status', { method: 'GET' }).then(r => r.json()),
  changeUserRole: (userId: string, role: string) => fetchWithAuth(`/admin/change-role/${userId}`, { method: 'POST', body: JSON.stringify({ role }) }).then(r => r.json()),
  getTicketsCount: () => fetchWithAuth('/tickets/count', { method: 'GET' }).then(r => r.json()),
  updateUserName: (userId: string, newName: string) => fetchWithAuth(`/users/${userId}/name`, { method: 'PUT', body: JSON.stringify({ name: newName }) }).then(r => r.json()),
  
  // Added missing methods for changePin and resetPin
  changePin: (userId: string, currentPin: string, newPin: string) => fetchWithAuth(`/admin/change-pin`, { method: 'POST', body: JSON.stringify({ userId, currentPin, newPin }) }).then(r => r.json()),
  resetPin: (targetUserId: string) => fetchWithAuth(`/admin/reset-pin`, { method: 'POST', body: JSON.stringify({ targetUserId }) }).then(r => r.json()),
};

export { fetchWithAuth };