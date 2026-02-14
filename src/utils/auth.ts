// src/utils/auth.ts
import { useState } from 'react';

const API_URL = 'http://localhost:3001/api';

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
  }
  return data.user;
}

  localStorage.removeItem('token');
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
