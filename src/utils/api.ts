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
  getCadets: () => fetchWithAuth('/cadets', { method: 'GET' }).then(r => r.json()),
  createCadet: (data: Partial<Cadet>) => fetchWithAuth('/cadets', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updateCadet: (id: string, data: Partial<Cadet>) => fetchWithAuth(`/cadets/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deleteCadet: (id: string) => fetchWithAuth(`/cadets/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Points
  getPoints: () => fetchWithAuth('/points', { method: 'GET' }).then(r => r.json()),
  createPoint: (data: Partial<Point>) => fetchWithAuth('/points', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updatePoint: (id: string, data: Partial<Point>) => fetchWithAuth(`/points/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deletePoint: (id: string) => fetchWithAuth(`/points/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Attendance
  getAttendance: () => fetchWithAuth('/attendance', { method: 'GET' }).then(r => r.json()),
  createAttendance: (data: Partial<Attendance>) => fetchWithAuth('/attendance', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updateAttendance: (id: string, data: Partial<Attendance>) => fetchWithAuth(`/attendance/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deleteAttendance: (id: string) => fetchWithAuth(`/attendance/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Other endpoints
  getLeaderboards: () => fetchWithAuth('/leaderboards', { method: 'GET' }).then(r => r.json()),
  getReports: () => fetchWithAuth('/reports', { method: 'GET' }).then(r => r.json()),
  runIntegrityCheck: () => fetchWithAuth('/integrity-check', { method: 'POST' }).then(r => r.json()),
};

export { fetchWithAuth };