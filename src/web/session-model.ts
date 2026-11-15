/**
 * What a session of the web pages is, as stored (spec 2.4): shared by `Sessions` and the stores
 * (`WebSessionRepository`, `MemoryWebSessions`), with no import of Fastify, so that the
 * repository layer does not depend on the web server.
 */

/** A session lasts this long from its last use. */
export const SESSION_MS = 30 * 24 * 3_600_000;

/**
 * The sessions one account has at most (plan 8Z-2): a browser holds one, so these are ten
 * browsers and devices. A login beyond them ends the session used longest ago, so that logging
 * in again and again leaves no rows behind without end.
 */
export const MAX_SESSIONS_PER_ACCOUNT = 10;

/**
 * The sessions of an account that a new one pushes out (`WebSessionStore.create`): of all its
 * sessions but the new one, those beyond the `MAX_SESSIONS_PER_ACCOUNT - 1` used last (by their
 * last use, then by when they were made, then by their id, so that both stores choose alike).
 */
export function sessionsPushedOut<S extends Pick<WebSession, 'id' | 'createdAt' | 'lastUsedAt'>>(
  others: readonly S[],
): S[] {
  return [...others]
    .sort(
      (a, b) =>
        b.lastUsedAt - a.lastUsedAt ||
        b.createdAt - a.createdAt ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    )
    .slice(MAX_SESSIONS_PER_ACCOUNT - 1);
}

/** A session as stored: by the SHA-256 of its cookie, never the cookie itself. */
export interface WebSession {
  /** The SHA-256 of the cookie value, 64 hex characters. */
  id: string;
  /**
   * Who logged in (a snowflake): the session says who the member is and which of this Pine's
   * servers they were in at the login (its servers), never what they may do.
   */
  userId: string;
  /** Their name when they logged in, for the page's header. */
  userName: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  /**
   * Whether its login read the member's servers from Discord (final review R4-1: a login with
   * Discord, the scope `guilds`): then its servers (`WebSessionStore.serversOf`) are every server
   * of this Pine served on the web that the member was in at the login. Not for a login by a link
   * of `/maps`, whose servers are the link's alone, nor for a session from before.
   */
  serversListed: boolean;
}

/** Where sessions are kept: `WebSessionRepository`, and `MemoryWebSessions` in tests. */
export interface WebSessionStore {
  /**
   * Stores a new session and, in the same step, deletes what it pushes out of its account's
   * `MAX_SESSIONS_PER_ACCOUNT` (`sessionsPushedOut`): never the new one. The ids of those it
   * deleted (F-B5: their live streams are ended). `servers` are the ids of the servers of this
   * Pine the member is in, as far as the login knows (final review R4-1; none by default): they
   * go with the session, and each with its server's data.
   */
  create(session: WebSession, servers?: readonly string[]): Promise<string[]>;
  /** The session with this id, unless it has expired by `now`. */
  find(id: string, now: number): Promise<WebSession | undefined>;
  /** The servers kept with a session (`create`'s `servers`); none for one there is not. */
  serversOf(id: string): Promise<string[]>;
  /** Marks a session used at `now`: it lasts `SESSION_MS` from then. */
  touch(id: string, now: number): Promise<void>;
  remove(id: string): Promise<void>;
  /** Deletes the sessions that expired by `now`; how many. */
  removeExpired(now: number): Promise<number>;
}
