import type { FastifyInstance } from 'fastify';
import type { Logger } from '../log.js';

/**
 * Starts listening (spec 6): a port it cannot take, or an address it cannot listen on, is
 * logged and answered false, and the bot runs on without its pages. Never throws.
 */
export async function startWebServer(
  app: FastifyInstance,
  where: { host: string; port: number },
  log: Logger,
): Promise<boolean> {
  try {
    await app.listen({ host: where.host, port: where.port });
    const address = app.server.address();
    const port = address !== null && typeof address === 'object' ? address.port : where.port;
    log.info({ host: where.host, port }, 'web server listening');
    return true;
  } catch (err) {
    log.error({ err, host: where.host, port: where.port }, 'the web server could not start');
    return false;
  }
}
