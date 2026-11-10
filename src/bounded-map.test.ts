import { describe, expect, it } from 'vitest';
import { BoundedMap } from './bounded-map.js';

describe('BoundedMap', () => {
  it('keeps what was set, and answers undefined for what was not', () => {
    const map = new BoundedMap<string, number>(3);
    map.set('a', 1);
    expect(map.get('a')).toBe(1);
    expect(map.has('a')).toBe(true);
    expect(map.get('b')).toBeUndefined();
    expect(map.has('b')).toBe(false);
    expect(map.size).toBe(1);
    expect(map.delete('a')).toBe(true);
    expect(map.delete('a')).toBe(false);
    expect(map.size).toBe(0);
  });

  it('lets the oldest go when one more than it holds is set', () => {
    const map = new BoundedMap<string, number>(3);
    for (const [n, key] of ['a', 'b', 'c', 'd', 'e'].entries()) map.set(key, n);
    expect(map.keys()).toEqual(['c', 'd', 'e']);
    expect(map.size).toBe(3);
  });

  it('makes a key that is set again the newest, without losing another for it', () => {
    const map = new BoundedMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    map.set('a', 4);
    expect(map.keys()).toEqual(['b', 'c', 'a']);
    expect(map.get('a')).toBe(4);
    map.set('d', 5);
    expect(map.keys()).toEqual(['c', 'a', 'd']);
  });

  it('holds one entry at least, whatever it is told', () => {
    const map = new BoundedMap<string, number>(0);
    map.set('a', 1);
    map.set('b', 2);
    expect(map.keys()).toEqual(['b']);
  });

  it('drops the stale entries from the oldest on and stops at the first that is kept', () => {
    const map = new BoundedMap<string, number>(10);
    map.set('a', 10);
    map.set('b', 20);
    map.set('c', 5);
    map.set('d', 30);
    map.dropWhile((until) => until <= 20);
    expect(map.keys()).toEqual(['d']);
    const other = new BoundedMap<string, number>(10);
    other.set('a', 10);
    other.set('b', 40);
    other.set('c', 5);
    other.dropWhile((until, key) => until <= 20 && key !== 'x');
    // `c` is behind one that was kept: it stays until its turn comes.
    expect(other.keys()).toEqual(['b', 'c']);
  });
});
