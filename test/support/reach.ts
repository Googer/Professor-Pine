import type { ReachOf, ReachRecorder } from '../../src/services/notify-service.js';

/** One run of the notifier that queued DMs, as its recorder heard of it. */
export interface ReachRun {
  of: ReachOf;
  members: number;
  at: number;
}

/**
 * What the notifier says its news reached (plan 8H-3), kept in memory: `runs` in the order they
 * came. Set `failing` to make every call reject.
 */
export class RecordingReach implements ReachRecorder {
  readonly runs: ReachRun[] = [];
  failing: Error | undefined;

  reached(of: ReachOf, members: number, at: number): Promise<void> {
    if (this.failing) return Promise.reject(this.failing);
    this.runs.push({ of, members, at });
    return Promise.resolve();
  }
}
