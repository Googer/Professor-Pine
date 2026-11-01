import { describe, expect, it } from 'vitest';
import { PendingRequests } from './pending-requests.js';

const ALICE = '200000000000000002';
const BOB = '200000000000000003';

describe('PendingRequests', () => {
  it('gives a value back once, to the member who put it there', () => {
    const pending = new PendingRequests<string>();
    const token = pending.put(ALICE, 'report');
    expect(token).toMatch(/^[0-9a-f]{16}$/);
    expect(pending.take(token, BOB)).toBe('not-yours');
    expect(pending.take(token, ALICE)).toEqual({ value: 'report' });
    expect(pending.take(token, ALICE)).toBe('expired');
    expect(pending.take('0000000000000000', ALICE)).toBe('expired');
  });

  it('forgets a request after its time', () => {
    let now = 1_000;
    const pending = new PendingRequests<string>({ ttlMs: 600_000, now: () => now });
    const token = pending.put(ALICE, 'report');
    now += 599_999;
    const other = pending.put(ALICE, 'second');
    now += 1;
    expect(pending.take(token, ALICE)).toBe('expired');
    expect(pending.take(other, ALICE)).toEqual({ value: 'second' });
  });

  it('never holds more than its maximum: the oldest go first', () => {
    const pending = new PendingRequests<number>({ max: 3 });
    const tokens = [1, 2, 3, 4, 5].map((n) => pending.put(ALICE, n));
    expect(pending.size).toBe(3);
    expect(pending.take(tokens[0] ?? '', ALICE)).toBe('expired');
    expect(pending.take(tokens[1] ?? '', ALICE)).toBe('expired');
    expect(pending.take(tokens[4] ?? '', ALICE)).toEqual({ value: 5 });
  });

  it('lets its owner look at a value without taking it', () => {
    let now = 1_000;
    const pending = new PendingRequests<string>({ ttlMs: 600_000, now: () => now });
    const token = pending.put(ALICE, 'report');
    expect(pending.peek(token, BOB)).toBe('not-yours');
    expect(pending.peek(token, ALICE)).toEqual({ value: 'report' });
    expect(pending.peek(token, ALICE)).toEqual({ value: 'report' });
    expect(pending.size).toBe(1);
    expect(pending.take(token, ALICE)).toEqual({ value: 'report' });
    expect(pending.peek(token, ALICE)).toBe('expired');
    // Looking does not keep a request alive.
    const old = pending.put(ALICE, 'old');
    now += 599_999;
    expect(pending.peek(old, ALICE)).toEqual({ value: 'old' });
    now += 1;
    expect(pending.peek(old, ALICE)).toBe('expired');
    expect(pending.size).toBe(0);
  });

  it('puts a value again under a token it names, which replaces the one before', () => {
    const pending = new PendingRequests<number>({ max: 3 });
    const kept = pending.put(BOB, 0);
    const token = pending.put(ALICE, 1);
    for (let n = 2; n < 10; n++) expect(pending.put(ALICE, n, token)).toBe(token);
    expect(pending.size).toBe(2);
    expect(pending.peek(kept, BOB)).toEqual({ value: 0 });
    expect(pending.take(token, ALICE)).toEqual({ value: 9 });
    // Once taken, the same token can be put again.
    expect(pending.put(ALICE, 10, token)).toBe(token);
    expect(pending.take(token, ALICE)).toEqual({ value: 10 });
  });
});
