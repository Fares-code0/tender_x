import { api } from './client';

export interface AuditEntry {
  id: string;
  action: string;
  details: unknown;
  createdAt: string;
  user: { id: string; name: string; role: string };
}

export function fetchAudit(tenderId: string): Promise<{ entries: AuditEntry[] }> {
  return api(`/tenders/${tenderId}/audit`);
}
