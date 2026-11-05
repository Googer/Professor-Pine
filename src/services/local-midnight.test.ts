import { describe, expect, it } from 'vitest';
import { everyLocalMidnight } from './local-midnight.js';

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
