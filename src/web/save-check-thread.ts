import { parentPort, workerData } from 'node:worker_threads';
import { newProblems, type Outlined } from '../domain/regions/coverage.js';

/**
 * The thread `SaveCheckWorker` starts for one check of a save of the region editor (plan 8M-2):
 * `newProblems` of the outlines it is given (`workerData`), answered as one message, so that the
 * bot's own thread never cuts outlines for seconds. Its time and memory are limited by the
 * worker that started it.
 */

/** What the thread is given. */
export interface SaveCheckJob {
  before: readonly Outlined[];
  after: readonly Outlined[];
}

/** What it answers: what `newProblems` found, or why it could not (a message alone). */
export type SaveCheckReply =
  { ok: true; coverage: ReturnType<typeof newProblems> } | { ok: false; message: string };

const job = workerData as SaveCheckJob;
let reply: SaveCheckReply;
try {
  reply = { ok: true, coverage: newProblems(job.before, job.after) };
} catch (err) {
  reply = { ok: false, message: err instanceof Error ? err.message : String(err) };
}
parentPort?.postMessage(reply);
