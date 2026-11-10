import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MapServer } from './map-servers.js';
import { limitedRead } from './rate-limit.js';
import type { WebDeps } from './server.js';
import { topAnswer, type Membership } from './top-answer.js';
import { topPage } from './top-page.js';

/** The requests for `/` one address may make in a minute (plan 8M-14). */
export const TOP_PER_MINUTE = 30;
/** How long the page waits for Discord's answer per server before it counts as unknown. */
export const TOP_LOOKUP_MS = 5_000;

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
 * `TOP_PER_MINUTE` a minute from one address, every answer counted (a logged-in load asks the
 * member directory once per server), and as many by whoever is logged in, from however many
 * addresses (`limitedRead`, plan 8Z-2). Membership is asked of the member directory itself, not of
 * the map's (`mapMembers`): a member without the map's role still counts, and the map's header
 * tells them what they lack. A server Discord has not made available is not asked of (it counts
 * as unknown, `topAnswer`). Every server is asked at once; a failed question, or one Discord
 * has not answered within `TOP_LOOKUP_MS`, is logged and counted as unknown.
 */
export function topRoutes(app: FastifyInstance, deps: WebDeps): void {
  const { sessions, members, log } = deps;
  const limited = limitedRead(TOP_PER_MINUTE, deps);
  const notKept = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    void reply.header('cache-control', 'no-store');
  };

  /** What the member directory says of somebody in each server, asked of all at once. */
  async function memberships(
    servers: readonly MapServer[],
    userId: string,
  ): Promise<Map<string, Membership>> {
    const answers = await Promise.allSettled(
      servers.map((server) => within(members.find(server.id, userId), TOP_LOOKUP_MS)),
    );
    return new Map(
      servers.map((server, i): [string, Membership] => {
        const answer = answers[i];
        if (answer?.status === 'fulfilled') {
          return [server.id, answer.value === undefined ? 'not' : 'member'];
        }
        log.warn(
          { err: answer?.reason, guild: server.id, user: userId },
          'could not ask whether somebody on the top page is a member',
        );
        return [server.id, 'unknown'];
      }),
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
        memberships: session ? await memberships(servers, session.userId) : new Map(),
        invites: deps.settings.invites,
        loginFailed: request.query.login === 'failed',
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
