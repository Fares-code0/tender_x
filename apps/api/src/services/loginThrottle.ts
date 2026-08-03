import { env } from '../lib/env';

/**
 * S4 — تأخير متصاعد بدل قفل ثابت.
 *
 * القفل الثابت (`LOGIN_LOCK_MINUTES` كاملة من أول بلوغ للحد) كان يخدم المهاجم
 * أكثر مما يخدمنا: خمسة طلبات تُسكت حساب أي موظف يُعرف بريده، وحلقة تكرّرها كل
 * ربع ساعة تُبقي المنظومة كلها خارج الخدمة. والتعداد عبر زمن الدخول (S2) كان
 * يسلّم قائمة البُرد الصالحة مجانًا.
 *
 * التصاعد يحفظ الغرض ويُسقط السلاح: التخمين يصير عديم الجدوى لأن كل محاولة
 * تضاعف الانتظار (٣٠ث ⇒ دقيقة ⇒ دقيقتان…)، بينما المستخدم الحقيقي الذي أخطأ
 * خمس مرات ينتظر نصف دقيقة لا ربع ساعة. و`LOGIN_LOCK_MINUTES` يبقى صالحًا
 * بمعنى جديد: **سقف** النافذة لا طولها الثابت.
 */

/** أول نافذة بعد بلوغ الحد؛ تتضاعف مع كل محاولة فاشلة بعدها */
export const BASE_LOCK_MS = 30_000;

export function lockDurationMs(failedAttempts: number): number {
  const over = failedAttempts - env.loginMaxFailedAttempts;
  if (over < 0) return 0;

  const maxMs = env.loginLockMinutes * 60_000;
  // 2**over ينمو أسرع من أي سقف معقول، فيُقصّ الأس أولًا تفاديًا لـInfinity
  const capExponent = Math.ceil(Math.log2(maxMs / BASE_LOCK_MS));
  return Math.min(BASE_LOCK_MS * 2 ** Math.min(over, capExponent), maxMs);
}
