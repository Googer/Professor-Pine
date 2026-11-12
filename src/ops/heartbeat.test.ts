import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Status } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { readHealthStatus } from './health.js';
import {
  GatewayProbe,
  gatewayHealth,
  Heartbeat,
  SHARD_GRACE_MS,
  shardUp,
  type GatewayReading,
} from './heartbeat.js';

const START = Date.UTC(2026, 9, 16, 12, 0);
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

afterEach(() => {
  vi.useRealTimers();
});

function heartbeatWith(database: () => Promise<void> = () => Promise.resolve()) {
  const file = path.join(
    mkdtempSync(path.join(tmpdir(), 'pine-heartbeat-')),
    'health',
    'status.json',
  );
  const clock = { now: START };
  const { log, entries } = createTestLogger();
  const heartbeat = new Heartbeat({
    file,
    database,
    databaseTimeoutMs: 5 * SECOND,
    log,
    now: () => clock.now,
  });
  return { file, clock, heartbeat, entries };
}

describe('Heartbeat', () => {
  it('writes the time and that the bot is starting, from the start on', async () => {
    const { file, heartbeat } = heartbeatWith();

    await heartbeat.beat();

    expect(readHealthStatus(file)).toEqual({
      writtenAt: START,
      startedAt: START,
      pid: process.pid,
      phase: 'starting',
      gateway: { connected: false, since: START },
      database: { reachable: true, checkedAt: START },
    });
  });

  it('says in rehearsal mode that it is on, and nothing of it otherwise', async () => {
    const { file } = heartbeatWith();
    const rehearsing = new Heartbeat({
      file,
      database: () => Promise.resolve(),
      log: createTestLogger().log,
      now: () => START,
      rehearsal: true,
    });
    await rehearsing.beat();
    expect(readHealthStatus(file)).toMatchObject({ rehearsal: true });
  });

  it('is running from the login on, and says since when Discord is connected or not', async () => {
    const { file, clock, heartbeat } = heartbeatWith();
    let reading: GatewayReading = { connected: false, up: 0, total: 1 };
    await heartbeat.beat();

    clock.now += 20 * 60 * SECOND;
    heartbeat.loggingIn(() => reading);
    await heartbeat.beat();
    const login = START + 20 * 60 * SECOND;
    expect(readHealthStatus(file)).toMatchObject({
      phase: 'running',
      gateway: { connected: false, since: login },
    });

    clock.now += 30 * SECOND;
    reading = { connected: true, up: 1, total: 1 };
    await heartbeat.beat();
    clock.now += 30 * SECOND;
    await heartbeat.beat();
    expect(readHealthStatus(file)?.gateway).toEqual({
      connected: true,
      since: login + 30 * SECOND,
      shards: { up: 1, total: 1 },
    });

    clock.now += 30 * SECOND;
    reading = { connected: false, up: 0, total: 1 };
    await heartbeat.beat();
    expect(readHealthStatus(file)?.gateway).toEqual({
      connected: false,
      since: login + 90 * SECOND,
      shards: { up: 0, total: 1 },
    });
  });

  it('says how many shards are up, and counts a shard away past its grace from when it went (plan 19D)', async () => {
    const { file, clock, heartbeat } = heartbeatWith();
    const shards = new Map([
      [0, { status: Status.Ready, lastPingTimestamp: -1 }],
      [1, { status: Status.Ready, lastPingTimestamp: -1 }],
      [2, { status: Status.Ready, lastPingTimestamp: -1 }],
    ]);
    const probe = new GatewayProbe(() => shards);
    heartbeat.loggingIn((now) => probe.read(now));
    await heartbeat.beat();
    expect(readHealthStatus(file)?.gateway).toEqual({
      connected: true,
      since: START,
      shards: { up: 3, total: 3 },
    });

    // One shard reconnects: routine, the bot stays connected.
    clock.now += 30 * SECOND;
    const away = clock.now;
    shards.set(2, { status: Status.Connecting, lastPingTimestamp: -1 });
    await heartbeat.beat();
    expect(readHealthStatus(file)?.gateway).toEqual({
      connected: true,
      since: START,
      shards: { up: 2, total: 3 },
    });

    // Away past the grace: not connected, since it went away.
    clock.now += SHARD_GRACE_MS + 30 * SECOND;
    await heartbeat.beat();
    expect(readHealthStatus(file)?.gateway).toEqual({
      connected: false,
      since: away,
      shards: { up: 2, total: 3, late: 1 },
    });
  });

  it('records a database that failed to answer, with its error', async () => {
    const { file, heartbeat } = heartbeatWith(() =>
      Promise.reject(new Error('connect ECONNREFUSED 172.18.0.2:3306')),
    );

    await heartbeat.beat();

    expect(readHealthStatus(file)?.database).toEqual({
      reachable: false,
      checkedAt: START,
      error: 'connect ECONNREFUSED 172.18.0.2:3306',
    });
  });

  it('records a database that takes too long as not answering', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { file, heartbeat } = heartbeatWith(() => new Promise(() => undefined));

    const beat = heartbeat.beat();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5 * SECOND);
    await beat;

    expect(readHealthStatus(file)?.database).toEqual({
      reachable: false,
      checkedAt: START,
      error: 'no answer within 5000 ms',
    });
  });

  it('logs a heartbeat it cannot write, once, and carries on', async () => {
    const { log, entries } = createTestLogger();
    // A folder cannot be made inside a file.
    const heartbeat = new Heartbeat({
      file: path.join(import.meta.filename, 'health', 'status.json'),
      database: () => Promise.resolve(),
      log,
    });

    await heartbeat.beat();
    await heartbeat.beat();

    expect(entries.filter((entry) => entry.msg === 'could not write the heartbeat')).toHaveLength(
      1,
    );
  });
});

