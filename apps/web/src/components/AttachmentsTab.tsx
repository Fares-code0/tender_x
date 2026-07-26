import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ALLOWED_ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_MB } from '@tender/shared';
import type { AuthUser } from '../api/auth';
import { ApiError } from '../api/client';
import {
  attachmentDownloadUrl,
  fetchAttachments,
  uploadAttachment,
  type Attachment,
} from '../api/attachments';
import { formatDate } from '../lib/labels';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** M5.4 — تبويب المرفقات: رفع بـdrag & drop + قائمة + تحميل */
export function AttachmentsTab({ tenderId, user }: { tenderId: string; user: AuthUser | null }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUpload = user?.role === 'WRITER';

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['attachments', tenderId],
    queryFn: () => fetchAttachments(tenderId),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadAttachment(tenderId, file),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['attachments', tenderId] });
      qc.invalidateQueries({ queryKey: ['tender', tenderId] });
    },
    onError: (e: ApiError) => setError(e.message),
  });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    for (const file of Array.from(files)) uploadMut.mutate(file);
  };

  const acceptHint = ALLOWED_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join('، ');

  return (
    <section className="space-y-6">
      {canUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:bg-slate-50'
          }`}
        >
          <p className="font-medium text-slate-700">اسحب الملفات هنا أو انقر للاختيار</p>
          <p className="mt-1 text-xs text-slate-500">
            الأنواع المسموحة: {acceptHint} — الحد الأقصى {MAX_ATTACHMENT_MB}MB
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {uploadMut.isPending && <p className="mt-3 text-sm text-indigo-600">جارٍ الرفع...</p>}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isLoading && <p className="text-slate-500">جارٍ التحميل...</p>}
      {loadError != null && <p className="text-red-600">تعذر تحميل المرفقات</p>}

      {data && data.attachments.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          لا توجد مرفقات بعد
        </div>
      )}

      {data && data.attachments.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">الملف</th>
                <th className="px-4 py-3 font-medium">الإصدار</th>
                <th className="px-4 py-3 font-medium">الرافع</th>
                <th className="px-4 py-3 font-medium">الحجم</th>
                <th className="px-4 py-3 font-medium">التاريخ</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.attachments.map((a: Attachment) => (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{a.fileName}</td>
                  <td className="px-4 py-3 text-slate-600">v{a.version}</td>
                  <td className="px-4 py-3 text-slate-600">{a.uploadedBy.name}</td>
                  <td className="px-4 py-3 text-slate-600">{formatSize(a.size)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(a.createdAt)}</td>
                  <td className="px-4 py-3">
                    <a
                      href={attachmentDownloadUrl(a.id)}
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      تحميل
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
