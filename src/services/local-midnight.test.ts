import { describe, expect, it } from 'vitest';
import { everyLocalMidnight, everyLocalMidnightIn } from './local-midnight.js';

const ZONE = 'America/New_York';
const at = (iso: string): number =>
  Temporal.PlainDateTime.from(iso).toZonedDateTime(ZONE).epochMilliseconds;

/** Timers the test runs by hand. */
function timers() {
  const set: { run: () => void; ms: number; cancelled: boolean }[] = [];
  return {
    set,
    setTimer: (run: () => void, ms: number) => {
      const timer = { run, ms, cancelled: false };
      set.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };
}

describe('everyLocalMidnight (plan 8V-1: the summaries’ and the events forum’s midnight)', () => {
  it('runs a second after each local midnight, the days of a change of the clocks included', () => {
    const clock = { now: at('2026-10-31T22:00') };
    const { set, setTimer } = timers();
    let runs = 0;
    everyLocalMidnight({
      zone: ZONE,
      now: () => clock.now,
      setTimer,
      run: () => runs++,
    });
    expect(set.map((one) => one.ms)).toEqual([at('2026-11-01T00:00') - clock.now + 1_000]);
    clock.now = at('2026-11-01T00:00:01');
    set[0]?.run();
    expect(runs).toBe(1);
    // November 1 has 25 hours in New York.
    expect(set[1]?.ms).toBe(at('2026-11-02T00:00') - clock.now + 1_000);
    expect(set[1]?.ms).toBe(25 * 60 * 60_000);
  });

  it('tells the run the midnight it was set for, also when its timer fires late (plan 8H-3)', () => {
    const clock = { now: at('2026-11-04T10:00') };
    const { set, setTimer } = timers();
    const midnights: number[] = [];
    everyLocalMidnight({
      zone: ZONE,
      now: () => clock.now,
      setTimer,
      run: (midnight) => midnights.push(midnight),
    });
    // The machine slept through the night: the timer fires the next morning.
    clock.now = at('2026-11-06T00:30');
    set[0]?.run();
    expect(midnights).toEqual([at('2026-11-05T00:00')]);
    expect(set[1]?.ms).toBe(at('2026-11-07T00:00') - clock.now + 1_000);
  });

  it('stops for good once cancelled', () => {
    const clock = { now: at('2026-10-31T22:00') };
    const { set, setTimer } = timers();
    let runs = 0;
    const watch = everyLocalMidnight({
      zone: ZONE,
      now: () => clock.now,
      setTimer,
      run: () => runs++,
    });
    watch.cancel();
    expect(set[0]?.cancelled).toBe(true);
    set[0]?.run();
    expect(runs).toBe(0);
    expect(set).toHaveLength(1);
  });
});

describe('everyLocalMidnightIn (plan 19A-2: one timer per zone in use)', () => {
  const BERLIN = 'Europe/Berlin';
  const KOLKATA = 'Asia/Kolkata';
  const inZone = (iso: string, zone: string): number =>
    Temporal.PlainDateTime.from(iso).toZonedDateTime(zone).epochMilliseconds;

  it('runs a second after each midnight of every zone in use, telling which zone', () => {
    // 22:00 in New York is 04:00 in Berlin and 08:30 in Kolkata, the next day.
    const clock = { now: at('2026-11-04T22:00') };
    const { set, setTimer } = timers();
    const runs: Array<[string, number]> = [];
    everyLocalMidnightIn({
      zones: () => [ZONE, BERLIN, KOLKATA],
      now: () => clock.now,
      setTimer,
      run: (zone, midnight) => runs.push([zone, midnight]),
    });
    expect(set.map((one) => one.ms).sort((a, b) => a - b)).toEqual([
      at('2026-11-05T00:00') - clock.now + 1_000,
      inZone('2026-11-06T00:00', KOLKATA) - clock.now + 1_000,
      inZone('2026-11-06T00:00', BERLIN) - clock.now + 1_000,
    ]);
    const berlin = set.find(
      (one) => one.ms === inZone('2026-11-06T00:00', BERLIN) - clock.now + 1_000,
    );
    clock.now = inZone('2026-11-06T00:00:01', BERLIN);
    berlin?.run();
    expect(runs).toEqual([[BERLIN, inZone('2026-11-06T00:00', BERLIN)]]);
    // Berlin's next one, and nothing more.
    expect(set).toHaveLength(4);
    expect(set[3]?.ms).toBe(inZone('2026-11-07T00:00', BERLIN) - clock.now + 1_000);
  });

  it('takes the zones in use anew when asked, and after each midnight: a zone that came gets its timer, one that went loses it', () => {
    const clock = { now: at('2026-11-04T22:00') };
    const { set, setTimer } = timers();
    let zones = [ZONE];
    const runs: string[] = [];
    const watch = everyLocalMidnightIn({
      zones: () => zones,
      now: () => clock.now,
      setTimer,
      run: (zone) => runs.push(zone),
    });
    expect(set).toHaveLength(1);
    zones = [ZONE, BERLIN];
    watch.refresh();
    expect(set).toHaveLength(2);
    expect(set[1]?.ms).toBe(inZone('2026-11-06T00:00', BERLIN) - clock.now + 1_000);
    // The same zones again: nothing new.
    watch.refresh();
    expect(set).toHaveLength(2);
    // Berlin went: its timer goes with it, and never runs.
    zones = [ZONE];
    watch.refresh();
    expect(set[1]?.cancelled).toBe(true);
    // New York's midnight: Kolkata came meanwhile, unasked, and is taken after it.
    zones = [ZONE, KOLKATA];
    clock.now = at('2026-11-05T00:00:01');
    set[0]?.run();
    expect(runs).toEqual([ZONE]);
    expect(set.slice(2).map((one) => one.ms)).toEqual(
      expect.arrayContaining([
        at('2026-11-06T00:00') - clock.now + 1_000,
        inZone('2026-11-06T00:00', KOLKATA) - clock.now + 1_000,
      ]),
    );
    expect(set).toHaveLength(4);
  });

  it('stops every timer for good once cancelled; a refresh after it sets none', () => {
    const clock = { now: at('2026-11-04T22:00') };
    const { set, setTimer } = timers();
    let runs = 0;
    const watch = everyLocalMidnightIn({
      zones: () => [ZONE, BERLIN],
      now: () => clock.now,
      setTimer,
      run: () => runs++,
    });
    watch.cancel();
    expect(set.every((one) => one.cancelled)).toBe(true);
    watch.refresh();
    expect(set).toHaveLength(2);
    for (const one of set) one.run();
    expect(runs).toBe(0);
  });
});
