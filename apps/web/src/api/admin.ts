import type { CreateUserInput, UpdateUserInput, RoleName } from '@tender/shared';
import { api } from './client';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  isActive: boolean;
}

export function fetchAdminUsers(): Promise<{ users: AdminUser[] }> {
  return api('/admin/users');
}

export function createUser(input: CreateUserInput): Promise<{ user: AdminUser }> {
  return api('/admin/users', { method: 'POST', body: JSON.stringify(input) });
}

export function updateUser(id: string, input: UpdateUserInput): Promise<{ user: AdminUser }> {
  return api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
