import { randomBytes } from 'node:crypto';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isSnowflake } from '../db/snowflake.js';
import { sendButtonPage, sendFailure } from './answers.js';
import { addressBucket, prefixBucket } from './client-address.js';
import { postGuard } from './csrf.js';
import { authorizeUrl } from './discord-oauth.js';
import { localPath } from './local-path.js';
import type { LinkPage } from './login-links.js';
import { limitedPerAddress, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';
import { sameText } from './sessions.js';

/**
 * The name of the cookie that holds the state of a login with Discord, and where it returns to:
 * `__Secure-` over https, so that a browser takes it only over https and from no plain-http
 * page of the domain; plain on http of this machine. (Not `__Host-`: its path is `/auth/`.)
 */
export function oauthCookieName(secure: boolean): string {
  return secure ? '__Secure-pine_oauth' : 'pine_oauth';
}
/** How long a login with Discord may take, from leaving to coming back. */
const OAUTH_SECONDS = 600;
/** The requests to `/auth/…` one address may make in a minute (spec 5). */
const AUTH_PER_MINUTE = 20;
/**
 * The code exchanges with Discord one address may cause in a minute (plan 8Z-2): a login is
 * one, and the exchanges are spaced a second apart for the whole process, so that an address
 * without this limit could take every slot.
 */
export const EXCHANGES_PER_ADDRESS_MINUTE = 3;
/**
 * The code exchanges one IPv6 /48 may cause in a minute (F-B2), beside the count per /64: one
 * routed prefix holds 65,536 /64s.
 */
export const EXCHANGES_PER_PREFIX_MINUTE = 10;
/** A state: 16 random bytes, base64url. */
const STATE = /^[A-Za-z0-9_-]{22}$/;
/** An authorization code as Discord gives one: a short plain token. */
const OAUTH_CODE = /^[A-Za-z0-9._~-]{1,128}$/;

/** The attributes of the cookie of a login with Discord: for `/auth/` alone, ten minutes. */
export function oauthCookie(secure: boolean, maxAge = OAUTH_SECONDS): CookieSerializeOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/auth/', maxAge };
}

/** The state and the page to return to, as the cookie of a login keeps them. */
function readOAuthCookie(value: string | undefined): { state: string; next?: string } | undefined {
  const [state = '', next = ''] = (value ?? '').split('.');
  if (!STATE.test(state)) return undefined;
  return { state, next: localPath(Buffer.from(next, 'base64url').toString('utf8')) };
}

type Query = Record<string, unknown>;

/** What the page of a login link says, by the page it opens. */
const LINK_SENTENCES: Readonly<Record<LinkPage, string>> = {
  map: "Open Professor Pine's map of this server, logged in with the link from /maps.",
  'regions/edit':
    'Open the region editor of this server, logged in with the link from /region edit.',
};
/** What the address of a login link adds after its token, by the page it opens. */
const LINK_SUFFIXES: Readonly<Record<LinkPage, string>> = { map: '', 'regions/edit': '/edit' };

/** The address of a login link: `/auth/link/<guild>/<token>`. */
interface LinkParams {
  guild: string;
  token: string;
}

/**
 * The addresses of logging in and out (`/auth/…`, spec 2.4), at most `AUTH_PER_MINUTE` a minute
 * from one address. "Log in with Discord" (only with the client secret): `/auth/login` sends
 * the member to Discord with a random state, kept with the page to return to in a cookie of ten
 * minutes; `/auth/callback` checks the state, exchanges the code, asks who the member is and
 * starts a session; whatever fails returns to the page with `?login=failed`, the cookie
 * deleted either way. One address causes at most `EXCHANGES_PER_ADDRESS_MINUTE` exchanges a
 * minute (plan 8Z-2), counted only once the state and the code have passed. A link of `/maps`, `/auth/link/<guild>/<token>`, shows a page whose
 * button (a POST of Pine's own page) starts a session once, within five minutes, for its own
 * server; then the map, without the token. Logging out is a POST of Pine's own pages
 * (`postGuard`). Neither a code nor a token is ever logged.
 */
