import type { Logger } from '../log.js';

/**
 * What a job of the catch-up did: ran (`done`), failed again (`failed`), or found nothing owed
 * (`not-owed`: its last attempt had not failed).
 */
export type CatchUpOutcome = 'done' | 'failed' | 'not-owed';

/** A job the catch-up runs when the gateway is back: its name in the log, and its run. */
export interface CatchUpJob {
  name: string;
  run(): Promise<CatchUpOutcome>;
}

export interface CatchUpOptions {
  /** In the order they run: what waits an hour or for good first (review R1). */
  jobs: readonly CatchUpJob[];
  log: Logger;
}

/**
 * The catch-up on reconnect (plan 8X-H; Matt, 2026-10-23: catch up, not restart): when the
 * gateway is back after a real disconnect (`GatewayWatch`), what failed meanwhile runs at once
 * instead of at its next interval. The jobs run one after another (never in parallel), each once
 * a catch-up, each through its own guard (a job decides itself whether it is owed); a job that
 * throws counts as failed, logged, and the others go on. One catch-up at a time: a return of the
 * gateway while one runs has one more run after it (a network that flaps), not one each; nothing
 * loops while the network is down. After `close` (shutdown) nothing starts. `caught up` at info
 * says which jobs ran, failed again and were not owed.
 */
export class CatchUp {
  private running: Promise<void> | undefined;
  private again = false;
  private closed = false;

  constructor(private readonly options: CatchUpOptions) {}

  /** The gateway is back: a catch-up now, or once more after the one under way. Never throws. */
  request(): void {
    if (this.closed) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.runAll().finally(() => {
      this.running = undefined;
    });
  }

  /** Resolves once no catch-up is under way. Never rejects. */
  async whenIdle(): Promise<void> {
    while (this.running) await this.running;
  }

  /**
   * For shutdown: starts nothing more, and does not wait (review r0 B6): the job under way may be
   * a feed's read of up to 30 s, which ends at that feed's `stop`, a later step of the shutdown;
   * a step after those awaits `whenIdle`.
   */
  close(): void {
    this.closed = true;
  }

  private async runAll(): Promise<void> {
    do {
      this.again = false;
      await this.runOnce();
    } while (this.again && !this.closed);
  }

  private async runOnce(): Promise<void> {
    const { jobs, log } = this.options;
    const said: Record<CatchUpOutcome, string[]> = { done: [], failed: [], 'not-owed': [] };
    for (const job of jobs) {
      if (this.closed) break;
      let outcome: CatchUpOutcome;
      try {
        outcome = await job.run();
      } catch (err) {
        log.warn({ err, job: job.name }, 'could not catch up');
        outcome = 'failed';
      }
      said[outcome].push(job.name);
    }
    log.info({ ran: said.done, failed: said.failed, notOwed: said['not-owed'] }, 'caught up');
  }
}
