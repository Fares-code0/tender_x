import type { TenderStatusName } from '@tender/shared';
import { api } from './client';

export interface DashboardData {
  role: 'QA' | 'WRITER' | 'MANAGER' | 'OWNER' | 'ADMIN';
  qa?: { newCount: number; underReviewMineCount: number; closingSoonCount: number };
  writer?: { myTasksCount: number; returnedToMeCount: number };
  manager?: { pendingApprovalCount: number; submittedCount: number };
  total: number;
  statusDistribution: Record<TenderStatusName, number>;
  monthly: { month: string; count: number }[];
  winRate: number | null;
  avgStageDurationDays: Record<string, number> | null;
}

export function fetchDashboard(): Promise<DashboardData> {
  return api('/dashboard');
}
