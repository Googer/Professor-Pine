import { describe, expect, it } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { zonedAt } from '../../test/support/time.js';
import { RegionTallies } from './region-tallies.js';

const NEW_YORK = '412345678901234567';
const TOKYO = '412345678901234599';

describe('RegionTallies in each server’s zone (plan 19A-2)', () => {
  it('sums the months of a period on each server’s own clock', async () => {
    const asked = new Map<string, { first: string; last: string }>();
    const tallies = new RegionTallies({
      reader: {
        regionSums: (serverId, months) => {
          asked.set(serverId, months);
          return Promise.resolve([]);
        },
      },
      regions: { all: () => [] },
      guilds: { idFor: () => Promise.resolve(undefined) },
      gateway: new FakePartyGateway(),
      zoneOf: (serverId) => (serverId === TOKYO ? 'Asia/Tokyo' : 'America/New_York'),
    });
    // 20:00 on October 31 in New York, 09:00 on November 1 in Tokyo.
    const now = zonedAt('2026-10-31T20:00', 'America/New_York');
    const none = () => Promise.resolve(new Set<number>());
    await tallies.tally(NEW_YORK, 'month', now, none);
    await tallies.tally(TOKYO, 'month', now, none);
    expect(asked.get(NEW_YORK)).toEqual({ first: '2026-10', last: '2026-10' });
    expect(asked.get(TOKYO)).toEqual({ first: '2026-11', last: '2026-11' });
  });
});
