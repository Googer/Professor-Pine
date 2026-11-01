import { describe, expect, it } from 'vitest';
import { emptyEdits, newKey, record, serialiseEdits } from '../../domain/regions/edits.js';
import {
  browserStorage,
  readMoveTogether,
  readStaged,
  stagedRegions,
  storageKey,
  writeMoveTogether,
  writeStaged,
  type KeyValueStorage,
} from './staged-storage.js';

class MemoryStorage implements KeyValueStorage {
  readonly items = new Map<string, string>();
  failing = false;
  /** Full, as a browser's storage for a page is past its few megabytes. */
  full = false;

  getItem(key: string): string | null {
    if (this.failing) throw new Error('SecurityError');
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failing) throw new Error('SecurityError');
    if (this.full)
      throw Object.assign(new Error('The quota has been exceeded.'), {
        name: 'QuotaExceededError',
      });
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failing) throw new Error('SecurityError');
    this.items.delete(key);
  }
}

const KEY = 'pine-region-edits:1:2';
const STAGED = record(emptyEdits(), {
  kind: 'add',
  key: newKey(0),
  outline: [
    { lat: 40, lon: -80 },
    { lat: 40.1, lon: -80 },
    { lat: 40.1, lon: -79.9 },
    { lat: 40, lon: -80 },
  ],
  channel: null,
  description: null,
});

describe('staged edits in the browser', () => {
  it('are kept, read back, and taken away once nothing is staged', () => {
    const storage = new MemoryStorage();
    expect(writeStaged(storage, KEY, STAGED)).toBe('kept');
    expect(readStaged(storage, KEY)).toEqual(STAGED);
    expect(writeStaged(storage, KEY, emptyEdits())).toBe('kept');
    expect(storage.items.has(KEY)).toBe(false);
    expect(readStaged(storage, KEY)).toEqual(emptyEdits());
  });

  it('are none where the browser keeps nothing, or keeps something else', () => {
    const storage = new MemoryStorage();
    storage.items.set(KEY, '{"not":"edits"}');
    expect(readStaged(storage, KEY)).toEqual(emptyEdits());
    storage.failing = true;
    expect(readStaged(storage, KEY)).toEqual(emptyEdits());
    expect(writeStaged(storage, KEY, STAGED)).toBe('none');
    expect(readStaged(undefined, KEY)).toEqual(emptyEdits());
    expect(writeStaged(undefined, KEY, STAGED)).toBe('none');
  });

  it('are not kept where the storage is full, which is said apart', () => {
    const storage = new MemoryStorage();
    storage.full = true;
    expect(writeStaged(storage, KEY, STAGED)).toBe('full');
    expect(writeStaged(storage, KEY, emptyEdits())).toBe('kept');
  });

  it('are none where even asking for the storage throws, as a sandboxed page does', () => {
    const storage = new MemoryStorage();
    expect(browserStorage(() => storage)).toBe(storage);
    expect(
      browserStorage(() => {
        throw new Error('SecurityError');
      }),
    ).toBeUndefined();
  });
});

describe('"Move shared corners together" (plan 8M-10, C13)', () => {
  it('is on until the browser keeps it off, and is remembered per browser', () => {
    const storage = new MemoryStorage();
    expect(readMoveTogether(storage)).toBe(true);
    writeMoveTogether(storage, false);
    expect(readMoveTogether(storage)).toBe(false);
    writeMoveTogether(storage, true);
    expect(readMoveTogether(storage)).toBe(true);
    // What the browser keeps under its name but is no choice of ours: on.
    storage.items.set('pine-region-move-together', 'maybe');
    expect(readMoveTogether(storage)).toBe(true);
  });

  it('is on, and never throws, where the browser keeps nothing', () => {
    const storage = new MemoryStorage();
    storage.failing = true;
    expect(readMoveTogether(storage)).toBe(true);
    expect(() => writeMoveTogether(storage, false)).not.toThrow();
    expect(readMoveTogether(undefined)).toBe(true);
    expect(() => writeMoveTogether(undefined, false)).not.toThrow();
  });
});

// Plan 8M-11C, S31: "Edit regions · 3 unsaved" on the map, by the member `/api/me` names.
describe("the regions staged for a server's member", () => {
  it('are counted from what the browser keeps for that server and member alone', () => {
    const storage = new MemoryStorage();
    storage.items.set(storageKey('1', '2'), serialiseEdits(STAGED));
    expect(stagedRegions(storage, '1', '2')).toBe(1);
    expect(stagedRegions(storage, '1', '3')).toBe(0);
    expect(stagedRegions(storage, '4', '2')).toBe(0);
  });

  it('are none where the browser keeps nothing or refuses to be read', () => {
    const storage = new MemoryStorage();
    storage.items.set(storageKey('1', '2'), serialiseEdits(STAGED));
    storage.failing = true;
    expect(stagedRegions(storage, '1', '2')).toBe(0);
    expect(stagedRegions(undefined, '1', '2')).toBe(0);
    storage.failing = false;
    storage.items.set(storageKey('1', '2'), 'not ours');
    expect(stagedRegions(storage, '1', '2')).toBe(0);
  });
});
