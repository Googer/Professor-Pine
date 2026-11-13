import { describe, expect, it } from 'vitest';
import { TestServers, withZones } from '../../test/support/server-values.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { zonedAt } from '../../test/support/time.js';
import { MemoryWantCounts } from '../../test/support/want-counts.js';
import { WantCountService } from './want-counts.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
const HERE = '100000000000000001';
const THERE = '100000000000000002';

/**
 * A count service over memory, with a clock and timers the test runs by hand; every server in
 * the test settings' zone unless `servers` say otherwise.
 */
function counting(now: string, servers = new TestServers()) {
  const storage = new MemoryWantCounts();
  const clock = { now: at(now) };
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const { log, entries } = createTestLogger();
  const service = new WantCountService({
    storage,
    servers,
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

  it('writes the servers after one whose write fails, and names the one that failed (review 8H3-3)', async () => {
    const made = counting('2026-11-04T10:00');
    const YONDER = '100000000000000003';
    made.storage.standing = new Map([
      [HERE, new Map([['trains', 1]])],
      [THERE, new Map([['trains', 2]])],
      [YONDER, new Map([['trains', 3]])],
    ]);
    const err = new Error('a row too long');
    made.storage.failingWrites.set(THERE, err);
    made.service.start();
    await made.service.idle();
    expect(await made.storage.serversCounted('2026-11-03')).toEqual(new Set([HERE, YONDER]));
    expect(await made.storage.countsOf(YONDER, '2026-11-03')).toEqual(new Map([['trains', 3]]));
    expect(made.entries.filter((entry) => Number(entry.level) >= 40)).toEqual([
      expect.objectContaining({
        level: 40,
        msg: 'could not write the want counts of a server; that day is lost for it',
        day: '2026-11-03',
        server: THERE,
      }),
    ]);
    expect(made.entries.filter((entry) => entry.msg === 'counted the wants of a day')).toEqual([
      expect.objectContaining({ level: 30, day: '2026-11-03', servers: 2, targets: 2 }),
    ]);
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

describe('WantCountService in each server’s zone (plan 19A-2)', () => {
  const BERLIN = 'Europe/Berlin';
  const berlin = (local: string): number => zonedAt(local, BERLIN);

  it('counts each server’s day at its own midnight, under its own local day', async () => {
    // 10:00 in New York, 16:00 in Berlin.
    const made = counting('2026-11-04T10:00', withZones({ [THERE]: BERLIN }));
    made.storage.standing = new Map([
      [HERE, new Map([['trains', 1]])],
      [THERE, new Map([['gym:7', 2]])],
    ]);
    made.service.start();
    await made.service.idle();
    // At start, the day before of each: the 3rd in both.
    expect(await made.storage.countsOf(HERE, '2026-11-03')).toEqual(new Map([['trains', 1]]));
    expect(await made.storage.countsOf(THERE, '2026-11-03')).toEqual(new Map([['gym:7', 2]]));
    const ms = made.timers.map((timer) => timer.ms);
    expect(ms).toEqual(
      expect.arrayContaining([
        at('2026-11-05T00:00') - made.clock.now + 1_000,
        berlin('2026-11-05T00:00') - made.clock.now + 1_000,
      ]),
    );
    expect(ms).toHaveLength(2);
    // Berlin's midnight, 18:00 in New York: Berlin's 4th ended, New York's has not.
    made.storage.standing = new Map([
      [HERE, new Map([['trains', 5]])],
      [THERE, new Map([['gym:7', 6]])],
    ]);
    made.clock.now = berlin('2026-11-05T00:00:01');
    made.timers
      .find((timer) => timer.ms === berlin('2026-11-05T00:00') - at('2026-11-04T10:00') + 1_000)
      ?.run();
    await made.service.idle();
    expect(await made.storage.countsOf(THERE, '2026-11-04')).toEqual(new Map([['gym:7', 6]]));
    expect(await made.storage.countsOf(HERE, '2026-11-04')).toEqual(new Map());
  });

  it('counts at start the day before on each server’s own clock (fix round 2, N7 a)', async () => {
    // 20:00 on the 4th in New York is 02:00 on the 5th in Berlin.
    const made = counting('2026-11-04T20:00', withZones({ [THERE]: BERLIN }));
    made.storage.standing = new Map([
      [HERE, new Map([['trains', 1]])],
      [THERE, new Map([['gym:7', 2]])],
    ]);
    made.service.start();
    await made.service.idle();
    // New York's day before is the 3rd, Berlin's the 4th.
    expect(await made.storage.countsOf(HERE, '2026-11-03')).toEqual(new Map([['trains', 1]]));
    expect(await made.storage.countsOf(THERE, '2026-11-04')).toEqual(new Map([['gym:7', 2]]));
    expect(await made.storage.countsOf(THERE, '2026-11-03')).toEqual(new Map());
  });

  it('follows the zones in use when a server’s zone changes', async () => {
    const servers = withZones({ [THERE]: BERLIN });
    const made = counting('2026-11-04T10:00', servers);
    made.service.start();
    await made.service.idle();
    await servers.set(THERE, (values) => ({ ...values, timezone: 'Asia/Kolkata' }), { id: HERE });
    made.service.zonesChanged();
    const live = made.timers.filter((timer) => !timer.cancelled).map((timer) => timer.ms);
    expect(live).toEqual(
      expect.arrayContaining([
        zonedAt('2026-11-05T00:00', 'Asia/Kolkata') - made.clock.now + 1_000,
      ]),
    );
    expect(live).not.toContain(berlin('2026-11-05T00:00') - made.clock.now + 1_000);
  });
});
