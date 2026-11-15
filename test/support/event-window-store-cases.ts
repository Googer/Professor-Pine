import { beforeEach, describe, expect, it } from 'vitest';
import type { EventWindowStorage } from '../../src/db/repositories/event-window-repository.js';
import type { EventWindow } from '../../src/domain/time/event-window.js';

/** Into the Wild 2026 as staff would set it: Monday 10:00 to Friday 20:00 (New York). */
export const INTO_THE_WILD_WINDOW: EventWindow = {
  start: Date.parse('2026-11-09T15:00:00Z'),
  end: Date.parse('2026-11-14T01:00:00Z'),
  setBy: '200000000000000001',
  setAt: Date.parse('2026-11-09T14:00:00Z'),
};

/**
 * The same window typed as local time (plan 19A-2): 10:00 Monday to 20:00 Friday on each
 * server's clock, its moments those of New York, the instance's default zone of the tests.
 */
export const INTO_THE_WILD_LOCAL: EventWindow = {
  ...INTO_THE_WILD_WINDOW,
  startLocal: '2026-11-09T10:00:00',
  endLocal: '2026-11-13T20:00:00',
};

/**
 * What every `EventWindowStorage` does (`EventWindowRepository`, `MemoryEventWindows`): `fresh` gives one
 * that keeps nothing yet.
 */
export function eventWindowCases(fresh: () => Promise<EventWindowStorage>): void {
  describe('EventWindowStorage', () => {
    let store: EventWindowStorage;
    beforeEach(async () => {
      store = await fresh();
    });

    it('keeps no window until one is set', async () => {
      expect(await store.current()).toBeUndefined();
    });

    it('keeps the window set, and one set again in its place', async () => {
      await store.keep(INTO_THE_WILD_WINDOW);
      expect(await store.current()).toEqual(INTO_THE_WILD_WINDOW);
      const again: EventWindow = {
        start: INTO_THE_WILD_WINDOW.start + 3_600_000,
        end: INTO_THE_WILD_WINDOW.end - 3_600_000,
        setBy: '200000000000000002',
        setAt: INTO_THE_WILD_WINDOW.setAt + 60_000,
      };
      await store.keep(again);
      expect(await store.current()).toEqual(again);
    });

    it('keeps the wall-clock times of a window typed as local time, and drops them again (plan 19A-2)', async () => {
      await store.keep(INTO_THE_WILD_LOCAL);
      expect(await store.current()).toEqual(INTO_THE_WILD_LOCAL);
      // Ended now: the end is a moment again, the same in every zone.
      const { endLocal: _dropped, ...ended } = {
        ...INTO_THE_WILD_LOCAL,
        end: Date.UTC(2026, 10, 11, 17),
      };
      await store.keep(ended);
      expect(await store.current()).toEqual(ended);
    });
  });
}
