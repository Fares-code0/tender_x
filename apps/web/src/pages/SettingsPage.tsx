import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateSettingsSchema } from '@tender/shared';
import { fetchSettings, updateSettings } from '../api/settings';
import { ApiError } from '../api/client';

export function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });

  const [days, setDays] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.settings) setDays(String(data.settings.closingReminderDays));
  }, [data]);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      setServerError(null);
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e: ApiError) => setServerError(e.message),
  });

  const save = () => {
    setServerError(null);
    const parsed = updateSettingsSchema.safeParse({ closingReminderDays: days });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'قيمة غير صالحة');
      return;
    }
    setFieldError(null);
    mutation.mutate(parsed.data);
  };

  if (isLoading) return <p className="text-slate-500">جارٍ التحميل...</p>;
  if (error) return <p className="text-red-600">تعذر تحميل الإعدادات</p>;

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-slate-800">إعدادات النظام</h1>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-700">تنبيه اقتراب موعد الإغلاق</h2>
        <p className="mt-1 text-sm text-slate-500">
          عدد الأيام قبل موعد الإغلاق التي يُرسَل عندها تنبيه للمناقصات النشطة (BR-009).
        </p>

        <div className="mt-4">
          <label htmlFor="reminder-days" className="mb-1 block text-xs font-medium text-slate-500">
            أيام التنبيه قبل الإغلاق
          </label>
          <input
            id="reminder-days"
            type="number"
            min={1}
            max={60}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          {fieldError && <p className="mt-1 text-xs text-red-600">{fieldError}</p>}
          {serverError && <p className="mt-1 text-xs text-red-600">{serverError}</p>}
          {mutation.isSuccess && !serverError && (
            <p className="mt-1 text-xs text-green-600">تم حفظ الإعداد بنجاح.</p>
          )}
        </div>

        <button
          onClick={save}
          disabled={mutation.isPending}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'جارٍ الحفظ...' : 'حفظ'}
        </button>
      </section>
    </div>
  );
}
