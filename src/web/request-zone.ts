import type { FastifyRequest } from 'fastify';

/** The zone each request of a server's addresses was given (`takeZone`), until it is answered. */
const zones = new WeakMap<FastifyRequest, string>();

/**
 * Gives a request of `/s/<guild>/…` its server's zone (plan 19A-2), once, as it comes (the guild
 * scope's first hook): every time its answer reads or says is in that one zone (`requestZone`),
 * also if the server's staff change it meanwhile.
 */
export function takeZone(request: FastifyRequest, zone: string): void {
  zones.set(request, zone);
}

/**
 * The zone of the server a request is for (`takeZone`): the times its answer reads and says, its
 * words (`pageWords`), the forms' hints. A request outside a server's addresses has none: a
 * programming error, thrown with the route's pattern, never the address, which may hold a key
 * or a member's id (fix round 1, N3).
 */
export function requestZone(request: FastifyRequest): string {
  const zone = zones.get(request);
  if (zone === undefined) {
    const route = (request.routeOptions as { url?: string } | undefined)?.url ?? '(none)';
    throw new Error(`no server's zone for ${route}`);
  }
  return zone;
}
