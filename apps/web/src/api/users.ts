import type { RoleName } from '@tender/shared';
import { api } from './client';

export interface UserOption {
  id: string;
  name: string;
  role: RoleName;
}

export function fetchUsers(): Promise<{ users: UserOption[] }> {
  return api('/users');
}
