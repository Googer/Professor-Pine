/**
 * Values kept in memory up to `maxBytes` in all (plan 8Z-2), each counted by `sizeOf`: when one
 * more is set, the ones set longest ago go first ("oldest out", as `BoundedMap`, which bounds a
 * count). Setting a key again makes it the newest. A value larger than the whole bound is not
 * kept. For bytes that are read from a file or fetched again when they are forgotten: what is
 * forgotten only costs the work again.
 */
export class BoundedBytes<K, V> {
  // A Map keeps the order in which its entries were added: its first key is the oldest.
  private readonly entries = new Map<K, { value: V; size: number }>();
  private readonly max: number;
  private total = 0;

  constructor(
    maxBytes: number,
    private readonly sizeOf: (value: V) => number,
  ) {
    this.max = Math.max(0, Math.floor(maxBytes));
  }

  /** The bytes kept in all. */
  get bytes(): number {
    return this.total;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: K): V | undefined {
    return this.entries.get(key)?.value;
  }

  /** Sets a value as the newest; the oldest ones go while there are too many bytes. */
  set(key: K, value: V): void {
    this.delete(key);
    const size = Math.max(0, this.sizeOf(value));
    if (size > this.max) return;
    for (const [oldest, kept] of this.entries) {
      if (this.total + size <= this.max) break;
      this.entries.delete(oldest);
      this.total -= kept.size;
    }
    this.entries.set(key, { value, size });
    this.total += size;
  }

  delete(key: K): boolean {
    const kept = this.entries.get(key);
    if (kept === undefined) return false;
    this.entries.delete(key);
    this.total -= kept.size;
    return true;
  }
}
