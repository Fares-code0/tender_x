import type { CreateTenderInput, TenderStatusName, UpdateTenderInput } from '@tender/shared';
import { api } from './client';

export interface TenderUserRef {
  id: string;
  name: string;
  role: string;
}

export interface Tender {
  id: string;
  title: string;
  entity: string;
  source: string | null;
  url: string | null;
  closingDate: string;
  description: string | null;
  status: TenderStatusName;
  rejectionReason: string | null;
  currentAssigneeId: string | null;
  currentAssignee: TenderUserRef | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenderDetails extends Tender {
  createdBy: TenderUserRef;
  statusHistory: {
    id: string;
    fromStatus: TenderStatusName | null;
    toStatus: TenderStatusName;
    note: string | null;
    createdAt: string;
    changedBy: TenderUserRef;
  }[];
}

export interface TenderListResponse {
  tenders: Tender[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TenderFilters {
  status?: string;
  entity?: string;
  q?: string;
  page?: number;
}

export function fetchTenders(filters: TenderFilters): Promise<TenderListResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return api(`/tenders${qs ? `?${qs}` : ''}`);
}

export function fetchTender(id: string): Promise<{ tender: TenderDetails }> {
  return api(`/tenders/${id}`);
}

export function createTender(
  input: CreateTenderInput,
  force = false,
): Promise<{ tender: Tender }> {
  return api(`/tenders${force ? '?force=1' : ''}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateTender(id: string, input: UpdateTenderInput): Promise<{ tender: Tender }> {
  return api(`/tenders/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
