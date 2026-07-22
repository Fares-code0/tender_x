import type { RoleName, TenderStatusName } from '@tender/shared';

export const roleLabels: Record<RoleName, string> = {
  ADMIN: 'مسؤول النظام',
  QA: 'مراجع الجودة',
  WRITER: 'كاتب العروض',
  MANAGER: 'المدير',
  OWNER: 'المالك',
};

export const statusLabels: Record<TenderStatusName, string> = {
  NEW: 'جديدة',
  UNDER_REVIEW: 'قيد المراجعة',
  REJECTED: 'مستبعدة',
  PROPOSAL_PREPARATION: 'إعداد العرض',
  PENDING_APPROVAL: 'بانتظار الاعتماد',
  SUBMITTED: 'مقدَّمة',
  WON: 'فوز',
  LOST: 'خسارة',
};

export const statusBadgeClasses: Record<TenderStatusName, string> = {
  NEW: 'bg-sky-100 text-sky-700',
  UNDER_REVIEW: 'bg-amber-100 text-amber-700',
  REJECTED: 'bg-red-100 text-red-700',
  PROPOSAL_PREPARATION: 'bg-violet-100 text-violet-700',
  PENDING_APPROVAL: 'bg-orange-100 text-orange-700',
  SUBMITTED: 'bg-indigo-100 text-indigo-700',
  WON: 'bg-green-100 text-green-700',
  LOST: 'bg-slate-200 text-slate-600',
};

/** الحالات التي ما زالت نشطة (موعد الإغلاق يهمّها) */
export const activeStatuses: TenderStatusName[] = [
  'NEW',
  'UNDER_REVIEW',
  'PROPOSAL_PREPARATION',
  'PENDING_APPROVAL',
];

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
