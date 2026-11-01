/**
 * Runs work one after the other per key: a second call for the same key starts only when the
 * first has finished, whether it succeeded or not. Calls for different keys do not wait for
 * each other. In one process only, which is all Pine has.
 */
export class KeyedLock<K> {
  private readonly tails = new Map<K, Promise<unknown>>();
  private readonly counts = new Map<K, number>();

  run<T>(key: K, work: () => T | Promise<T>): Promise<T> {
    const before = this.tails.get(key) ?? Promise.resolve();
    this.counts.set(key, this.pending(key) + 1);
    const result = before.then(work).finally(() => {
      const left = this.pending(key) - 1;
      if (left > 0) this.counts.set(key, left);
      else this.counts.delete(key);
    });
    const tail = result.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  /** How many calls for a key have not finished: the one running and those waiting behind it. */
  pending(key: K): number {
    return this.counts.get(key) ?? 0;
  }

  /**
   * Resolves once no work is running or waiting for any key (at once when there is none),
   * including work queued while it waits. Never rejects, whatever the work did.
   */
  async whenIdle(): Promise<void> {
    while (this.tails.size > 0) {
      await Promise.all([...this.tails.values()]);
      // Lets the clean-up of the finished keys run before the next look.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  /** Keys with work running or waiting. */
  get size(): number {
    return this.tails.size;
  }
}
