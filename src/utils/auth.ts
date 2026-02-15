// src/utils/auth.ts
import { useState } from 'react';

const API_URL = 'https://flightpoints.uk/api';

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
          cadetName: payload.cadetName
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
  // Remove any Supabase-related keys
  Object.keys(localStorage).forEach(key => {
    if (key.toLowerCase().includes('supabase')) {
      localStorage.removeItem(key);
    }
  });
}

export function getToken(): string | null {
  return localStorage.getItem('token');
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
