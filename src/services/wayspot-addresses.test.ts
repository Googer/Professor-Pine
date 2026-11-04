import { describe, expect, it } from 'vitest';
import { FakeGeoGateway } from '../../test/support/geo.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  LOOKED_UP_GEODATA,
  wayspotAddressCases,
} from '../../test/support/wayspot-address-cases.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import type { GoogleBudget } from '../domain/geo/google-line.js';
import { NONE_FOUND_AGAIN_MS } from '../domain/geo/spot-address.js';
import { MemoryGoogleUse } from './google-use.js';
import {
  MEMBER_LOOKUPS_PER_DAY,
  MemoryWayspotAddresses,
  WayspotAddresses,
} from './wayspot-addresses.js';

describe('MemoryWayspotAddresses', () => {
  wayspotAddressCases(() => Promise.resolve(new MemoryWayspotAddresses()));
});

/** Noon on 2026-11-10 in California. */
const NOON = new Date('2026-11-10T12:00:00-08:00').getTime();
const BUDGET: GoogleBudget = { places: 4_500, reserve: 500, geocodes: 9_000, geocodesReserve: 500 };
const ALICE = { guildId: '412345678901234567', userId: '512345678901234567' };
const BOB = { guildId: '412345678901234567', userId: '612345678901234567' };

/** A Power Spot without Wayfarer's address, `n` as `keptRow`'s. */
const spot = (n: number, overrides: Parameters<typeof keptRow>[1] = {}) =>
  keptRow(n, { kind: 'powerspot', address: null, ...overrides });

/** The service over memory: Google faked, a clock the test moves, the month's counts. */
async function addressesWith(
  options: { rows?: MemoryWayspotAddresses; budget?: GoogleBudget; geocodesUsed?: number } = {},
) {
  const geo = new FakeGeoGateway();
  geo.addresses.set(`${spot(1).lat},${spot(1).lon}`, {
    route: 'Grant St',
    formatted_address: '600 Grant St, Pittsburgh, PA 15219, USA',
  });
  const use = new MemoryGoogleUse();
  for (let n = 0; n < (options.geocodesUsed ?? 0); n++) await use.use('2026-11-02', 'geocode');
  const storage = options.rows ?? new MemoryWayspotAddresses();
  const clock = { now: NOON };
  const { log, entries } = createTestLogger();
  const addresses = new WayspotAddresses({
    storage,
    geo,
    use,
    budget: options.budget ?? BUDGET,
    log,
    now: () => clock.now,
  });
  await addresses.load();
  return { addresses, geo, use, storage, clock, entries };
}

