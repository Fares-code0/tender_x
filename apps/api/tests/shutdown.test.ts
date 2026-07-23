import { describe, it, expect, vi } from 'vitest';
import { createGracefulShutdown } from '../src/lib/shutdown';

function makeDeps(closeImpl?: (cb: (err?: Error) => void) => void) {
  const exit = vi.fn();
  const stop = vi.fn();
  const $disconnect = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn(closeImpl ?? ((cb: (err?: Error) => void) => cb()));
  const logger = { log: vi.fn(), error: vi.fn() };
  return {
    exit,
    stop,
    $disconnect,
    close,
    logger,
    deps: {
      server: { close } as never,
      prisma: { $disconnect },
      tasks: [{ stop }],
      logger,
      exit,
    },
  };
}

describe('createGracefulShutdown (H0.3 — graceful shutdown)', () => {
  it('stops tasks, closes the server, disconnects prisma, then exits 0', async () => {
    const t = makeDeps();
    await createGracefulShutdown(t.deps)('SIGTERM');
    expect(t.stop).toHaveBeenCalledTimes(1);
    expect(t.close).toHaveBeenCalledTimes(1);
    expect(t.$disconnect).toHaveBeenCalledTimes(1);
    expect(t.exit).toHaveBeenCalledWith(0);
  });

  it('exits 1 when server.close fails', async () => {
    const t = makeDeps((cb) => cb(new Error('close failed')));
    await createGracefulShutdown(t.deps)('SIGTERM');
    expect(t.exit).toHaveBeenCalledWith(1);
    expect(t.logger.error).toHaveBeenCalled();
  });

  it('is idempotent — a second signal is a no-op', async () => {
    const t = makeDeps();
    const shutdown = createGracefulShutdown(t.deps);
    await shutdown('SIGTERM');
    await shutdown('SIGINT');
    expect(t.exit).toHaveBeenCalledTimes(1);
    expect(t.close).toHaveBeenCalledTimes(1);
  });
});
