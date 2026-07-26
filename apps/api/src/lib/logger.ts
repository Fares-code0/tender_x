import pino, { type Logger, type DestinationStream } from 'pino';
import { env } from './env';

/**
 * H3.1 — تسجيل منظّم (JSON) بـpino.
 *
 * مسارات تُحجب دائمًا حتى لا تتسرّب أسرار إلى السجلات: ترويسة الاعتماد،
 * الكوكيز (تحمل توكن الجلسة)، وكلمات المرور/التوكنات في أجسام الطلبات.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'token',
  '*.password',
  '*.passwordHash',
  '*.token',
];

export function createLogger(destination?: DestinationStream): Logger {
  return pino(
    {
      // في الاختبارات نُسكت السجلات افتراضيًا حتى لا تُغرق المخرجات
      level: env.logLevel,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      // طابع زمني ISO أوضح للتجميع من الافتراضي (ملي ثانية)
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        // مستوى نصّي (`info`) بدل الرقم — أسهل للقراءة والفلترة
        level: (label) => ({ level: label }),
      },
    },
    destination,
  );
}

export const logger = createLogger();