describe("a Power Spot's address asked for the map (WayspotAddresses)", () => {
  it('asks Google once at the spot, counts the geocode, keeps the answer and gives its line', async () => {
    const made = await addressesWith();
    expect(await made.addresses.ask(spot(1), ALICE)).toBe(
      '600 Grant St, Pittsburgh, PA 15219, USA',
    );
    expect(made.geo.questions('geocode')).toEqual([
      { what: 'geocode', point: { lat: spot(1).lat, lon: spot(1).lon } },
    ]);
    expect(made.use.total('geocode')).toBe(1);
    expect(made.storage.rows.get(wayspotId(1))).toMatchObject({
      lat: spot(1).lat,
      lon: spot(1).lon,
      askedAt: NOON,
    });
    expect(made.addresses.lookedUp(wayspotId(1))?.geodata).toContain('600 Grant St');
    // Kept: the next ask is answered at once, nothing asked or counted.
    expect(await made.addresses.ask(spot(1), BOB)).toBe('600 Grant St, Pittsburgh, PA 15219, USA');
    expect(made.geo.questions('geocode')).toHaveLength(1);
    expect(made.use.total('geocode')).toBe(1);
    // The address is never logged.
    expect(JSON.stringify(made.entries)).not.toContain('Grant');
  });

  it('reads the kept answers at load, and never asks for one kept where the spot is', async () => {
    const rows = new MemoryWayspotAddresses();
    await rows.save({
      wayspotId: wayspotId(2),
      lat: spot(2).lat,
      lon: spot(2).lon,
      geodata: LOOKED_UP_GEODATA,
      askedAt: 1,
    });
    const made = await addressesWith({ rows });
    expect(made.addresses.lookedUp(wayspotId(2))?.geodata).toBe(LOOKED_UP_GEODATA);
    expect(await made.addresses.ask(spot(2), ALICE)).toBe(
      '12 Église Street, Pinewood, PA 15000, USA',
    );
    // Moved 11 meters since: asked again where it is now.
    expect(await made.addresses.ask(spot(2, { lat: spot(2).lat + 0.0001 }), ALICE)).toBe(
      'Test Road, Pinewood',
    );
    expect(made.geo.questions('geocode')).toHaveLength(1);
  });

  it('asks one question for a spot asked twice at once, both waiting for its answer', async () => {
    const made = await addressesWith();
    const [first, second] = await Promise.all([
      made.addresses.ask(spot(1), ALICE),
      made.addresses.ask(spot(1), BOB),
    ]);
    expect(first).toBe('600 Grant St, Pittsburgh, PA 15219, USA');
    expect(second).toBe(first);
    expect(made.geo.questions('geocode')).toHaveLength(1);
    expect(made.use.total('geocode')).toBe(1);
  });

  it('never asks for a PokéStop or a spot Wayfarer gave an address', async () => {
    const made = await addressesWith();
    expect(await made.addresses.ask(keptRow(3, { address: null }), ALICE)).toBeNull();
    expect(await made.addresses.ask(spot(4, { address: '4 Main St, Pittsburgh, US' }), ALICE)).toBe(
      '4 Main St, Pittsburgh, US',
    );
    expect(made.geo.asked).toEqual([]);
  });

  it('keeps "none found" and asks again only 30 days after', async () => {
    const made = await addressesWith();
    made.geo.addresses.set(`${spot(5).lat},${spot(5).lon}`, {});
    expect(await made.addresses.ask(spot(5), ALICE)).toBeNull();
    expect(made.storage.rows.get(wayspotId(5))).toMatchObject({ geodata: null, askedAt: NOON });
    made.clock.now = NOON + NONE_FOUND_AGAIN_MS - 1;
    expect(await made.addresses.ask(spot(5), ALICE)).toBeNull();
    expect(made.geo.questions('geocode')).toHaveLength(1);
    made.clock.now = NOON + NONE_FOUND_AGAIN_MS;
    expect(await made.addresses.ask(spot(5), ALICE)).toBeNull();
    expect(made.geo.questions('geocode')).toHaveLength(2);
  });

  it('counts a question that failed, keeps nothing, and sets the spot aside until the next Pacific day', async () => {
    const made = await addressesWith();
    made.geo.failing.geocode = 'failed';
    expect(await made.addresses.ask(spot(1), ALICE)).toBeNull();
    expect(made.use.total('geocode')).toBe(1);
    expect(made.storage.rows.size).toBe(0);
    made.geo.failing = {};
    // 23:59 the same day in California: still aside.
    made.clock.now = new Date('2026-11-10T23:59:00-08:00').getTime();
    expect(await made.addresses.ask(spot(1), ALICE)).toBeNull();
    expect(made.use.total('geocode')).toBe(1);
    made.clock.now = new Date('2026-11-11T00:00:00-08:00').getTime();
    expect(await made.addresses.ask(spot(1), ALICE)).toBe(
      '600 Grant St, Pittsburgh, PA 15219, USA',
    );
    expect(made.use.total('geocode')).toBe(2);
  });

  it('counts nothing for a refused key or none, nor against the member', async () => {
    const made = await addressesWith();
    made.geo.failing.geocode = 'denied';
    for (let n = 0; n < MEMBER_LOOKUPS_PER_DAY + 1; n++) {
      expect(await made.addresses.ask(spot(10 + n), ALICE)).toBeNull();
    }
    made.geo.failing = {};
    made.geo.enabled = false;
    expect(await made.addresses.ask(spot(1), ALICE)).toBeNull();
    expect(made.use.total('geocode')).toBe(0);
    made.geo.enabled = true;
    // Nothing reached Google: the member's day is whole, the spots not set aside.
    expect(await made.addresses.ask(spot(1), ALICE)).toBe(
      '600 Grant St, Pittsburgh, PA 15219, USA',
    );
  });

  it('asks nothing once only the reserve of the month’s geocodes is left, those on their way counted', async () => {
    const tight = { ...BUDGET, geocodes: 12, geocodesReserve: 2 };
    const made = await addressesWith({ geocodesUsed: 9, budget: tight });
    // One geocode is left above the reserve: of two spots asked at once, one is asked.
    const answers = await Promise.all([
      made.addresses.ask(spot(1), ALICE),
      made.addresses.ask(spot(6), BOB),
    ]);
    expect(answers).toEqual(['600 Grant St, Pittsburgh, PA 15219, USA', null]);
    expect(made.geo.questions('geocode')).toHaveLength(1);
    expect(await made.addresses.ask(spot(7), BOB)).toBeNull();
    expect(made.geo.questions('geocode')).toHaveLength(1);
  });

  it('asks at most 100 new addresses a member a Pacific day; kept ones still show', async () => {
    const made = await addressesWith();
    expect(MEMBER_LOOKUPS_PER_DAY).toBe(100);
    for (let n = 0; n < MEMBER_LOOKUPS_PER_DAY; n++) {
      expect(await made.addresses.ask(spot(100 + n), ALICE)).not.toBeNull();
    }
    expect(await made.addresses.ask(spot(1), ALICE)).toBeNull();
    expect(made.geo.questions('geocode')).toHaveLength(MEMBER_LOOKUPS_PER_DAY);
    // What is kept still shows; another member may ask.
    expect(await made.addresses.ask(spot(100), ALICE)).toBe('Test Road, Pinewood');
    expect(await made.addresses.ask(spot(1), BOB)).toBe('600 Grant St, Pittsburgh, PA 15219, USA');
    // The same member in another server is another count.
    expect(
      await made.addresses.ask(spot(2), { ...ALICE, guildId: '412345678901234568' }),
    ).not.toBeNull();
    // The next Pacific day, a new count.
    made.clock.now = new Date('2026-11-11T00:00:00-08:00').getTime();
    expect(await made.addresses.ask(spot(3), ALICE)).not.toBeNull();
  });

  it('counts a lookup against the member as soon as it is on its way', async () => {
    const made = await addressesWith();
    let release!: () => void;
    made.geo.hold = new Promise((resolve) => {
      release = resolve;
    });
    const asked = Array.from({ length: MEMBER_LOOKUPS_PER_DAY + 1 }, (_, n) =>
      made.addresses.ask(spot(100 + n), ALICE),
    );
    release();
    const answers = await Promise.all(asked);
    expect(answers.filter((answer) => answer !== null)).toHaveLength(MEMBER_LOOKUPS_PER_DAY);
    expect(made.geo.questions('geocode')).toHaveLength(MEMBER_LOOKUPS_PER_DAY);
  });

  it('gives the answer and keeps it in memory when it could not be written', async () => {
    const made = await addressesWith();
    made.storage.failing = true;
    expect(await made.addresses.ask(spot(1), ALICE)).toBe(
      '600 Grant St, Pittsburgh, PA 15219, USA',
    );
    expect(made.addresses.lookedUp(wayspotId(1))).toBeDefined();
    expect(
      made.entries.some((entry) => entry.msg === 'could not keep a Power Spot’s address'),
    ).toBe(true);
    expect(JSON.stringify(made.entries)).not.toContain('Grant');
  });
});
