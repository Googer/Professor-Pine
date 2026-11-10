import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MayCost } from '../services/costly.js';
import { sendFailure } from './answers.js';
import { RateLimiter } from './rate-limit.js';
import type { Sessions } from './sessions.js';

/**
 * The work that costs which visitors who are not logged in may cause in a minute, all of them
 * together (plan 8Z-2): a picture read from its folder or fetched from Discord's CDN, a
 * server's regions and gyms built anew. Each is done once and then answered from memory, so an
 * honest minute needs few (a restart's first pictures, a view after a gym changed); what a
 * flood of addresses could cause before had no bound at all.
 */
export const PUBLIC_COSTS_PER_MINUTE = 300;

/** The one key of the overall limit: it is nobody's own. */
const EVERYBODY = 'everybody';

/** What a route that anybody may ask does with the overall limit, for one request. */
export interface PublicCost {
  /**
   * Asked right before work that costs (`MayCost`): yes for whoever is logged in, uncounted;
   * else counted against the overall limit, and no once that is spent.
   */
  mayCost: MayCost;
  /** Answers the request where `mayCost` said no: 429 with `Retry-After`. */
  refuse(reply: FastifyReply): FastifyReply;
}

/**
 * The overall limit of the routes that cost without a session (`/api/geo`, `/emoji/<id>.png`,
 * `/pictures/<key>.png`; plan 8Z-2): one for all of them, not per address, counting only work
 * that costs (the services ask `mayCost` right before it) and only for requests without a
 * session; an answer from memory is never counted nor refused. The session is looked up only
 * when work is due, and never renewed (`Sessions.has`): these answers may be kept by others.
 */
export function publicCosts(options: {
  sessions: Pick<Sessions, 'has'>;
  now: () => number;
}): (request: FastifyRequest) => PublicCost {
  const limiter = new RateLimiter({ uses: PUBLIC_COSTS_PER_MINUTE, perMs: 60_000, addresses: 1 });
  return (request) => {
    let retryAfterSeconds = 60;
    return {
      mayCost: async () => {
        if (await options.sessions.has(request)) return true;
        const answer = limiter.take(EVERYBODY, options.now());
        if (answer.ok) return true;
        ({ retryAfterSeconds } = answer);
        return false;
      },
      refuse: (reply) => {
        void reply.header('retry-after', String(retryAfterSeconds));
        return sendFailure(request, reply, 429);
      },
    };
  };
}
