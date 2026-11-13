import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { upgradeCopies, wayspotsInNoRegion } from './server-copies.js';

function square(south: number, west: number, north: number, east: number): LatLon[] {
  return [
    { lat: south, lon: west },
    { lat: north, lon: west },
    { lat: north, lon: east },
    { lat: south, lon: east },
    { lat: south, lon: west },
  ];
}

describe('upgradeCopies', () => {
  // Server 1 has West; server 2 has Wide, over West and East; a region of no server lies north.
  const regions = [
    { guildId: 1, channelId: 'west', bounds: square(40.0, -80.1, 40.1, -80.0) },
    { guildId: 2, channelId: 'wide', bounds: square(40.0, -80.1, 40.1, -79.9) },
    { guildId: null, channelId: 'nobody', bounds: square(41.0, -80.1, 41.1, -79.9) },
  ];
  const servers = [1, 2, 3];
  const wayspots = [
    { id: 'aa.16', lat: 40.05, lon: -80.05 },
    { id: 'bb.16', lat: 40.05, lon: -79.95 },
    { id: 'cc.16', lat: 41.05, lon: -80.0 },
    { id: 'dd.16', lat: 42.0, lon: -80.0 },
  ];

  it('copies a Wayspot to every server whose regions hold it, else to the servers that used it, else to every server', () => {
    const copies = upgradeCopies({
      wayspots,
      regions,
      usedBy: new Map([
        ['cc.16', [3, 3]],
        // A server not recorded is no server to copy to.
        ['dd.16', [9]],
        // The regions decide where they hold it.
        ['aa.16', [3]],
      ]),
      servers,
    });
    expect(copies).toEqual([
      { id: 'aa.16', guildId: 1 },
      { id: 'aa.16', guildId: 2 },
      { id: 'bb.16', guildId: 2 },
      { id: 'cc.16', guildId: 3 },
      { id: 'dd.16', guildId: 1 },
      { id: 'dd.16', guildId: 2 },
      { id: 'dd.16', guildId: 3 },
    ]);
  });

  it('names the Wayspots in no region of any server: the only ones their use decides', () => {
    expect(wayspotsInNoRegion({ wayspots, regions })).toEqual(['cc.16', 'dd.16']);
  });

  it('copies nothing without Wayspots, and nothing to no server', () => {
    expect(upgradeCopies({ wayspots: [], regions, usedBy: new Map(), servers })).toEqual([]);
    expect(upgradeCopies({ wayspots, regions: [], usedBy: new Map(), servers: [] })).toEqual([]);
  });
});
