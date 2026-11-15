import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { healthCheck, healthLine, healthVerdict, type HealthStatus } from './health.js';

const NOW = Date.UTC(2026, 9, 16, 12, 0);
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

function status(overrides: Partial<HealthStatus> = {}): HealthStatus {
  return {
    writtenAt: NOW - 10 * SECOND,
    startedAt: NOW - 3 * 60 * MINUTE,
    pid: 7,
    phase: 'running',
    gateway: { connected: true, since: NOW - 2 * 60 * MINUTE },
    database: { reachable: true, checkedAt: NOW - 10 * SECOND },
    ...overrides,
  };
}

describe('healthVerdict', () => {
  it('is healthy when the heartbeat is fresh, Discord connected and the database answering', () => {
    expect(healthVerdict(status(), NOW)).toEqual({
      healthy: true,
      kind: 'healthy',
      reason: 'connected to Discord for 2 hours, the database answered 10 seconds ago',
    });
  });

  it('says that rehearsal mode is on, whatever else it says', () => {
    expect(healthVerdict(status({ rehearsal: true }), NOW)).toEqual({
      healthy: true,
      kind: 'healthy',
      reason:
        'connected to Discord for 2 hours, the database answered 10 seconds ago; REHEARSAL MODE IS ON',
    });
    expect(
      healthVerdict(status({ rehearsal: true, writtenAt: NOW - 2 * MINUTE }), NOW).reason,
    ).toMatch(/; REHEARSAL MODE IS ON$/);
  });

  it('is unhealthy when the heartbeat is old: the bot is stuck or gone', () => {
    expect(healthVerdict(status({ writtenAt: NOW - 2 * MINUTE }), NOW)).toEqual({
      healthy: false,
      kind: 'stale',
      reason: 'the last heartbeat is 2 minutes old: the bot is stuck or not running',
    });
  });

  it('is healthy while it starts, however long migrations and downloads take, up to a limit', () => {
    const starting = status({
      phase: 'starting',
      startedAt: NOW - 25 * MINUTE,
      gateway: { connected: false, since: NOW - 25 * MINUTE },
    });
    expect(healthVerdict(starting, NOW)).toEqual({
      healthy: true,
      kind: 'starting',
      reason: 'starting for 25 minutes, the database answered 10 seconds ago',
    });

    expect(healthVerdict({ ...starting, startedAt: NOW - 31 * MINUTE }, NOW)).toEqual({
      healthy: false,
      kind: 'slow-start',
      reason: 'still starting after 31 minutes',
    });
  });

  it('gives a bot that logs in time to connect to Discord, then calls it unhealthy', () => {
    const connecting = status({ gateway: { connected: false, since: NOW - 1 * MINUTE } });
    expect(healthVerdict(connecting, NOW)).toEqual({
      healthy: true,
      kind: 'healthy',
      reason: 'connecting to Discord for 60 seconds, the database answered 10 seconds ago',
    });

    // Matt (2026-10-16): raids are coordinated through the bot; two minutes away is already long.
    const down = status({ gateway: { connected: false, since: NOW - 3 * MINUTE } });
    expect(healthVerdict(down, NOW)).toEqual({
      healthy: false,
      kind: 'gateway',
      reason: 'not connected to Discord for 3 minutes',
    });
  });

  it('says how many shards are up when there are several, and nothing of one (plan 19D)', () => {
    const shards = (up: number, total: number) => ({ up, total });
    expect(
      healthVerdict(
        status({
          gateway: { connected: true, since: NOW - 2 * 60 * MINUTE, shards: shards(3, 4) },
        }),
        NOW,
      ),
    ).toEqual({
      healthy: true,
      kind: 'healthy',
      reason:
        'connected to Discord for 2 hours (3 of 4 shards up), the database answered 10 seconds ago',
    });
    // One shard away past its grace: the time counts from when it went away.
    expect(
      healthVerdict(
        status({ gateway: { connected: false, since: NOW - 4 * MINUTE, shards: shards(3, 4) } }),
        NOW,
      ),
    ).toEqual({
      healthy: false,
      kind: 'gateway',
      reason: 'a shard away from Discord for 4 minutes (3 of 4 shards up)',
    });
    // Several past their grace: how many (fix round 1, F4).
    expect(
      healthVerdict(
        status({
          gateway: {
            connected: false,
            since: NOW - 5 * MINUTE,
            shards: { up: 2, total: 4, late: 2 },
          },
        }),
        NOW,
      ).reason,
    ).toBe('2 shards away from Discord for 5 minutes (2 of 4 shards up)');
    expect(
      healthVerdict(
        status({ gateway: { connected: false, since: NOW - 3 * MINUTE, shards: shards(0, 4) } }),
        NOW,
      ).reason,
    ).toBe('not connected to Discord for 3 minutes (0 of 4 shards up)');
    expect(
      healthVerdict(
        status({ gateway: { connected: false, since: NOW - 1 * MINUTE, shards: shards(0, 4) } }),
        NOW,
      ).reason,
    ).toBe(
      'connecting to Discord for 60 seconds (0 of 4 shards up), the database answered 10 seconds ago',
    );
    // A self-hosted instance's one shard: the line as before.
    expect(
      healthVerdict(
        status({ gateway: { connected: false, since: NOW - 3 * MINUTE, shards: shards(0, 1) } }),
        NOW,
      ).reason,
    ).toBe('not connected to Discord for 3 minutes');
  });

  it('is unhealthy when the database did not answer at the last check, also while starting', () => {
    const database = {
      reachable: false,
      checkedAt: NOW - 20 * SECOND,
      error: 'connect ECONNREFUSED',
    };
    const expected = {
      healthy: false,
      kind: 'database',
      reason: 'the database did not answer 20 seconds ago: connect ECONNREFUSED',
    };
    expect(healthVerdict(status({ database }), NOW)).toEqual(expected);
    expect(healthVerdict(status({ database, phase: 'starting' }), NOW)).toEqual(expected);
  });

  it('takes other limits', () => {
    const down = status({ gateway: { connected: false, since: NOW - 2 * MINUTE } });
    const limits = { staleMs: MINUTE, gatewayGraceMs: MINUTE, startLimitMs: MINUTE };
    expect(healthVerdict(down, NOW, limits).healthy).toBe(false);
  });
});

describe('healthLine', () => {
  it('starts with the kind, which the watchdog reads', () => {
    expect(healthLine(healthVerdict(status({ writtenAt: NOW - 2 * MINUTE }), NOW))).toBe(
      'stale: the last heartbeat is 2 minutes old: the bot is stuck or not running',
    );
  });
});

describe('healthCheck', () => {
  const dir = () => mkdtempSync(path.join(tmpdir(), 'pine-health-'));

  it('reads the heartbeat file', () => {
    const file = path.join(dir(), 'status.json');
    writeFileSync(file, JSON.stringify(status()));
    expect(healthCheck(file, NOW).healthy).toBe(true);
  });

  it('is unhealthy without a heartbeat file', () => {
    const file = path.join(dir(), 'status.json');
    expect(healthCheck(file, NOW)).toEqual({
      healthy: false,
      kind: 'missing',
      reason: `no heartbeat yet: ${file} is missing`,
    });
  });

  it('is unhealthy with a heartbeat file it cannot read', () => {
    const file = path.join(dir(), 'status.json');
    writeFileSync(file, '{"writtenAt": "soon"}');
    expect(healthCheck(file, NOW)).toEqual({
      healthy: false,
      kind: 'unreadable',
      reason: `the heartbeat file ${file} cannot be read`,
    });
  });
});
