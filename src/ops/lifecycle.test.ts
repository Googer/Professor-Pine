import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { ConfigError } from '../config/errors.js';
import { CrashRecord } from './crash-record.js';
import { healthFiles } from './health.js';
import { afterFailedStart, Lifecycle, loginBackoffMs, waitBeforeLogin } from './lifecycle.js';
import { StartStopped } from './start-stop.js';

afterEach(() => {
  vi.useRealTimers();
});

/** The process as the lifecycle sees it: its events, and what it did. */
function lifecycleWith(options: { shutdownAtOnce?: boolean } = {}) {
  const events = new EventEmitter();
  const { log, entries } = createTestLogger();
  const exits: number[] = [];
  const ended: Array<[string, unknown]> = [];
  let stoppedCleanly = 0;
  let shutdowns = 0;
  let finishShutdown: () => void = () => undefined;
  const lifecycle = new Lifecycle({
    events,
    log,
    ending: (what, err) => {
      ended.push([what, err]);
      return Promise.resolve();
    },
    exit: (code) => {
      exits.push(code);
    },
    stopped: () => {
      stoppedCleanly++;
    },
  });
  const app = {
    log,
    shutdown: () => {
      shutdowns++;
      if (options.shutdownAtOnce) return Promise.resolve();
      return new Promise<void>((resolve) => {
        finishShutdown = resolve;
      });
    },
  };
  return {
    events,
    entries,
    exits,
    ended,
    lifecycle,
    app,
    stoppedCleanly: () => stoppedCleanly,
    shutdowns: () => shutdowns,
    finishShutdown: () => finishShutdown(),
  };
}

describe('Lifecycle: signals', () => {
  it('lets the start finish its step on a signal, and a second one too, then stops cleanly', async () => {
    const made = lifecycleWith();
    made.events.emit('SIGTERM');
    made.events.emit('SIGTERM');

    expect(made.lifecycle.stopRequested()).toBe(true);
    expect(made.exits).toEqual([]);
    expect(made.entries.map((entry) => entry.msg)).toEqual([
      'stopping once the step of the start under way is done',
      'still finishing the step under way',
    ]);

    made.lifecycle.started(made.app);
    expect(made.shutdowns()).toBe(1);
    made.finishShutdown();
    await made.lifecycle.settled();
    expect(made.stoppedCleanly()).toBe(1);
    expect(made.exits).toEqual([0]);
  });

  it('shuts down on a signal after the start, and exits at once on a second one', () => {
    const made = lifecycleWith();
    made.lifecycle.started(made.app);

    made.events.emit('SIGINT');
    expect(made.shutdowns()).toBe(1);
    made.events.emit('SIGINT');

    expect(made.exits).toEqual([1]);
    expect(made.stoppedCleanly()).toBe(0);
  });
});

describe('Lifecycle: crashes', () => {
  it('ends a start that throws where nothing catches it, telling why', async () => {
    const made = lifecycleWith();
    const err = new Error('boom during the migrations');

    made.events.emit('uncaughtException', err);
    await made.lifecycle.settled();

    expect(made.ended).toEqual([['could not start', err]]);
    expect(made.exits).toEqual([1]);
  });

  it('ends a start whose promise is rejected where nothing catches it', async () => {
    const made = lifecycleWith();

    made.events.emit('unhandledRejection', new Error('rejected while loading'));
    await made.lifecycle.settled();

    expect(made.ended).toEqual([['could not start', new Error('rejected while loading')]]);
    expect(made.exits).toEqual([1]);
  });

  it('after the start, logs a rejection and ends on an uncaught exception after its shutdown', async () => {
    const made = lifecycleWith({ shutdownAtOnce: true });
    made.lifecycle.started(made.app);

    made.events.emit('unhandledRejection', new Error('a request failed'));
    await made.lifecycle.settled();
    expect(made.exits).toEqual([]);
    expect(made.entries.some((entry) => entry.msg === 'unhandled promise rejection')).toBe(true);

    const err = new Error('boom');
    made.events.emit('uncaughtException', err);
    await made.lifecycle.settled();
    expect(made.ended).toEqual([['stopped after an uncaught error', err]]);
    expect(made.shutdowns()).toBe(1);
    expect(made.exits).toEqual([1]);
  });

  it('ends the run on a fatal close of the gateway once; a signal during it exits at once, the error kept', async () => {
    const made = lifecycleWith({ shutdownAtOnce: true });
    made.lifecycle.started(made.app);

    made.lifecycle.fatal(made.app.shutdown, 'Discord closed the gateway connection for good');
    made.lifecycle.fatal(made.app.shutdown, 'again');
    made.events.emit('SIGTERM');
    // The signal exits at once; the shutdown under way still finishes, once.
    expect(made.exits).toEqual([1]);
    await made.lifecycle.settled();

    expect(made.ended).toEqual([['stopped', 'Discord closed the gateway connection for good']]);
    expect(made.shutdowns()).toBe(1);
    expect(made.exits).toEqual([1, 1]);
    // The crash marker stays, with the error: the next start tells of it.
    expect(made.stoppedCleanly()).toBe(0);
  });
});

