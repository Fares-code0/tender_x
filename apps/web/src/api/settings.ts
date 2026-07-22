import type { SystemSettings } from '@tender/shared';
import { api } from './client';

export function fetchSettings(): Promise<{ settings: SystemSettings }> {
  return api('/admin/settings');
}

export function updateSettings(input: {
  closingReminderDays: number;
}): Promise<{ settings: SystemSettings }> {
  return api('/admin/settings', { method: 'PATCH', body: JSON.stringify(input) });
}
