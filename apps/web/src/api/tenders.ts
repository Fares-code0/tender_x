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
  managerApprovedAt: string | null;
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
  assigneeId?: string;
  closingAfter?: string;
  closingBefore?: string;
  sort?: 'closing_asc' | 'closing_desc' | 'created_desc';
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

// ── M3.3–M3.5: المراجعة والـChecklist ──────────────────────────

export interface ChecklistItemState {
  itemId: string;
  text: string;
  order: number;
  checked: boolean;
  note: string | null;
}

export interface ChecklistResponse {
  templateId: string | null;
  items: ChecklistItemState[];
}

export function fetchChecklist(id: string): Promise<ChecklistResponse> {
  return api(`/tenders/${id}/checklist`);
}

export function saveChecklist(
  id: string,
  answers: { itemId: string; checked: boolean; note?: string }[],
): Promise<unknown> {
  return api(`/tenders/${id}/checklist`, {
    method: 'PUT',
    body: JSON.stringify({ answers }),
  });
}

export function startReview(id: string): Promise<{ tender: Tender }> {
  return api(`/tenders/${id}/review/start`, { method: 'POST' });
}

export type ReviewDecisionBody =
  | { decision: 'approve' }
  | { decision: 'reject'; rejectionReason: string };

export function reviewDecision(id: string, body: ReviewDecisionBody): Promise<{ tender: Tender }> {
  return api(`/tenders/${id}/review/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ── M4: انتقالات سير العمل ──────────────────────────────────────

export function fetchWriters(): Promise<{ writers: { id: string; name: string }[] }> {
  return api('/tenders/meta/writers');
}

export function assignWriter(id: string, assigneeId: string): Promise<{ tender: Tender }> {
  return api(`/tenders/${id}/assign`, { method: 'POST', body: JSON.stringify({ assigneeId }) });
}

export function submitForApproval(id: string): Promise<{ tender: Tender }> {
  return api(`/tenders/${id}/submit-for-approval`, { method: 'POST' });
}

export type ManagerDecisionBody =
  | { decision: 'approve' }
  | { decision: 'return'; notes: string }
  | { decision: 'stop'; reason: string };

export function managerDecision(id: string, body: ManagerDecisionBody): Promise<{ tender: Tender }> {
  return api(`/tenders/${id}/manager-decision`, { method: 'POST', body: JSON.stringify(body) });
}

export function markSubmitted(id: string): Promise<{ tender: Tender }> {
  return api(`/tenders/${id}/mark-submitted`, { method: 'POST' });
}

export function recordResult(id: string, result: 'WON' | 'LOST'): Promise<{ tender: Tender }> {
  return api(`/tenders/${id}/result`, { method: 'POST', body: JSON.stringify({ result }) });
}
