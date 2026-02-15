// src/utils/api.ts
import { getToken } from './auth';

const API_URL = 'https://flightpoints.uk/api';

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

  // Other endpoints
  getLeaderboards: () => fetchWithAuth('/leaderboards', { method: 'GET' }).then(r => r.json()),
  getReports: () => fetchWithAuth('/reports', { method: 'GET' }).then(r => r.json()),
  runIntegrityCheck: () => fetchWithAuth('/integrity-check', { method: 'POST' }).then(r => r.json()),
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
    }).then(r => r.json()),
};

export { fetchWithAuth };