import { onTestFinished } from 'vitest';
import { TALLY_LIMIT_MS } from './tally.js';

// The timers of the machine, taken before any test fakes them: a wait gives up by real time
// also under `vi.useFakeTimers`.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

/**
 * A call a test holds (plan 8R-4L, review R1): the fake calls `arrive()` once it waits and goes on
 * at the test's `release()`; the test awaits `reached` to act while the call is on its way, which
 * waits on the event itself, never on time or a count of turns.
 */
export interface HeldCall {
  /**
   * Resolves once the call waits (at once when it has); rejects, naming the call, when it has not
   * come within `TALLY_LIMIT_MS` of the read (fix round 2, F8), as `Tally.reached` does.
   */
  readonly reached: Promise<void>;
  /** Resolves at `release()`. */
  released: Promise<void>;
  arrive(): void;
  release(): void;
}

/** A held call; `what` names it in the failure of a wait that gives up. */
export function heldCall(what = 'the held call', limitMs = TALLY_LIMIT_MS): HeldCall {
  let arrived = false;
  const waiting = new Set<() => void>();
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    // A wait of its own per read, so that a call held and never awaited rejects nothing.
    get reached(): Promise<void> {
      if (arrived) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const done = () => {
          realClearTimeout(timer);
          resolve();
        };
        const timer = realSetTimeout(() => {
          waiting.delete(done);
          reject(new Error(`still waiting for ${what} to be reached`));
        }, limitMs);
        timer.unref();
        waiting.add(done);
        // A wait its test left behind is given up with that test: it never rejects into a later
        // one. Outside a test (none is running) it keeps only its limit.
        try {
          onTestFinished(() => {
            realClearTimeout(timer);
            waiting.delete(done);
          });
        } catch {
          // No test is running.
        }
      });
    },
    released,
    arrive() {
      arrived = true;
      for (const done of [...waiting]) done();
      waiting.clear();
    },
    release,
  };
}
