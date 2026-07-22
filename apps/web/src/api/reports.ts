import type { TenderStatusName } from '@tender/shared';
import { api } from './client';

export interface ReportSummary {
  from: string | null;
  to: string | null;
  userId: string | null;
  total: number;
  byStatus: Record<TenderStatusName, number>;
  wonLost: { won: number; lost: number };
  byUser: {
    userId: string;
    name: string;
    role: string;
    tendersCreated: number;
    statusChanges: number;
  }[];
}

export interface ReportFilters {
  from?: string;
  to?: string;
  userId?: string;
}

export function fetchReportSummary(filters: ReportFilters): Promise<ReportSummary> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, String(v));
  }
  const qs = params.toString();
  return api(`/reports/summary${qs ? `?${qs}` : ''}`);
}
