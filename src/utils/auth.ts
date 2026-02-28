// src/utils/auth.ts
import { useState } from 'react';

const API_URL = 'https://flightpoints.uk/api';

function decodeJwtPayload(token: string): any | null {
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return null;
    const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string, clockSkewSeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= (now + clockSkewSeconds);
}

export interface User {
  id: string;
  email: string;
  [key: string]: any;
}

export async function login(email: string, password: string): Promise<User> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error('Login failed');
  }
  const data = await res.json();
  if (data.token) {
    localStorage.setItem('token', data.token);
    
    // Decode JWT to extract user data
    try {
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      const user = {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        user_metadata: {
          name: payload.name,
          role: payload.role,
          // cadetName: if the account is linked to a cadet, user.name IS the cadet name
          cadetName: payload.cadetName || (payload.cadetId ? payload.name : undefined),
          cadetId: payload.cadetId,
          flight: payload.flight,
        }
      };
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    } catch (err) {
      console.error('Failed to decode token:', err);
    }
  }
  return data.user;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('localStore_73a3871f_v1');
  // Remove any legacy auth-provider keys
  Object.keys(localStorage).forEach(key => {
    const legacyPrefixes = ['sb-', 'supa-'];
    if (legacyPrefixes.some(prefix => key.toLowerCase().includes(prefix))) {
      localStorage.removeItem(key);
    }
  });
}

export function getToken(): string | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  if (isTokenExpired(token)) {
    logout();
    return null;
  }
  return token;
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getUser(): User | null {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}
