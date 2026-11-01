import { describe, expect, it } from 'vitest';
import { composeLabels, FakeDockerApi } from '../../test/support/fake-docker.js';
import { FakeAlertRest } from '../../test/support/fake-rest.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { BackupsOff, BackupStatus } from './backup-status.js';
import { MemoryStamps, OwnerAlerts } from './owner-alerts.js';
import { MemoryWatchdogState, Watchdog, watchdogConfig } from './watchdog.js';

const START = Date.UTC(2026, 9, 16, 12, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const OWNER = '223456789012345678';

function watchdogWith(
  options: {
    backup?: BackupStatus | BackupsOff;
    backupService?: boolean;
    state?: MemoryWatchdogState;
  } = {},
) {
  const docker = new FakeDockerApi();
  const rest = new FakeAlertRest();
  const { log, entries } = createTestLogger();
  const clock = { now: START };
  const backup: { status: BackupStatus | BackupsOff | undefined } = { status: options.backup };
  const alerts = new OwnerAlerts({
    rest,
    ownerId: OWNER,
    log,
    stamps: new MemoryStamps(),
    minIntervalMs: 0,
    now: () => clock.now,
  });
  const watchdog = new Watchdog({
    docker,
    alerts,
    log,
    project: 'pine',
    unhealthyMs: 5 * MINUTE,
    alertMs: 15 * MINUTE,
    gatewayRestartMs: 60 * MINUTE,
    restartLimit: 3,
    restartWindowMs: 30 * MINUTE,
    backup: { read: () => backup.status, maxAgeMs: 26 * HOUR },
    state: options.state ?? new MemoryWatchdogState(),
    now: () => clock.now,
  });
  const pine = docker.add({ id: 'pine-1', labels: composeLabels('pine', 'pine') });
  if (options.backupService ?? true) {
    docker.add({ id: 'backup-1', labels: composeLabels('pine', 'backup'), health: 'none' });
  }
  return { docker, rest, entries, clock, watchdog, pine, backup };
}

describe('Watchdog: an unhealthy bot', () => {
  it('leaves a healthy bot alone', async () => {
    const { docker, rest, watchdog, clock } = watchdogWith();

    await watchdog.tick();
    clock.now += HOUR;
    await watchdog.tick();

    expect(docker.restarted).toEqual([]);
    expect(rest.messages()).toEqual([]);
  });

  it('restarts the bot once it has been unhealthy for the time allowed, and tells the owner', async () => {
    const { docker, rest, watchdog, clock, pine } = watchdogWith();
    pine.health = 'unhealthy';
    pine.healthOutput =
      'stale: the last heartbeat is 2 minutes old: the bot is stuck or not running\n';

    await watchdog.tick();
    clock.now += 4 * MINUTE;
    await watchdog.tick();
    expect(docker.restarted).toEqual([]);

    clock.now += MINUTE;
    await watchdog.tick();
    expect(docker.restarted).toEqual(['pine-1']);
    expect(rest.messages()).toEqual([
      'Professor Pine was unhealthy for 5 minutes (stale: the last heartbeat is 2 minutes old: ' +
        'the bot is stuck or not running); the watchdog restarted it.',
    ]);
  });

  it('only tells the owner, once and later, of what a restart would not mend', async () => {
    for (const line of [
      'database: the database did not answer 20 seconds ago: connect ECONNREFUSED',
      'slow-start: still starting after 31 minutes',
    ]) {
      const { docker, rest, watchdog, clock, pine } = watchdogWith();
      pine.health = 'unhealthy';
      pine.healthOutput = `${line}\n`;

      for (let minutes = 0; minutes <= 40; minutes += 5) {
        await watchdog.tick();
        if (minutes === 10) expect(rest.messages()).toEqual([]);
        clock.now += 5 * MINUTE;
      }

      expect(docker.restarted).toEqual([]);
      expect(rest.messages()).toEqual([
        `Professor Pine has been unhealthy for 15 minutes (${line}); a restart would not mend ` +
          'that, so the watchdog leaves it running.',
      ]);
    }
  });

  it('tells the owner when Discord stays away, and restarts the bot after an hour of it', async () => {
    const { docker, rest, watchdog, clock, pine } = watchdogWith();
    pine.health = 'unhealthy';
    const line = 'gateway: not connected to Discord for 6 minutes';
    pine.healthOutput = `${line}\n`;

    for (let minutes = 0; minutes < 60; minutes += 5) {
      await watchdog.tick();
      clock.now += 5 * MINUTE;
    }
    expect(docker.restarted).toEqual([]);
    expect(rest.messages()).toEqual([
      `Professor Pine has been unhealthy for 15 minutes (${line}); the watchdog restarts it ` +
        'if that lasts 60 minutes.',
    ]);

    await watchdog.tick();
    expect(docker.restarted).toEqual(['pine-1']);
    expect(rest.messages().at(-1)).toBe(
      `Professor Pine was unhealthy for 60 minutes (${line}); the watchdog restarted it.`,
    );
  });

  it('counts the time to a restart from when the bot became stuck, not from an earlier spell of another kind', async () => {
    const { docker, rest, watchdog, clock, pine } = watchdogWith();
    pine.health = 'unhealthy';
    pine.healthOutput = 'gateway: not connected to Discord for 6 minutes\n';
    await watchdog.tick();
    clock.now += 10 * MINUTE;
    await watchdog.tick();

    pine.healthOutput =
      'stale: the last heartbeat is 2 minutes old: the bot is stuck or not running\n';
    await watchdog.tick();
    expect(docker.restarted).toEqual([]);
    clock.now += 4 * MINUTE;
    await watchdog.tick();
    expect(docker.restarted).toEqual([]);

    clock.now += MINUTE;
    await watchdog.tick();
    expect(docker.restarted).toEqual(['pine-1']);
    expect(rest.messages().at(-1)).toMatch(/^Professor Pine was unhealthy for 5 minutes \(stale:/);
  });

  it('never restarts a bot that is starting, however long it takes', async () => {
    const { docker, rest, watchdog, clock, pine } = watchdogWith();
    pine.health = 'healthy';
    pine.healthOutput = 'starting: starting for 25 minutes, the database answered 3 seconds ago\n';

    for (let i = 0; i < 6; i++) {
      await watchdog.tick();
      clock.now += 5 * MINUTE;
    }

    expect(docker.restarted).toEqual([]);
    expect(rest.messages()).toEqual([]);
  });

  it('counts the time anew after the bot was healthy in between', async () => {
    const { docker, watchdog, clock, pine } = watchdogWith();
    pine.health = 'unhealthy';
    await watchdog.tick();
    clock.now += 3 * MINUTE;
    pine.health = 'healthy';
    await watchdog.tick();
    clock.now += MINUTE;
    pine.health = 'unhealthy';
    await watchdog.tick();
    clock.now += 4 * MINUTE;
    await watchdog.tick();

    expect(docker.restarted).toEqual([]);
  });

  it('tells the owner when the restart fails', async () => {
    const { docker, rest, watchdog, clock, pine, entries } = watchdogWith();
    pine.health = 'unhealthy';
    docker.failRestart = new Error('Cannot restart container pine-1: permission denied');

    await watchdog.tick();
    clock.now += 5 * MINUTE;
    await watchdog.tick();

    expect(rest.messages()).toEqual([
      'Professor Pine was unhealthy for 5 minutes (no health output); the watchdog could not ' +
        'restart it: Cannot restart container pine-1: permission denied',
    ]);
    expect(entries.some((entry) => entry.msg === 'could not restart the bot')).toBe(true);
  });

  it('leaves a stopped bot to Docker and touches no other container', async () => {
    const { docker, watchdog, clock, pine } = watchdogWith();
    pine.running = false;
    pine.health = 'unhealthy';
    docker.add({ id: 'mysql-1', labels: composeLabels('pine', 'mysql'), health: 'unhealthy' });
    docker.add({ id: 'other-pine', labels: composeLabels('staging', 'pine'), health: 'unhealthy' });
    docker.add({
      id: 'pine-run',
      labels: { ...composeLabels('pine', 'pine'), 'com.docker.compose.oneoff': 'True' },
      health: 'unhealthy',
    });

    await watchdog.tick();
    clock.now += HOUR;
    await watchdog.tick();

    expect(docker.restarted).toEqual([]);
  });

  it('does nothing while the stack is down, and survives an Engine that does not answer', async () => {
    const { docker, rest, watchdog, entries } = watchdogWith();
    docker.containers.length = 0;
    await watchdog.tick();

    docker.failWith = new Error('connect ENOENT /var/run/docker.sock');
    await watchdog.tick();

    expect(rest.messages()).toEqual([]);
    expect(entries.some((entry) => entry.msg === 'could not ask Docker about the bot')).toBe(true);
  });
});

describe('Watchdog: a bot that keeps restarting', () => {
  it('tells the owner when the bot restarted as often as allowed within the window', async () => {
    const { rest, watchdog, clock, pine } = watchdogWith();
    await watchdog.tick();
    for (const count of [1, 2, 3]) {
      clock.now += 5 * MINUTE;
      pine.restartCount = count;
      pine.exitCode = 1;
      await watchdog.tick();
    }
    clock.now += 5 * MINUTE;
    await watchdog.tick();

    expect(rest.messages()).toEqual([
      'Professor Pine restarted 3 times in the last 30 minutes (exit code 1 the last time). ' +
        "'./pine logs pine' shows why.",
    ]);
  });

  it('does not count restarts that lie further apart than the window', async () => {
    const { rest, watchdog, clock, pine } = watchdogWith();
    await watchdog.tick();
    for (const count of [1, 2, 3]) {
      clock.now += 20 * MINUTE;
      pine.restartCount = count;
      await watchdog.tick();
    }

    expect(rest.messages()).toEqual([]);
  });

  it('counts afresh for a new container', async () => {
    const { docker, rest, watchdog, clock, pine } = watchdogWith();
    pine.restartCount = 7;
    await watchdog.tick();
    docker.containers.length = 0;
    docker.add({ id: 'pine-2', labels: composeLabels('pine', 'pine'), restartCount: 0 });
    clock.now += MINUTE;
    await watchdog.tick();

    expect(rest.messages()).toEqual([]);
  });
});

describe('Watchdog: backups', () => {
  it('tells the owner of a failed backup once', async () => {
    const { rest, watchdog, clock, backup } = watchdogWith();
    await watchdog.tick();
    backup.status = {
      finishedAt: START + MINUTE,
      ok: false,
      reason: 'the dump did not load into the scratch server',
      lastOkAt: START - 23 * HOUR,
    };
    clock.now += 2 * MINUTE;
    await watchdog.tick();
    clock.now += MINUTE;
    await watchdog.tick();

    expect(rest.messages()).toEqual([
      `The backup of <t:${(START + MINUTE) / 1000}:f> failed: the dump did not load into the ` +
        "scratch server. './pine logs backup' shows more.",
    ]);
  });

  it('remembers what it told across its own restarts', async () => {
    const state = new MemoryWatchdogState();
    const failed: BackupStatus = {
      finishedAt: START - HOUR,
      ok: false,
      reason: 'disk full',
      lastOkAt: START - 25 * HOUR,
    };
    const first = watchdogWith({ backup: failed, state });
    await first.watchdog.tick();
    expect(first.rest.messages()).toHaveLength(1);

    const second = watchdogWith({ backup: failed, state });
    await second.watchdog.tick();
    second.clock.now += 2 * HOUR;
    await second.watchdog.tick();

    // The failure was told; that no backup succeeded for 26 hours is new.
    expect(second.rest.messages()).toEqual([
      `No backup has succeeded since <t:${(START - 25 * HOUR) / 1000}:f>. ` +
        "'./pine logs backup' shows why.",
    ]);
  });

  it('watches no backups where the stack has no backup service, and says so once', async () => {
    const { rest, watchdog, clock, entries } = watchdogWith({ backupService: false });
    await watchdog.tick();
    clock.now += 27 * HOUR;
    await watchdog.tick();

    expect(rest.messages()).toEqual([]);
    expect(
      entries.filter((entry) => entry.msg === 'no backup service: backups are not watched'),
    ).toHaveLength(1);
  });

  it('watches no backups where they are switched off, and tells the owner so once', async () => {
    const state = new MemoryWatchdogState();
    const first = watchdogWith({ backup: { off: true }, state });
    await first.watchdog.tick();
    first.clock.now += 27 * HOUR;
    await first.watchdog.tick();
    // Its own restart does not tell it again.
    const second = watchdogWith({ backup: { off: true }, state });
    await second.watchdog.tick();

    const told = 'Backups are off on this stack (BACKUP_DIR is blank): nothing is backed up.';
    expect(first.rest.messages()).toEqual([told]);
    expect(second.rest.messages()).toEqual([]);
    expect(
      first.entries.filter((entry) => entry.msg === 'backups are off: they are not watched'),
    ).toHaveLength(1);
  });

  it('tells the owner that backups are off again when the first message did not go out', async () => {
    const { rest, watchdog, clock } = watchdogWith({ backup: { off: true } });
    rest.failWith = new Error('getaddrinfo ENOTFOUND discord.com');
    await watchdog.tick();
    rest.failWith = undefined;
    clock.now += MINUTE;
    await watchdog.tick();
    clock.now += MINUTE;
    await watchdog.tick();

    expect(rest.messages()).toEqual([
      'Backups are off on this stack (BACKUP_DIR is blank): nothing is backed up.',
    ]);
  });

  it('does not tell again of a failure older than a day it finds at its own start', async () => {
    const { rest, watchdog } = watchdogWith({
      backup: {
        finishedAt: START - 2 * 24 * HOUR,
        ok: false,
        reason: 'disk full',
        lastOkAt: START - HOUR,
      },
    });

    await watchdog.tick();

    expect(rest.messages()).toEqual([]);
  });

  it('tells the owner when no backup has succeeded for too long, twice a day at most', async () => {
    const { rest, watchdog, clock } = watchdogWith({
      backup: { finishedAt: START - 2 * HOUR, ok: true, lastOkAt: START - 2 * HOUR },
    });
    await watchdog.tick();
    clock.now += 24 * HOUR;
    await watchdog.tick();
    clock.now += HOUR;
    await watchdog.tick();
    clock.now += 12 * HOUR;
    await watchdog.tick();

    const since = `<t:${(START - 2 * HOUR) / 1000}:f>`;
    const told = `No backup has succeeded since ${since}. './pine logs backup' shows why.`;
    expect(rest.messages()).toEqual([told, told]);
  });

  it('tells the owner when no backup has run since it started', async () => {
    const { rest, watchdog, clock } = watchdogWith();
    await watchdog.tick();
    clock.now += 27 * HOUR;
    await watchdog.tick();

    expect(rest.messages()).toEqual([
      `No backup has run since the watchdog started at <t:${START / 1000}:f>. ` +
        "'./pine logs backup' shows why.",
    ]);
  });
});

describe('watchdogConfig', () => {
  it('has a default for everything', () => {
    expect(watchdogConfig({})).toEqual({
      socketPath: '/var/run/docker.sock',
      project: undefined,
      intervalMs: 30_000,
      unhealthyMs: 5 * MINUTE,
      alertMs: 15 * MINUTE,
      // Matt (2026-10-16): a bot off Discord while raids go on is a problem; restart it soon.
      gatewayRestartMs: 5 * MINUTE,
      restartLimit: 3,
      restartWindowMs: 30 * MINUTE,
      backupStatusFile: '/ops/backup-status.json',
      backupMaxAgeMs: 26 * HOUR,
    });
  });

  it('reads the environment, blank as unset, and refuses what makes no sense', () => {
    expect(
      watchdogConfig({
        WATCHDOG_UNHEALTHY_MINUTES: '10',
        WATCHDOG_RESTARTS: '',
        WATCHDOG_PROJECT: 'staging',
        WATCHDOG_BACKUP_HOURS: '50',
      }),
    ).toMatchObject({
      unhealthyMs: 10 * MINUTE,
      restartLimit: 3,
      project: 'staging',
      backupMaxAgeMs: 50 * HOUR,
    });
    expect(() => watchdogConfig({ WATCHDOG_UNHEALTHY_MINUTES: 'soon' })).toThrow(
      /WATCHDOG_UNHEALTHY_MINUTES/,
    );
  });
});
