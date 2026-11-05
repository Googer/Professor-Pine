import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { zonedAt } from '../../test/support/time.js';
import { MemoryWantCounts } from '../../test/support/want-counts.js';
import { WantCountService } from './want-counts.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
const HERE = '100000000000000001';
const THERE = '100000000000000002';

/** A count service over memory, with a clock and timers the test runs by hand. */
function counting(now: string) {
  const storage = new MemoryWantCounts();
  const clock = { now: at(now) };
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const { log, entries } = createTestLogger();
  const service = new WantCountService({
    storage,
    zone: ZONE,
    log,
    now: () => clock.now,
    setTimer: (run, ms) => {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  return { storage, clock, timers, entries, service };
}

describe('WantCountService (plan 8H-3)', () => {
  it('counts the wants at start for the day before, then a second after each local midnight', async () => {
    const made = counting('2026-11-04T10:00');
    made.storage.standing = new Map([[HERE, new Map([['pokemon:25@raid', 3]])]]);
    made.service.start();
    await made.service.idle();
    expect(await made.storage.countsOf(HERE, '2026-11-03')).toEqual(
      new Map([['pokemon:25@raid', 3]]),
    );
    expect(made.timers.map((timer) => timer.ms)).toEqual([
      at('2026-11-05T00:00') - made.clock.now + 1_000,
    ]);
    // The wants as they stand at midnight are the day that just ended.
    made.storage.standing = new Map([
      [
        HERE,
        new Map([
          ['pokemon:25@raid', 4],
          ['trains', 1],
        ]),
      ],
      [THERE, new Map([['gym:7', 2]])],
    ]);
    made.clock.now = at('2026-11-05T00:00:01');
    made.timers[0]?.run();
    await made.service.idle();
    expect(await made.storage.countsOf(HERE, '2026-11-04')).toEqual(
      new Map([
        ['pokemon:25@raid', 4],
        ['trains', 1],
      ]),
    );
    expect(await made.storage.countsOf(THERE, '2026-11-04')).toEqual(new Map([['gym:7', 2]]));
    // The day before stays as it was counted.
    expect(await made.storage.countsOf(HERE, '2026-11-03')).toEqual(
      new Map([['pokemon:25@raid', 3]]),
    );
    expect(made.timers).toHaveLength(2);
    expect(made.entries.filter((entry) => entry.msg === 'counted the wants of a day')).toEqual([
      expect.objectContaining({ level: 30, day: '2026-11-03', servers: 1, targets: 1 }),
      expect.objectContaining({ level: 30, day: '2026-11-04', servers: 2, targets: 3 }),
    ]);
  });

  it('catches up at start only on a server without counts of the day before', async () => {
    const made = counting('2026-11-04T10:00');
    await made.storage.write(HERE, '2026-11-03', new Map([['trains', 1]]));
    made.storage.standing = new Map([
      [HERE, new Map([['trains', 9]])],
      [THERE, new Map([['trains', 2]])],
    ]);
    made.service.start();
    await made.service.idle();
    expect(await made.storage.countsOf(HERE, '2026-11-03')).toEqual(new Map([['trains', 1]]));
    expect(await made.storage.countsOf(THERE, '2026-11-03')).toEqual(new Map([['trains', 2]]));
  });

  it('logs a day it could not count, and counts the next one at its midnight', async () => {
    const made = counting('2026-11-04T10:00');
    made.storage.standing = new Map([[HERE, new Map([['trains', 1]])]]);
    made.storage.failing = new Error('the database is gone');
    made.service.start();
    await made.service.idle();
    expect(
      made.entries.filter(
        (entry) => entry.msg === 'could not count the wants of a day; that day is lost',
      ),
    ).toEqual([expect.objectContaining({ level: 40, day: '2026-11-03' })]);
    made.storage.failing = undefined;
    made.clock.now = at('2026-11-05T00:00:01');
    made.timers[0]?.run();
    await made.service.idle();
    expect(await made.storage.countsOf(HERE, '2026-11-04')).toEqual(new Map([['trains', 1]]));
    expect(await made.storage.serversCounted('2026-11-03')).toEqual(new Set());
  });

  it('counts the day before the midnight it waited for and the day before now, when its timer fires late', async () => {
    const made = counting('2026-11-04T10:00');
    made.service.start();
    await made.service.idle();
    made.storage.standing = new Map([[HERE, new Map([['trains', 1]])]]);
    // The machine slept through the night: the timer of the 5th fires on the 6th.
    made.clock.now = at('2026-11-06T00:30');
    made.timers[0]?.run();
    await made.service.idle();
    expect(await made.storage.countsOf(HERE, '2026-11-04')).toEqual(new Map([['trains', 1]]));
    // The day before now too (the 5th); a day further between would be lost.
    expect(await made.storage.countsOf(HERE, '2026-11-05')).toEqual(new Map([['trains', 1]]));
  });

  it('counts nothing more once stopped', async () => {
    const made = counting('2026-11-04T10:00');
    made.service.start();
    await made.service.idle();
    made.service.stop();
    expect(made.timers[0]?.cancelled).toBe(true);
    made.storage.standing = new Map([[HERE, new Map([['trains', 1]])]]);
    made.clock.now = at('2026-11-05T00:00:01');
    made.timers[0]?.run();
    await made.service.idle();
    expect(made.storage.days.size).toBe(0);
  });
});
