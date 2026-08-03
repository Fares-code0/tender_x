import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { renderWithProviders, stubSession, testUser } from '../test/utils';

/**
 * S8 — البوابة التي يراها المستخدم.
 *
 * الخادم يفرض الصلاحيات فعلًا (٢٠٩ اختبارًا خلفه)، فانكسار هذه البوابة لا يفتح
 * بيانات — لكنه يعرض للمستخدم صفحةً لا يملك بياناتها فيراها فارغة أو معطوبة،
 * والأسوأ أنه يمرّ صامتًا: لا خطأ ولا تحذير، فقط واجهة تعد بما لا تستطيع.
 */

function Guarded({ roles }: { roles?: Parameters<typeof ProtectedRoute>[0]['roles'] }) {
  return (
    <Routes>
      <Route path="/login" element={<div>صفحة الدخول</div>} />
      <Route path="/" element={<div>لوحة التحكم</div>} />
      <Route element={<ProtectedRoute roles={roles} />}>
        <Route path="/secret" element={<div>محتوى محمي</div>} />
      </Route>
    </Routes>
  );
}

describe('ProtectedRoute', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends an anonymous visitor to the login page', async () => {
    stubSession(null);
    renderWithProviders(<Guarded />, { route: '/secret' });

    expect(await screen.findByText('صفحة الدخول')).toBeInTheDocument();
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument();
  });

  it('lets an authenticated user through when no role is required', async () => {
    stubSession(testUser('WRITER'));
    renderWithProviders(<Guarded />, { route: '/secret' });

    expect(await screen.findByText('محتوى محمي')).toBeInTheDocument();
  });

  it('lets a permitted role through', async () => {
    stubSession(testUser('ADMIN'));
    renderWithProviders(<Guarded roles={['ADMIN']} />, { route: '/secret' });

    expect(await screen.findByText('محتوى محمي')).toBeInTheDocument();
  });

  it('bounces a role that is not on the list back to the dashboard', async () => {
    stubSession(testUser('WRITER'));
    renderWithProviders(<Guarded roles={['ADMIN']} />, { route: '/secret' });

    expect(await screen.findByText('لوحة التحكم')).toBeInTheDocument();
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument();
  });

  it('shows a loading state instead of the protected content while the session is unknown', () => {
    stubSession(testUser('ADMIN'));
    renderWithProviders(<Guarded roles={['ADMIN']} />, { route: '/secret' });

    // قبل وصول /auth/me: لا محتوى محمي ولا ارتداد — الوميض هنا كان سيعني
    // عرض صفحة إدارة للحظة لمن لا يملكها
    expect(screen.getByText('جارٍ التحميل...')).toBeInTheDocument();
    expect(screen.queryByText('محتوى محمي')).not.toBeInTheDocument();
  });
});
