import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchTenders, type TenderFilters } from '../api/tenders';
import { useMe } from '../hooks/useAuth';
import { StatusBadge } from '../components/StatusBadge';
import { activeStatuses, daysUntil, formatDate } from '../lib/labels';

/**
 * M4.7 — صفحة "مهامي": المناقصات المعنيّة بالمستخدم الحالي حسب دوره.
 * - QA/Writer: المناقصات المعيّنة له (currentAssignee = أنا).
 * - Manager: المناقصات بانتظار الاعتماد (مجمّع المدراء).
 */
export function MyTasksPage() {
  const { data: user } = useMe();

  const filters: TenderFilters | null = user
    ? user.role === 'MANAGER'
      ? { status: 'PENDING_APPROVAL' }
      : { assigneeId: user.id }
    : null;

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-tasks', user?.id, user?.role],
    queryFn: () => fetchTenders(filters!),
    enabled: !!filters,
  });

  const heading =
    user?.role === 'MANAGER' ? 'مهامي — بانتظار اعتمادي' : 'مهامي — المناقصات المعيّنة لي';

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800">{heading}</h1>

      {isLoading && <p className="mt-6 text-slate-500">جارٍ التحميل...</p>}
      {error != null && <p className="mt-6 text-red-600">تعذر تحميل المهام</p>}

      {data && data.tenders.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          لا توجد مهام لك حاليًا
        </div>
      )}

      {data && data.tenders.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">العنوان</th>
                <th className="px-4 py-3 font-medium">الجهة المعلنة</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium">موعد الإغلاق</th>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
