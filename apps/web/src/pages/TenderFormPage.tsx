import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTenderSchema } from '@tender/shared';
import { createTender, fetchTender, updateTender } from '../api/tenders';
import { ApiError } from '../api/client';

interface FormState {
  title: string;
  entity: string;
  closingDate: string;
  source: string;
  url: string;
  description: string;
}

const emptyForm: FormState = {
  title: '',
  entity: '',
  closingDate: '',
  source: '',
  url: '',
  description: '',
};

/** نموذج إضافة/تعديل مناقصة — تحقق Zod نفسه المستخدم في الـbackend + رسائل عربية (M2.7) */
export function TenderFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const existing = useQuery({
    queryKey: ['tender', id],
    queryFn: () => fetchTender(id!),
    enabled: mode === 'edit' && !!id,
  });

  useEffect(() => {
    if (mode === 'edit' && existing.data) {
      const t = existing.data.tender;
      setForm({
        title: t.title,
        entity: t.entity,
        closingDate: t.closingDate.slice(0, 10),
        source: t.source ?? '',
        url: t.url ?? '',
        description: t.description ?? '',
      });
    }
  }, [mode, existing.data]);

  const mutation = useMutation({
    mutationFn: async ({ force }: { force: boolean }) => {
      const parsed = createTenderSchema.parse({
        ...form,
        closingDate: form.closingDate ? new Date(form.closingDate) : undefined,
      });
      if (mode === 'create') return createTender(parsed, force);
      return updateTender(id!, parsed);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tenders'] });
      queryClient.invalidateQueries({ queryKey: ['tender', data.tender.id] });
      navigate(`/tenders/${data.tender.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setDuplicateWarning(true);
      } else if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('تعذر الاتصال بالخادم');
      }
    },
  });

  const submit = (e: FormEvent, force = false) => {
    e.preventDefault();
    setFieldErrors({});
    setServerError(null);
    setDuplicateWarning(false);

    const parsed = createTenderSchema.safeParse({
      ...form,
      closingDate: form.closingDate ? new Date(form.closingDate) : undefined,
    });
    if (!parsed.success) {
      const errors: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (key && !errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    mutation.mutate({ force });
  };

  const set = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const inputClass = (key: keyof FormState) =>
    `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
      fieldErrors[key]
        ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
        : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500'
    }`;

  const FieldError = ({ name }: { name: keyof FormState }) =>
    fieldErrors[name] ? <p className="mt-1 text-xs text-red-600">{fieldErrors[name]}</p> : null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800">
        {mode === 'create' ? 'إضافة مناقصة جديدة' : 'تعديل المناقصة'}
      </h1>

      <form onSubmit={submit} noValidate className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <label htmlFor="t-title" className="mb-1 block text-sm font-medium text-slate-700">
            عنوان المناقصة <span className="text-red-500">*</span>
          </label>
          <input id="t-title" value={form.title} onChange={set('title')} className={inputClass('title')} />
          <FieldError name="title" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="t-entity" className="mb-1 block text-sm font-medium text-slate-700">
              الجهة المعلنة <span className="text-red-500">*</span>
            </label>
            <input id="t-entity" value={form.entity} onChange={set('entity')} className={inputClass('entity')} />
            <FieldError name="entity" />
          </div>
          <div>
            <label htmlFor="t-closing" className="mb-1 block text-sm font-medium text-slate-700">
              موعد الإغلاق <span className="text-red-500">*</span>
            </label>
            <input
              id="t-closing"
              type="date"
              value={form.closingDate}
              onChange={set('closingDate')}
              className={inputClass('closingDate')}
            />
            <FieldError name="closingDate" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="t-source" className="mb-1 block text-sm font-medium text-slate-700">
              المصدر
            </label>
            <input
              id="t-source"
              value={form.source}
              onChange={set('source')}
              placeholder="مثال: منصة اعتماد"
              className={inputClass('source')}
            />
            <FieldError name="source" />
          </div>
          <div>
            <label htmlFor="t-url" className="mb-1 block text-sm font-medium text-slate-700">
              رابط المناقصة
            </label>
            <input id="t-url" dir="ltr" value={form.url} onChange={set('url')} className={inputClass('url')} />
            <FieldError name="url" />
          </div>
        </div>

        <div>
          <label htmlFor="t-desc" className="mb-1 block text-sm font-medium text-slate-700">
            الوصف
          </label>
          <textarea
            id="t-desc"
            rows={4}
            value={form.description}
            onChange={set('description')}
            className={inputClass('description')}
          />
          <FieldError name="description" />
        </div>

        {duplicateWarning && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">تحذير: مناقصة مكررة</p>
            <p className="mt-1">
              توجد مناقصة مسجلة بنفس الرابط أو بنفس العنوان والجهة. يمكنك التأكيد للإضافة رغم التكرار.
            </p>
            <button
              type="button"
              onClick={(e) => submit(e as unknown as FormEvent, true)}
              className="mt-3 rounded-lg bg-amber-600 px-4 py-1.5 font-semibold text-white hover:bg-amber-700"
            >
              تأكيد الإضافة رغم التكرار
            </button>
          </div>
        )}

        {serverError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {mutation.isPending ? 'جارٍ الحفظ...' : mode === 'create' ? 'إضافة المناقصة' : 'حفظ التعديلات'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-slate-300 px-5 py-2 text-slate-600 hover:bg-slate-100"
          >
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}
