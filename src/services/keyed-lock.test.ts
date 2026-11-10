import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import { KeyedLock, LockOverdueError } from './keyed-lock.js';

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

  describe('with a time limit', () => {
    const LIMIT = 60_000;
    afterEach(() => {
      vi.useRealTimers();
    });

    /** A lock with the limit, the keys it said were held too long, and a key held until opened. */
    function heldLock() {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const overdue: [string, number][] = [];
      const lock = new KeyedLock<string>({
        limitMs: LIMIT,
        overdue: (key, heldMs) => overdue.push([key, heldMs]),
      });
      const holder = gate();
      const held = lock.run('k', () => holder.opened.then(() => 'held'));
      return { lock, overdue, holder, held };
    }

    it('refuses the waiters of a key held past its limit, and says once which key it is', async () => {
      const { lock, overdue, holder, held } = heldLock();
      const ran: string[] = [];
      const waiting = lock.run('k', () => ran.push('waiter'));
      const behind = lock.run('k', () => ran.push('behind'));
      const refused = Promise.allSettled([waiting, behind]);
      await vi.advanceTimersByTimeAsync(LIMIT - 1);
      expect(overdue).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      const [first, second] = await refused;
      for (const outcome of [first, second]) {
        expect(outcome?.status === 'rejected' && outcome.reason instanceof LockOverdueError).toBe(
          true,
        );
      }
      expect(overdue).toEqual([['k', LIMIT]]);
      // Only the holder is left, and the refused work never runs, not even once it settles.
      expect(lock.pending('k')).toBe(1);
      holder.open();
      await expect(held).resolves.toBe('held');
      await background.settle();
      expect(ran).toEqual([]);
      expect(overdue).toHaveLength(1);
    });

    it('refuses at once whoever asks while the key is overdue, and frees it once the holder settles', async () => {
      const { lock, holder, held } = heldLock();
      await vi.advanceTimersByTimeAsync(LIMIT);
      const late = vi.fn(() => 'late');
      await expect(lock.run('k', late)).rejects.toBeInstanceOf(LockOverdueError);
      expect(late).not.toHaveBeenCalled();
      // Other keys are not held up.
      await expect(lock.run('other', () => 'free')).resolves.toBe('free');
      holder.open();
      await held;
      await expect(lock.run('k', () => 'after')).resolves.toBe('after');
      await background.settle();
      expect(lock.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('lets a waiter run whose holder settles within the limit, and counts the limit per holder', async () => {
      const { lock, overdue, holder, held } = heldLock();
      const second = gate();
      const waiting = lock.run('k', () => second.opened.then(() => 'second'));
      await vi.advanceTimersByTimeAsync(LIMIT - 1);
      holder.open();
      await held;
      // The waiter now holds the key, with a limit of its own from when it began.
      await vi.advanceTimersByTimeAsync(LIMIT - 1);
      second.open();
      await expect(waiting).resolves.toBe('second');
      expect(overdue).toEqual([]);
      await background.settle();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('is idle only once the overdue holder settles', async () => {
      const { lock, holder, held } = heldLock();
      const refused = lock.run('k', () => undefined).catch((err: unknown) => err);
      await vi.advanceTimersByTimeAsync(LIMIT);
      await expect(refused).resolves.toBeInstanceOf(LockOverdueError);
      let idle = false;
      const waiting = lock.whenIdle().then(() => {
        idle = true;
      });
      await background.settle();
      expect(idle).toBe(false);
      holder.open();
      await held;
      await waiting;
      expect(idle).toBe(true);
    });
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
