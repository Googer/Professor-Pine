import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_MS, type WebSession, type WebSessionStore } from './session-model.js';

/**
 * The name of the cookie that carries a session (spec 2.4). Over https it is `__Host-`: the
 * browser keeps it only from this host, Secure, with path `/` and no Domain, so another host of
 * the same domain can neither set nor shadow it (cookie tossing). A browser keeps no Secure
 * cookie from plain http of this machine, so there the name is plain.
 */
export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-pine_session' : 'pine_session';
}
/** A session in use is renewed (its row written, its cookie sent anew) at most this often. */
export const RENEW_MS = 3_600_000;
/** The longest name kept with a session (`WebSession.userName`, varchar(100)). */
const NAME_LENGTH = 100;
/** A session's cookie value: 32 random bytes, base64url. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A random token of 32 bytes, base64url: a session's cookie, a login link. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** How a token is kept: the hex SHA-256 of it. */
export function sessionHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * The attributes of the session cookie: never read by a script, sent only over https (unless
 * the public address is this machine's in plain http), sent along when a member follows a link
 * to Pine from elsewhere but not with another site's requests, for 30 days.
 */
export function sessionCookie(secure: boolean): CookieSerializeOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: SESSION_MS / 1000 };
}

/** The session cookie's attributes when it is deleted. */
export function clearedSessionCookie(secure: boolean): CookieSerializeOptions {
  return { ...sessionCookie(secure), maxAge: 0 };
}

/** Compares two texts in a time that does not depend on where they differ. */
export function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface SessionsOptions {
  store: WebSessionStore;
  /** Whether cookies are `Secure` (the public address is https). */
  secure: boolean;
  now?: () => number;
  /** The key of the CSRF tokens; made at start by default. */
  csrfKey?: Buffer;
}

/**
 * The sessions of the web pages (spec 2.4): started by a login, read from the cookie of a
 * request (once per request), renewed at most hourly, ended by logging out, swept hourly. The
 * CSRF token of a session is an HMAC of its id under a key made at start: a restart only makes
 * open pages ask for it again.
 */
export class Sessions {
  readonly secure: boolean;
  /** The name of the session cookie (`sessionCookieName`). */
  readonly cookieName: string;
  private readonly now: () => number;
  private readonly csrfKey: Buffer;
  /** What a request's cookie stood for, read once per request. */
  private readonly read = new WeakMap<FastifyRequest, Promise<WebSession | undefined>>();

  constructor(private readonly options: SessionsOptions) {
    this.secure = options.secure;
    this.cookieName = sessionCookieName(options.secure);
    this.now = options.now ?? (() => Date.now());
    this.csrfKey = options.csrfKey ?? randomBytes(32);
  }

  /** Starts a session for a member; gives the cookie value to send. */
  async create(user: { id: string; name: string }): Promise<string> {
    const token = randomToken();
    const now = this.now();
    await this.options.store.create({
      id: sessionHash(token),
      userId: user.id,
      userName: [...user.name].slice(0, NAME_LENGTH).join(''),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now + SESSION_MS,
    });
    return token;
  }

  /**
   * Starts a session and sends its cookie with the answer. The session the request's cookie
   * stood for, if any, is deleted first: a browser holds one session, and a login over another
   * leaves no row behind that the old cookie could still use.
   */
  async start(
    request: FastifyRequest,
    reply: FastifyReply,
    user: { id: string; name: string },
  ): Promise<void> {
    const current = request.cookies[this.cookieName];
    if (current !== undefined && TOKEN.test(current)) {
      await this.options.store.remove(sessionHash(current));
    }
    const token = await this.create(user);
    void reply.setCookie(this.cookieName, token, sessionCookie(this.secure));
  }

  /**
   * The session of a request, or undefined: no cookie, one that is no token, one no session has
   * (any more). A session last renewed an hour ago or more is renewed, its cookie sent anew.
   */
  of(request: FastifyRequest, reply: FastifyReply): Promise<WebSession | undefined> {
    let session = this.read.get(request);
    if (!session) {
      session = this.lookUp(request, reply);
      this.read.set(request, session);
    }
    return session;
  }

  private async lookUp(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<WebSession | undefined> {
    const token = request.cookies[this.cookieName];
    if (token === undefined || !TOKEN.test(token)) return undefined;
    const now = this.now();
    const session = await this.options.store.find(sessionHash(token), now);
    if (!session) return undefined;
    if (now - session.lastUsedAt < RENEW_MS) return session;
    await this.options.store.touch(session.id, now);
    void reply.setCookie(this.cookieName, token, sessionCookie(this.secure));
    return { ...session, lastUsedAt: now, expiresAt: now + SESSION_MS };
  }

  /**
   * Whether a request carries a session, without renewing it (plan 8Z-2): for an answer that
   * anybody gets and others may keep (a public picture), which must never carry a cookie.
   */
  async has(request: FastifyRequest): Promise<boolean> {
    const read = this.read.get(request);
    if (read) return (await read) !== undefined;
    const token = request.cookies[this.cookieName];
    if (token === undefined || !TOKEN.test(token)) return false;
    return (await this.options.store.find(sessionHash(token), this.now())) !== undefined;
  }

  /** Ends the session of a request, if any, and deletes its cookie. */
  async end(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = await this.of(request, reply);
    if (session) await this.options.store.remove(session.id);
    void reply.setCookie(this.cookieName, '', clearedSessionCookie(this.secure));
  }

  /** The CSRF token of a session: what its pages send with every POST (`X-Pine-CSRF`). */
  csrfToken(session: Pick<WebSession, 'id'>): string {
    return createHmac('sha256', this.csrfKey).update(session.id).digest('base64url');
  }

  /** Whether a request carries the CSRF token of its session. */
  hasToken(session: Pick<WebSession, 'id'>, sent: string | undefined): boolean {
    return sent !== undefined && sameText(sent, this.csrfToken(session));
  }

  /** Deletes the sessions that have expired; how many. */
  sweep(): Promise<number> {
    return this.options.store.removeExpired(this.now());
  }
}
