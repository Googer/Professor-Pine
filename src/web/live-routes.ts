import { PassThrough } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { sendFailure } from './answers.js';
import { addressBucket } from './client-address.js';
import type { GuildRequest } from './guild-routes.js';
import { UNCONFIRMED } from './party-routes.js';
import type { PartyViewers } from './party-viewers.js';
import { limitedRead } from './rate-limit.js';
import type { WebDeps } from './server.js';

/**
 * The live streams one address may open in a minute. A page never reopens within 20 seconds of
 * opening, so a phone switching apps cannot run this up; it polls meanwhile, as without a stream.
 */
export const LIVE_PER_MINUTE = 30;

/**
 * `GET /s/<guild>/api/live` (design `2026-10-31-map-live-updates-design.md`): Server-Sent Events
 * saying that a list of the server changed, for members. Each refusal is a normal HTTP answer
 * before the stream opens. Sent by `reply.send(stream)`, never `reply.hijack()`, which would skip
 * the security headers (`onSend`), the headers set on the reply and the cookie writer: a session
 * renewal landing here keeps its cookie. Fastify sends the headers at the first data, so the hub
 * writes the first ping before `send`.
 */
export function liveRoutes(scope: FastifyInstance, deps: WebDeps, viewers: PartyViewers): void {
  const { sessions, parties, live, log } = deps;
  scope.get(
    '/api/live',
    // No HEAD of its own, which would open a stream nobody reads.
    { exposeHeadRoute: false, onRequest: limitedRead(LIVE_PER_MINUTE, deps) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const { guild } = request.params;
      // Paced as the lists are: a restart has every map open its stream with nothing kept.
      const member = await viewers.askedMembership(guild, session.userId);
      if (member.kind === 'not-member') return sendFailure(request, reply, 403);
      if (member.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
      const row = await parties.guilds.idFor(guild);
      // From here to `open` one turn, no `await`: the caps count what they let through. A client
      // gone meanwhile is not registered.
      if (reply.raw.destroyed) return sendFailure(request, reply, 503);
      const stream = new PassThrough();
      const answer = live.open({
        server: guild,
        row,
        address: addressBucket(request.ip),
        member: session.userId,
        sink: {
          write: (text) => stream.write(text),
          end: () => {
            stream.end();
          },
          destroy: () => {
            stream.destroy();
          },
        },
      });
      if (answer.kind === 'closed') return sendFailure(request, reply, 503);
      if (answer.kind === 'full') return sendFailure(request, reply, 429);
      // One path for both ends. Fastify's `onResponse` does not fire for a dropped stream, the
      // usual ending, so that is logged here with the same fields.
      stream.once('close', () => {
        answer.gone();
        if (reply.raw.writableEnded) return;
        log.debug(
          {
            method: request.method,
            route: request.routeOptions.url ?? '(none)',
            status: reply.statusCode,
            ms: Math.round(reply.elapsedTime),
          },
          'web request',
        );
      });
      return reply
        .header('content-type', 'text/event-stream')
        .header('cache-control', 'no-store, no-transform')
        .header('x-accel-buffering', 'no')
        .send(stream);
    },
  );
}
