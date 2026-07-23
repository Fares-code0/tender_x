import type { Server } from 'node:http';

interface Stoppable {
  stop: () => void;
}
interface Disconnectable {
  $disconnect: () => Promise<void>;
}
interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface ShutdownDeps {
  server: Pick<Server, 'close'>;
  prisma: Disconnectable;
  tasks?: Stoppable[];
  logger?: Logger;
  exit?: (code: number) => void;
}

/**
 * H0.3 — إيقاف رشيق (Graceful shutdown).
 * يوقف مهام الـcron، ثم يتوقف عن قبول طلبات جديدة (`server.close`) منتظرًا انتهاء
 * الطلبات الجارية، ثم يفصل اتصال Prisma، ثم يُنهي العملية. آمن للاستدعاء مرة واحدة
 * فقط (idempotent) حتى لا تتداخل إشارتان.
 */
export function createGracefulShutdown(deps: ShutdownDeps) {
  const logger = deps.logger ?? console;
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  let started = false;

  return async function shutdown(signal: string): Promise<void> {
    if (started) return;
    started = true;
    logger.log(`Received ${signal}, shutting down gracefully...`);
    try {
      for (const task of deps.tasks ?? []) task.stop();
      await new Promise<void>((resolve, reject) =>
        deps.server.close((err) => (err ? reject(err) : resolve())),
      );
      await deps.prisma.$disconnect();
      logger.log('Shutdown complete.');
      exit(0);
    } catch (err) {
      logger.error('Error during shutdown:', err);
      exit(1);
    }
  };
}
