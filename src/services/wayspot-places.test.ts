import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { MemoryWayspotLookups } from './wayspot-lookups.js';
import { WayspotPlaces } from './wayspot-places.js';

const ASKED = {
  wayspotId: 'aa.16',
  kind: 'stop' as const,
  lat: 40.05,
  lon: -80.05,
  places: 'Corner Bakery',
  askedAt: 1,
};

function placesWith(storage = new MemoryWayspotLookups()) {
  let now = 10_000_000;
  const timers: { run: () => void; ms: number }[] = [];
  const places = new WayspotPlaces({
    storage,
    log: createTestLogger().log,
    now: () => now,
    setTimer: (run, ms) => {
      const timer = { run, ms };
      timers.push(timer);
      return () => {
        timers.splice(timers.indexOf(timer), 1);
      };
    },
  });
  let told = 0;
  places.whenChanged(() => {
    told++;
  });
  return {
    places,
    storage,
    timers,
    told: () => told,
    later: (ms: number) => {
      now += ms;
    },
  };
}

describe('WayspotPlaces', () => {
  it('reads what was kept, and tells of it at once', async () => {
    const storage = new MemoryWayspotLookups();
    await storage.saveAsked(ASKED);
    const { places, told } = placesWith(storage);
    expect(places.placesOf('aa.16')).toBeNull();
    await places.load();
    expect(places.placesOf('aa.16')).toBe('Corner Bakery');
    expect(places.get('aa.16')).toEqual(ASKED);
    expect(told()).toBe(1);
  });

  it('tells of new answers at most once an hour, never once per answer', async () => {
    const { places, storage, timers, told, later } = placesWith();
    await places.load();
    await places.save({ ...ASKED, askedAt: 2 });
    // Within the hour of the load: told when the hour is over.
    expect(told()).toBe(1);
    expect(timers.map((timer) => timer.ms)).toEqual([3_600_000]);
    await places.save({ ...ASKED, wayspotId: 'bb.16', places: null });
    expect(timers).toHaveLength(1);
    expect(places.placesOf('bb.16')).toBeNull();
    expect((await storage.asked()).map((row) => row.wayspotId).sort()).toEqual(['aa.16', 'bb.16']);
    later(3_600_000);
    timers.shift()?.run();
    expect(told()).toBe(2);
    // A quiet hour later an answer is told at once.
    later(2 * 3_600_000);
    await places.save({ ...ASKED, places: 'Maple Dental' });
    expect(told()).toBe(3);
    expect(timers).toEqual([]);
  });

  it('forgets dropped places, also in the storage', async () => {
    const { places, storage } = placesWith();
    await places.save(ASKED);
    await places.drop(['aa.16']);
    expect(places.get('aa.16')).toBeUndefined();
    expect(await storage.asked()).toEqual([]);
    expect(places.ids()).toEqual([]);
  });
});
