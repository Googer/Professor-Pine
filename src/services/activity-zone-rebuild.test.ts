import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { heldCall } from '../../test/support/held-call.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TestServers, withZones } from '../../test/support/server-values.js';
import type { RebuiltServer } from '../db/repositories/activity-repository.js';
import { ActivityZoneRebuild } from './activity-zone-rebuild.js';

const SERVER = '412345678901234567';
const OTHER = '412345678901234599';
const STAFF = { id: '200000000000000001' };

const rebuilt = (serverId: string): RebuiltServer => ({
  serverId,
  lastHistoryId: 12,
  lastDayHistoryId: 12,
  records: 12,
});

/** The rebuild over a fake activity whose rebuilds the test may hold; listening to `servers`. */
function rebuilding(servers: TestServers) {
  const asked: string[] = [];
  const holds: ReturnType<typeof heldCall>[] = [];
  let failing: Error | undefined;
  const { log, entries } = createTestLogger();
  const rebuild = new ActivityZoneRebuild({
    activity: {
      rebuild: async (serverId?: string) => {
        asked.push(serverId ?? 'all');
        const hold = holds.shift();
        if (hold) {
          hold.arrive();
          await hold.released;
        }
        if (failing) throw failing;
        return [rebuilt(serverId ?? '')];
      },
    },
    log,
  });
  servers.onZoneChange((serverId) => {
    rebuild.zoneChanged(serverId);
  });
  return {
    rebuild,
    asked,
    holds,
    entries,
    fail: (err: Error | undefined) => {
      failing = err;
    },
  };
}

describe('ActivityZoneRebuild (plan 19A-2)', () => {
  it('rebuilds a server’s activity in the background when its zone changes, and logs it', async () => {
    const servers = withZones({ [SERVER]: 'Europe/Berlin' });
    const made = rebuilding(servers);
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Asia/Tokyo' }), STAFF);
    await made.rebuild.whenIdle();
    expect(made.asked).toEqual([SERVER]);
    expect(made.entries.map((entry) => [entry.level, entry.msg])).toEqual([
      [30, 'rebuilding the activity of a server in its new zone'],
      [30, 'rebuilt the activity of a server in its new zone'],
    ]);
    // Another setting changed: nothing to rebuild.
    await servers.set(SERVER, (values) => ({ ...values, distanceUnits: 'imperial' }), STAFF);
    await made.rebuild.whenIdle();
    expect(made.asked).toEqual([SERVER]);
  });

  it('runs one more rebuild after the one under way for changes meanwhile, never two at once', async () => {
    const servers = new TestServers();
    const made = rebuilding(servers);
    const first = heldCall('the first rebuild');
    made.holds.push(first);
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Asia/Tokyo' }), STAFF);
    await first.reached;
    // Two more changes while it runs, and one of another server, which runs beside it.
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Europe/Berlin' }), STAFF);
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Asia/Kolkata' }), STAFF);
    await servers.set(OTHER, (values) => ({ ...values, timezone: 'Asia/Tokyo' }), STAFF);
    expect(made.asked).toEqual([SERVER, OTHER]);
    first.release();
    await made.rebuild.whenIdle();
    expect(made.asked).toEqual([SERVER, OTHER, SERVER]);
  });

  it('runs a change that lands right as the loop ends, never losing it (fix round 1, N1)', async () => {
    const servers = new TestServers();
    const asked: string[] = [];
    const held: { rebuild?: ActivityZoneRebuild } = {};
    // A logger that, at the line the last rebuild ends with, asks again two turns later: after
    // the loop has looked for a change meanwhile and found none, before anything after it.
    const log = pino(
      { level: 'info' },
      {
        write(line: string) {
          if (!line.includes('rebuilt the activity of a server in its new zone')) return;
          if (asked.length > 1) return;
          queueMicrotask(() => {
            queueMicrotask(() => {
              held.rebuild?.zoneChanged(SERVER);
            });
          });
        },
      },
    );
    const rebuild = new ActivityZoneRebuild({
      activity: {
        rebuild: (serverId?: string) => {
          asked.push(serverId ?? 'all');
          return Promise.resolve([rebuilt(serverId ?? '')]);
        },
      },
      log,
    });
    held.rebuild = rebuild;
    servers.onZoneChange((serverId) => {
      rebuild.zoneChanged(serverId);
    });
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Asia/Tokyo' }), STAFF);
    await rebuild.whenIdle();
    expect(asked).toEqual([SERVER, SERVER]);
  });

  it('stops at shutdown before the next batch, and starts nothing more (fix round 1, N2)', async () => {
    const servers = new TestServers();
    const stops: Array<() => boolean> = [];
    const hold = heldCall('the rebuild');
    const { log } = createTestLogger();
    const rebuild = new ActivityZoneRebuild({
      activity: {
        rebuild: async (serverId?: string, isStopped?: () => boolean) => {
          if (isStopped) stops.push(isStopped);
          hold.arrive();
          await hold.released;
          return [rebuilt(serverId ?? '')];
        },
      },
      log,
    });
    servers.onZoneChange((serverId) => {
      rebuild.zoneChanged(serverId);
    });
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Asia/Tokyo' }), STAFF);
    await hold.reached;
    expect(stops.map((stopped) => stopped())).toEqual([false]);
    // A change meanwhile, then the shutdown: the batch under way ends, and nothing follows.
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Europe/Berlin' }), STAFF);
    const closing = rebuild.close();
    expect(stops.map((stopped) => stopped())).toEqual([true]);
    hold.release();
    await closing;
    await servers.set(OTHER, (values) => ({ ...values, timezone: 'Asia/Kolkata' }), STAFF);
    await rebuild.whenIdle();
    expect(stops).toHaveLength(1);
  });

  it('logs a rebuild that failed; the next change tries again', async () => {
    const servers = new TestServers();
    const made = rebuilding(servers);
    made.fail(new Error('the database is away'));
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Asia/Tokyo' }), STAFF);
    await made.rebuild.whenIdle();
    expect(made.entries.at(-1)).toMatchObject({
      level: 50,
      msg: 'could not rebuild the activity of a server in its new zone',
      guild: SERVER,
    });
    made.fail(undefined);
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Europe/Berlin' }), STAFF);
    await made.rebuild.whenIdle();
    expect(made.asked).toEqual([SERVER, SERVER]);
  });
});
