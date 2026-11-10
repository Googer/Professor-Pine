import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MayCost } from '../services/costly.js';
import { sendFailure } from './answers.js';
import { addressBucket } from './client-address.js';
import { RateLimiter } from './rate-limit.js';
import type { Sessions } from './sessions.js';

/**
 * The stops' pictures read from their folder that visitors without a session may cause in a
 * minute, all of them together (plan 8Z-2; F-B3: a budget of its own). Discord's media proxy is
 * such a visitor: after a restart it asks for each picture the region boards' posts show the
 * first time it misses it in its own cache, and a day's posts show a few dozen distinct pictures
 * across every board (a reward's picture serves every board that shows it), at most six per
 * task; 300 is that burst several times over, in one minute.
 */
export const PICTURE_COSTS_PER_MINUTE = 300;

/**
 * The application's emoji fetched or read that visitors without a session may cause in a minute
 * (F-B3). Emoji are shown on the map's posts, which only members see, whose pages carry their
 * session and are counted by it (`MEMBER_COSTS_PER_MINUTE`); a visitor without one has little
 * reason to ask for any.
 */
export const EMOJI_COSTS_PER_MINUTE = 120;

/**
 * The servers' regions and gyms built anew for visitors without a session in a minute (F-B3):
 * a view is built after a gym changed, the regions loaded or the public regions changed, a few
 * a minute on a busy server; a visitor opening the public map is answered the kept view.
 */
export const GEO_COSTS_PER_MINUTE = 60;

/**
 * The work that costs one account may cause in a minute, of every kind together (F-B3: a session
 * no longer exempts, as anybody can log in with Discord): a member's page after a restart loads
 * the emoji its posts show, each once, and a view of the map or two.
 */
export const MEMBER_COSTS_PER_MINUTE = 60;

/**
 * The sessions one address may have looked up in a minute for misses that carry a session
 * cookie (F-B4): each is a read of the database, also once a budget is spent. Twice what one
 * account may cost (`MEMBER_COSTS_PER_MINUTE`): a household shares an address.
 */
export const COOKIE_LOOKUPS_PER_ADDRESS_MINUTE = 120;

/** The kinds of work that costs, each with a budget of its own for visitors without a session. */
export type CostKind = 'pictures' | 'emoji' | 'geo';

/** The limits of work that costs for one request of a kind (`publicCosts`). */
export type CostOf = (request: FastifyRequest, kind: CostKind) => PublicCost;

/** The one key of an overall limit: it is nobody's own. */
const EVERYBODY = 'everybody';

/** What a route that anybody may ask does with the limits of work that costs, for one request. */
export interface PublicCost {
  /**
   * Asked right before work that costs (`MayCost`): counted against the account where the
   * request has a session, else against the overall budget of its kind; no once that is spent.
   */
  mayCost: MayCost;
  /** Answers the request where `mayCost` said no: 429 with `Retry-After`. */
  refuse(reply: FastifyReply): FastifyReply;
}

/**
 * The limits of the routes that cost without a session (`/api/geo`, `/emoji/<id>.png`,
 * `/pictures/<key>.png`; plan 8Z-2, F-B3), counting only work that costs (the services ask
 * `mayCost` right before it; an answer from memory is never counted nor refused, and asks that
 * arrive while the work is on its way share it, counted once): a request with a session against
 * its account (`MEMBER_COSTS_PER_MINUTE`, every kind together), one without against the overall
 * budget of its kind (`PICTURE_COSTS_PER_MINUTE`, `EMOJI_COSTS_PER_MINUTE`,
 * `GEO_COSTS_PER_MINUTE`), so that one kind spent never refuses another. The session is looked
 * up only when work is due, and never renewed (`Sessions.userOf`): these answers may be kept by
 * others; a lookup reads the database, so one address has at most
 * `COOKIE_LOOKUPS_PER_ADDRESS_MINUTE` a minute (F-B4), past which a miss with a cookie is
 * refused unread.
 */
export function publicCosts(options: {
  sessions: Pick<Sessions, 'userOf' | 'needsLookup'>;
  now: () => number;
}): CostOf {
  const overall = (uses: number) => new RateLimiter({ uses, perMs: 60_000, addresses: 1 });
  const budgets: Readonly<Record<CostKind, RateLimiter>> = {
    pictures: overall(PICTURE_COSTS_PER_MINUTE),
    emoji: overall(EMOJI_COSTS_PER_MINUTE),
    geo: overall(GEO_COSTS_PER_MINUTE),
  };
  const members = new RateLimiter({ uses: MEMBER_COSTS_PER_MINUTE, perMs: 60_000 });
  const lookups = new RateLimiter({ uses: COOKIE_LOOKUPS_PER_ADDRESS_MINUTE, perMs: 60_000 });
  return (request, kind) => {
    let retryAfterSeconds = 60;
    return {
      mayCost: async () => {
        // A cookie is looked up in the database: so often per address, then refused unread.
        if (options.sessions.needsLookup(request)) {
          const allowed = lookups.take(addressBucket(request.ip), options.now());
          if (!allowed.ok) {
            ({ retryAfterSeconds } = allowed);
            return false;
          }
        }
        const user = await options.sessions.userOf(request);
        const answer =
          user === undefined
            ? budgets[kind].take(EVERYBODY, options.now())
            : members.take(user, options.now());
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
