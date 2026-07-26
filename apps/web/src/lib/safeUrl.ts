const SAFE_PROTOCOLS = ['http:', 'https:'];

/**
 * يتحقق أن الرابط صالح للعرض كـ`<a href>`.
 *
 * الخادم يمنع `javascript:`/`data:` عند الحفظ (`externalUrlSchema`)، لكن هذه
 * طبقة ثانية للصفوف التي حُفظت **قبل** ذلك التحقق: بلا هذا الفحص يكفي رابط
 * `javascript:` مخزَّن ليُنفَّذ سكربت في جلسة من يفتح الصفحة ويضغطه.
 */
export function isSafeExternalUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return SAFE_PROTOCOLS.includes(new URL(value).protocol.toLowerCase());
  } catch {
    return false;
  }
}
