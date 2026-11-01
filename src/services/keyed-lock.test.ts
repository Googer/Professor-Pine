import { describe, expect, it } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import { KeyedLock } from './keyed-lock.js';

/** A promise and the function that resolves it. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}
const background = watchEachTest();

describe('KeyedLock', () => {
  it('runs work for one key one after the other, in the order asked', async () => {
    const lock = new KeyedLock<string>();
    const first = gate();
    const order: string[] = [];
    const a = lock.run('k', async () => {
      order.push('a starts');
      await first.opened;
      order.push('a ends');
      return 'a';
    });
    const b = lock.run('k', () => {
      order.push('b runs');
      return 'b';
    });
    await background.settle();
    expect(order).toEqual(['a starts']);
    first.open();
    await expect(Promise.all([a, b])).resolves.toEqual(['a', 'b']);
    expect(order).toEqual(['a starts', 'a ends', 'b runs']);
  });

  it('does not make different keys wait for each other', async () => {
    const lock = new KeyedLock<number>();
    const held = gate();
    const slow = lock.run(1, () => held.opened);
    await expect(lock.run(2, () => 'free')).resolves.toBe('free');
    held.open();
    await slow;
  });

  it('carries on after work that failed, and hands the failure to its caller only', async () => {
    const lock = new KeyedLock<string>();
    const failed = lock.run('k', () => {
      throw new Error('broken');
    });
    const next = lock.run('k', () => 'fine');
    await expect(failed).rejects.toThrow('broken');
    await expect(next).resolves.toBe('fine');
  });

  it('forgets a key once nothing is running or waiting for it', async () => {
    const lock = new KeyedLock<string>();
    await Promise.all([lock.run('a', () => 1), lock.run('a', () => 2), lock.run('b', () => 3)]);
    await background.settle();
    expect(lock.size).toBe(0);
  });

  it('says when it is idle: at once when nothing runs', async () => {
    const lock = new KeyedLock<string>();
    await expect(lock.whenIdle()).resolves.toBeUndefined();
  });

  it('waits for running and queued work of every key, and for work queued meanwhile', async () => {
    const lock = new KeyedLock<string>();
    const first = gate();
    const second = gate();
    const done: string[] = [];
    void lock.run('a', async () => {
      await first.opened;
      done.push('a1');
    });
    void lock.run('a', () => {
      done.push('a2');
    });
    void lock.run('b', async () => {
      await second.opened;
      done.push('b');
    });
    let idle = false;
    const waiting = lock.whenIdle().then(() => {
      idle = true;
    });
    first.open();
    await background.settle();
    expect(idle).toBe(false);
    const late = gate();
    void lock.run('c', async () => {
      await late.opened;
      done.push('c');
    });
    second.open();
    await background.settle();
    expect(idle).toBe(false);
    late.open();
    await waiting;
    expect(idle).toBe(true);
    expect(done.sort()).toEqual(['a1', 'a2', 'b', 'c']);
  });

  it('counts the work of a key that runs or waits, failed work done', async () => {
    const lock = new KeyedLock<string>();
    const first = gate();
    expect(lock.pending('k')).toBe(0);
    const running = lock.run('k', () => first.opened);
    const failing = lock.run('k', () => {
      throw new Error('broken');
    });
    void lock.run('other', () => undefined);
    expect(lock.pending('k')).toBe(2);
    first.open();
    await running;
    await expect(failing).rejects.toThrow('broken');
    expect(lock.pending('k')).toBe(0);
  });

  it('is idle although the work failed, and does not reject', async () => {
    const lock = new KeyedLock<string>();
    const failed = lock.run('k', () => {
      throw new Error('broken');
    });
    await expect(lock.whenIdle()).resolves.toBeUndefined();
    await expect(failed).rejects.toThrow('broken');
  });
});
