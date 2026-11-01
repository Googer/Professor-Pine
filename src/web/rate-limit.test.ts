import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limit.js';

describe('RateLimiter', () => {
  it('lets an address through as often as allowed in a window, then says how long to wait', () => {
    const limiter = new RateLimiter({ uses: 3, perMs: 60_000 });
    expect(limiter.take('203.0.113.7', 0)).toEqual({ ok: true });
    expect(limiter.take('203.0.113.7', 10_000)).toEqual({ ok: true });
    expect(limiter.take('203.0.113.7', 20_000)).toEqual({ ok: true });
    expect(limiter.take('203.0.113.7', 30_000)).toEqual({ ok: false, retryAfterSeconds: 30 });
    // Another address has its own window.
    expect(limiter.take('203.0.113.8', 30_000)).toEqual({ ok: true });
    // The window starts anew once it has passed.
    expect(limiter.take('203.0.113.7', 60_000)).toEqual({ ok: true });
  });

  it('counts a refused use too, and rounds the wait up to a whole second', () => {
    const limiter = new RateLimiter({ uses: 1, perMs: 1_000 });
    expect(limiter.take('a', 0).ok).toBe(true);
    expect(limiter.take('a', 1)).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(limiter.take('a', 999)).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(limiter.take('a', 1_000).ok).toBe(true);
  });

  it('remembers a bounded number of addresses, the oldest going first', () => {
    const limiter = new RateLimiter({ uses: 1, perMs: 60_000, addresses: 2 });
    limiter.take('a', 0);
    limiter.take('b', 0);
    limiter.take('c', 0);
    // `a` was forgotten: it starts anew.
    expect(limiter.take('a', 1).ok).toBe(true);
    expect(limiter.take('c', 1).ok).toBe(false);
  });
});
