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
