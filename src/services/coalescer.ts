/**
 * Runs work per key, however often it is asked for, with at least `delayMs` between the starts
 * of two runs of one key. The first request after a quiet time (the last run started `delayMs`
 * ago or more, or never) runs at once; requests that come sooner are gathered into one run that
 * starts `delayMs` after the last start. A request made while the work is running leads to one
 * more run after it, which respects the delay as well. Work for one key never overlaps itself.
 * Failures go to `onError`; they never stop later runs.
 *
 * This is what keeps the edits of a post few: the first change shows at once, and a burst of
 * changes after it is one edit.
 */
export class Coalescer<K> {
  private readonly waiting = new Map<K, NodeJS.Timeout>();
  private readonly running = new Map<K, Promise<void>>();
  private readonly lastStart = new Map<K, number>();
  private readonly again = new Set<K>();
  private stopped = false;

  constructor(
    private readonly options: {
      delayMs: number;
      work: (key: K) => Promise<void>;
      onError: (err: unknown, key: K) => void;
    },
  ) {}

  /** Asks for a run for this key. Returns at once. */
  request(key: K): void {
    if (this.stopped) return;
    this.schedule(key);
  }

  private schedule(key: K): void {
    if (this.running.has(key)) {
      this.again.add(key);
      return;
    }
    if (this.waiting.has(key)) return;
    const last = this.lastStart.get(key);
    const wait = last === undefined ? 0 : this.options.delayMs - (Date.now() - last);
    if (wait <= 0) {
      this.start(key);
      return;
    }
    const timer = setTimeout(() => {
      this.waiting.delete(key);
      this.start(key);
    }, wait);
    timer.unref();
    this.waiting.set(key, timer);
  }

  private start(key: K): void {
    const now = Date.now();
    // A key idle for longer than the delay would run at once anyway: it needs no memory.
    for (const [other, at] of this.lastStart) {
      if (
        other !== key &&
        now - at >= this.options.delayMs &&
        !this.waiting.has(other) &&
        !this.running.has(other)
      ) {
        this.lastStart.delete(other);
      }
    }
    this.lastStart.set(key, now);
    // Marked as running before the work is called, so that a request made by the work itself is
    // queued behind it.
    this.running.set(key, Promise.resolve());
    let work: Promise<void>;
    try {
      work = this.options.work(key);
    } catch (err) {
      work = Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    const run = work
      .catch((err: unknown) => {
        try {
          this.options.onError(err, key);
        } catch {
          // A failing error handler must not stop the runs that follow.
        }
      })
      .finally(() => {
        this.running.delete(key);
        if (this.again.delete(key)) this.schedule(key);
      });
    this.running.set(key, run);
  }

  /**
   * Runs everything that is waiting now and resolves once nothing is waiting or running any
   * more, including runs asked for meanwhile. For shutdown and for tests.
   */
  async flush(): Promise<void> {
    for (;;) {
      for (const [key, timer] of [...this.waiting]) {
        clearTimeout(timer);
        this.waiting.delete(key);
        this.start(key);
      }
      if (this.running.size === 0) return;
      await Promise.all(this.running.values());
    }
  }

  /**
   * Resolves once no run for this key is going on, including one that follows it at once. A run
   * that is waiting for its delay is not started.
   */
  async idle(key: K): Promise<void> {
    for (let run = this.running.get(key); run; run = this.running.get(key)) await run;
  }

  /** Whether a run for this key is waiting for its delay or going on. */
  busy(key: K): boolean {
    return this.waiting.has(key) || this.running.has(key);
  }

  /** Refuses every later request, then flushes. */
  async stop(): Promise<void> {
    this.stopped = true;
    await this.flush();
  }

  /** How many keys have a last start remembered (for tests). */
  get tracked(): number {
    return this.lastStart.size;
  }

  /** Keys with a run waiting or going on. */
  get pending(): number {
    return new Set([...this.waiting.keys(), ...this.running.keys()]).size;
  }
}
