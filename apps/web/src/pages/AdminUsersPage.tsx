import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLES, createUserSchema, type RoleName } from '@tender/shared';
import { fetchAdminUsers, createUser, updateUser, type AdminUser } from '../api/admin';
import { ApiError } from '../api/client';
import { useMe } from '../hooks/useAuth';
import { roleLabels } from '../lib/labels';

const emptyForm = { name: '', email: '', password: '', role: 'WRITER' as RoleName };

export function AdminUsersPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchAdminUsers,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] });

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      setShowForm(false);
      setForm(emptyForm);
      setFieldErrors({});
      setFormError(null);
      invalidate();
    },
    onError: (e: ApiError) => setFormError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) => updateUser(id, input),
    onSuccess: invalidate,
    onError: (e: ApiError) => setRowError(e.message),
  });

  const submitCreate = () => {
    setFormError(null);
    const parsed = createUserSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    createMut.mutate(parsed.data);
  };

  if (isLoading) return <p className="text-slate-500">جارٍ التحميل...</p>;
  if (error) return <p className="text-red-600">تعذر تحميل المستخدمين</p>;

  const users = data?.users ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">إدارة المستخدمين</h1>
        <button
          onClick={() => {
            setForm(emptyForm);
            setFieldErrors({});
            setFormError(null);
            setShowForm(true);
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + إضافة مستخدم
        </button>
      </div>

      {rowError && <p className="mt-3 text-sm text-red-600">{rowError}</p>}

      {users.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          لا يوجد مستخدمون
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">الاسم</th>
                <th className="px-4 py-3 font-medium">البريد الإلكتروني</th>
                <th className="px-4 py-3 font-medium">الدور</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: AdminUser) => {
                const isSelf = me?.id === u.id;
                return (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                    <td className="px-4 py-3 text-slate-500" dir="ltr">
                      {u.email}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={isSelf || updateMut.isPending}
                        onChange={(e) => {
                          setRowError(null);
                          updateMut.mutate({ id: u.id, role: e.target.value });
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-60"
                        title={isSelf ? 'لا يمكنك تغيير دورك' : undefined}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabels[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {u.isActive ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">نشط</span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">معطّل</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        disabled={isSelf || updateMut.isPending}
                        onClick={() => {
                          setRowError(null);
                          updateMut.mutate({ id: u.id, isActive: !u.isActive });
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                        title={isSelf ? 'لا يمكنك تعطيل حسابك' : undefined}
                      >
                        {u.isActive ? 'تعطيل' : 'تفعيل'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="font-semibold text-slate-800">إضافة مستخدم جديد</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="u-name" className="mb-1 block text-xs font-medium text-slate-500">الاسم</label>
                <input
                  id="u-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
              </div>
              <div>
                <label htmlFor="u-email" className="mb-1 block text-xs font-medium text-slate-500">البريد الإلكتروني</label>
                <input
                  id="u-email"
                  type="email"
                  dir="ltr"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
              </div>
              <div>
                <label htmlFor="u-pass" className="mb-1 block text-xs font-medium text-slate-500">كلمة المرور</label>
                <input
                  id="u-pass"
                  type="password"
                  dir="ltr"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                {fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}
              </div>
              <div>
                <label htmlFor="u-role" className="mb-1 block text-xs font-medium text-slate-500">الدور</label>
                <select
                  id="u-role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as RoleName })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabels[r]}
                    </option>
                  ))}
                </select>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                onClick={submitCreate}
                disabled={createMut.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {createMut.isPending ? 'جارٍ الحفظ...' : 'إضافة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
