import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { loginSchema } from '@tender/shared';
import { useLogin, useMe } from '../hooks/useAuth';
import { ApiError } from '../api/client';

export function LoginPage() {
  const { data: user, isLoading } = useMe();
  const loginMutation = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  if (!isLoading && user) return <Navigate to="/" replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة');
      return;
    }
    loginMutation.mutate(parsed.data);
  };

  const serverError =
    loginMutation.error instanceof ApiError
      ? loginMutation.error.message
      : loginMutation.isError
        ? 'تعذر الاتصال بالخادم'
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-center text-2xl font-bold text-indigo-700">نظام إدارة المناقصات</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Brains Valley</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              كلمة المرور
            </label>
            <input
              id="password"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {(fieldError || serverError) && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {fieldError ?? serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
          >
            {loginMutation.isPending ? 'جارٍ الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
