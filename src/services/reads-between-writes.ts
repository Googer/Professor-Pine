import { BoundedMap } from '../bounded-map.js';

/**
 * Reads of a store kept until its owner writes to it again (the map's lists, polled by every map
 * open: plan map-speed). For a store that only its owner writes in this process: the owner runs
 * every write through `writing`, which counts it where it begins and where it ends, so that a read
 * kept is what a read now would give. A read that a write began or ended during is not kept, nor
 * one that failed; asks that come together share one read. `max` keys at most (oldest out).
 */
export class ReadsBetweenWrites<K, V> {
  /** The writes begun and ended (`writing`: one at the start of each and one at its end). */
  private writes = 0;
  private readonly kept: BoundedMap<K, { writes: number; value: Promise<V> }>;

  constructor(max: number) {
    this.kept = new BoundedMap(max);
  }

  /** A write to the store, counted where it begins and where it ends. */
  async writing<T>(work: () => Promise<T>): Promise<T> {
    this.writes += 1;
    try {
      return await work();
    } finally {
      this.writes += 1;
    }
  }

  /**
   * What `load` gives for `key`: the read kept where no write began or ended since it started and
   * `usable` takes it, else a new one.
   */
  async read(
    key: K,
    load: () => Promise<V>,
    usable: (value: V) => boolean = () => true,
  ): Promise<V> {
    const kept = this.kept.get(key);
    if (kept?.writes === this.writes) {
      const value = await kept.value;
      if (usable(value)) return value;
    }
    const read = { writes: this.writes, value: load() };
    this.kept.set(key, read);
    read.value.catch(() => {
      if (this.kept.get(key) === read) this.kept.delete(key);
    });
    return read.value;
  }
}
