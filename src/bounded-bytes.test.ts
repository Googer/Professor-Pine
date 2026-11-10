import { describe, expect, it } from 'vitest';
import { BoundedBytes } from './bounded-bytes.js';

const kept = (maxBytes: number) => new BoundedBytes<string, Buffer>(maxBytes, (b) => b.length);

describe('BoundedBytes', () => {
  it('keeps values up to its bytes in all, the oldest going first', () => {
    const bytes = kept(10);
    bytes.set('a', Buffer.alloc(4));
    bytes.set('b', Buffer.alloc(4));
    expect(bytes.bytes).toBe(8);
    // Six more need both gone: 4 + 6 fits, 8 + 6 does not.
    bytes.set('c', Buffer.alloc(6));
    expect(bytes.get('a')).toBeUndefined();
    expect(bytes.get('b')).toHaveLength(4);
    expect(bytes.get('c')).toHaveLength(6);
    expect(bytes.bytes).toBe(10);
    bytes.set('d', Buffer.alloc(5));
    expect([bytes.get('b'), bytes.get('c')]).toEqual([undefined, undefined]);
    expect(bytes.size).toBe(1);
    expect(bytes.bytes).toBe(5);
  });

  it('makes a key set again the newest, counting its new size alone', () => {
    const bytes = kept(10);
    bytes.set('a', Buffer.alloc(4));
    bytes.set('b', Buffer.alloc(4));
    bytes.set('a', Buffer.alloc(2));
    expect(bytes.bytes).toBe(6);
    // `b` is the oldest now.
    bytes.set('c', Buffer.alloc(8));
    expect(bytes.get('b')).toBeUndefined();
    expect(bytes.get('a')).toHaveLength(2);
    expect(bytes.bytes).toBe(10);
  });

  it('keeps nothing larger than the whole bound, and forgets what was under its key', () => {
    const bytes = kept(10);
    bytes.set('a', Buffer.alloc(4));
    bytes.set('a', Buffer.alloc(11));
    expect(bytes.get('a')).toBeUndefined();
    expect(bytes.bytes).toBe(0);
    bytes.set('b', Buffer.alloc(10));
    expect(bytes.get('b')).toHaveLength(10);
  });

  it('forgets a deleted value and its bytes', () => {
    const bytes = kept(10);
    bytes.set('a', Buffer.alloc(4));
    expect(bytes.delete('a')).toBe(true);
    expect(bytes.delete('a')).toBe(false);
    expect([bytes.bytes, bytes.size]).toEqual([0, 0]);
  });
});
