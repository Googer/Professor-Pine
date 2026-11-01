import { ConfigError } from '../config/errors.js';
import type { Logger } from '../log.js';
import type { CrashRecord } from './crash-record.js';
import { firstLine } from './owner-alerts.js';
import { StartStopped } from './start-stop.js';

/** What the lifecycle needs of the started bot. */
export interface StartedApp {
  log: Logger;
  shutdown: () => Promise<void>;
}

export interface LifecycleOptions {
  /** The process (its signals and its unhandled errors). */
  events: { on(event: string, listener: (...args: unknown[]) => void): unknown };
  /** For what happens before the bot's own logger exists. */
  log: Logger;
  /** Keeps why the run ends for the next start and tells the owner; never rejects. */
  ending: (what: string, err: unknown) => Promise<void>;
  exit: (code: number) => void;
  /** A clean end: the crash marker goes. */
  stopped: () => void;
}

/**
 * The bot's process from the first line of `src/index.ts` on: its signals and its unhandled
 * errors, before the start, during it and after. A signal during the start ends it after the
 * step under way (`stopRequested`, read by the start's checkpoints), a repeat only says it is
 * still finishing that step; after the start a signal shuts down cleanly and a repeat exits at
 * once. An unhandled error during the start ends it (`could not start`), after it ends the run
 * after the shutdown; an unhandled rejection after the start is only logged.
 */
export class Lifecycle {
  private app: StartedApp | undefined;
  private stopAsked = false;
  private shuttingDown = false;
  private work: Promise<void> = Promise.resolve();
  private markStopAsked: () => void = () => undefined;
  private readonly stopAskedPromise = new Promise<void>((resolve) => {
    this.markStopAsked = resolve;
  });

  constructor(private readonly options: LifecycleOptions) {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      options.events.on(signal, () => this.signal(signal));
    }
    options.events.on('uncaughtException', (err) => this.crash(err, 'uncaught exception'));
    options.events.on('unhandledRejection', (reason) => {
      if (this.app) this.app.log.error({ err: reason }, 'unhandled promise rejection');
      else this.crash(reason, 'unhandled promise rejection');
    });
  }

  /** Whether a stop was asked for during the start. */
  stopRequested(): boolean {
    return this.stopAsked;
  }

  /** Resolves when a stop is asked for during the start (a wait before the login ends then). */
  whenStopRequested(): Promise<void> {
    return this.stopAskedPromise;
  }

  /**
   * The gateway closed for good: the owner is told, the bot shuts down and exits 1, its crash
   * marker kept with the error. Once: a second call, or a signal meanwhile, starts no second
   * shutdown (a signal then exits at once).
   */
  fatal(shutdown: () => Promise<void>, reason: string): void {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.work = this.options
      .ending('stopped', reason)
      .then(shutdown)
      .finally(() => this.options.exit(1));
  }

  /** The start is done: a stop asked for meanwhile happens now. */
  started(app: StartedApp): void {
    this.app = app;
    if (this.stopAsked) this.stop('a stop asked for during the start');
  }

  /** Resolves once what an end has begun (an alert, a shutdown, the exit) is done. */
  settled(): Promise<void> {
    return this.work;
  }

  private signal(signal: NodeJS.Signals): void {
    const { log } = this.options;
    if (!this.app) {
      if (this.stopAsked) log.info({ signal }, 'still finishing the step under way');
      else log.info({ signal }, 'stopping once the step of the start under way is done');
      this.stopAsked = true;
      this.markStopAsked();
      return;
    }
    if (this.shuttingDown) {
      this.app.log.warn({ signal }, 'asked while shutting down: exiting now');
      this.options.exit(1);
      return;
    }
    this.stop(signal);
  }

  private stop(why: string): void {
    const app = this.app;
    if (!app) return;
    this.shuttingDown = true;
    app.log.info({ signal: why }, 'shutting down');
    this.work = app.shutdown().finally(() => {
      this.options.stopped();
      this.options.exit(0);
    });
  }

  private crash(err: unknown, what: string): void {
    const { ending, exit, log } = this.options;
    const app = this.app;
    if (!app) {
      log.fatal({ err }, `${what} during the start; exiting`);
      this.work = ending('could not start', err).finally(() => exit(1));
      return;
    }
    app.log.fatal({ err }, 'uncaught exception; exiting so the supervisor restarts the bot');
    this.shuttingDown = true;
    this.work = ending('stopped after an uncaught error', err)
      .then(app.shutdown)
      .finally(() => exit(1));
  }
}

export interface FailedStartOptions {
  crashes: Pick<CrashRecord, 'failed' | 'stopped'>;
  log: Logger;
  ending: (what: string, err: unknown) => Promise<void>;
  /** Where the failure is said (stderr). */
  write: (text: string) => void;
  exit: (code: number) => void;
}

/**
 * The end of a start that did not finish: one asked to stop (`StartStopped`) ends cleanly (no
 * crash marker, exit 0); any other failure is said, kept in the marker for the next start and
 * told to the owner (a config the operator must fix at the console is only kept), exit 1.
 */
export async function afterFailedStart(err: unknown, options: FailedStartOptions): Promise<void> {
  const { crashes, log, ending, write, exit } = options;
  if (err instanceof StartStopped) {
    log.info('stopped during the start');
    crashes.stopped();
    exit(0);
    return;
  }
  const detail =
    err instanceof ConfigError
      ? err.message
      : err instanceof Error
        ? (err.stack ?? err.message)
        : String(err);
  write(`Professor Pine failed to start: ${detail}\n`);
  if (err instanceof ConfigError) crashes.failed(firstLine(err));
  else await ending('could not start', err);
  exit(1);
}

/** Half a minute a restart after a crash within the hour, up to ten minutes. */
export function loginBackoffMs(restartsInWindow: number): number {
  return Math.min(restartsInWindow * 30_000, 10 * 60_000);
}

/**
 * Waits before the login of a bot that keeps crashing (`loginBackoffMs`), so that a crash loop
 * through the login does not hammer Discord; a stop asked for meanwhile ends the wait at once.
 */
export async function waitBeforeLogin(
  ms: number,
  stopRequested: Promise<void>,
  log: Logger,
): Promise<void> {
  if (ms <= 0) return;
  log.warn({ seconds: Math.round(ms / 1000) }, 'waiting before the login after recent crashes');
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
      stopRequested,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
