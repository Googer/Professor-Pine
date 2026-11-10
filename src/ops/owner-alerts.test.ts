import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAlertRest } from '../../test/support/fake-rest.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  FileStamps,
  firstLine,
  MemoryStamps,
  OwnerAlerts,
  ownerAlertsFrom,
} from './owner-alerts.js';

const OWNER = '223456789012345678';
const MINUTE = 60_000;

function alertsWith(
  options: { stamps?: FileStamps | MemoryStamps; timeoutMs?: number; at?: { now: number } } = {},
) {
  const rest = new FakeAlertRest();
  const { log, entries } = createTestLogger();
  const clock = options.at ?? { now: Date.UTC(2026, 9, 16, 3, 0) };
  const alerts = new OwnerAlerts({
    rest,
    ownerId: OWNER,
    log,
    stamps: options.stamps ?? new MemoryStamps(),
    minIntervalMs: 15 * MINUTE,
    timeoutMs: options.timeoutMs ?? 1_000,
    now: () => clock.now,
  });
  return { rest, alerts, entries, clock };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('OwnerAlerts', () => {
  it('opens a DM channel with the owner and posts the text there, pinging nobody', async () => {
    const { rest, alerts } = alertsWith();

    expect(await alerts.send('fatal', 'Professor Pine stopped: boom')).toBe('sent');

    expect(rest.requests).toEqual([
      { route: '/users/@me/channels', body: { recipient_id: OWNER } },
      {
        route: `/channels/dm-of-${OWNER}/messages`,
        body: { content: 'Professor Pine stopped: boom', allowed_mentions: { parse: [] } },
      },
    ]);
  });

  it('holds back a second alert of the same kind within the interval, not one of another kind', async () => {
    const { rest, alerts, clock, entries } = alertsWith();

    await alerts.send('fatal', 'first');
    clock.now += 10 * MINUTE;
    expect(await alerts.send('fatal', 'second')).toBe('held');
    expect(await alerts.send('restart', 'restarted')).toBe('sent');
    clock.now += 5 * MINUTE;
    expect(await alerts.send('fatal', 'third')).toBe('sent');

    expect(rest.messages()).toEqual(['first', 'restarted', 'third']);
    expect(
      entries.some((entry) => entry.msg === 'owner alert held back' && entry.kind === 'fatal'),
    ).toBe(true);
  });

  it('remembers the last alerts in a file, so that a crashing bot does not alert at every start', async () => {
    const file = path.join(
      mkdtempSync(path.join(tmpdir(), 'pine-alerts-')),
      'health',
      'alerts.json',
    );
    const at = { now: Date.UTC(2026, 9, 16, 3, 0) };
    const { log } = createTestLogger();
    const before = alertsWith({ stamps: new FileStamps(file, log), at });
    await before.alerts.send('fatal', 'crash one');

    at.now += MINUTE;
    const after = alertsWith({ stamps: new FileStamps(file, log), at });
    expect(await after.alerts.send('fatal', 'crash two')).toBe('held');
    at.now += 15 * MINUTE;
    expect(await after.alerts.send('fatal', 'crash three')).toBe('sent');
    expect(after.rest.messages()).toEqual(['crash three']);
  });

  it('says so in the log when the stamps cannot be written', () => {
    const { log, entries } = createTestLogger();
    const folder = mkdtempSync(path.join(tmpdir(), 'pine-alerts-'));
    writeFileSync(path.join(folder, 'a-file'), '');
    new FileStamps(path.join(folder, 'a-file', 'alerts.json'), log).set('fatal', 1);
    expect(entries.map((entry) => entry.msg)).toContain('could not keep when an alert went out');
  });

  it('logs a failed alert and does not throw; the next one is not held back', async () => {
    const { rest, alerts, entries } = alertsWith();
    rest.failWith = new Error('getaddrinfo ENOTFOUND discord.com');

    expect(await alerts.send('fatal', 'boom')).toBe('failed');
    expect(
      entries.some((entry) => entry.level === 40 && entry.msg === 'could not alert the owner'),
    ).toBe(true);

    rest.failWith = undefined;
    expect(await alerts.send('fatal', 'boom again')).toBe('sent');
  });

  it('gives up on an alert that Discord does not answer within its time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { rest, alerts } = alertsWith({ timeoutMs: 5_000 });
    rest.failWith = 'hang';

    const sending = alerts.send('fatal', 'boom');
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await sending).toBe('failed');
  });

  it('sends one of two alerts of a kind asked for at the same moment', async () => {
    const { rest, alerts } = alertsWith();

    const outcomes = await Promise.all([alerts.send('fatal', 'one'), alerts.send('fatal', 'two')]);

    expect(outcomes).toEqual(['sent', 'held']);
    expect(rest.messages()).toEqual(['one']);
  });

  it('cuts a text to what a message holds', async () => {
    const { rest, alerts } = alertsWith();

    await alerts.send('fatal', 'x'.repeat(2_500));

    expect(rest.messages()[0]).toHaveLength(2_000);
    expect(rest.messages()[0]?.endsWith('…')).toBe(true);
  });
});

describe('ownerAlertsFrom', () => {
  const { log } = createTestLogger();

  it('needs the token and the owner', () => {
    expect(ownerAlertsFrom({ OWNER_ID: OWNER }, log, new MemoryStamps())).toBeUndefined();
    expect(ownerAlertsFrom({ DISCORD_TOKEN: 'token' }, log, new MemoryStamps())).toBeUndefined();
    expect(
      ownerAlertsFrom({ DISCORD_TOKEN: 'token', OWNER_ID: 'me' }, log, new MemoryStamps()),
    ).toBeUndefined();
    expect(
      ownerAlertsFrom({ DISCORD_TOKEN: ' ', OWNER_ID: OWNER }, log, new MemoryStamps()),
    ).toBeUndefined();
    expect(
      ownerAlertsFrom({ DISCORD_TOKEN: 'token', OWNER_ID: OWNER }, log, new MemoryStamps()),
    ).toBeInstanceOf(OwnerAlerts);
  });
});

describe('firstLine', () => {
  it('is the first line of an error message, never its stack', () => {
    const err = new Error('Connection lost\nat the second line');
    expect(firstLine(err)).toBe('Connection lost');
    expect(firstLine('plain words')).toBe('plain words');
    // A heading line takes the line after it along.
    expect(firstLine(new Error('Invalid environment:\n✖ Invalid input\n  → at DB_HOST'))).toBe(
      'Invalid environment: ✖ Invalid input',
    );
    expect(firstLine(new Error(''))).toBe('Error');
    expect(firstLine(new Error('y'.repeat(400)))).toHaveLength(300);
  });
});
