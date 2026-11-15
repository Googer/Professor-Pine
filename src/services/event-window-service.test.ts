import { describe, expect, it } from 'vitest';
import {
  INTO_THE_WILD_LOCAL,
  INTO_THE_WILD_WINDOW,
} from '../../test/support/event-window-store-cases.js';
import { zonedAt } from '../../test/support/time.js';
import { MemoryEventWindows } from '../../test/support/event-window-store.js';
import { Tally } from '../../test/support/tally.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { EventWindow } from '../domain/time/event-window.js';
import { EventWindowService } from './event-window-service.js';

const MINUTE = 60_000;
const window = INTO_THE_WILD_WINDOW;
const ZONE = 'America/New_York';

function service(store = new MemoryEventWindows(), zones: readonly string[] = [ZONE]) {
  const { log, entries } = createTestLogger();
  return { windows: new EventWindowService({ store, log, zones: () => zones }), store, entries };
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
    expect(await windows.end(window.start, ZONE)).toBeUndefined();
    await windows.set(() => window);
    const now = window.start + 90 * MINUTE;
    expect(await windows.end(now, ZONE)).toEqual({
      before: window,
      window: { ...window, end: now },
      here: 'on',
      ran: true,
    });
    expect(windows.current()).toEqual({ ...window, end: now });
    expect(await store.current()).toEqual({ ...window, end: now });
    // Over already: nothing to end.
    expect(await windows.end(now + MINUTE, ZONE)).toBeUndefined();
    expect(windows.ongoing(now + MINUTE, ZONE)).toBeUndefined();
  });

  it('ends a window that has not begun as none at all', async () => {
    const { windows } = service();
    await windows.set(() => window);
    const before = window.start - 60 * MINUTE;
    expect(windows.ongoing(before, ZONE)).toEqual(window);
    expect(await windows.end(before, ZONE)).toMatchObject({ here: 'to-come', ran: false });
    // An empty window is none: no event of it reaches a reader (no start to cut a battle at).
    expect(windows.current()).toBeUndefined();
  });

  // Plan 19A-2: a window typed as local time is on at those hours on each server's clock.
  describe('in each server’s zone (plan 19A-2)', () => {
    const BERLIN = 'Europe/Berlin';
    const NEW_YORK = 'America/New_York';
    const local = INTO_THE_WILD_LOCAL;

    it('gives a window typed as local time on each zone’s clock, its stored moments without one', async () => {
      const { windows } = service();
      await windows.set(() => local);
      expect(windows.current()).toEqual(local);
      expect(windows.current(NEW_YORK)).toEqual(local);
      expect(windows.current(BERLIN)).toMatchObject({
        start: zonedAt('2026-11-09T10:00', BERLIN),
        end: zonedAt('2026-11-13T20:00', BERLIN),
      });
      // At 09:00 in New York the window is on in Berlin (15:00) and to come in New York.
      const nine = zonedAt('2026-11-09T09:00', NEW_YORK);
      expect(windows.ongoing(nine, BERLIN)?.start).toBeLessThan(nine);
      expect(windows.ongoing(nine, NEW_YORK)?.start).toBeGreaterThan(nine);
    });

    it('ends a window begun in the zone of whoever ends it now, everywhere', async () => {
      const { windows, store } = service();
      await windows.set(() => local);
      const now = zonedAt('2026-11-09T09:00', NEW_YORK);
      const ended = await windows.end(now, BERLIN);
      expect(ended).toMatchObject({
        here: 'on',
        window: { start: zonedAt('2026-11-09T10:00', BERLIN), end: now },
      });
      // The end is a moment now: New York, where it had not begun, has none left.
      expect(await store.current()).toEqual({
        ...INTO_THE_WILD_WINDOW,
        startLocal: local.startLocal,
        end: now,
      });
      expect(windows.current(NEW_YORK)).toBeUndefined();
      expect(windows.current(BERLIN)?.end).toBe(now);
    });

    it('never erases what ran where it had begun, ended where it had not (fix round 1, M1)', async () => {
      const { windows } = service(undefined, [NEW_YORK, BERLIN]);
      await windows.set(() => local);
      // 09:00 in New York, 15:00 in Berlin: begun there, not here.
      const now = zonedAt('2026-11-09T09:00', NEW_YORK);
      const ended = await windows.end(now, NEW_YORK);
      expect(ended).toMatchObject({ here: 'to-come', ran: true });
      expect(windows.current(BERLIN)).toMatchObject({
        start: zonedAt('2026-11-09T10:00', BERLIN),
        end: now,
      });
      expect(windows.current(NEW_YORK)).toBeUndefined();
    });

    it('calls off a window begun in no zone in use, in every zone', async () => {
      const { windows } = service(undefined, [NEW_YORK]);
      await windows.set(() => local);
      const now = zonedAt('2026-11-09T09:00', NEW_YORK);
      expect(await windows.end(now, NEW_YORK)).toMatchObject({ here: 'to-come', ran: false });
      expect(windows.current(NEW_YORK)).toBeUndefined();
    });

    it('ends a window over in the ender’s zone that is still on in another (fix round 1, M4)', async () => {
      const { windows } = service(undefined, [NEW_YORK, BERLIN]);
      await windows.set(() => local);
      // 21:00 on Friday in Berlin, over there; 15:00 in New York, on.
      const now = zonedAt('2026-11-13T21:00', BERLIN);
      expect(await windows.end(now, BERLIN)).toMatchObject({ here: 'over', ran: true });
      expect(windows.current(NEW_YORK)?.end).toBe(now);
      expect(windows.ongoing(now, NEW_YORK)).toBeUndefined();
      // Over everywhere: nothing more to end.
      expect(await windows.end(now + MINUTE, BERLIN)).toBeUndefined();
    });

    it('gives a set the window as kept, also one empty in the default zone (fix round 1, M3)', async () => {
      const { windows } = service(undefined, [NEW_YORK, BERLIN]);
      await windows.set(() => local);
      const now = zonedAt('2026-11-09T15:00', BERLIN);
      await windows.end(now, BERLIN);
      const seen: (EventWindow | undefined)[] = [];
      await windows.set((kept) => {
        seen.push(kept);
        return local;
      });
      expect(seen).toEqual([{ ...INTO_THE_WILD_WINDOW, startLocal: local.startLocal, end: now }]);
    });
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
      const ending = windows.end(now, ZONE);
      await store.asked.reached(1);
      store.release();
      await setting;
      await store.asked.reached(2);
      store.release();
      expect(await ending).toMatchObject({ window: { ...window, end: now } });
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
