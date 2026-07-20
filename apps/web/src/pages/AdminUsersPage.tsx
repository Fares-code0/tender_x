import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { roleLabels } from '../lib/labels';
import type { RoleName } from '@tender/shared';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  isActive: boolean;
}

export function AdminUsersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<{ users: AdminUser[] }>('/admin/users'),
  });

  if (isLoading) return <p className="text-slate-500">جارٍ التحميل...</p>;
  if (error) return <p className="text-red-600">تعذر تحميل المستخدمين</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800">إدارة المستخدمين</h1>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">البريد الإلكتروني</th>
              <th className="px-4 py-3 font-medium">الدور</th>
              <th className="px-4 py-3 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                <td className="px-4 py-3 text-slate-500" dir="ltr">
                  {u.email}
                </td>
                <td className="px-4 py-3">{roleLabels[u.role]}</td>
                <td className="px-4 py-3">
                  {u.isActive ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">نشط</span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">معطّل</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
