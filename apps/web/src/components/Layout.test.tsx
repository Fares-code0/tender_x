import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { RoleName } from '@tender/shared';
import { Layout } from './Layout';
import { renderWithProviders, stubSession, testUser } from '../test/utils';

/**
 * S8 — ظهور عناصر التنقّل حسب الدور.
 *
 * إخفاء الرابط ليس صلاحية — الخادم يردّ 403 على من يطرق الباب مباشرةً — لكن
 * إظهاره لمن لا يملكه يقود المستخدم إلى صفحة سترتدّ به أو تظهر فارغة، وهو عطل
 * صامت لا يكشفه أي اختبار خلفي.
 */
const NAV = {
  tasks: 'مهامي',
  reports: 'التقارير',
  users: 'إدارة المستخدمين',
  settings: 'الإعدادات',
};

function renderLayoutAs(role: RoleName) {
  stubSession(testUser(role), { 'GET /notifications': { body: { notifications: [], unreadCount: 0 } } });
  return renderWithProviders(<Layout />);
}

const visible = (label: string) => screen.queryByRole('link', { name: label }) !== null;

describe('Layout navigation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows an ADMIN the admin-only links', async () => {
    renderLayoutAs('ADMIN');
    await screen.findByRole('link', { name: NAV.users });

    expect(visible(NAV.users)).toBe(true);
    expect(visible(NAV.settings)).toBe(true);
    expect(visible(NAV.reports)).toBe(true);
  });

  it('hides admin and report links from a WRITER', async () => {
    renderLayoutAs('WRITER');
    await screen.findByRole('link', { name: NAV.tasks });

    expect(visible(NAV.users)).toBe(false);
    expect(visible(NAV.settings)).toBe(false);
    expect(visible(NAV.reports)).toBe(false);
  });

  it('gives a MANAGER reports but not user administration', async () => {
    renderLayoutAs('MANAGER');
    await screen.findByRole('link', { name: NAV.reports });

    expect(visible(NAV.users)).toBe(false);
    expect(visible(NAV.settings)).toBe(false);
    expect(visible(NAV.tasks)).toBe(true);
  });

  it('gives an OWNER reports but no task queue', async () => {
    renderLayoutAs('OWNER');
    await screen.findByRole('link', { name: NAV.reports });

    expect(visible(NAV.tasks)).toBe(false);
    expect(visible(NAV.users)).toBe(false);
  });

  it('signs the user out through the API', async () => {
    const { calls } = stubSession(testUser('QA'), {
      'GET /notifications': { body: { notifications: [], unreadCount: 0 } },
      'POST /auth/logout': { body: { ok: true } },
    });
    renderWithProviders(<Layout />);

    fireEvent.click(await screen.findByRole('button', { name: 'تسجيل الخروج' }));

    // الخروج يجب أن يصل الخادم فعلًا: مسح الكوكي محليًا وحده لا يُبطل التوكن
    await waitFor(() =>
      expect(calls).toContainEqual({ method: 'POST', path: '/auth/logout', body: undefined }),
    );
  });
});