describe('shardUp', () => {
  const NOW = START;
  const shard = (status: Status, lastPingTimestamp = NOW - 40 * SECOND) => ({
    status,
    lastPingTimestamp,
  });

  it('follows a shard through a reconnect: Ready, Connecting, Resuming, Ready again', () => {
    expect(shardUp(shard(Status.Ready), NOW)).toBe(true);
    expect(shardUp(shard(Status.Connecting), NOW)).toBe(false);
    expect(shardUp(shard(Status.Resuming), NOW)).toBe(false);
    expect(shardUp(shard(Status.Disconnected), NOW)).toBe(false);
  });

  it('is down when Discord has acknowledged no heartbeat for three minutes', () => {
    expect(shardUp(shard(Status.Ready, NOW - 4 * MINUTE), NOW)).toBe(false);
    // Before the first acknowledgement there is none to be late.
    expect(shardUp(shard(Status.Ready, -1), NOW)).toBe(true);
  });
});

describe('gatewayHealth (plan 19D)', () => {
  const NOW = START;
  const up = (since = NOW - 60 * MINUTE) => ({ up: true, since });
  const away = (since: number) => ({ up: false, since });

  it('is not connected without shards', () => {
    expect(gatewayHealth([], NOW)).toEqual({ connected: false, up: 0, total: 0 });
  });

  it('is not connected the moment the one shard of a self-hosted instance is away, as before', () => {
    expect(gatewayHealth([up()], NOW)).toEqual({ connected: true, up: 1, total: 1 });
    expect(gatewayHealth([away(NOW - 10 * SECOND)], NOW)).toEqual({
      connected: false,
      since: NOW - 10 * SECOND,
      up: 0,
      total: 1,
    });
  });

  it('stays connected while one shard of several reconnects, within the grace', () => {
    expect(gatewayHealth([up(), away(NOW - 2 * MINUTE), up()], NOW)).toEqual({
      connected: true,
      up: 2,
      total: 3,
    });
    expect(gatewayHealth([up(), away(NOW - SHARD_GRACE_MS), up()], NOW).connected).toBe(true);
  });

  it('is not connected once one shard has been away longer than the grace, since it went away', () => {
    expect(gatewayHealth([up(), away(NOW - SHARD_GRACE_MS - SECOND), up()], NOW)).toEqual({
      connected: false,
      since: NOW - SHARD_GRACE_MS - SECOND,
      up: 2,
      total: 3,
      late: 1,
    });
    expect(gatewayHealth([up(), away(NOW - 2 * MINUTE)], NOW, MINUTE).connected).toBe(false);
  });

  it('says how many shards are past their grace (fix round 1, F4)', () => {
    expect(
      gatewayHealth([up(), away(NOW - 5 * MINUTE), away(NOW - 4 * MINUTE), up()], NOW),
    ).toEqual({ connected: false, since: NOW - 5 * MINUTE, up: 2, total: 4, late: 2 });
  });

  it('starts the time away of a shard not ready yet at its identify slot (fix round 1, F4)', () => {
    const waiting = { up: false, since: NOW - SHARD_GRACE_MS - 5 * SECOND, slotMs: 10 * SECOND };
    expect(gatewayHealth([up(), waiting], NOW)).toEqual({ connected: true, up: 1, total: 2 });
    expect(gatewayHealth([up(), waiting], NOW + 6 * SECOND)).toEqual({
      connected: false,
      // Away from its slot on: first seen, and the ten seconds before its identify.
      since: NOW - SHARD_GRACE_MS + 5 * SECOND,
      up: 1,
      total: 2,
      late: 1,
    });
  });

  it('is not connected when every shard is away, since the last one went', () => {
    expect(gatewayHealth([away(NOW - 20 * SECOND), away(NOW - 5 * SECOND)], NOW)).toEqual({
      connected: false,
      since: NOW - 5 * SECOND,
      up: 0,
      total: 2,
    });
  });
});

