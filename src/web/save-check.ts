import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BoundedMap } from '../bounded-map.js';
import { newProblems, type Coverage, type Outlined } from '../domain/regions/coverage.js';
import type { Logger } from '../log.js';
import type { SaveCheckJob, SaveCheckReply } from './save-check-thread.js';

/**
 * What the check of a save for new overlaps and gaps came to (spec 4.3, plan 8M-2): `checked`,
 * with what `newProblems` found; `too-complex`, when it took longer or more memory than it may;
 * `failed`, when polyclip could not cut the outlines (it threw): logged, and then it does not
 * block, as the page's own check has shaded what it found; `unavailable`, when the check could
 * not be run at all (its thread did not start, failed or ended without an answer): the save is
 * refused for now; `busy`, when too many checks wait already (`MAX_WAITING`): refused for now.
 */
export type CheckVerdict =
  | { kind: 'checked'; coverage: Coverage }
  | { kind: 'too-complex' }
  | { kind: 'failed'; err: unknown }
  | { kind: 'unavailable'; err: unknown }
  | { kind: 'busy' };

/** Works out the new overlaps and gaps of a save (`newProblems`). Never rejects. */
export interface SaveChecker {
  check(before: readonly Outlined[], after: readonly Outlined[]): Promise<CheckVerdict>;
}

/** How long the verdict of a check is kept for the save that follows its preview. */
export const VERDICT_MS = 5 * 60_000;
/** How many verdicts are kept at most (oldest out). */
const VERDICTS = 100;

/**
 * The checks of the saves of the region editor (`SaveChecker`), with the verdicts of the
 * last few minutes kept by what they were of (`key`: the request and the versions of the
 * server's regions it was checked against, as the caller hashes them): the save of what was
 * just previewed, with nothing changed since, is not checked again. Only a `checked` verdict is
 * kept.
 */
export class SaveChecks {
  private readonly verdicts = new BoundedMap<string, { at: number; coverage: Coverage }>(VERDICTS);

  constructor(
    private readonly checker: SaveChecker,
    private readonly now: () => number,
  ) {}

  async check(
    key: string,
    before: readonly Outlined[],
    after: readonly Outlined[],
  ): Promise<CheckVerdict> {
    const kept = this.verdicts.get(key);
    if (kept && this.now() - kept.at < VERDICT_MS) {
      return { kind: 'checked', coverage: kept.coverage };
    }
    const verdict = await this.checker.check(before, after);
    if (verdict.kind === 'checked') {
      this.verdicts.set(key, { at: this.now(), coverage: verdict.coverage });
    }
    return verdict;
  }
}

/** How long one check may take: a city's regions take a second or two. */
export const CHECK_LIMIT_MS = 10_000;
/** How much memory (of its old generation, in MB) the thread of one check may take. */
const CHECK_MEMORY_MB = 256;
/** How many checks may wait beyond the one running; any more is `busy`. */
export const MAX_WAITING = 3;

const here = fileURLToPath(import.meta.url);
/** The thread's script beside this one: `.js` in `dist/`, `.ts` where tests run the source. */
const THREAD = path.join(path.dirname(here), `save-check-thread${path.extname(here)}`);

export interface SaveCheckWorkerOptions {
  log: Logger;
  /** The thread's script; `save-check-thread` beside this module by default (tests give a fake). */
  file?: string;
  limitMs?: number;
}

/**
 * The checks of the saves of the region editor off the bot's thread: each in a thread of its
 * own (`save-check-thread`), one at a time (at most `MAX_WAITING` others wait their turn; any
 * more is `busy` at once), ended after `CHECK_LIMIT_MS` or when it runs out of the memory it may
 * take: `too-complex` then. A thread whose cutting threw answers so (`failed`, logged by the
 * caller); one that does not start, fails otherwise or ends without an answer is
 * `unavailable`. Threads do not keep the bot from ending.
 */
export class SaveCheckWorker implements SaveChecker {
  private last: Promise<unknown> | undefined;
  /** The checks running or waiting. */
  private pending = 0;

  constructor(private readonly options: SaveCheckWorkerOptions) {}

  check(before: readonly Outlined[], after: readonly Outlined[]): Promise<CheckVerdict> {
    if (this.pending > MAX_WAITING) return Promise.resolve({ kind: 'busy' });
    this.pending++;
    const run = (): Promise<CheckVerdict> => this.run(before, after);
    const verdict = this.last ? this.last.then(run, run) : run();
    this.last = verdict;
    void verdict.then(() => {
      this.pending--;
      if (this.last === verdict) this.last = undefined;
    });
    return verdict;
  }

  private run(before: readonly Outlined[], after: readonly Outlined[]): Promise<CheckVerdict> {
    const file = this.options.file ?? THREAD;
    return new Promise((resolve) => {
      let worker: Worker;
      try {
        worker = new Worker(file, {
          workerData: { before, after } satisfies SaveCheckJob,
          // From the sources (tests, `npm run dev`): through tsx, `@pine/wayspot-core` from its
          // sources too (tsconfig.json, `customConditions`).
          execArgv:
            path.extname(file) === '.ts'
              ? ['--conditions=pine-source', '--import', import.meta.resolve('tsx')]
              : [],
          resourceLimits: { maxOldGenerationSizeMb: CHECK_MEMORY_MB },
          stdout: true,
          stderr: true,
        });
      } catch (err) {
        resolve({ kind: 'unavailable', err });
        return;
      }
      worker.unref();
      let done = false;
      const finish = (verdict: CheckVerdict): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        void worker.terminate();
        resolve(verdict);
      };
      const timer = setTimeout(() => {
        this.options.log.warn('the check of a save took too long, and was ended');
        finish({ kind: 'too-complex' });
      }, this.options.limitMs ?? CHECK_LIMIT_MS);
      worker.once('message', (reply: SaveCheckReply) => {
        finish(
          reply.ok
            ? { kind: 'checked', coverage: reply.coverage }
            : { kind: 'failed', err: new Error(reply.message) },
        );
      });
      worker.once('error', (err: Error & { code?: string }) => {
        finish(
          err.code === 'ERR_WORKER_OUT_OF_MEMORY'
            ? { kind: 'too-complex' }
            : { kind: 'unavailable', err },
        );
      });
      worker.once('exit', (code) => {
        finish({
          kind: 'unavailable',
          err: new Error(`the thread ended (${code}) without an answer`),
        });
      });
    });
  }
}

/** The check on the calling thread: for tests, which need no thread of its own. */
export const inThisThread: SaveChecker = {
  check(before, after) {
    try {
      return Promise.resolve({ kind: 'checked', coverage: newProblems(before, after) });
    } catch (err) {
      return Promise.resolve({ kind: 'failed', err });
    }
  },
};
