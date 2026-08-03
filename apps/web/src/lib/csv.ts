/**
 * S7 — تهيئة حقول CSV.
 *
 * الملف المُصدَّر يُفتح خارج التطبيق، في برنامج لا يعرف شيئًا عن دفاعاته: React
 * يهرّب النص في الصفحة، أما Excel فيرى في الحقل الذي يبدأ بـ`=` أو `+` أو `-`
 * أو `@` صيغةً ويحاول تنفيذها. ويكفي اسم فيه فاصلة ليزيح بقية أعمدة السطر
 * فيصير التقرير خاطئًا بلا أي نية سيئة.
 *
 * الأسماء يضبطها مسؤول النظام لا الجمهور، فالمسار ليس تصعيدًا للصلاحيات — لكنه
 * لا سبب لتركه: التهيئة سطران.
 */

/** يبدأ الحقل بمحرف تفسّره Excel بداية صيغة */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** يحتاج الحقل إلى تنصيص (فاصلة أو علامة تنصيص أو سطر جديد) */
const NEEDS_QUOTING = /[",\n\r]/;

export function csvField(value: string | number): string {
  // الأعداد تأتي من الخادم؛ سالبها رقم لا صيغة، فلا يُسبق بشيء
  if (typeof value === 'number') return String(value);

  const guarded = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return NEEDS_QUOTING.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function csvRow(values: (string | number)[]): string {
  return values.map(csvField).join(',');
}
