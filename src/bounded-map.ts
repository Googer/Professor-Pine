/**
 * A map that holds `max` entries at most: when one more is set, the one set longest ago goes
 * first ("oldest out"). Setting a key again makes it the newest. For what is remembered in
 * memory for as long as the bot runs (answers of Discord, members that were met, what was told),
 * so that none of it grows without end; what is forgotten only costs the work again.
 *
 * Time is the user's own: a value that is good only for a while carries its time, and whoever
 * sets entries in the order of those times can free the old ones with `dropWhile`.
 */
export class BoundedMap<K, V> {
  // A Map keeps the order in which its entries were added: its first key is the oldest.
  private readonly entries = new Map<K, V>();
  private readonly max: number;

  /** `max` is at least one. */
  constructor(max: number) {
    this.max = Math.max(1, Math.floor(max));
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: K): boolean {
    return this.entries.has(key);
  }

  get(key: K): V | undefined {
    return this.entries.get(key);
  }

  /** Sets an entry as the newest; the oldest ones go while there are too many. */
  set(key: K, value: V): void {
    this.entries.delete(key);
    while (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    this.entries.set(key, value);
  }

  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  /**
   * Removes entries from the oldest on for as long as `stale` says so, and stops at the first
   * that is kept: for entries that were set in the order in which they run out.
   */
  dropWhile(stale: (value: V, key: K) => boolean): void {
    for (const [key, value] of this.entries) {
      if (!stale(value, key)) return;
      this.entries.delete(key);
    }
  }

  /** The keys, oldest first. */
  keys(): K[] {
    return [...this.entries.keys()];
  }
}
