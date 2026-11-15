import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MapServer } from './map-servers.js';
import { limitedRead } from './rate-limit.js';
import type { WebDeps } from './server.js';
import type { WebSession } from './session-model.js';
import { topAnswer, type Membership } from './top-answer.js';
import { topPage } from './top-page.js';

/** The requests for `/` one address may make in a minute (plan 8M-14). */
export const TOP_PER_MINUTE = 30;
/** How long the page waits for Discord's answer per server before it counts as unknown. */
export const TOP_LOOKUP_MS = 5_000;
/**
 * The servers one load asks the member directory of at most, for a session that did not read
 * its servers at its login (final review R4-1: one from before, a link's): an instance of many
 * servers then says the list may be partial rather than ask Discord of each. Pittsburgh's one
 * server, and a handful, are all asked as before.
 */
export const TOP_LOOKUPS_PER_LOAD = 5;

/** A question that has not settled within `ms` rejects, its timer cleared once it settles. */
function within<T>(question: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`no answer within ${ms} ms`));
    }, ms);
  });
  return Promise.race([question, late]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * The top page `/` (plan 8M-14; and HEAD), answered by `topAnswer`: never kept by a browser or a
 * proxy (`no-store`, set before the limit so that a 429 carries it too), at most
 * `TOP_PER_MINUTE` a minute from one address, every answer counted, and as many by whoever is
 * logged in, from however many addresses (`limitedRead`, plan 8Z-2). Membership is read from the
 * session's servers where its login read them from Discord (final review R4-1), with no request
 * to Discord; else (a session from before, or a link's) the servers it knows are theirs and the
 * member directory itself is asked of at most `TOP_LOOKUPS_PER_LOAD` others, not the map's
 * (`mapMembers`): a member without the map's role still counts, and the map's header tells them
 * what they lack. A server Discord has not made available is not asked of (it counts as
 * unknown, `topAnswer`). Those asked are asked at once; a failed question, or one Discord has
 * not answered within `TOP_LOOKUP_MS`, is logged and counted as unknown.
 */
export function topRoutes(app: FastifyInstance, deps: WebDeps): void {
  const { sessions, members, log } = deps;
  const limited = limitedRead(TOP_PER_MINUTE, deps);
  const notKept = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    void reply.header('cache-control', 'no-store');
  };

  /**
   * Whether somebody is in each server (final review R4-1): from their session's servers where
   * its login read them (`serversListed`), asking nothing; else the servers it knows (a link's)
   * are theirs, and the member directory is asked of the first `TOP_LOOKUPS_PER_LOAD` of the
   * others, all at once, the rest left `unasked`.
   */
  async function memberships(
    servers: readonly MapServer[],
    session: WebSession,
  ): Promise<Map<string, Membership>> {
    const known = new Set(await sessions.serversOf(session));
    if (session.serversListed) {
      return new Map(servers.map((server) => [server.id, known.has(server.id) ? 'member' : 'not']));
    }
    const asked = servers
      .filter((server) => !known.has(server.id))
      .slice(0, TOP_LOOKUPS_PER_LOAD)
      .map((server) => server.id);
    const answers = await Promise.allSettled(
      asked.map((serverId) => within(members.find(serverId, session.userId), TOP_LOOKUP_MS)),
    );
    const said = new Map(
      asked.map((serverId, i): [string, Membership] => {
        const answer = answers[i];
        if (answer?.status === 'fulfilled') {
          return [serverId, answer.value === undefined ? 'not' : 'member'];
        }
        log.warn(
          { err: answer?.reason, guild: serverId, user: session.userId },
          'could not ask whether somebody on the top page is a member',
        );
        return [serverId, 'unknown'];
      }),
    );
    return new Map(
      servers.map((server): [string, Membership] => [
        server.id,
        known.has(server.id) ? 'member' : (said.get(server.id) ?? 'unasked'),
      ]),
    );
  }

  app.get(
    '/',
    { onRequest: [notKept, ...limited] },
    async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply) => {
      const { servers, unavailable } = await deps.serversWithMap();
      const anyMap = servers.length > 0 || unavailable.length > 0;
      const session = anyMap ? await sessions.of(request, reply) : undefined;
      const answer = topAnswer({
        servers,
        unavailable,
        visitor: session && { name: session.userName },
        discordLogin: deps.oauth !== undefined,
        memberships: session ? await memberships(servers, session) : new Map(),
        listed: session?.serversListed ?? false,
        // Each server's invite (plan 19A-1: its values); none offered on an open instance.
        invites: Object.fromEntries(
          servers.flatMap((server) => {
            const invite = deps.serverSettings.of(server.id).invite;
            return invite === undefined ? [] : [[server.id, invite]];
          }),
        ),
        loginFailed: request.query.login === 'failed',
        openInstance: deps.openInstance,
      });
      if (answer.kind === 'redirect') return reply.redirect(answer.to, 302);
      return reply
        .type('text/html; charset=utf-8')
        .send(
          topPage(answer, session && sessions.csrfToken(session), deps.assets.manifest?.map.theme),
        );
    },
  );
}
