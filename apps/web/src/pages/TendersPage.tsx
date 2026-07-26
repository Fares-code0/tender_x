import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { TENDER_STATUSES } from '@tender/shared';
import { fetchTenders } from '../api/tenders';
import { fetchUsers } from '../api/users';
import { useMe } from '../hooks/useAuth';
import { StatusBadge } from '../components/StatusBadge';
import { activeStatuses, daysUntil, formatDate, roleLabels, statusLabels } from '../lib/labels';

type SortOption = 'closing_asc' | 'closing_desc' | 'created_desc';

export function TendersPage() {
  const { data: user } = useMe();
  const [status, setStatus] = useState('');
  const [entity, setEntity] = useState('');
  const [q, setQ] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [closingAfter, setClosingAfter] = useState('');
  const [closingBefore, setClosingBefore] = useState('');
  const [sort, setSort] = useState<SortOption>('closing_asc');
  const [page, setPage] = useState(1);

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['tenders', { status, entity, q, assigneeId, closingAfter, closingBefore, sort, page }],
    queryFn: () =>
      fetchTenders({
        status,
        entity,
        q,
        assigneeId,
        sort,
        page,
        closingAfter: closingAfter ? `${closingAfter}T00:00:00.000Z` : undefined,
        closingBefore: closingBefore ? `${closingBefore}T23:59:59.999Z` : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">المناقصات</h1>
        {user?.role === 'QA' && (
          <Link
            to="/tenders/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + إضافة مناقصة
          </Link>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label htmlFor="f-q" className="mb-1 block text-xs font-medium text-slate-500">
            بحث
          </label>
          <input
            id="f-q"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="عنوان أو جهة..."
            className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-xs font-medium text-slate-500">
            الحالة
          </label>
          <select
            id="f-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">كل الحالات</option>
            {TENDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-entity" className="mb-1 block text-xs font-medium text-slate-500">
            الجهة المعلنة
          </label>
          <input
            id="f-entity"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
            placeholder="مثال: وزارة الصحة"
            className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="f-assignee" className="mb-1 block text-xs font-medium text-slate-500">
            المسؤول الحالي
          </label>
          <select
            id="f-assignee"
            value={assigneeId}
            onChange={(e) => {
              setAssigneeId(e.target.value);
              setPage(1);
            }}
            className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">الكل</option>
            {usersData?.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {roleLabels[u.role]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-after" className="mb-1 block text-xs font-medium text-slate-500">
            الإغلاق بعد
          </label>
          <input
            id="f-after"
            type="date"
            value={closingAfter}
            onChange={(e) => {
              setClosingAfter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="f-before" className="mb-1 block text-xs font-medium text-slate-500">
            الإغلاق قبل
          </label>
          <input
            id="f-before"
            type="date"
            value={closingBefore}
            onChange={(e) => {
              setClosingBefore(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="f-sort" className="mb-1 block text-xs font-medium text-slate-500">
            الترتيب
          </label>
          <select
            id="f-sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortOption);
              setPage(1);
            }}
            className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="closing_asc">الإغلاق: الأقرب أولًا</option>
            <option value="closing_desc">الإغلاق: الأبعد أولًا</option>
            <option value="created_desc">الأحدث إضافةً</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="mt-6 text-slate-500">جارٍ التحميل...</p>}
      {error != null && <p className="mt-6 text-red-600">تعذر تحميل المناقصات</p>}

      {data && data.tenders.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-500">لا توجد مناقصات مطابقة</p>
          {user?.role === 'QA' && (
            <Link
              to="/tenders/new"
              className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              + إضافة مناقصة
            </Link>
          )}
        </div>
      )}

      {data && data.tenders.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">العنوان</th>
                  <th className="px-4 py-3 font-medium">الجهة المعلنة</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium">موعد الإغلاق</th>
                  <th className="px-4 py-3 font-medium">المسؤول الحالي</th>
                </tr>
              </thead>
              <tbody>
                {data.tenders.map((t) => {
                  const days = daysUntil(t.closingDate);
                  const closingSoon = activeStatuses.includes(t.status) && days <= 3;
                  return (
                    <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          to={`/tenders/${t.id}`}
                          className="font-medium text-indigo-700 hover:underline"
                        >
                          {t.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{t.entity}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className={`px-4 py-3 ${closingSoon ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
                        {formatDate(t.closingDate)}
                        {closingSoon && (
                          <span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                            {days <= 0 ? 'انتهى الموعد' : `متبقٍ ${days} ${days === 1 ? 'يوم' : 'أيام'}`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{t.currentAssignee?.name ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <span>
              إجمالي النتائج: {data.total} — صفحة {data.page} من {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                السابق
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
