import { useQuery } from '@tanstack/react-query';
import { fetchAudit, type AuditEntry } from '../api/audit';
import { roleLabels } from '../lib/labels';

const ACTION_LABELS: Record<string, string> = {
  TENDER_CREATED: 'إنشاء المناقصة',
  TENDER_UPDATED: 'تعديل بيانات المناقصة',
  REVIEW_STARTED: 'بدء المراجعة',
  CHECKLIST_SAVED: 'حفظ قائمة التحقق',
  REVIEW_APPROVED: 'اعتماد المراجعة',
  REVIEW_REJECTED: 'استبعاد في المراجعة',
  ASSIGNED: 'تعيين كاتب',
  SUBMITTED_FOR_APPROVAL: 'إرسال للاعتماد',
  MANAGER_APPROVED: 'اعتماد المدير',
  MANAGER_RETURNED: 'إعادة للكاتب',
  MANAGER_STOPPED: 'إيقاف من المدير',
  MARKED_SUBMITTED: 'تسجيل التقديم',
  RESULT_RECORDED: 'تسجيل النتيجة',
  ATTACHMENT_UPLOADED: 'رفع مرفق',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ar-SA-u-ca-gregory', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** M8.1 — تبويب "سجل العمليات": من/ماذا/متى — قراءة فقط (NFR-005) */
export function AuditTab({ tenderId }: { tenderId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', tenderId],
    queryFn: () => fetchAudit(tenderId),
  });

  if (isLoading) return <p className="text-slate-500">جارٍ التحميل...</p>;
  if (error) return <p className="text-red-600">تعذر تحميل سجل العمليات</p>;

  const entries = data?.entries ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-700">
        سجل العمليات (قراءة فقط)
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">لا توجد عمليات مسجّلة</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">الإجراء</th>
                <th className="px-4 py-2 font-medium">المنفِّذ</th>
                <th className="px-4 py-2 font-medium">التوقيت</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: AuditEntry) => (
                <tr key={e.id} className="border-t border-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {ACTION_LABELS[e.action] ?? e.action}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {e.user.name}
                    <span className="mr-1 text-xs text-slate-400">
                      ({roleLabels[e.user.role as keyof typeof roleLabels] ?? e.user.role})
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{formatDateTime(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
