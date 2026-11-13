import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { gymsInNoRegion, upgradeLinks } from './gym-server.js';

function square(south: number, west: number, north: number, east: number): LatLon[] {
  return [
    { lat: south, lon: west },
    { lat: north, lon: west },
    { lat: north, lon: east },
    { lat: south, lon: east },
    { lat: south, lon: west },
  ];
}

describe('upgradeLinks', () => {
  // Server 1 has West (-80.10 to -80.00); server 2 has Wide, over West and East (-80.10 to
  // -79.90); a region of no server lies far north.
  const regions = [
    { guildId: 1, channelId: 'west', bounds: square(40.0, -80.1, 40.1, -80.0) },
    { guildId: 2, channelId: 'wide', bounds: square(40.0, -80.1, 40.1, -79.9) },
    { guildId: null, channelId: 'nobody', bounds: square(41.0, -80.1, 41.1, -79.9) },
    { guildId: 1, channelId: 'unbounded', bounds: null },
  ];
  const servers = [1, 2, 3];

  it('links a gym to every server whose regions hold it', () => {
    const links = upgradeLinks({
      gyms: [
        { id: 1, lat: 40.05, lon: -80.05 },
        { id: 2, lat: 40.05, lon: -79.95 },
      ],
      regions,
      historyServers: new Map(),
      servers,
    });
    expect(links).toEqual([
      { gymId: 1, guildId: 1 },
      { gymId: 1, guildId: 2 },
      { gymId: 2, guildId: 2 },
    ]);
  });

  it('links a gym near a region but outside it as one in no region', () => {
    // Just east of West: West's neighbour, not in it; and in no region of server 1.
    const links = upgradeLinks({
      gyms: [{ id: 3, lat: 40.05, lon: -79.99 }],
      regions: regions.filter((region) => region.channelId !== 'wide'),
      historyServers: new Map([[3, [2]]]),
      servers,
    });
    expect(links).toEqual([{ gymId: 3, guildId: 2 }]);
  });

  it('links a gym in no region of a server to the servers whose history used it', () => {
    const links = upgradeLinks({
      gyms: [{ id: 4, lat: 41.05, lon: -80.0 }],
      regions,
      historyServers: new Map([[4, [3, 2, 3]]]),
      servers,
    });
    expect(links).toEqual([
      { gymId: 4, guildId: 2 },
      { gymId: 4, guildId: 3 },
    ]);
  });

  it('links a gym in no region and in no history to every server', () => {
    const links = upgradeLinks({
      gyms: [{ id: 5, lat: 45, lon: -75 }],
      regions,
      historyServers: new Map(),
      servers,
    });
    expect(links).toEqual([
      { gymId: 5, guildId: 1 },
      { gymId: 5, guildId: 2 },
      { gymId: 5, guildId: 3 },
    ]);
  });

  it('leaves out a server of the history that is no server recorded', () => {
    const links = upgradeLinks({
      gyms: [{ id: 6, lat: 45, lon: -75 }],
      regions,
      historyServers: new Map([[6, [9]]]),
      servers,
    });
    expect(links.map((link) => link.guildId)).toEqual([1, 2, 3]);
  });

  it('links a gym without a place as one in no region', () => {
    const links = upgradeLinks({
      gyms: [{ id: 7, lat: null, lon: null }],
      regions,
      historyServers: new Map([[7, [1]]]),
      servers,
    });
    expect(links).toEqual([{ gymId: 7, guildId: 1 }]);
  });

  it('names the gyms in no region of any server: the only ones whose history the upgrade reads', () => {
    expect(
      gymsInNoRegion({
        gyms: [
          { id: 1, lat: 40.05, lon: -80.05 },
          { id: 2, lat: 40.05, lon: -79.95 },
          // In a region of no server, in none at all, and without a place.
          { id: 3, lat: 41.05, lon: -80.0 },
          { id: 4, lat: 45.0, lon: -80.0 },
          { id: 5, lat: null, lon: null },
        ],
        regions,
      }),
    ).toEqual([3, 4, 5]);
  });
});
