import { describe, expect, it } from 'vitest';
import { INTO_THE_WILD_WINDOW } from '../../test/support/event-window-store-cases.js';
import { MemoryEventWindows } from '../../test/support/event-window-store.js';
import { Tally } from '../../test/support/tally.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { EventWindow } from '../domain/time/event-window.js';
import { EventWindowService } from './event-window-service.js';

const MINUTE = 60_000;
const window = INTO_THE_WILD_WINDOW;

function service(store = new MemoryEventWindows()) {
  const { log, entries } = createTestLogger();
  return { windows: new EventWindowService({ store, log }), store, entries };
}

describe('EventWindowService', () => {
  it('has no window until one is set, then keeps it in the store and gives it at once', async () => {
    const { windows, store } = service();
    expect(windows.current()).toBeUndefined();
    await windows.set(() => window);
    expect(windows.current()).toEqual(window);
    expect(await store.current()).toEqual(window);
  });

  it('survives a restart: the kept window is loaded', async () => {
    const store = new MemoryEventWindows(window);
    const { windows, entries } = service(store);
    expect(windows.current()).toBeUndefined();
    await windows.load();
    expect(windows.current()).toEqual(window);
    expect(entries.find((entry) => entry.msg === 'event window loaded')).toMatchObject({
      start: window.start,
      end: window.end,
    });
  });

  it('keeps nothing in memory when the store refuses, and says so on a load', async () => {
    const store = new MemoryEventWindows();
    store.failing.set('keep', new Error('the database is down'));
    const { windows } = service(store);
    await expect(windows.set(() => window)).rejects.toThrow('the database is down');
    expect(windows.current()).toBeUndefined();
    const broken = new MemoryEventWindows();
    broken.failing.set('current', new Error('the database is down'));
    const after = service(broken);
    await after.windows.load();
    expect(after.windows.current()).toBeUndefined();
    expect(
      after.entries.find((entry) => entry.msg === 'could not read the event window'),
    ).toMatchObject({ level: 40 });
  });

  it('ends a window on now: what came before stays, nothing after; none to end is said', async () => {
    const { windows, store } = service();
    expect(await windows.end(window.start)).toBeUndefined();
    await windows.set(() => window);
    const now = window.start + 90 * MINUTE;
    expect(await windows.end(now)).toEqual({ ...window, end: now });
    expect(windows.current()).toEqual({ ...window, end: now });
    expect(await store.current()).toEqual({ ...window, end: now });
    // Over already: nothing to end.
    expect(await windows.end(now + MINUTE)).toBeUndefined();
    expect(windows.ongoing(now + MINUTE)).toBeUndefined();
  });

  it('ends a window that has not begun as none at all', async () => {
    const { windows } = service();
    await windows.set(() => window);
    const before = window.start - 60 * MINUTE;
    expect(windows.ongoing(before)).toEqual(window);
    expect(await windows.end(before)).toEqual({ ...window, end: window.start });
    // An empty window is none: no event of it reaches a reader (no start to cut a battle at).
    expect(windows.current()).toBeUndefined();
  });

  describe('one change at a time (review LW-2)', () => {
    /** A store whose writes wait until the test lets each go, in order. */
    class HeldStore extends MemoryEventWindows {
      readonly waiting: (() => void)[] = [];
      readonly asked = new Tally('writes asked');
      override async keep(kept: EventWindow): Promise<void> {
        await new Promise<void>((resolve) => {
          this.waiting.push(resolve);
          this.asked.add();
        });
        await super.keep(kept);
      }
      release(): void {
        this.waiting.shift()?.();
      }
    }

    it('ends the window a set still being written made, not the one before it', async () => {
      const store = new HeldStore();
      const { windows } = service(store);
      const setting = windows.set(() => window);
      const now = window.start + 90 * MINUTE;
      const ending = windows.end(now);
      await store.asked.reached(1);
      store.release();
      await setting;
      await store.asked.reached(2);
      store.release();
      expect(await ending).toEqual({ ...window, end: now });
      expect(await store.current()).toEqual({ ...window, end: now });
    });

    it('lets a second set decide from what the first one kept', async () => {
      const store = new HeldStore();
      const { windows } = service(store);
      const later = { ...window, end: window.end + 60 * MINUTE };
      const seen: (EventWindow | undefined)[] = [];
      const first = windows.set((kept) => {
        seen.push(kept);
        return window;
      });
      const second = windows.set((kept) => {
        seen.push(kept);
        return { ...later, start: kept?.start ?? later.start };
      });
      await store.asked.reached(1);
      store.release();
      await store.asked.reached(2);
      store.release();
      expect(await first).toEqual({ window, before: undefined });
      expect(await second).toEqual({ window: later, before: window });
      expect(seen).toEqual([undefined, window]);
    });

    it('goes on after a change that failed', async () => {
      const { windows } = service();
      await expect(
        windows.set(() => {
          throw new Error('refused');
        }),
      ).rejects.toThrow('refused');
      await windows.set(() => window);
      expect(windows.current()).toEqual(window);
    });
  });
});
