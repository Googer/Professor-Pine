import { afterEach, beforeEach, onTestFinished, vi } from 'vitest';
import { Tally } from './tally.js';

/** What `watchImmediates` gives a test. */
export interface ImmediateWatch {
  /**
   * Resolves once no `setImmediate` callback is waiting any more: every answer of the fakes that
   * was asked for has come, and everything that followed from it (which may ask for more) is
   * done. Timers (faked with `vi.useFakeTimers`) are not run.
   *
   * It sees only what goes through the global `setImmediate` (and `clearImmediate`) from the
   * moment `watchImmediates` was called: I/O, timers that are not faked, and an import of
   * `setImmediate` from `node:timers` are invisible to it. So "nothing happened" after a
   * `settle()` means something only where the work answers on the global `setImmediate` and
   * `setTimeout` is faked (or the work has no timer).
   */
  settle(): Promise<void>;
  /** Gives `setImmediate` and `clearImmediate` back as they were. */
  restore(): void;
}

/**
 * Keeps the `setImmediate` callbacks that wait, so that a test can wait until work in the
 * background is done, whatever it is: the fakes answer on `setImmediate`, and with the timers
 * faked nothing else moves. For a test that must see what the work left behind at its end (a
 * timer it asked for, or none) and has nothing else to await, or that nothing happens while
 * something is held. `restore()` afterwards.
 */
export function watchImmediates(): ImmediateWatch {
  const globals = install();
  const waiting = new Set<NodeJS.Immediate>();
  watches.add(waiting);
  return {
    async settle() {
      // A turn of our own first: work started just now may still be in its microtasks. Each
      // callback's microtasks are done before the next callback runs.
      for (let round = 0; ; round++) {
        if (globalThis.setImmediate !== globals.counted) {
          throw new Error('setImmediate is not the watched one (faked?)');
        }
        if (round >= MAX_SETTLE_ROUNDS) {
          throw new Error(
            `the background never settled: ${String(waiting.size)} immediates still waiting`,
          );
        }
        await new Promise<void>((resolve) => {
          globals.set(resolve);
        });
        if (waiting.size === 0) return;
      }
    },
    restore() {
      watches.delete(waiting);
      if (watches.size === 0) uninstall();
    },
  };
}

/**
 * How many turns `settle()` lets pass before it gives up: work in the background that is still
 * asking for more after that never ends (a heartbeat that is watched, a loop).
 */
const MAX_SETTLE_ROUNDS = 10_000;

/** The callbacks each watch waits for; one pair of globals counts for all of them. */
const watches = new Set<Set<NodeJS.Immediate>>();

interface Installed {
  /** The globals as they were before the first watch. */
  set: typeof setImmediate;
  clear: typeof clearImmediate;
  /** The counting globals put in their place. */
  counted: typeof setImmediate;
  countedClear: typeof clearImmediate;
}

/** While any watch is on: the globals before and the counting ones. */
let installed: Installed | undefined;

/** Puts the counting globals in place (once for all watches). */
function install(): Installed {
  if (installed) return installed;
  const real = { set: globalThis.setImmediate, clear: globalThis.clearImmediate };
  const counted = (run: (...args: unknown[]) => void, ...args: unknown[]) => {
    const handle = real.set(() => {
      for (const waiting of watches) waiting.delete(handle);
      run(...args);
    });
    for (const waiting of watches) waiting.add(handle);
    return handle;
  };
  const countingSet = Object.assign(counted, {
    __promisify__: real.set.__promisify__,
  }) as typeof setImmediate;
  const countingClear = (handle: NodeJS.Immediate | undefined) => {
    if (handle !== undefined) for (const waiting of watches) waiting.delete(handle);
    real.clear(handle);
  };
  globalThis.setImmediate = countingSet;
  globalThis.clearImmediate = countingClear;
  installed = { ...real, counted: countingSet, countedClear: countingClear };
  return installed;
}

/**
 * Gives the globals back, each only while it is still the counting one: whoever put something
 * else in its place since (vi's fake timers) gives back what they found.
 */
function uninstall(): void {
  if (!installed) return;
  if (globalThis.setImmediate === installed.counted) globalThis.setImmediate = installed.set;
  if (globalThis.clearImmediate === installed.countedClear) {
    globalThis.clearImmediate = installed.clear;
  }
  installed = undefined;
}

/** `watchImmediates` from here to the end of the test, which gives the globals back. */
export function watchForTest(): ImmediateWatch {
  const immediates = watchImmediates();
  onTestFinished(() => {
    immediates.restore();
  });
  return immediates;
}

/**
 * For a test file or a `describe` whose tests settle the background: every test's immediates
 * are watched from its start (`beforeEach`) to its end. `settle()` is the running test's.
 */
export function watchEachTest(): { settle(): Promise<void> } {
  let current: ImmediateWatch | undefined;
  beforeEach(() => {
    current = watchImmediates();
  });
  afterEach(() => {
    current?.restore();
    current = undefined;
  });
  return {
    settle() {
      if (!current) throw new Error('settle() is for the body of a test');
      return current.settle();
    },
  };
}

/**
 * From here to the end of the test: `setTimeout` and `clearTimeout` are faked (`Date` too when
 * `now` is given) and the immediates watched, so that `settle()` waits until the work in the
 * background is done, and "nothing has happened yet" can be asserted after it. Both are undone
 * when the test finishes. Call it after the setup when the setup needs real timers.
 */
export function watchBackground(now?: number): ImmediateWatch {
  vi.useFakeTimers(
    now === undefined
      ? { toFake: ['setTimeout', 'clearTimeout'] }
      : { toFake: ['Date', 'setTimeout', 'clearTimeout'], now },
  );
  const immediates = watchImmediates();
  onTestFinished(() => {
    immediates.restore();
    vi.useRealTimers();
  });
  return immediates;
}

/** What `fakeTimeoutSignals` gives a test. */
export interface TimeoutSignals {
  /** The signals made so far, as a count a test can wait for. */
  readonly made: Tally;
  /** The time each signal was made for, in order. */
  readonly lengths: number[];
  /**
   * The time is up: every signal made so far aborts as its time running out would
   * (`TimeoutError`), and every one made from now on is aborted already.
   */
  expire(): void;
}

const timedOut = (): DOMException =>
  new DOMException('The operation was aborted due to timeout', 'TimeoutError');

/**
 * From here to the end of the test, `AbortSignal.timeout(ms)` gives a signal that aborts only
 * when the test calls `expire()`: the time limit of a download or a request without real time
 * (vi's fake timers do not reach the timer of `AbortSignal.timeout`). A fake that stalls must
 * then, like `fetch`, reject at once for a signal that is aborted already. After `expire()`
 * every new signal starts aborted, so a test of a retry with a fresh limit cannot use it.
 */
export function fakeTimeoutSignals(): TimeoutSignals {
  const made = new Tally('the time limits made');
  const lengths: number[] = [];
  const controllers: AbortController[] = [];
  let expired = false;
  const spy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    const controller = new AbortController();
    if (expired) controller.abort(timedOut());
    controllers.push(controller);
    lengths.push(ms);
    made.add();
    return controller.signal;
  });
  onTestFinished(() => {
    spy.mockRestore();
  });
  return {
    made,
    lengths,
    expire() {
      expired = true;
      for (const controller of controllers) {
        if (!controller.signal.aborted) controller.abort(timedOut());
      }
    },
  };
}
