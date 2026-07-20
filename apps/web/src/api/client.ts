export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = 'حدث خطأ غير متوقع';
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // body ليس JSON
    }
    throw new ApiError(res.status, code, message);
  }
  return res.json() as Promise<T>;
}
