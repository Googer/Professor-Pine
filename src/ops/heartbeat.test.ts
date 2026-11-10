import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Status } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { readHealthStatus } from './health.js';
import { gatewayConnected, Heartbeat } from './heartbeat.js';

const START = Date.UTC(2026, 9, 16, 12, 0);
const SECOND = 1_000;

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
    let connected = false;
    await heartbeat.beat();

    clock.now += 20 * 60 * SECOND;
    heartbeat.loggingIn(() => connected);
    await heartbeat.beat();
    const login = START + 20 * 60 * SECOND;
    expect(readHealthStatus(file)).toMatchObject({
      phase: 'running',
      gateway: { connected: false, since: login },
    });

    clock.now += 30 * SECOND;
    connected = true;
    await heartbeat.beat();
    clock.now += 30 * SECOND;
    await heartbeat.beat();
    expect(readHealthStatus(file)?.gateway).toEqual({
      connected: true,
      since: login + 30 * SECOND,
    });

    clock.now += 30 * SECOND;
    connected = false;
    await heartbeat.beat();
    expect(readHealthStatus(file)?.gateway).toEqual({
      connected: false,
      since: login + 90 * SECOND,
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

describe('gatewayConnected', () => {
  const NOW = START;
  const shard = (status: Status, lastPingTimestamp = NOW - 40 * SECOND) => ({
    status,
    lastPingTimestamp,
  });

  it('follows every shard through a reconnect: Ready, Connecting, Ready again', () => {
    const shards = new Map([[0, shard(Status.Ready)]]);
    expect(gatewayConnected(shards, NOW)).toBe(true);

    shards.set(0, shard(Status.Connecting));
    expect(gatewayConnected(shards, NOW)).toBe(false);
    shards.set(0, shard(Status.Resuming));
    expect(gatewayConnected(shards, NOW)).toBe(false);

    shards.set(0, shard(Status.Ready));
    expect(gatewayConnected(shards, NOW)).toBe(true);
  });

  it('is not connected without shards, or when one shard is down', () => {
    expect(gatewayConnected(new Map(), NOW)).toBe(false);
    const shards = new Map([
      [0, shard(Status.Ready)],
      [1, shard(Status.Disconnected)],
    ]);
    expect(gatewayConnected(shards, NOW)).toBe(false);
  });

  it('is not connected when Discord has acknowledged no heartbeat for three minutes', () => {
    expect(gatewayConnected(new Map([[0, shard(Status.Ready, NOW - 4 * 60 * SECOND)]]), NOW)).toBe(
      false,
    );
    // Before the first acknowledgement there is none to be late.
    expect(gatewayConnected(new Map([[0, shard(Status.Ready, -1)]]), NOW)).toBe(true);
  });
});
