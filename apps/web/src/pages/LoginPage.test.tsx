import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { renderWithProviders, stubApi, stubSession, testUser } from '../test/utils';

/** يملأ النموذج ويرسله كما يفعل المستخدم */
function submitLogin(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('كلمة المرور'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));
}

// S8 — دورة الدخول كاملة عبر النموذج الحقيقي: ما يُرسَل، وإلى أين يذهب
// المستخدم بعده، وكيف تُعرَض أخطاء الخادم.
function LoginApp() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<div>لوحة التحكم</div>} />
    </Routes>
  );
}

const renderLogin = () => renderWithProviders(<LoginApp />, { route: '/login' });

describe('LoginPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the credentials and lands on the dashboard', async () => {
    const user = testUser('QA');
    const { calls } = stubApi({
      'GET /auth/me': { status: 401, body: {} },
      'POST /auth/login': { body: { user } },
    });
    renderLogin();

    submitLogin('qa@test.com', 'Test1234!');

    expect(await screen.findByText('لوحة التحكم')).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/auth/login',
      body: { email: 'qa@test.com', password: 'Test1234!' },
    });
  });

  it('shows the server message when the credentials are rejected', async () => {
    stubApi({
      'GET /auth/me': { status: 401, body: {} },
      'POST /auth/login': {
        status: 401,
        body: { error: { code: 'INVALID_CREDENTIALS', message: 'بيانات الدخول غير صحيحة' } },
      },
    });
    renderLogin();

    submitLogin('qa@test.com', 'wrong');

    expect(await screen.findByText('بيانات الدخول غير صحيحة')).toBeInTheDocument();
    expect(screen.queryByText('لوحة التحكم')).not.toBeInTheDocument();
  });

  // القفل المتصاعد (S4) يردّ 423 برسالته الخاصة — يجب أن تصل للمستخدم كما هي
  it('surfaces the lockout message', async () => {
    stubApi({
      'GET /auth/me': { status: 401, body: {} },
      'POST /auth/login': {
        status: 423,
        body: {
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'الحساب مقفول مؤقتًا بسبب محاولات دخول فاشلة، حاول لاحقًا',
          },
        },
      },
    });
    renderLogin();

    submitLogin('qa@test.com', 'wrong');

    expect(await screen.findByText(/الحساب مقفول مؤقتًا/)).toBeInTheDocument();
  });

  it('rejects a malformed email in the browser without calling the API', async () => {
    const { calls } = stubApi({ 'GET /auth/me': { status: 401, body: {} } });
    renderLogin();

    submitLogin('not-an-email', 'Test1234!');

    expect(await screen.findByText('بريد إلكتروني غير صالح')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/auth/login')).toBe(false);
  });

  it('redirects an already signed-in user away from the login form', async () => {
    stubSession(testUser('ADMIN'));
    renderLogin();

    await waitFor(() => expect(screen.getByText('لوحة التحكم')).toBeInTheDocument());
  });
});