describe('GatewayProbe (plan 19D)', () => {
  it('remembers since when each shard is away, from the read that first saw it', () => {
    const shards = new Map([
      [0, { status: Status.Ready, lastPingTimestamp: -1 }],
      [1, { status: Status.Ready, lastPingTimestamp: -1 }],
    ]);
    const probe = new GatewayProbe(() => shards);
    expect(probe.read(START)).toEqual({ connected: true, up: 2, total: 2 });

    shards.set(1, { status: Status.Connecting, lastPingTimestamp: -1 });
    expect(probe.read(START + 30 * SECOND)).toEqual({ connected: true, up: 1, total: 2 });
    // Still away at the next reads: the time counts from the first.
    expect(probe.read(START + 3 * MINUTE).connected).toBe(true);
    expect(probe.read(START + 4 * MINUTE)).toEqual({
      connected: false,
      since: START + 30 * SECOND,
      up: 1,
      total: 2,
      late: 1,
    });

    // Back, then away again: a new spell.
    shards.set(1, { status: Status.Ready, lastPingTimestamp: -1 });
    expect(probe.read(START + 5 * MINUTE)).toEqual({ connected: true, up: 2, total: 2 });
    shards.set(1, { status: Status.Resuming, lastPingTimestamp: -1 });
    expect(probe.read(START + 6 * MINUTE).connected).toBe(true);
  });

  it('gives a shard that has not been ready its identify slot at the login: five seconds per slot before it (fix round 1, F4)', () => {
    // Forty shards, one identify at a time: shard 39 identifies some 200 s after the first.
    const shards = new Map(
      Array.from({ length: 40 }, (_, id) => [
        id,
        { status: id === 0 ? Status.Ready : Status.Connecting, lastPingTimestamp: -1 },
      ]),
    );
    const probe = new GatewayProbe(() => shards, { maxConcurrency: () => 1 });
    probe.read(START);
    for (let id = 1; id < 39; id++) shards.set(id, { status: Status.Ready, lastPingTimestamp: -1 });
    // Past the grace, within shard 39's slot (200 s): still connected.
    expect(probe.read(START + SHARD_GRACE_MS + 100 * SECOND)).toEqual({
      connected: true,
      up: 39,
      total: 40,
    });
    expect(probe.read(START + SHARD_GRACE_MS + 201 * SECOND)).toMatchObject({
      connected: false,
      since: START + 200 * SECOND,
      late: 1,
    });
    // With sixteen at a time, shard 39 is in the third slot: 15 s.
    const sixteen = new GatewayProbe(() => shards, { maxConcurrency: () => 16 });
    shards.set(39, { status: Status.Connecting, lastPingTimestamp: -1 });
    sixteen.read(START);
    expect(sixteen.read(START + SHARD_GRACE_MS + 14 * SECOND).connected).toBe(true);
    expect(sixteen.read(START + SHARD_GRACE_MS + 16 * SECOND).connected).toBe(false);
  });

  it('gives a shard that was ready once no slot: its reconnection counts from when it went (F4)', () => {
    const shards = new Map(
      Array.from({ length: 40 }, (_, id) => [id, { status: Status.Ready, lastPingTimestamp: -1 }]),
    );
    const probe = new GatewayProbe(() => shards, { maxConcurrency: () => 1 });
    probe.read(START);
    shards.set(39, { status: Status.Connecting, lastPingTimestamp: -1 });
    probe.read(START + 30 * SECOND);
    expect(probe.read(START + 30 * SECOND + SHARD_GRACE_MS + SECOND)).toMatchObject({
      connected: false,
      since: START + 30 * SECOND,
    });
  });
});
