import { onTestFinished } from 'vitest';

// The timers of the machine, taken before any test fakes them: a wait gives up by real time
// also under `vi.useFakeTimers`.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

/**
 * How long `Tally.reached` waits before it gives up: far longer than any count takes to come in
 * a passing run (milliseconds, also on a machine busy with another suite), and under the unit
 * tests' 15 s, so that a broken behaviour fails with what did not happen rather than a timeout.
 */
export const TALLY_LIMIT_MS = 10_000;

/**
 * How often something a fake saw has happened (a request arrived, a post was edited), as a count
 * a test can wait for: the fake calls `add()` each time, and `reached(n)` resolves once it has
 * happened `n` times in all (at once when it has). A test waits for work in the background by
 * awaiting the event itself this way, never by polling (`vi.waitFor`) or by letting turns of
 * the event loop pass. `what` names it in the failure of a wait that gives up ("still waiting
 * for requests to the role gateway to reach 2, saw 1").
 */
export class Tally {
  private seen = 0;
  private waiting: { times: number; resolve: () => void }[] = [];

  constructor(
    private readonly what = 'the count',
    private readonly limitMs = TALLY_LIMIT_MS,
  ) {}

  /** How often it has happened so far. */
  get count(): number {
    return this.seen;
  }

  /** It happened once more: whoever waited for this count goes on. */
  add(): void {
    this.seen++;
    const due = this.waiting.filter((waiter) => waiter.times <= this.seen);
    this.waiting = this.waiting.filter((waiter) => waiter.times > this.seen);
    for (const waiter of due) waiter.resolve();
  }

  /**
   * Resolves once it has happened `times` times in all; rejects, saying what it waited for and
   * what it saw, when that has not come within the limit.
   */
  reached(times: number): Promise<void> {
    if (this.seen >= times) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = {
        times,
        resolve: () => {
          realClearTimeout(timer);
          resolve();
        },
      };
      const timer = realSetTimeout(() => {
        this.waiting = this.waiting.filter((other) => other !== waiter);
        reject(
          new Error(
            `still waiting for ${this.what} to reach ${String(times)}, saw ${String(this.seen)}`,
          ),
        );
      }, this.limitMs);
      timer.unref();
      this.waiting.push(waiter);
      // A wait its test left behind is given up with that test: it never rejects into a later
      // one. Outside a test (none is running) it keeps only its limit.
      try {
        onTestFinished(() => {
          realClearTimeout(timer);
          this.waiting = this.waiting.filter((other) => other !== waiter);
        });
      } catch {
        // No test is running.
      }
    });
  }
}
