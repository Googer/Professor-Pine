import { KeyedLock } from './keyed-lock.js';

export interface GatheredOptions<T> {
  /** How long after the last change of a key its message goes out. */
  delayMs: number;
  /** Sends what was gathered for a key. What it throws goes to `onError`. */
  send: (key: string, gathered: T) => Promise<void>;
  /**
   * Makes one of what two messages of a key gathered, the older first: for a message that did
   * not go out before the next one of its key was waiting.
   */
  fold: (older: T, newer: T) => T;
  onError: (err: unknown, key: string) => void;
}

/**
 * Messages that are gathered: a change that calls for a message does not send it at once but
 * lets it wait, and a change of the same key (a party) that comes sooner starts the wait anew,
 * so that several quick changes are one message with one ping, about how things stand then.
 * The messages of one key go out one after the other, never overtaking each other.
 *
 * A message says how things stand when it is sent, so two of one key must not be due at once:
 * they would say the same. While a message is on its way (a send can take longer than the
 * delay), what comes after it for its key is one message: a message whose turn comes while
 * something waits again for its key is not sent, and what it gathered is folded into what waits
 * (`fold`).
 *
 * What waits is lost when the process stops without `flush` (a clean shutdown calls it).
 */
export class Gathered<T> {
  /** What waits for its delay, by key. */
  private readonly waiting = new Map<string, { gathered: T; cancel: () => void }>();
  /** What has waited for its delay and now waits for the message of its key that is on its way. */
  private readonly due = new Map<string, { gathered: T }>();
  /** The messages of one key go out one after the other. */
  private readonly chain = new KeyedLock<string>();
  /** Messages on their way; `flush` waits for them. */
  private readonly background = new Set<Promise<void>>();

  constructor(private readonly options: GatheredOptions<T>) {}

  /**
   * Has the message of `key` sent once nothing has changed for the delay. `merge` gets what was
   * waiting for the key (undefined when nothing was) and answers what waits now.
   */
  later(key: string, merge: (earlier: T | undefined) => T): void {
    const earlier = this.waiting.get(key);
    earlier?.cancel();
    const timer = setTimeout(() => {
      this.now(key);
    }, this.options.delayMs);
    timer.unref();
    this.waiting.set(key, {
      gathered: merge(earlier?.gathered),
      cancel: () => {
        clearTimeout(timer);
      },
    });
  }

  /**
   * What is gathered for a key and not sent yet, as one (`fold`): what is due behind a message
   * on its way and what waits for its delay; undefined when nothing is.
   */
  pending(key: string): T | undefined {
    const due = this.due.get(key)?.gathered;
    const waiting = this.waiting.get(key)?.gathered;
    if (due === undefined) return waiting;
    return waiting === undefined ? due : this.options.fold(due, waiting);
  }

  /**
   * Changes what is gathered for a key and not sent yet, without starting its wait anew: what
   * waits for its delay, else what is due behind a message on its way. False where nothing is.
   */
  amend(key: string, change: (gathered: T) => T): boolean {
    const pending = this.waiting.get(key) ?? this.due.get(key);
    if (pending === undefined) return false;
    pending.gathered = change(pending.gathered);
    return true;
  }

  /**
   * Forgets what waits for a key, unsent: for a change that makes what was gathered about it
   * meaningless. What is on its way already still goes out.
   */
  drop(key: string): void {
    this.waiting.get(key)?.cancel();
    this.waiting.delete(key);
    this.due.delete(key);
  }

  /**
   * Sends what waits for a key, after the message of that key that is on its way. It joins what
   * is due for that key already; and when its turn comes while something waits again, it joins
   * that instead of being sent.
   */
  private now(key: string): void {
    const { send, fold } = this.options;
    const pending = this.waiting.get(key);
    if (!pending) return;
    pending.cancel();
    this.waiting.delete(key);
    const ahead = this.due.get(key);
    if (ahead) {
      ahead.gathered = fold(ahead.gathered, pending.gathered);
      return;
    }
    const mine = { gathered: pending.gathered };
    this.due.set(key, mine);
    const run = this.chain
      .run(key, async () => {
        // Dropped while it waited for its turn.
        if (this.due.get(key) !== mine) return;
        this.due.delete(key);
        const again = this.waiting.get(key);
        if (again) {
          again.gathered = fold(mine.gathered, again.gathered);
          return;
        }
        await send(key, mine.gathered);
      })
      .catch((err: unknown) => {
        this.options.onError(err, key);
      })
      .finally(() => this.background.delete(run));
    this.background.add(run);
  }

  /**
   * Sends what waits for one key without waiting for its delay, and waits until that key's
   * messages are out: for a caller that needs the message as it stands now (a DM that links to
   * the post of the stops, plan 8R-1). Other keys keep their delay.
   */
  async flushKey(key: string): Promise<void> {
    while (this.waiting.has(key) || this.due.has(key)) {
      this.now(key);
      // Behind everything of the key in its chain: what was due has gone out by then.
      await this.chain.run(key, () => Promise.resolve());
    }
  }

  /**
   * Sends everything that waits without waiting for its delay, and waits for what is on its
   * way. For shutdown and for tests.
   */
  async flush(): Promise<void> {
    // A message that was folded into one that waits is waiting again.
    while (this.waiting.size > 0 || this.background.size > 0) {
      for (const key of [...this.waiting.keys()]) this.now(key);
      await Promise.all(this.background);
    }
  }
}
