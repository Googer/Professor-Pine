import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CrashRecord, restartText } from './crash-record.js';

const START = Date.UTC(2026, 9, 16, 12, 0);
const MINUTE = 60_000;

function recordIn(dir: string, clock: { now: number }) {
  return new CrashRecord({ dir, now: () => clock.now });
}

function freshDir() {
  return path.join(mkdtempSync(path.join(tmpdir(), 'pine-crash-')), 'health');
}

describe('CrashRecord', () => {
  it('reports nothing at a first start, nor after a clean stop', () => {
    const dir = freshDir();
    const clock = { now: START };

    expect(recordIn(dir, clock).started()).toBeUndefined();
    recordIn(dir, clock).stopped();
    clock.now += MINUTE;
    expect(recordIn(dir, clock).started()).toBeUndefined();
  });

  it('reports a crash when the last run left its marker, with the error it recorded', () => {
    const dir = freshDir();
    const clock = { now: START };
    const first = recordIn(dir, clock);
    first.started();
    clock.now += 10 * MINUTE;
    first.failed('Connection lost: The server closed the connection.');

    clock.now += MINUTE;
    expect(recordIn(dir, clock).started()).toEqual({
      at: START + 10 * MINUTE,
      error: 'Connection lost: The server closed the connection.',
      restartsInWindow: 1,
    });
  });

  it('takes the last heartbeat as the time of a crash that recorded no error', () => {
    const dir = freshDir();
    const clock = { now: START };
    recordIn(dir, clock).started();
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'status.json'),
      JSON.stringify({
        writtenAt: START + 42 * MINUTE,
        startedAt: START,
        pid: 7,
        phase: 'running',
        gateway: { connected: true, since: START + MINUTE },
        database: { reachable: true, checkedAt: START + 42 * MINUTE },
      }),
    );

    clock.now = START + 50 * MINUTE;
    expect(recordIn(dir, clock).started()).toEqual({
      at: START + 42 * MINUTE,
      restartsInWindow: 1,
    });
  });

  it('takes the start as the time of a crash before the first heartbeat', () => {
    const dir = freshDir();
    const clock = { now: START };
    recordIn(dir, clock).started();

    clock.now += MINUTE;
    expect(recordIn(dir, clock).started()).toEqual({ at: START, restartsInWindow: 1 });
  });

  it('counts the restarts after a crash in the last hour', () => {
    const dir = freshDir();
    const clock = { now: START };
    recordIn(dir, clock).started();
    const reports = [];
    for (let i = 0; i < 3; i++) {
      clock.now += 20 * MINUTE;
      reports.push(recordIn(dir, clock).started()?.restartsInWindow);
    }
    // A clean run in between does not count, and the oldest leaves the hour.
    recordIn(dir, clock).stopped();
    clock.now += 20 * MINUTE;
    recordIn(dir, clock).started();
    clock.now += 5 * MINUTE;
    reports.push(recordIn(dir, clock).started()?.restartsInWindow);

    expect(reports).toEqual([1, 2, 3, 3]);
  });

  it('starts afresh from marker files it cannot read', () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'running.json'), 'not json');
    writeFileSync(path.join(dir, 'restarts.json'), '{"no": "list"}');
    const clock = { now: START };

    expect(recordIn(dir, clock).started()).toEqual({ at: START, restartsInWindow: 1 });
  });
});

describe('CrashRecord.runningElsewhere', () => {
  const OTHER = 4242;
  const OWN = 77;

  function recordAs(dir: string, clock: { now: number }, pid: number, alive: number[] = []) {
    return new CrashRecord({
      dir,
      now: () => clock.now,
      pid,
      isAlive: (candidate) => alive.includes(candidate),
    });
  }

  function beat(dir: string, pid: number, writtenAt: number) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'status.json'),
      JSON.stringify({
        writtenAt,
        startedAt: START,
        pid,
        phase: 'running',
        gateway: { connected: true, since: START },
        database: { reachable: true, checkedAt: writtenAt },
      }),
    );
  }

  it('finds a bot running from the same folder: its process alive and its heartbeat fresh', () => {
    const dir = freshDir();
    const clock = { now: START };
    recordAs(dir, clock, OTHER).started();
    clock.now += 10 * MINUTE;
    beat(dir, OTHER, clock.now - 20_000);

    expect(recordAs(dir, clock, OWN, [OTHER]).runningElsewhere()).toEqual({
      pid: OTHER,
      startedAt: START,
    });
  });

  it('finds one still starting, before its first heartbeat', () => {
    const dir = freshDir();
    const clock = { now: START };
    recordAs(dir, clock, OTHER).started();
    clock.now += 30_000;

    expect(recordAs(dir, clock, OWN, [OTHER]).runningElsewhere()).toEqual({
      pid: OTHER,
      startedAt: START,
    });
  });

  it('finds none after a crash: no process, its own process, or a stale heartbeat', () => {
    const dir = freshDir();
    const clock = { now: START };
    recordAs(dir, clock, OTHER).started();
    clock.now += 10 * MINUTE;
    beat(dir, OTHER, clock.now - 20_000);

    // The process is gone.
    expect(recordAs(dir, clock, OWN).runningElsewhere()).toBeUndefined();
    // A container's bot is process 1 at every start.
    expect(recordAs(dir, clock, OTHER, [OTHER]).runningElsewhere()).toBeUndefined();
    // Another process took the number of the one that crashed.
    beat(dir, OTHER, clock.now - 5 * MINUTE);
    expect(recordAs(dir, clock, OWN, [OTHER]).runningElsewhere()).toBeUndefined();
    beat(dir, 5151, clock.now - 20_000);
    expect(recordAs(dir, clock, OWN, [OTHER]).runningElsewhere()).toBeUndefined();
  });

  it('finds none without a marker or after a clean stop', () => {
    const dir = freshDir();
    const clock = { now: START };
    expect(recordAs(dir, clock, OWN, [OTHER]).runningElsewhere()).toBeUndefined();

    recordAs(dir, clock, OTHER).started();
    recordAs(dir, clock, OTHER).stopped();
    expect(recordAs(dir, clock, OWN, [OTHER]).runningElsewhere()).toBeUndefined();
  });
});

describe('restartText', () => {
  it('says when the crash was, why, and how often it happened lately', () => {
    expect(
      restartText({ at: Date.UTC(2026, 9, 16, 12, 0), error: 'boom', restartsInWindow: 2 }),
    ).toBe(
      'Professor Pine restarted after a crash at <t:1792152000:f>: boom. Restart 2 in the last hour.',
    );
    expect(restartText({ at: Date.UTC(2026, 9, 16, 12, 0), restartsInWindow: 1 })).toBe(
      'Professor Pine restarted after a crash at <t:1792152000:f>: no error was recorded ' +
        '(killed, out of memory, or the machine stopped). Restart 1 in the last hour.',
    );
  });
});
