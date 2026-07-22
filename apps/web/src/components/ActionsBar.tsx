import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '../api/auth';
import { ApiError } from '../api/client';
import {
  assignWriter,
  fetchWriters,
  managerDecision,
  markSubmitted,
  recordResult,
  submitForApproval,
  type TenderDetails,
} from '../api/tenders';

type ModalKind = null | 'assign' | 'return' | 'stop';

/**
 * M4.6 — شريط الإجراءات: يعرض أزرار الانتقال المتاحة ديناميكيًا
 * حسب (الحالة الحالية + دور المستخدم + كونه المسؤول المعيّن).
 */
export function ActionsBar({ tender, user }: { tender: TenderDetails; user: AuthUser | null }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalKind>(null);
  const [writerId, setWriterId] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tender', tender.id] });
    qc.invalidateQueries({ queryKey: ['my-tasks'] });
  };
  const onError = (e: ApiError) => setError(e.message);
  const closeModal = () => {
    setModal(null);
    setNotes('');
    setReason('');
    setWriterId('');
  };

  const writersQuery = useQuery({
    queryKey: ['writers'],
    queryFn: fetchWriters,
    enabled: modal === 'assign',
  });

  const assignMut = useMutation({
    mutationFn: () => assignWriter(tender.id, writerId),
    onSuccess: () => {
      closeModal();
      invalidate();
    },
    onError,
  });
  const submitMut = useMutation({
    mutationFn: () => submitForApproval(tender.id),
    onSuccess: invalidate,
    onError,
  });
  const approveMut = useMutation({
    mutationFn: () => managerDecision(tender.id, { decision: 'approve' }),
    onSuccess: invalidate,
    onError,
  });
  const returnMut = useMutation({
    mutationFn: () => managerDecision(tender.id, { decision: 'return', notes }),
    onSuccess: () => {
      closeModal();
      invalidate();
    },
    onError,
  });
  const stopMut = useMutation({
    mutationFn: () => managerDecision(tender.id, { decision: 'stop', reason }),
    onSuccess: () => {
      closeModal();
      invalidate();
    },
    onError,
  });
  const markMut = useMutation({
    mutationFn: () => markSubmitted(tender.id),
    onSuccess: invalidate,
    onError,
  });
  const resultMut = useMutation({
    mutationFn: (r: 'WON' | 'LOST') => recordResult(tender.id, r),
    onSuccess: invalidate,
    onError,
  });

  if (!user) return null;
  const { status } = tender;
  const isAssignee = tender.currentAssigneeId === user.id;

  const actions: React.ReactNode[] = [];
  const btn = 'rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

  if (status === 'UNDER_REVIEW' && user.role === 'QA') {
    actions.push(
      <button
        key="assign"
        onClick={() => {
          setError(null);
          setModal('assign');
        }}
        className={`${btn} bg-indigo-600 hover:bg-indigo-700`}
      >
        تعيين كاتب
      </button>,
    );
  }

  if (status === 'PROPOSAL_PREPARATION' && user.role === 'WRITER' && isAssignee) {
    actions.push(
      <button
        key="submit"
        onClick={() => {
          setError(null);
          submitMut.mutate();
        }}
        disabled={submitMut.isPending}
        className={`${btn} bg-indigo-600 hover:bg-indigo-700`}
      >
        {submitMut.isPending ? 'جارٍ الإرسال...' : 'إرسال للاعتماد'}
      </button>,
    );
  }

  if (status === 'PENDING_APPROVAL' && user.role === 'MANAGER') {
    if (!tender.managerApprovedAt) {
      actions.push(
        <button
          key="approve"
          onClick={() => {
            setError(null);
            approveMut.mutate();
          }}
          disabled={approveMut.isPending}
          className={`${btn} bg-green-600 hover:bg-green-700`}
        >
          {approveMut.isPending ? 'جارٍ الاعتماد...' : 'اعتماد'}
        </button>,
      );
    } else {
      actions.push(
        <button
          key="mark"
          onClick={() => {
            setError(null);
            markMut.mutate();
          }}
          disabled={markMut.isPending}
          className={`${btn} bg-emerald-600 hover:bg-emerald-700`}
        >
          {markMut.isPending ? 'جارٍ التسجيل...' : 'تسجيل التقديم'}
        </button>,
      );
    }
    actions.push(
      <button
        key="return"
        onClick={() => {
          setError(null);
          setModal('return');
        }}
        className={`${btn} bg-amber-600 hover:bg-amber-700`}
      >
        إعادة للكاتب
      </button>,
      <button
        key="stop"
        onClick={() => {
          setError(null);
          setModal('stop');
        }}
        className={`${btn} bg-red-600 hover:bg-red-700`}
      >
        إيقاف
      </button>,
    );
  }

  if (status === 'SUBMITTED' && user.role === 'MANAGER') {
    actions.push(
      <button
        key="won"
        onClick={() => {
          setError(null);
          resultMut.mutate('WON');
        }}
        disabled={resultMut.isPending}
        className={`${btn} bg-green-600 hover:bg-green-700`}
      >
        النتيجة: فوز
      </button>,
      <button
        key="lost"
        onClick={() => {
          setError(null);
          resultMut.mutate('LOST');
        }}
        disabled={resultMut.isPending}
        className={`${btn} bg-slate-600 hover:bg-slate-700`}
      >
        النتيجة: خسارة
      </button>,
    );
  }

  if (actions.length === 0 && !error) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-500">الإجراءات المتاحة:</span>
        {actions}
        {actions.length === 0 && <span className="text-sm text-slate-400">لا توجد إجراءات متاحة لك حاليًا.</span>}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {modal === 'assign' && (
        <Modal title="تعيين كاتب للعرض" onClose={closeModal}>
          <label htmlFor="writer" className="mb-1 block text-sm text-slate-600">
            اختر الكاتب
          </label>
          <select
            id="writer"
            value={writerId}
            onChange={(e) => setWriterId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">— اختر —</option>
            {writersQuery.data?.writers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <ModalActions
            confirmLabel={assignMut.isPending ? 'جارٍ التعيين...' : 'تعيين'}
            confirmDisabled={!writerId || assignMut.isPending}
            onConfirm={() => assignMut.mutate()}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal === 'return' && (
        <Modal title="إعادة العرض للكاتب" onClose={closeModal}>
          <p className="mb-2 text-sm text-slate-500">الملاحظات إلزامية وتُرسَل للكاتب.</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="اكتب ملاحظات الإعادة..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
          <ModalActions
            confirmLabel={returnMut.isPending ? 'جارٍ الإرسال...' : 'إعادة'}
            confirmDisabled={notes.trim().length < 3 || returnMut.isPending}
            onConfirm={() => returnMut.mutate()}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal === 'stop' && (
        <Modal title="إيقاف المناقصة" onClose={closeModal}>
          <p className="mb-2 text-sm text-slate-500">سبب الإيقاف إلزامي.</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="اكتب سبب الإيقاف..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
          />
          <ModalActions
            confirmLabel={stopMut.isPending ? 'جارٍ الإيقاف...' : 'إيقاف'}
            confirmDisabled={reason.trim().length < 3 || stopMut.isPending}
            onConfirm={() => stopMut.mutate()}
            onCancel={closeModal}
          />
        </Modal>
      )}
    </section>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 font-semibold text-slate-800">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  confirmLabel,
  confirmDisabled,
  onConfirm,
  onCancel,
}: {
  confirmLabel: string;
  confirmDisabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex justify-end gap-3">
      <button
        onClick={onCancel}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
      >
        إلغاء
      </button>
      <button
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