export function authRoutes(app: FastifyInstance, deps: WebDeps): void {
  const { sessions, settings, oauth, loginLinks, servers, now, log } = deps;
  const callbackUrl = `${settings.publicUrl}/auth/callback`;
  const oauthName = oauthCookieName(sessions.secure);
  const limited = limitedPerAddress(new RateLimiter({ uses: AUTH_PER_MINUTE, perMs: 60_000 }), {
    now,
  });
  const exchanges = new RateLimiter({ uses: EXCHANGES_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const prefixExchanges = new RateLimiter({ uses: EXCHANGES_PER_PREFIX_MINUTE, perMs: 60_000 });
  /**
   * The live streams of the sessions a login ended end with them (F-B5): the browser's old
   * session, and those the new one pushed out of the account's ten.
   */
  const endStreams = (ended: readonly string[]): void => {
    for (const id of ended) deps.live.endSession(id);
  };

  app.addHook('onRequest', async (request, reply) => {
    void reply.header('cache-control', 'no-store');
    return limited(request, reply);
  });

  app.get('/auth/login', async (request: FastifyRequest<{ Querystring: Query }>, reply) => {
    if (!oauth) return sendFailure(request, reply, 404);
    const state = randomBytes(16).toString('base64url');
    const next = localPath(request.query.next) ?? '';
    void reply.setCookie(
      oauthName,
      `${state}.${Buffer.from(next).toString('base64url')}`,
      oauthCookie(sessions.secure),
    );
    return reply.redirect(authorizeUrl(oauth.appId, callbackUrl, state), 302);
  });

  app.get('/auth/callback', async (request: FastifyRequest<{ Querystring: Query }>, reply) => {
    if (!oauth) return sendFailure(request, reply, 404);
    const kept = readOAuthCookie(request.cookies[oauthName]);
    void reply.setCookie(oauthName, '', oauthCookie(sessions.secure, 0));
    const back = kept?.next ?? '/';
    const failed = (reason: string): FastifyReply => {
      log.info({ reason }, 'a login with Discord failed');
      // A page at an ended train has its query already (`localPath`, plan 8H-7B).
      return reply.redirect(`${back}${back.includes('?') ? '&' : '?'}login=failed`, 302);
    };
    const { code, state } = request.query;
    if (!kept || typeof state !== 'string' || !sameText(state, kept.state)) {
      return failed('state');
    }
    if (typeof code !== 'string' || code === '') return failed('declined');
    // Discord's codes are short plain tokens: anything else never reaches it (plan 8Z).
    if (!OAUTH_CODE.test(code)) return failed('bad code');
    // Only what reaches the exchange counts against the address (plan 8Z-2): a request refused
    // above cost nothing.
    if (!exchanges.take(addressBucket(request.ip), now()).ok) {
      return failed('exchange: busy (too many from one address)');
    }
    // And per IPv6 /48 (F-B2): a routed prefix has thousands of /64s.
    const prefix = prefixBucket(request.ip);
    if (prefix !== undefined && !prefixExchanges.take(prefix, now()).ok) {
      return failed('exchange: busy (too many from one network)');
    }
    const token = await oauth.gateway.exchange(code, callbackUrl);
    if ('failed' in token) return failed(`exchange: ${token.failed}`);
    const user = await oauth.gateway.who(token.accessToken);
    if ('failed' in user) return failed(`user: ${user.failed}`);
    endStreams(await sessions.start(request, reply, user));
    log.info({ user: user.id }, 'logged in to the web pages with Discord');
    return reply.redirect(back, 302);
  });

  // A link of `/maps` or `/region edit` (spec 2.4, a GET from Discord's link button) only shows
  // a page whose button POSTs to the same address: a GET or HEAD (a link preview, a prefetch)
  // uses nothing up. The page presses its button itself by a script of ours (Matt, 2026-10-25;
  // a preview runs no script), but only in a browser that is not logged in (Matt, 2026-11-10,
  // plan 8Z-2): with a session the button waits, and under another account's session the page
  // names both. The button names the account the link logs in to (somebody else's link logs
  // you in as them); a link that is unknown, used, expired or another
  // server's leads straight to `?login=expired` of the page its address names (the map, or
  // with `/edit` the region editor: an expired link is known no more).
  const linkPage =
    (page: LinkPage) =>
    async (request: FastifyRequest<{ Params: LinkParams }>, reply: FastifyReply) => {
      const { guild, token } = request.params;
      if (!isSnowflake(guild) || !servers.has(guild)) return sendFailure(request, reply, 404);
      const holder = loginLinks.peek(token, now());
      if (!holder || holder.guildId !== guild) {
        return reply.redirect(`/s/${guild}/${page}?login=expired`, 303);
      }
      // Who the browser is logged in as (plan 8Z-2): only one that is not logged in has the
      // button pressed for it; a session's holder sees whose link it is and presses, or not.
      const session = await sessions.of(request, reply);
      return sendButtonPage(reply, {
        sentence: LINK_SENTENCES[page],
        action: `/auth/link/${guild}/${encodeURIComponent(token)}${LINK_SUFFIXES[page]}`,
        name: holder.userName,
        loggedIn:
          session === undefined
            ? 'none'
            : session.userId === holder.userId
              ? 'same'
              : { other: session.userName },
      });
    };
  app.get('/auth/link/:guild/:token', linkPage('map'));
  app.get('/auth/link/:guild/:token/edit', linkPage('regions/edit'));

  // The page's button: from Pine's own page alone (`Origin`), the link is used up and a
  // session started (any session the browser had is ended); then the page the link was given
  // for, without the token.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, _body, done) => {
      done(null, {});
    },
  );
  const useLink =
    (page: LinkPage) =>
    async (request: FastifyRequest<{ Params: LinkParams }>, reply: FastifyReply) => {
      const { guild, token } = request.params;
      if (!isSnowflake(guild) || !servers.has(guild)) return sendFailure(request, reply, 404);
      if (request.headers.origin !== settings.publicUrl) return sendFailure(request, reply, 403);
      const holder = loginLinks.redeem(token, now());
      if (!holder || holder.guildId !== guild) {
        return reply.redirect(`/s/${guild}/${page}?login=expired`, 303);
      }
      endStreams(
        await sessions.start(request, reply, { id: holder.userId, name: holder.userName }),
      );
      log.info({ user: holder.userId, guild }, 'logged in to the web pages with a link');
      // The map on the region of the channel /maps was used in (plan 8M-7): a number of ours.
      const region =
        holder.page === 'map' && holder.region !== undefined ? `?region=${holder.region}` : '';
      return reply.redirect(`/s/${guild}/${holder.page}${region}`, 303);
    };
  app.post('/auth/link/:guild/:token', useLink('map'));
  app.post('/auth/link/:guild/:token/edit', useLink('regions/edit'));

  app.post(
    '/auth/logout',
    { preHandler: postGuard(sessions, settings.publicUrl) },
    async (request, reply) => {
      const session = await sessions.of(request, reply);
      await sessions.end(request, reply);
      // The session's live streams end with it (plan 8Z-2): they would tell a logged-out page
      // of changes for up to their lifetime.
      if (session) deps.live.endSession(session.id);
      // And the browser drops what it kept of the pages' answers (a post is kept a day,
      // `private, max-age=86400`): the next visitor of this browser finds none of them.
      return reply.header('clear-site-data', '"cache"').code(204).send();
    },
  );
}
