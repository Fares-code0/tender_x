import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '../api/auth';
import { ApiError } from '../api/client';
import {
  fetchChecklist,
  saveChecklist,
  startReview,
  reviewDecision,
  type ChecklistItemState,
  type TenderDetails,
} from '../api/tenders';

/**
 * M3.6 — تبويب المراجعة: Checklist تفاعلية + اعتماد/استبعاد.
 * تظهر الإجراءات لدور QA فقط، وزر الاعتماد يبقى معطّلًا حتى تكتمل كل البنود.
 */
export function ReviewTab({ tender, user }: { tender: TenderDetails; user: AuthUser | null }) {
  const qc = useQueryClient();
  const isQa = user?.role === 'QA';

  const { data, isLoading, error } = useQuery({
    queryKey: ['checklist', tender.id],
    queryFn: () => fetchChecklist(tender.id),
  });

  const [items, setItems] = useState<ChecklistItemState[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.items) setItems(data.items);
  }, [data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['checklist', tender.id] });
    qc.invalidateQueries({ queryKey: ['tender', tender.id] });
  };

  const startMut = useMutation({
    mutationFn: () => startReview(tender.id),
    onSuccess: invalidate,
    onError: (e: ApiError) => setActionError(e.message),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      saveChecklist(
        tender.id,
        items.map((i) => ({ itemId: i.itemId, checked: i.checked, note: i.note ?? undefined })),
      ),
    onSuccess: invalidate,
    onError: (e: ApiError) => setActionError(e.message),
  });

  const approveMut = useMutation({
    mutationFn: async () => {
      // نحفظ آخر حالة للبنود ثم نعتمد لضمان تطابق الخادم
      await saveChecklist(
        tender.id,
        items.map((i) => ({ itemId: i.itemId, checked: i.checked, note: i.note ?? undefined })),
      );
      return reviewDecision(tender.id, { decision: 'approve' });
    },
    onSuccess: invalidate,
    onError: (e: ApiError) => setActionError(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: () => reviewDecision(tender.id, { decision: 'reject', rejectionReason: rejectReason }),
    onSuccess: () => {
      setRejectOpen(false);
      setRejectReason('');
      invalidate();
    },
    onError: (e: ApiError) => setActionError(e.message),
  });

  if (isLoading) return <p className="text-slate-500">جارٍ التحميل...</p>;
  if (error) return <p className="text-red-600">تعذر تحميل بيانات المراجعة</p>;

  const allChecked = items.length > 0 && items.every((i) => i.checked);
  const editable = isQa && tender.status === 'UNDER_REVIEW';

  // حالة NEW: لم تبدأ المراجعة بعد
  if (tender.status === 'NEW') {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-700">المراجعة</h2>
        <p className="mt-2 text-sm text-slate-500">لم تبدأ مراجعة هذه المناقصة بعد.</p>
        {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
        {isQa && (
          <button
            onClick={() => {
              setActionError(null);
              startMut.mutate();
            }}
            disabled={startMut.isPending}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {startMut.isPending ? 'جارٍ البدء...' : 'بدء المراجعة'}
          </button>
        )}
        {!isQa && <p className="mt-4 text-xs text-slate-400">بدء المراجعة متاح لمراجع الجودة فقط.</p>}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">قائمة تحقق المراجعة</h2>
        {tender.status === 'REJECTED' && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
            مستبعدة
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">لا يوجد قالب مراجعة نشط.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item, idx) => (
            <li key={item.itemId} className="rounded-lg border border-slate-200 p-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={!editable}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, checked: e.target.checked } : p)),
                    )
                  }
                  className="mt-1 h-4 w-4 shrink-0 accent-indigo-600 disabled:opacity-60"
                />
                <span className="text-sm text-slate-800">{item.text}</span>
              </label>
              {editable && (
                <input
                  type="text"
                  value={item.note ?? ''}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, note: e.target.value } : p)),
                    )
                  }
                  placeholder="ملاحظة (اختياري)"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                />
              )}
              {!editable && item.note && (
                <p className="mt-1 pr-7 text-xs text-slate-500">{item.note}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {actionError && <p className="mt-4 text-sm text-red-600">{actionError}</p>}

      {editable && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              setActionError(null);
              saveMut.mutate();
            }}
            disabled={saveMut.isPending || items.length === 0}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {saveMut.isPending ? 'جارٍ الحفظ...' : 'حفظ القائمة'}
          </button>
          <button
            onClick={() => {
              setActionError(null);
              approveMut.mutate();
            }}
            disabled={!allChecked || approveMut.isPending}
            title={!allChecked ? 'يجب اكتمال جميع البنود قبل الاعتماد' : undefined}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {approveMut.isPending ? 'جارٍ الاعتماد...' : 'اعتماد'}
          </button>
          <button
            onClick={() => {
              setActionError(null);
              setRejectOpen(true);
            }}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            استبعاد
          </button>
        </div>
      )}

      {approveMut.isSuccess && (
        <p className="mt-4 text-sm font-medium text-green-700">
          تم اعتماد المراجعة — المناقصة جاهزة للتعيين.
        </p>
      )}

      {rejectOpen && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 className="font-semibold text-slate-800">استبعاد المناقصة</h3>
            <p className="mt-1 text-sm text-slate-500">سبب الاستبعاد إلزامي ويُسجَّل في تفاصيل المناقصة.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="اكتب سبب الاستبعاد..."
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
            />
            {rejectMut.isError && (
              <p className="mt-2 text-sm text-red-600">{(rejectMut.error as ApiError).message}</p>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setRejectOpen(false);
                  setRejectReason('');
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                onClick={() => rejectMut.mutate()}
                disabled={rejectReason.trim().length < 3 || rejectMut.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMut.isPending ? 'جارٍ الاستبعاد...' : 'تأكيد الاستبعاد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
