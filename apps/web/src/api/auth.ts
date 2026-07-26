import type { RoleName } from '@tender/shared';
import { api, ApiError } from './client';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const data = await api<{ user: AuthUser }>('/auth/me');
    return data.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await api<{ user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export function logout(): Promise<{ ok: boolean }> {
  return api('/auth/logout', { method: 'POST' });
}
