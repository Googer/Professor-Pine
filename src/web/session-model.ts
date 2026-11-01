/**
 * What a session of the web pages is, as stored (spec 2.4): shared by `Sessions` and the stores
 * (`WebSessionRepository`, `MemoryWebSessions`), with no import of Fastify, so that the
 * repository layer does not depend on the web server.
 */

/** A session lasts this long from its last use. */
export const SESSION_MS = 30 * 24 * 3_600_000;

/** A session as stored: by the SHA-256 of its cookie, never the cookie itself. */
export interface WebSession {
  /** The SHA-256 of the cookie value, 64 hex characters. */
  id: string;
  /** Who logged in (a snowflake): the session says who the member is, nothing more. */
  userId: string;
  /** Their name when they logged in, for the page's header. */
  userName: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
}

/** Where sessions are kept: `WebSessionRepository`, and `MemoryWebSessions` in tests. */
export interface WebSessionStore {
  create(session: WebSession): Promise<void>;
  /** The session with this id, unless it has expired by `now`. */
  find(id: string, now: number): Promise<WebSession | undefined>;
  /** Marks a session used at `now`: it lasts `SESSION_MS` from then. */
  touch(id: string, now: number): Promise<void>;
  remove(id: string): Promise<void>;
  /** Deletes the sessions that expired by `now`; how many. */
  removeExpired(now: number): Promise<number>;
}
