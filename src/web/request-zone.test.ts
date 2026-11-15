import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { requestZone, takeZone } from './request-zone.js';

/** A request as the zone needs it: its address, and the pattern of the route it matched. */
function request(url: string, route?: string): FastifyRequest {
  return { url, routeOptions: { url: route } } as unknown as FastifyRequest;
}

describe('requestZone (plan 19A-2)', () => {
  it('gives the zone the request was given', () => {
    const given = request('/s/412345678901234567/api/raids', '/s/:guild/api/raids');
    takeZone(given, 'Europe/Berlin');
    expect(requestZone(given)).toBe('Europe/Berlin');
  });

  it('names the route’s pattern when there is none, never the address (fix round 1, N3)', () => {
    const lost = request('/s/412345678901234567/api/raids?token=secret', '/s/:guild/api/raids');
    expect(() => requestZone(lost)).toThrow("no server's zone for /s/:guild/api/raids");
    expect(() => requestZone(lost)).not.toThrow(/secret|412345678901234567/u);
    expect(() => requestZone(request('/elsewhere?token=secret'))).toThrow(
      "no server's zone for (none)",
    );
  });
});
