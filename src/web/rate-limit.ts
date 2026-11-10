import type { FastifyReply, FastifyRequest } from 'fastify';
import { BoundedMap } from '../bounded-map.js';
import { sendFailure } from './answers.js';
import { addressBucket } from './client-address.js';
import type { Sessions } from './sessions.js';

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

/**
 * A hook that counts every request of the routes it is on against whoever is logged in (plan
 * 8Z-2: the session's member, from however many addresses and sessions) and refuses one over
 * the limit with 429 and `Retry-After`; a request without a session passes uncounted. A member
 * with a routed IPv6 prefix has thousands of /64s, each a client of its own to
 * `limitedPerAddress`: a read for members has both hooks, this one after the per-address one,
 * with a limiter of its own of the same number (its keys are members' ids).
 */
export function limitedPerMember(
  limiter: RateLimiter,
  options: { now: () => number; sessions: Pick<Sessions, 'of'> },
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await options.sessions.of(request, reply);
    if (!session) return;
    const answer = limiter.take(session.userId, options.now());
    if (answer.ok) return;
    void reply.header('retry-after', String(answer.retryAfterSeconds));
    return sendFailure(request, reply, 429);
  };
}

/**
 * The hooks of a read for members, in their order (plan 8Z-2): at most `uses` a minute from
 * one address (`limitedPerAddress`), then as many by one member (`limitedPerMember`). Routes
 * that share a limit share the hooks.
 */
export function limitedRead(uses: number, options: ReadLimitOptions & { sessions: Sessions }) {
  return [
    limitedPerAddress(readLimiter(uses, options), options),
    limitedPerMember(readLimiter(uses, options), options),
  ];
}

/** What the limiters of the reads are made with (`WebDeps`). */
export interface ReadLimitOptions {
  now: () => number;
  /** The number a read's limit allows instead of its own (`WebDeps.readUses`, for tests). */
  readUses?: ((uses: number) => number) | undefined;
}

/**
 * A limiter of reads, `uses` a minute (`readUses` of it where the deps give one: F-B9, a test
 * of every read's hooks lowers them all at once).
 */
export function readLimiter(uses: number, options: ReadLimitOptions): RateLimiter {
  return new RateLimiter({ uses: options.readUses?.(uses) ?? uses, perMs: 60_000 });
}
