import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchTender } from '../api/tenders';
import { isTenderEditable } from '@tender/shared';
import { useMe } from '../hooks/useAuth';
import { StatusBadge } from '../components/StatusBadge';
import { ReviewTab } from '../components/ReviewTab';
import { ActionsBar } from '../components/ActionsBar';
import { AttachmentsTab } from '../components/AttachmentsTab';
import { AuditTab } from '../components/AuditTab';
import { formatDate, statusLabels } from '../lib/labels';

/** صفحة تفاصيل المناقصة: تبويبات (التفاصيل + المراجعة) (M2.8 + M3.6) */
export function TenderDetailsPage() {
  const { id } = useParams();
  const { data: user } = useMe();
  const [tab, setTab] = useState<'details' | 'review' | 'attachments' | 'audit'>('details');
  const { data, isLoading, error } = useQuery({
    queryKey: ['tender', id],
    queryFn: () => fetchTender(id!),
    enabled: !!id,
  });

  if (isLoading) return <p className="text-slate-500">جارٍ التحميل...</p>;
  if (error || !data) return <p className="text-red-600">تعذر تحميل المناقصة</p>;

  const t = data.tender;
  const canEdit =
    user && ['QA', 'MANAGER', 'ADMIN'].includes(user.role) && isTenderEditable(t.status);

  const canViewAudit = user && ['MANAGER', 'OWNER', 'ADMIN'].includes(user.role);
  const tabs = [
    { key: 'details' as const, label: 'التفاصيل' },
    { key: 'review' as const, label: 'المراجعة' },
    { key: 'attachments' as const, label: 'المرفقات' },
    ...(canViewAudit ? [{ key: 'audit' as const, label: 'سجل العمليات' }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">{t.title}</h1>
            <StatusBadge status={t.status} />
          </div>
          <p className="mt-1 text-slate-500">{t.entity}</p>
        </div>
        {canEdit && (
          <Link
            to={`/tenders/${t.id}/edit`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            تعديل
          </Link>
        )}
      </div>

      <ActionsBar tender={t} user={user ?? null} />

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === tabItem.key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === 'review' ? (
        <ReviewTab tender={t} user={user ?? null} />
      ) : tab === 'attachments' ? (
        <AttachmentsTab tenderId={t.id} user={user ?? null} />
      ) : tab === 'audit' ? (
        <AuditTab tenderId={t.id} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold text-slate-700">بيانات المناقصة</h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">موعد الإغلاق</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{formatDate(t.closingDate)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">المصدر</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{t.source ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">المسؤول الحالي</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{t.currentAssignee?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">أضافها</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{t.createdBy.name}</dd>
              </div>
              {t.url && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">الرابط</dt>
                  <dd className="mt-0.5">
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      dir="ltr"
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      {t.url}
                    </a>
                  </dd>
                </div>
              )}
              {t.description && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">الوصف</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">{t.description}</dd>
                </div>
              )}
              {t.rejectionReason && (
                <div className="sm:col-span-2">
                  <dt className="text-red-500">سبب الاستبعاد</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap font-medium text-red-700">
                    {t.rejectionReason}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-700">تاريخ الحالات</h2>
          <ol className="mt-4 space-y-0">
            {t.statusHistory.map((h, i) => (
              <li key={h.id} className="relative flex gap-3 pb-6 last:pb-0">
                {i < t.statusHistory.length - 1 && (
                  <span className="absolute right-[5px] top-4 h-full w-px bg-slate-200" />
                )}
                <span className="relative mt-1.5 block h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500" />
                <div className="text-sm">
                  <p className="font-medium text-slate-800">
                    {h.fromStatus ? `${statusLabels[h.fromStatus]} ← ${statusLabels[h.toStatus]}` : `أُنشئت (${statusLabels[h.toStatus]})`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {h.changedBy.name} — {formatDate(h.createdAt)}
                  </p>
                  {h.note && <p className="mt-1 text-xs text-slate-600">{h.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
        </div>
      )}
    </div>
  );
}
