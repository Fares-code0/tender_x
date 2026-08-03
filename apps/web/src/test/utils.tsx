import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { RoleName } from '@tender/shared';
import type { AuthUser } from '../api/auth';

/**
 * S8 — أدوات اختبار الواجهة.
 *
 * الطبقة الوحيدة المستبدَلة هي `fetch`: ما دونها مكوّنات حقيقية وموجّه حقيقي
 * وعميل استعلام حقيقي. اختبارٌ يستبدل `useMe` أو `ProtectedRoute` كان سيثبت
 * أن المحاكاة تعمل لا أن البوابة تعمل.
 */

export interface StubbedRoute {
  status?: number;
  body?: unknown;
}

/** المفتاح: `"<METHOD> <path>"` — مثل `"GET /auth/me"` */
export type RouteStubs = Record<string, StubbedRoute>;

export function stubApi(routes: RouteStubs) {
  const calls: { method: string; path: string; body: unknown }[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.replace(/^\/api\/v1/, '');
    calls.push({
      method,
      path,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });

    const stub = routes[`${method} ${path}`] ?? { status: 404, body: {} };
    const status = stub.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => stub.body ?? {},
    } as Response;
  });

  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export const testUser = (role: RoleName, overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: `user-${role.toLowerCase()}`,
  name: 'مستخدم الاختبار',
  email: `${role.toLowerCase()}@test.com`,
  role,
  ...overrides,
});

/** جلسة قائمة لدور معيّن، أو مجهول عند تمرير `null` */
export function stubSession(user: AuthUser | null, extra: RouteStubs = {}) {
  return stubApi({
    'GET /auth/me': user ? { body: { user } } : { status: 401, body: { error: { code: 'UNAUTHENTICATED' } } },
    ...extra,
  });
}

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
