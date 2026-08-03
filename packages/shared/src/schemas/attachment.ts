// M5 — قيود المرفقات (مشتركة بين الـBackend والواجهة)

/** الامتدادات المسموحة للمرفقات */
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  'pdf',
  'docx',
  'xlsx',
  'png',
  'jpg',
  'jpeg',
  'zip',
] as const;
export type AllowedAttachmentExtension = (typeof ALLOWED_ATTACHMENT_EXTENSIONS)[number];

/** الحد الأقصى لحجم المرفق: 20MB */
export const MAX_ATTACHMENT_MB = 20;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

/** يستخرج الامتداد (بدون النقطة، حروف صغيرة) من اسم ملف */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

export function isAllowedAttachment(fileName: string): boolean {
  return (ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(fileExtension(fileName));
}

/**
 * S6 — نوع المحتوى مشتقًّا من الامتداد المُتحقَّق منه، لا من ترويسة الرفع.
 *
 * ترويسة `Content-Type` في الطلب يكتبها العميل، فمرفق `.png` يُعلَن `text/html`
 * ويُخزَّن كذلك ثم يُعاد كذلك عند التنزيل. الامتداد وحده هو ما نفحصه فعلًا
 * (`isAllowedAttachment`)، فليكن هو مصدر النوع أيضًا.
 */
const MIME_BY_EXTENSION: Record<AllowedAttachmentExtension, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  zip: 'application/zip',
};

/** النوع المحايد لما لا امتداد له أو لا نعرفه — المتصفح ينزّله ولا يفسّره */
export const FALLBACK_MIME_TYPE = 'application/octet-stream';

export function mimeTypeForFile(fileName: string): string {
  const ext = fileExtension(fileName) as AllowedAttachmentExtension;
  return MIME_BY_EXTENSION[ext] ?? FALLBACK_MIME_TYPE;
}