describe('afterFailedStart', () => {
  function crashesIn() {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'pine-start-')), 'health');
    const crashes = new CrashRecord({ dir });
    crashes.started();
    return { crashes, marker: healthFiles(dir).marker };
  }

  it('ends a start that was asked to stop cleanly: no marker, exit 0', async () => {
    const { crashes, marker } = crashesIn();
    const { log } = createTestLogger();
    const exits: number[] = [];
    const ended: string[] = [];

    await afterFailedStart(new StartStopped(), {
      crashes,
      log,
      ending: (what) => {
        ended.push(what);
        return Promise.resolve();
      },
      write: () => undefined,
      exit: (code) => {
        exits.push(code);
      },
    });

    expect(existsSync(marker)).toBe(false);
    expect(exits).toEqual([0]);
    expect(ended).toEqual([]);
  });

  it('keeps the marker with the error of a start that failed, and tells the owner unless the config is wrong', async () => {
    for (const [err, told] of [
      [new Error('connect ECONNREFUSED'), ['could not start']],
      [new ConfigError('Invalid environment:\nDB_HOST'), []],
    ] as const) {
      const { crashes, marker } = crashesIn();
      const { log } = createTestLogger();
      const exits: number[] = [];
      const ended: string[] = [];
      const written: string[] = [];

      await afterFailedStart(err, {
        crashes,
        log,
        ending: (what, error) => {
          ended.push(what);
          crashes.failed(String(error));
          return Promise.resolve();
        },
        write: (text) => {
          written.push(text);
        },
        exit: (code) => {
          exits.push(code);
        },
      });

      expect(existsSync(marker)).toBe(true);
      expect(exits).toEqual([1]);
      expect(ended).toEqual(told);
      expect(written[0]).toMatch(/^Professor Pine failed to start: /);
    }
  });
});

describe('the wait before the login', () => {
  it('grows by half a minute a restart after a crash, up to ten minutes', () => {
    expect(loginBackoffMs(0)).toBe(0);
    expect(loginBackoffMs(1)).toBe(30_000);
    expect(loginBackoffMs(4)).toBe(120_000);
    expect(loginBackoffMs(50)).toBe(600_000);
  });

  it('waits, logged, and ends at once when a stop is asked for', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { log, entries } = createTestLogger();
    let stop: () => void = () => undefined;
    const stopped = new Promise<void>((resolve) => {
      stop = resolve;
    });

    let waited = false;
    const waiting = waitBeforeLogin(90_000, stopped, log).then(() => {
      waited = true;
    });
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(89_000);
    expect(waited).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await waiting;
    expect(
      entries.some((entry) => entry.msg === 'waiting before the login after recent crashes'),
    ).toBe(true);

    const cut = waitBeforeLogin(90_000, stopped, log);
    stop();
    await cut;
    expect(vi.getTimerCount()).toBe(0);
  });
});
