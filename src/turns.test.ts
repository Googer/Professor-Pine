import { describe, expect, it } from 'vitest';
import { Turns } from './turns.js';

describe('Turns', () => {
  it('serves one item of each key in turn, each key’s in the order they came', () => {
    const turns = new Turns<string, string>();
    for (const item of ['h1', 'h2', 'h3']) turns.put('home', item);
    turns.put('away', 'a1');
    turns.put('away', 'a2');
    expect(turns.size).toBe(5);
    expect(turns.sizeOf('home')).toBe(3);
    const taken: (string | undefined)[] = [];
    for (let n = 0; n < 6; n++) taken.push(turns.take());
    expect(taken).toEqual(['h1', 'a1', 'h2', 'a2', 'h3', undefined]);
    expect(turns.size).toBe(0);
  });

  it('gives a key that comes its turn after those waiting already', () => {
    const turns = new Turns<string, string>();
    turns.put('home', 'h1');
    turns.put('home', 'h2');
    turns.put('away', 'a1');
    expect(turns.take()).toBe('h1');
    turns.put('third', 't1');
    expect([turns.take(), turns.take(), turns.take()]).toEqual(['a1', 'h2', 't1']);
  });

  it('says whether a key has an item, and gives everything back when cleared', () => {
    const turns = new Turns<number | null, string>();
    turns.put(1, 'x');
    turns.put(null, 'y');
    expect(turns.has(1, (item) => item === 'x')).toBe(true);
    expect(turns.has(1, (item) => item === 'y')).toBe(false);
    expect(turns.clear().sort()).toEqual(['x', 'y']);
    expect(turns.size).toBe(0);
    expect(turns.take()).toBeUndefined();
  });
});
