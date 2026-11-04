import { describe, expect, it } from 'vitest';
import { geodataJson } from './google.js';
import {
  NONE_FOUND_AGAIN_MS,
  spotAddressWanted,
  wayspotAddress,
  type LookedUpAddress,
} from './spot-address.js';

const SPOT = { kind: 'powerspot' as const, lat: 40.44, lon: -79.99, address: null };
const LOOKED: LookedUpAddress = {
  lat: 40.44,
  lon: -79.99,
  geodata: geodataJson({ formatted_address: '600 Grant St, Pittsburgh, PA 15219, USA' }),
  askedAt: 1_000,
};
/** About 11 meters north of `SPOT`. */
const MOVED = { ...SPOT, lat: 40.4401 };

describe("a Wayspot's address (one path for every reader)", () => {
  it("is Wayfarer's address where it gives one, whatever was looked up", () => {
    const stop = {
      kind: 'stop' as const,
      lat: 40.44,
      lon: -79.99,
      address: '59-69 Ingram Avenue, Pittsburgh, PA 15205, USA, Pittsburgh, 15205, US',
    };
    expect(wayspotAddress(stop, undefined)).toBe('59-69 Ingram Avenue, Pittsburgh, PA 15205, USA');
    expect(wayspotAddress({ ...stop, kind: 'powerspot' }, LOOKED)).toBe(
      '59-69 Ingram Avenue, Pittsburgh, PA 15205, USA',
    );
  });

  it("is a Power Spot's looked-up address, worded as a gym's, while it is where it was asked", () => {
    expect(wayspotAddress(SPOT, LOOKED)).toBe('600 Grant St, Pittsburgh, PA 15219, USA');
    // Of the parts alone, as a gym's older row.
    const parts = {
      ...LOOKED,
      geodata: geodataJson({ route: 'Grant St', locality: 'Pittsburgh' }),
    };
    expect(wayspotAddress(SPOT, parts)).toBe('Grant St, Pittsburgh');
    // Moved more than 10 meters since: not its address any more.
    expect(wayspotAddress(MOVED, LOOKED)).toBe('');
    // None found, or never asked.
    expect(wayspotAddress(SPOT, { ...LOOKED, geodata: null })).toBe('');
    expect(wayspotAddress(SPOT, undefined)).toBe('');
  });

  it('is never a looked-up address for a PokéStop or a gym', () => {
    expect(wayspotAddress({ ...SPOT, kind: 'stop' }, LOOKED)).toBe('');
    expect(wayspotAddress({ ...SPOT, kind: 'gym' }, LOOKED)).toBe('');
  });
});

describe("whether a Power Spot's address is to be asked (spotAddressWanted)", () => {
  it('asks one never asked, or asked more than 10 meters from where it is now', () => {
    expect(spotAddressWanted(SPOT, undefined, 2_000)).toBe(true);
    expect(spotAddressWanted(MOVED, LOOKED, 2_000)).toBe(true);
  });

  it('never asks again where an address is kept', () => {
    expect(spotAddressWanted(SPOT, LOOKED, 2_000 + 10 * NONE_FOUND_AGAIN_MS)).toBe(false);
  });

  it('asks again 30 days after Google found none', () => {
    const none = { ...LOOKED, geodata: null };
    expect(NONE_FOUND_AGAIN_MS).toBe(30 * 86_400_000);
    expect(spotAddressWanted(SPOT, none, 1_000 + NONE_FOUND_AGAIN_MS - 1)).toBe(false);
    expect(spotAddressWanted(SPOT, none, 1_000 + NONE_FOUND_AGAIN_MS)).toBe(true);
  });

  it('never asks for a PokéStop, a gym, or a Wayspot Wayfarer gave an address', () => {
    expect(spotAddressWanted({ ...SPOT, kind: 'stop' }, undefined, 2_000)).toBe(false);
    expect(spotAddressWanted({ ...SPOT, kind: 'gym' }, undefined, 2_000)).toBe(false);
    expect(
      spotAddressWanted({ ...SPOT, address: '1 Park Lane, Pinewood, US' }, undefined, 2_000),
    ).toBe(false);
  });
});
