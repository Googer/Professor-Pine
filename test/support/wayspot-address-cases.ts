import { expect, it } from 'vitest';
import { geodataJson } from '../../src/domain/geo/google.js';
import type { WayspotAddressStorage } from '../../src/services/wayspot-addresses.js';
import { wayspotId } from './wayspot-cases.js';

/** A Power Spot's address as Google gave it (invented), with a name of more than ASCII. */
export const LOOKED_UP_GEODATA = geodataJson({
  route: 'Église Street',
  locality: 'Pinewood',
  formatted_address: '12 Église Street, Pinewood, PA 15000, USA',
});

/**
 * What the kept addresses of Power Spots do (design `2026-11-04-power-spot-address-design.md`),
 * run against `WayspotAddressRepository` and its twin `MemoryWayspotAddresses` alike. `made`
 * gives an empty storage.
 */
export function wayspotAddressCases(made: () => Promise<WayspotAddressStorage>): void {
  it('keeps where a Power Spot was asked, what Google gave and when, and reads them all back', async () => {
    const storage = await made();
    expect(await storage.all()).toEqual([]);
    await storage.save({
      wayspotId: wayspotId(1),
      lat: 40.0512345,
      lon: -80.0512345,
      geodata: LOOKED_UP_GEODATA,
      askedAt: 1_793_000_000_000,
    });
    await storage.save({
      wayspotId: wayspotId(2),
      lat: 40.06,
      lon: -80.06,
      geodata: null,
      askedAt: 1_000,
    });
    const rows = await storage.all();
    expect([...rows].sort((a, b) => a.wayspotId.localeCompare(b.wayspotId))).toEqual([
      {
        wayspotId: wayspotId(1),
        lat: 40.0512345,
        lon: -80.0512345,
        geodata: LOOKED_UP_GEODATA,
        askedAt: 1_793_000_000_000,
      },
      { wayspotId: wayspotId(2), lat: 40.06, lon: -80.06, geodata: null, askedAt: 1_000 },
    ]);
  });

  it('keeps the newest answer for a Power Spot asked again', async () => {
    const storage = await made();
    await storage.save({ wayspotId: wayspotId(1), lat: 40, lon: -80, geodata: null, askedAt: 1 });
    await storage.save({
      wayspotId: wayspotId(1),
      lat: 40.001,
      lon: -80,
      geodata: LOOKED_UP_GEODATA,
      askedAt: 2,
    });
    expect(await storage.all()).toEqual([
      {
        wayspotId: wayspotId(1),
        lat: 40.001,
        lon: -80,
        geodata: LOOKED_UP_GEODATA,
        askedAt: 2,
      },
    ]);
  });
}
