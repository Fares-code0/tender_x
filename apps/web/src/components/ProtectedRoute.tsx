import { Navigate, Outlet } from 'react-router-dom';
import type { RoleName } from '@tender/shared';
import { useMe } from '../hooks/useAuth';

export function ProtectedRoute({ roles }: { roles?: RoleName[] }) {
  const { data: user, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        جارٍ التحميل...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
