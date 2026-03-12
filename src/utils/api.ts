// src/utils/api.ts
import { getToken, logout } from './auth';

const API_URL = import.meta.env.VITE_API_URL || 'https://flightpoints.uk/api';

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

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  };
  const response = await fetch(`${API_URL}${url}`, { ...options, headers });

  if (response.status === 401) {
    logout();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('flightpoints:auth-expired', {
        detail: {
          message: 'Your session has expired or you have been signed out. Please log in again.',
        },
      }));
    }
  }

  return response;
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
  createPoint: (data: Partial<Point>) => fetchWithAuth('/points', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updatePoint: (id: string, data: Partial<Point>) => fetchWithAuth(`/data/points/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deletePoint: (id: string) => fetchWithAuth(`/data/points/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Attendance
  getAttendance: () => fetchWithAuth('/data/attendance', { method: 'GET' }).then(r => r.json()),
  createAttendance: (data: Partial<Attendance>) => fetchWithAuth('/data/attendance', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  createBulkAttendance: (data: { entries: any[]; date: string; flightFilter: string }) => fetchWithAuth('/attendance/bulk', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  getAttendanceBulks: () => fetchWithAuth('/attendance/bulks', { method: 'GET' }).then(r => r.json()),
  getAttendanceBulkRecords: (id: string) => fetchWithAuth(`/attendance/bulk/${id}/records`, { method: 'GET' }).then(r => r.json()),
  updateAttendanceStatus: (id: string, status: 'present' | 'absent') => fetchWithAuth(`/attendance/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }).then(r => r.json()),
  deleteAttendanceBulk: (id: string) => fetchWithAuth(`/attendance/bulk/${id}`, { method: 'DELETE' }).then(r => r.json()),
  updateAttendance: (id: string, data: Partial<Attendance>) => fetchWithAuth(`/data/attendance/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deleteAttendance: (id: string) => fetchWithAuth(`/data/attendance/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Rewards
  getRewards: () => fetchWithAuth('/data/rewards', { method: 'GET' }).then(r => r.json()),
  createReward: (data: any) => fetchWithAuth('/data/rewards', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updateReward: (id: string, data: any) => fetchWithAuth(`/data/rewards/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deleteReward: (id: string) => fetchWithAuth(`/data/rewards/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Reward Suggestions
  getRewardSuggestions: () => fetchWithAuth('/reward-suggestions', { method: 'GET' }).then(r => r.json()),
  createRewardSuggestion: (data: { title: string; description?: string }) => fetchWithAuth('/reward-suggestions', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  voteRewardSuggestion: (id: string) => fetchWithAuth(`/reward-suggestions/${id}/vote`, { method: 'POST' }).then(r => r.json()),
  deleteRewardSuggestion: (id: string) => fetchWithAuth(`/reward-suggestions/${id}`, { method: 'DELETE' }).then(r => r.json()),
  moderateRewardSuggestion: (id: string, action: 'approve' | 'reject') => fetchWithAuth(`/reward-suggestions/${id}/moderate`, { method: 'PUT', body: JSON.stringify({ action }) }).then(r => r.json()),

  // Other endpoints
  getLeaderboards: () => fetchWithAuth('/leaderboards', { method: 'GET' }).then(r => r.json()),
  getPresentationStats: () => fetchWithAuth('/presentation-stats', { method: 'GET' }).then(r => r.json()),
  getReports: () => fetchWithAuth('/reports', { method: 'GET' }).then(r => r.json()),
  runIntegrityCheck: () => fetchWithAuth('/integrity-check', { method: 'GET' }).then(r => r.json()),
  getAttendanceSummary: () => fetchWithAuth('/attendance/reports', { method: 'GET' }).then(r => r.json()),
  
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
  getTicketsCount: () => fetchWithAuth('/tickets/count', { method: 'GET' }).then(r => r.json()),
  getIntegrityCheckCount: () => fetchWithAuth('/integrity-check/count', { method: 'GET' }).then(r => r.json()),
  getActiveRewardsCount: () => fetchWithAuth('/rewards/active-count', { method: 'GET' }).then(r => r.json()),
  getRecentPointsCount: () => fetchWithAuth('/points/recent-count', { method: 'GET' }).then(r => r.json()),
  
  // Notifications
  getNotifications: () => fetchWithAuth('/notifications', { method: 'GET' }).then(r => r.json()),
  markNotificationRead: (id: string) => fetchWithAuth(`/notifications/${id}/read`, { method: 'POST' }).then(r => r.json()),
  markAllNotificationsRead: () => fetchWithAuth('/notifications/read-all', { method: 'POST' }).then(r => r.json()),
  
  // User's own points
  getMyPoints: (cadetName: string) => fetchWithAuth(`/my-points?name=${encodeURIComponent(cadetName)}`, { method: 'GET' }).then(r => r.json()),
  
  // Auth helpers
  lookupEmail: (username: string) => fetch(`${API_URL}/auth/lookup-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  }).then(r => r.json()),

  // Admin Account Management
  getUsers: () => fetchWithAuth('/auth/users', { method: 'GET' }).then(parseJsonSafe),
  updateUserRole: (userId: string, role: string) =>
    fetchWithAuth(`/auth/users/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify({ role }) }).then(parseJsonSafe),
  updateUsername: (userId: string, username: string) =>
    fetchWithAuth(`/auth/users/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify({ username }) }).then(parseJsonSafe),
  deleteUser: (userId: string) =>
    fetchWithAuth(`/auth/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }).then(parseJsonSafe),
  createAccount: (data: { cadetId: string; role?: string }) =>
    fetchWithAuth('/admin/create-account', { method: 'POST', body: JSON.stringify(data) }).then(parseJsonSafe),
  resetAccountPassword: (userId: string) =>
    fetchWithAuth('/admin/reset-account-password', { method: 'POST', body: JSON.stringify({ userId }) }).then(parseJsonSafe),
  
  // Cleanup retention
  cleanupRetention: () => fetchWithAuth('/admin/cleanup-retention', { method: 'POST' }).then(r => r.json()),
  
  // Deploy Status
  getDeployStatus: () => fetchWithAuth('/deploy-status', { method: 'GET' }).then(r => r.json()),
  
  // Verify PIN
  verifyPin: (pin: string) => fetchWithAuth('/admin/verify-pin', { method: 'POST', body: JSON.stringify({ pin }) }).then(r => r.json()),
  
  // Admin utilities
  getPinStatus: () => fetchWithAuth('/admin/pin-status', { method: 'GET' }).then(r => r.json()),
  changeUserRole: (userId: string, role: string) => fetchWithAuth(`/admin/change-role/${userId}`, { method: 'POST', body: JSON.stringify({ role }) }).then(r => r.json()),
  updateUserName: (userId: string, newName: string) => fetchWithAuth(`/users/${userId}/name`, { method: 'PUT', body: JSON.stringify({ name: newName }) }).then(r => r.json()),
  changePin: (userId: string, currentPin: string, newPin: string) => fetchWithAuth(`/admin/change-pin`, { method: 'POST', body: JSON.stringify({ userId, currentPin, newPin }) }).then(r => r.json()),
  resetPin: (targetUserId: string) => fetchWithAuth(`/admin/reset-pin`, { method: 'POST', body: JSON.stringify({ targetUserId }) }).then(r => r.json()),
};

export { fetchWithAuth };