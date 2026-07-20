import { NavLink, Outlet } from 'react-router-dom';
import { useMe, useLogout } from '../hooks/useAuth';
import { roleLabels } from '../lib/labels';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`;

export function Layout() {
  const { data: user } = useMe();
  const logout = useLogout();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-indigo-700">نظام المناقصات</span>
            <nav className="flex items-center gap-1">
              <NavLink to="/" end className={navLinkClass}>
                لوحة التحكم
              </NavLink>
              {user?.role === 'ADMIN' && (
                <NavLink to="/admin/users" className={navLinkClass}>
                  إدارة المستخدمين
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="text-left">
                <div className="text-sm font-semibold text-slate-800">{user.name}</div>
                <div className="text-xs text-slate-500">{roleLabels[user.role]}</div>
              </div>
            )}
            <button
              onClick={() => logout.mutate()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
