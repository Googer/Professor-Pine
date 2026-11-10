import { BoundedMap } from '../bounded-map.js';
import { randomToken, sessionHash } from './sessions.js';

/** How long a login link is good for (spec 2.4). */
export const LINK_MS = 5 * 60_000;
/** How many links are kept at most; the oldest go first. */
const LINKS = 10_000;

/** The page of a server a login link opens: the map (`/maps`) or the region editor (`/region edit`). */
export type LinkPage = 'map' | 'regions/edit';

/** Whom a login link logs in, for which server, and which of its pages it opens. */
export interface LinkHolder {
  guildId: string;
  userId: string;
  userName: string;
  page: LinkPage;
  /**
   * The region of the channel `/maps` was used in (plan 8M-7): the map opens on it
   * (`?region=<id>`). Absent elsewhere and for the region editor.
   */
  region?: number;
}

/** Whom a link logs in, as kept, without its expiry. */
function holderOf(link: LinkHolder): LinkHolder {
  const { guildId, userId, userName, page, region } = link;
  return { guildId, userId, userName, page, ...(region === undefined ? {} : { region }) };
}

/**
 * The links `/maps` and `/region edit` give (spec 2.4): 256 random bits, good for five minutes
 * and once, tied to the member, the server and the page they open; kept in memory by their
 * SHA-256 alone, so a restart only expires them. Its page names the account (`peek`); its POST
 * starts a session as logging in with Discord does (`redeem`).
 */
export class LoginLinks {
  private readonly links: BoundedMap<string, LinkHolder & { expiresAt: number }>;

  constructor(max = LINKS) {
    this.links = new BoundedMap(max);
  }

  /**
   * A new link's token for a member of a server, issued at `now`, opening `page` (the map on
   * `region`, when `/maps` was used in a region's channel).
   */
  issue(
    guildId: string,
    userId: string,
    userName: string,
    now: number,
    page: LinkPage = 'map',
    region?: number,
  ): string {
    this.links.dropWhile((link) => link.expiresAt <= now);
    const token = randomToken();
    this.links.set(sessionHash(token), {
      guildId,
      userId,
      userName,
      page,
      ...(region === undefined ? {} : { region }),
      expiresAt: now + LINK_MS,
    });
    return token;
  }

  /**
   * Whom a link logs in, without using it up (the page a GET shows names the account); undefined
   * for one that is unknown, used or expired.
   */
  peek(token: string, now: number): LinkHolder | undefined {
    const link = this.links.get(sessionHash(token));
    if (!link || link.expiresAt <= now) return undefined;
    return holderOf(link);
  }

  /** Whom a link logs in; undefined for one that is unknown, used or expired. Used up by this. */
  redeem(token: string, now: number): LinkHolder | undefined {
    const hash = sessionHash(token);
    const link = this.links.get(hash);
    if (!link) return undefined;
    this.links.delete(hash);
    if (link.expiresAt <= now) return undefined;
    return holderOf(link);
  }
}
