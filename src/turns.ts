/**
 * Items that wait in a line per key (a server: plan 19B-5), served in turns: one item of the
 * first key, which then goes to the back, then one of the next, so that one key's burst waits
 * behind the others' items rather than in front of them. Each key's items go in the order they
 * came. Only keys with an item waiting have a line; a key that comes gets its turn after those
 * waiting already.
 *
 * For short lines (a key's items are taken from the front of an array): the screenshot reader's
 * queue (`OcrService`), the posts shown anew (`PartyService`) and the gateway's requests for
 * members (`BudgetLine`, `member-directory.ts`). The DM queue, whose lines are
 * long and ordered by their events, has its own (`QueuedDmSender`).
 */
export class Turns<K, T> {
  /** In the order of the turns: the first is served next. */
  private readonly lines = new Map<K, T[]>();
  private count = 0;

  /** How many items wait, in all. */
  get size(): number {
    return this.count;
  }

  /** How many items of `key` wait. */
  sizeOf(key: K): number {
    return this.lines.get(key)?.length ?? 0;
  }

  /** The keys with an item waiting, with how many each, in the order of their turns. */
  waiting(): IterableIterator<[K, number]> {
    return [...this.lines].map(([key, line]): [K, number] => [key, line.length]).values();
  }

  put(key: K, item: T): void {
    const line = this.lines.get(key);
    if (line) line.push(item);
    else this.lines.set(key, [item]);
    this.count += 1;
  }

  /** Whether an item of `key` that `is` says is waiting. */
  has(key: K, is: (item: T) => boolean): boolean {
    return this.lines.get(key)?.some(is) ?? false;
  }

  /** The next item by the turns: the first key's oldest, that key to the back. */
  take(): T | undefined {
    const first = this.lines.entries().next();
    if (first.done === true) return undefined;
    const [key, line] = first.value;
    this.lines.delete(key);
    const item = line.shift();
    if (line.length > 0) this.lines.set(key, line);
    if (item !== undefined) this.count -= 1;
    return item;
  }

  /** Takes every item out; gives them. */
  clear(): T[] {
    const all = [...this.lines.values()].flat();
    this.lines.clear();
    this.count = 0;
    return all;
  }
}
