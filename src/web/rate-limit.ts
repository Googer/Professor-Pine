import type { FastifyReply, FastifyRequest } from 'fastify';
import { BoundedMap } from '../bounded-map.js';
import { sendFailure } from './answers.js';
import { addressBucket } from './client-address.js';

/** How many addresses a limiter remembers at most. */
const ADDRESSES = 10_000;

export type RateAnswer = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Requests per client address in fixed windows (spec 5: the login pages and the public data):
 * at most `uses` in `perMs`, counted from an address's first request of a window; a refused
 * request counts too. Kept in memory for at most `addresses` addresses (oldest out: what is
 * forgotten starts anew). The time is the caller's.
 */
export class RateLimiter {
  private readonly windows: BoundedMap<string, { start: number; used: number }>;

  constructor(private readonly limit: { uses: number; perMs: number; addresses?: number }) {
    this.windows = new BoundedMap(limit.addresses ?? ADDRESSES);
  }

  /** Counts a request of this address; whether it may go through, else how long to wait. */
  take(address: string, now: number): RateAnswer {
    const kept = this.windows.get(address);
    const window = kept && now - kept.start < this.limit.perMs ? kept : { start: now, used: 0 };
    window.used += 1;
    this.windows.set(address, window);
    if (window.used <= this.limit.uses) return { ok: true };
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((window.start + this.limit.perMs - now) / 1000)),
    };
  }
}

/**
 * A hook that counts every request of the routes it is on against the client (`addressBucket`
 * of Fastify's `request.ip`) and refuses one over the limit with 429 and `Retry-After`.
 */
export function limitedPerAddress(limiter: RateLimiter, options: { now: () => number }) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const answer = limiter.take(addressBucket(request.ip), options.now());
    if (answer.ok) return;
    void reply.header('retry-after', String(answer.retryAfterSeconds));
    return sendFailure(request, reply, 429);
  };
}
