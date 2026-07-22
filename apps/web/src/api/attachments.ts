import { ApiError, api } from './client';

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  version: number;
  createdAt: string;
  uploadedBy: { id: string; name: string };
}

export function fetchAttachments(tenderId: string): Promise<{ attachments: Attachment[] }> {
  return api(`/tenders/${tenderId}/attachments`);
}

/** رفع مرفق (multipart) — لا نضبط Content-Type يدويًا ليضيف المتصفح boundary */
export async function uploadAttachment(
  tenderId: string,
  file: File,
): Promise<{ attachment: Attachment }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/tenders/${tenderId}/attachments`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = 'تعذر رفع الملف';
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // ليس JSON
    }
    throw new ApiError(res.status, code, message);
  }
  return res.json() as Promise<{ attachment: Attachment }>;
}

/** رابط التحميل (يحمل الكوكي تلقائيًا لكونه same-origin) */
export function attachmentDownloadUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}/download`;
}
