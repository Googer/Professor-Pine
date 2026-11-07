/**
 * Why a call of `KeyedLock.run` was refused: its key has been held longer than the lock's time
 * limit by work that has not settled (a save that never answers). The refused work never runs.
 */
export class LockOverdueError extends Error {
  override name = 'LockOverdueError';

  constructor(readonly key: unknown) {
    super(`The lock of ${String(key)} has been held past its time limit`);
  }
}

export interface KeyedLockOptions<K> {
  /**
   * How long one call may hold a key before the calls waiting for it, and those that come while
   * it still holds it, are refused (`LockOverdueError`). Without it a call waits as long as it
   * takes.
   */
  limitMs?: number;
  /** Told once per call that held its key past the limit: the key and the limit. */
  overdue?: (key: K, heldMs: number) => void;
}

/** A call that waits for its key. */
interface Waiter {
  work: () => unknown;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/** A key with work running: the calls waiting behind it, and whether it is past its limit. */
interface Held {
  waiting: Waiter[];
  overdue: boolean;
}

/**
 * Runs work one after the other per key: a second call for the same key starts only when the
 * first has finished, whether it succeeded or not. Calls for different keys do not wait for
 * each other. In one process only, which is all Pine has.
 *
 * With a time limit (`limitMs`), a call that holds its key longer is told about (`overdue`),
 * the calls waiting behind it are refused, and so is every call for that key until it settles:
 * then the key is free again. Two calls of one key never run at once.
 */
export class KeyedLock<K> {
  private readonly held = new Map<K, Held>();
  private idleWaiters: (() => void)[] = [];

  constructor(private readonly options: KeyedLockOptions<K> = {}) {}

  run<T>(key: K, work: () => T | Promise<T>): Promise<T> {
    const held = this.held.get(key);
    const result =
      held?.overdue === true
        ? Promise.reject(new LockOverdueError(key))
        : new Promise<T>((resolve, reject) => {
            const waiter: Waiter = {
              work,
              resolve: resolve as (value: unknown) => void,
              reject,
            };
            if (held) held.waiting.push(waiter);
            else {
              const fresh: Held = { waiting: [], overdue: false };
              this.held.set(key, fresh);
              this.start(key, fresh, waiter);
            }
          });
    // A caller that does not wait for its work (`void lock.run(…)`) does not hear of its failure
    // as an unhandled rejection: what fails is the caller's to catch where it waits.
    result.catch(() => undefined);
    return result;
  }

  /** Runs one call that now holds its key, then hands the key to the next one waiting. */
  private start(key: K, held: Held, waiter: Waiter): void {
    const { limitMs } = this.options;
    const timer =
      limitMs === undefined
        ? undefined
        : setTimeout(() => {
            held.overdue = true;
            const refused = held.waiting;
            held.waiting = [];
            for (const one of refused) one.reject(new LockOverdueError(key));
            this.options.overdue?.(key, limitMs);
          }, limitMs);
    timer?.unref();
    // The key is handed on before the caller hears: whoever awaited it may ask for it again.
    const settled = (answer: () => void): void => {
      if (timer !== undefined) clearTimeout(timer);
      this.handOn(key, held);
      answer();
    };
    void Promise.resolve()
      .then(waiter.work)
      .then(
        (value) => settled(() => waiter.resolve(value)),
        (err: unknown) => settled(() => waiter.reject(err)),
      );
  }

  /** Gives a key that was just let go to the next call waiting for it, or frees it. */
  private handOn(key: K, held: Held): void {
    held.overdue = false;
    const next = held.waiting.shift();
    if (next) {
      this.start(key, held, next);
      return;
    }
    this.held.delete(key);
    if (this.held.size === 0) {
      const told = this.idleWaiters;
      this.idleWaiters = [];
      for (const resolve of told) resolve();
    }
  }

  /** How many calls for a key have not finished: the one running and those waiting behind it. */
  pending(key: K): number {
    const held = this.held.get(key);
    return held === undefined ? 0 : 1 + held.waiting.length;
  }

  /**
   * Resolves once no work is running or waiting for any key (at once when there is none),
   * including work queued while it waits. Never rejects, whatever the work did.
   */
  async whenIdle(): Promise<void> {
    while (this.held.size > 0) {
      await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
      // Lets what the last callers do with their answers run before the next look (a caller's
      // own catch of a failure, as `StopPostService.flush` expects).
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  /** Keys with work running or waiting. */
  get size(): number {
    return this.held.size;
  }
}
