import { describe, expect, it } from 'vitest';
import { ReadsBetweenWrites } from './reads-between-writes.js';

/** A load whose answers are counted; `hold()` keeps the next answer until its `release`. */
function counted() {
  let value = 0;
  let loads = 0;
  let held: PromiseWithResolvers<void> | undefined;
  const load = async (): Promise<number> => {
    loads += 1;
    const read = value;
    const waiting = held;
    held = undefined;
    if (waiting) await waiting.promise;
    return read;
  };
  return {
    load,
    set: (next: number) => {
      value = next;
    },
    loads: () => loads,
    hold: () => {
      const waiting = Promise.withResolvers<void>();
      held = waiting;
      return () => {
        waiting.resolve();
      };
    },
  };
}

describe('ReadsBetweenWrites', () => {
  it('keeps a read until a write, by key', async () => {
    const reads = new ReadsBetweenWrites<string, number>(10);
    const store = counted();
    store.set(1);
    expect(await reads.read('a', store.load)).toBe(1);
    expect(await reads.read('a', store.load)).toBe(1);
    expect(store.loads()).toBe(1);
    expect(await reads.read('b', store.load)).toBe(1);
    expect(store.loads()).toBe(2);
    await reads.writing(() => {
      store.set(2);
      return Promise.resolve();
    });
    expect(await reads.read('a', store.load)).toBe(2);
    expect(store.loads()).toBe(3);
  });

  it('keeps no read that a write began before and ended after', async () => {
    const reads = new ReadsBetweenWrites<string, number>(10);
    const store = counted();
    store.set(1);
    const written = Promise.withResolvers<void>();
    const write = reads.writing(() => written.promise);
    // The read sees the value before the write lands.
    expect(await reads.read('a', store.load)).toBe(1);
    store.set(2);
    written.resolve();
    await write;
    expect(await reads.read('a', store.load)).toBe(2);
    expect(store.loads()).toBe(2);
  });

  it('keeps no read that a write landed during', async () => {
    const reads = new ReadsBetweenWrites<string, number>(10);
    const store = counted();
    store.set(1);
    const release = store.hold();
    const before = reads.read('a', store.load);
    await reads.writing(() => {
      store.set(2);
      return Promise.resolve();
    });
    release();
    expect(await before).toBe(1);
    expect(await reads.read('a', store.load)).toBe(2);
  });

  it('counts a write whose work failed', async () => {
    const reads = new ReadsBetweenWrites<string, number>(10);
    const store = counted();
    store.set(1);
    expect(await reads.read('a', store.load)).toBe(1);
    store.set(2);
    await expect(
      reads.writing(() => Promise.reject(new Error('the database is away'))),
    ).rejects.toThrow('the database is away');
    expect(await reads.read('a', store.load)).toBe(2);
  });

  it('shares a read in flight, and reads anew where the kept one is not usable once it lands', async () => {
    const reads = new ReadsBetweenWrites<string, number>(10);
    const store = counted();
    store.set(1);
    const release = store.hold();
    const first = reads.read('a', store.load);
    const second = reads.read('a', store.load);
    // Not usable: waits for the read in flight, then reads again.
    store.set(2);
    const third = reads.read('a', store.load, (value) => value >= 2);
    release();
    expect([await first, await second, await third]).toEqual([1, 1, 2]);
    expect(store.loads()).toBe(2);
    // The new read is the one kept.
    expect(await reads.read('a', store.load)).toBe(2);
    expect(store.loads()).toBe(2);
  });

  it('keeps no failed read', async () => {
    const reads = new ReadsBetweenWrites<string, number>(10);
    let fail = true;
    const load = () => (fail ? Promise.reject(new Error('away')) : Promise.resolve(3));
    await expect(reads.read('a', load)).rejects.toThrow('away');
    fail = false;
    expect(await reads.read('a', load)).toBe(3);
  });
});
