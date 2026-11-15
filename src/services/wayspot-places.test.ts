import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { GoogleAnswers, MemoryGoogleAnswerStorage } from './google-answers.js';
import { WayspotPlaces } from './wayspot-places.js';

const HOME = 1;
const AWAY = 2;
const POINT = { lat: 40.05, lon: -80.05 };

async function placesWith() {
  let now = 10_000_000;
  const timers: { run: () => void; ms: number }[] = [];
  const log = createTestLogger().log;
  const answers = new GoogleAnswers({ storage: new MemoryGoogleAnswerStorage(), log });
  await answers.load();
  const places = new WayspotPlaces({
    answers,
    log,
    now: () => now,
    setTimer: (run, ms) => {
      const timer = { run, ms };
      timers.push(timer);
      return () => {
        timers.splice(timers.indexOf(timer), 1);
      };
    },
  });
  const told: number[] = [];
  places.whenChanged((guildId) => {
    told.push(guildId);
  });
  return {
    places,
    answers,
    timers,
    told,
    later: (ms: number) => {
      now += ms;
    },
  };
}

describe('WayspotPlaces', () => {
  it('reads the places around a Wayspot from its point’s answer, for every server alike', async () => {
    const { places, answers } = await placesWith();
    expect(places.placesAt(POINT)).toBeNull();
    await answers.save([{ kind: 'places', ...POINT, answer: 'Corner Bakery', askedAt: 1 }]);
    expect(places.placesAt(POINT)).toBe('Corner Bakery');
    expect(places.placesAt({ lat: POINT.lat + 0.00005, lon: POINT.lon })).toBe('Corner Bakery');
    // An address is no list of places.
    await answers.save([{ kind: 'address', lat: 40.06, lon: -80.06, answer: '{}', askedAt: 1 }]);
    expect(places.placesAt({ lat: 40.06, lon: -80.06 })).toBeNull();
  });

  it('tells a server of its new places at once, then at most once an hour, never once per answer', async () => {
    const { places, timers, told, later } = await placesWith();
    places.changed(HOME);
    expect(told).toEqual([HOME]);
    places.changed(HOME);
    places.changed(HOME);
    // Within the hour: told when the hour is over, once.
    expect(told).toEqual([HOME]);
    expect(timers.map((timer) => timer.ms)).toEqual([3_600_000]);
    later(3_600_000);
    timers.shift()?.run();
    expect(told).toEqual([HOME, HOME]);
    // A quiet hour later an answer is told at once.
    later(2 * 3_600_000);
    places.changed(HOME);
    expect(told).toEqual([HOME, HOME, HOME]);
    expect(timers).toEqual([]);
  });

  it('tells each server of its own places alone, each by its own hour', async () => {
    const { places, timers, told } = await placesWith();
    const before = places.generationOf(AWAY);
    places.changed(HOME);
    places.changed(HOME);
    expect(told).toEqual([HOME]);
    expect(places.generationOf(AWAY)).toBe(before);
    // Away's first is told at once, whatever Home's hour.
    places.changed(AWAY);
    expect(told).toEqual([HOME, AWAY]);
    expect(places.generationOf(AWAY)).not.toBe(before);
    expect(timers).toHaveLength(1);
  });

  it('leaves no timer behind when stopped', async () => {
    const { places, timers } = await placesWith();
    places.changed(HOME);
    places.changed(HOME);
    places.changed(AWAY);
    places.changed(AWAY);
    expect(timers).toHaveLength(2);
    places.stop();
    expect(timers).toEqual([]);
  });
});
