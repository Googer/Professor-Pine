import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { createTestLogger } from '../test/support/test-logger.js';
import { createShutdown } from './shutdown.js';

describe('createShutdown', () => {
  it('runs steps in order', async () => {
    const { log } = createTestLogger();
    const order: string[] = [];
    const step = (name: string) => ({
      name,
      timeoutMs: 1000,
      run: () => Promise.resolve(void order.push(name)),
    });
    await createShutdown([step('scheduler'), step('discord'), step('database')], log)();
    expect(order).toEqual(['scheduler', 'discord', 'database']);
  });

  it('continues past a failing or hanging step', async () => {
    const { log, entries } = createTestLogger();
    const order: string[] = [];
    // The time limit of the step that hangs, on the test's clock.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const shuttingDown = createShutdown(
      [
        { name: 'fails', timeoutMs: 1000, run: () => Promise.reject(new Error('nope')) },
        { name: 'hangs', timeoutMs: 20, run: () => new Promise<void>(() => undefined) },
        {
          name: 'database',
          timeoutMs: 1000,
          run: () => Promise.resolve(void order.push('database')),
        },
      ],
      log,
    )();
    await vi.advanceTimersByTimeAsync(19);
    expect(order).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await shuttingDown;
    expect(order).toEqual(['database']);
    expect(entries.filter((e) => e.msg === 'shutdown step failed').map((e) => e.step)).toEqual([
      'fails',
      'hangs',
    ]);
  });

  it('runs only once when called repeatedly', async () => {
    const { log } = createTestLogger();
    let runs = 0;
    const shutdown = createShutdown(
      [{ name: 'x', timeoutMs: 1000, run: () => Promise.resolve(void runs++) }],
      log,
    );
    await Promise.all([shutdown(), shutdown()]);
    await shutdown();
    expect(runs).toBe(1);
  });
});
