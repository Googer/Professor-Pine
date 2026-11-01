import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendFailure } from './answers.js';
import type { Sessions } from './sessions.js';

/** The header a page sends its session's CSRF token in. */
export const CSRF_HEADER = 'x-pine-csrf';

/**
 * The guard of every POST (spec 5), as a `preHandler`: the request must come from Pine's own
 * pages (`Origin` equal to `publicUrl`) and carry the CSRF token of its session; anything else
 * is refused with 403 before the handler runs. GETs change nothing and need none of it.
 */
export function postGuard(sessions: Sessions, publicUrl: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const sent = request.headers[CSRF_HEADER];
    const session =
      request.headers.origin === publicUrl ? await sessions.of(request, reply) : undefined;
    if (!session || !sessions.hasToken(session, typeof sent === 'string' ? sent : undefined)) {
      return sendFailure(request, reply, 403);
    }
  };
}
