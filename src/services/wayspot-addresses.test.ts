import { describe, expect, it } from 'vitest';
import { FakeGeoGateway } from '../../test/support/geo.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { LOOKED_UP_GEODATA } from '../../test/support/google-answer-cases.js';
import { keptRow } from '../../test/support/wayspot-cases.js';
import { answerPoint } from '../domain/geo/answer-point.js';
import type { GoogleBudget } from '../domain/geo/google-line.js';
import { NONE_FOUND_AGAIN_MS } from '../domain/geo/spot-address.js';
import { MemoryGoogleUse, type GoogleUse } from './google-use.js';
import { GoogleAnswers, MemoryGoogleAnswerStorage } from './google-answers.js';
import { MEMBER_LOOKUPS_PER_DAY, WayspotAddresses } from './wayspot-addresses.js';

/** Noon on 2026-11-10 in California. */
const NOON = new Date('2026-11-10T12:00:00-08:00').getTime();
const BUDGET: GoogleBudget = { places: 4_500, reserve: 500, geocodes: 9_000, geocodesReserve: 500 };
const ALICE = { guildId: '412345678901234567', userId: '512345678901234567' };
const BOB = { guildId: '412345678901234567', userId: '612345678901234567' };

/**
 * A Power Spot without Wayfarer's address, `n` as `keptRow`'s, 111 m from the next: an answer is
 * the point's, and serves every place within ten meters (plan 19B-3).
 */
const spot = (n: number, overrides: Parameters<typeof keptRow>[1] = {}) =>
  keptRow(n, { kind: 'powerspot', address: null, lat: 40.44 + n / 1_000, ...overrides });

/** The service over memory: Google faked, a clock the test moves, the month's counts. */
async function addressesWith(
  options: { rows?: MemoryGoogleAnswerStorage; budget?: GoogleBudget; geocodesUsed?: number } = {},
) {
  const geo = new FakeGeoGateway();
  geo.addresses.set(`${spot(1).lat},${spot(1).lon}`, {
    route: 'Grant St',
    formatted_address: '600 Grant St, Pittsburgh, PA 15219, USA',
  });
  const use = new MemoryGoogleUse();
  for (let n = 0; n < (options.geocodesUsed ?? 0); n++) await use.use('2026-11-02', 'geocode');
  const storage = options.rows ?? new MemoryGoogleAnswerStorage();
  const clock = { now: NOON };
  const { log, entries } = createTestLogger();
  // The answers by the point (plan 19B-3), read at start.
  const answers = new GoogleAnswers({ storage, log });
  await answers.load();
  const addresses = new WayspotAddresses({
    answers,
    geo,
    use,
    budget: options.budget ?? BUDGET,
    log,
    now: () => clock.now,
  });
  return { addresses, answers, geo, use, storage, clock, entries };
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
    expect(await made.storage.all()).toMatchObject([
      { kind: 'address', ...answerPoint(spot(1)), askedAt: NOON },
    ]);
    expect(made.addresses.lookedUp(spot(1))?.geodata).toContain('600 Grant St');
    // Kept: the next ask is answered at once, nothing asked or counted.
    expect(await made.addresses.ask(spot(1), BOB)).toBe('600 Grant St, Pittsburgh, PA 15219, USA');
    expect(made.geo.questions('geocode')).toHaveLength(1);
    expect(made.use.total('geocode')).toBe(1);
    // The address is never logged.
    expect(JSON.stringify(made.entries)).not.toContain('Grant');
  });

  it('reads the kept answers at load, and never asks for one kept where the spot is', async () => {
    const rows = new MemoryGoogleAnswerStorage();
    await rows.save([
      {
        kind: 'address',
        lat: spot(2).lat,
        lon: spot(2).lon,
        answer: LOOKED_UP_GEODATA,
        askedAt: 1,
      },
    ]);
    const made = await addressesWith({ rows });
    expect(made.addresses.lookedUp(spot(2))?.geodata).toBe(LOOKED_UP_GEODATA);
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
    expect(made.answers.at('address', spot(5))).toMatchObject({ answer: null, askedAt: NOON });
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
    expect(made.answers.size).toBe(0);
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

  // Review: a read of the month that begins before an earlier question's count is written, and
  // ends after it, must not miss that question.
  it('never passes the reserve when a read of the month straddles the count of a question', async () => {
    const memory = new MemoryGoogleUse();
    for (let n = 0; n < 9; n++) await memory.use('2026-11-02', 'geocode');
    /** A's count, held once it is on its way; the next read of the month, held once its snapshot is taken. */
    let writeOnItsWay!: () => void;
    const writing = new Promise<void>((resolve) => {
      writeOnItsWay = resolve;
    });
    let landWrite!: () => void;
    const writeHeld = new Promise<void>((resolve) => {
      landWrite = resolve;
    });
    let readHeld: Promise<void> | undefined;
    const use: GoogleUse = {
      use: async (day, counted) => {
        writeOnItsWay();
        await writeHeld;
        await memory.use(day, counted);
      },
      usedOn: async (days) => {
        const snapshot = await memory.usedOn(days);
        const held = readHeld;
        readHeld = undefined;
        await held;
        return snapshot;
      },
    };
    const geo = new FakeGeoGateway();
    const answers = new GoogleAnswers({
      storage: new MemoryGoogleAnswerStorage(),
      log: createTestLogger().log,
    });
    const addresses = new WayspotAddresses({
      answers,
      geo,
      use,
      // One geocode left above the reserve.
      budget: { ...BUDGET, geocodes: 12, geocodesReserve: 2 },
      log: createTestLogger().log,
      now: () => NOON,
    });
    const a = addresses.ask(spot(1), ALICE);
    await writing;
    // C's read of the month starts while A's count is on its way, and ends after it landed.
    let endRead!: () => void;
    readHeld = new Promise<void>((resolve) => {
      endRead = resolve;
    });
    const c = addresses.ask(spot(6), BOB);
    landWrite();
    await a;
    endRead();
    expect(await c).toBeNull();
    expect(geo.questions('geocode')).toHaveLength(1);
    expect(memory.total('geocode')).toBe(10);
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

  it('gives the answer when it could not be kept, which is asked again the next time', async () => {
    const made = await addressesWith();
    made.storage.failing = true;
    expect(await made.addresses.ask(spot(1), ALICE)).toBe(
      '600 Grant St, Pittsburgh, PA 15219, USA',
    );
    expect(made.addresses.lookedUp(spot(1))).toBeUndefined();
    expect(
      made.entries.some((entry) => entry.msg === 'could not keep a Power Spot’s address'),
    ).toBe(true);
    expect(JSON.stringify(made.entries)).not.toContain('Grant');
  });

  it('asks once for one place, whichever server’s copy of the Power Spot asks (plan 19B-3)', async () => {
    const made = await addressesWith();
    const away = { guildId: '412345678901234568', userId: ALICE.userId };
    expect(await made.addresses.ask(spot(1), ALICE)).toBe(
      '600 Grant St, Pittsburgh, PA 15219, USA',
    );
    // Away's copy of it, where its own import put the place (within a meter: its own point).
    expect(await made.addresses.ask(spot(1, { lat: spot(1).lat + 0.000005 }), away)).toBe(
      '600 Grant St, Pittsburgh, PA 15219, USA',
    );
    expect(made.geo.questions('geocode')).toHaveLength(1);
    // Two servers' copies asked at once: one question.
    const both = await Promise.all([
      made.addresses.ask(spot(8), ALICE),
      made.addresses.ask(spot(8), away),
    ]);
    expect(both[0]).toBe(both[1]);
    expect(made.geo.questions('geocode')).toHaveLength(2);
  });

  it('asks about a Power Spot 8 m from an answered place, whose answer it shows only meanwhile', async () => {
    const made = await addressesWith();
    expect(await made.addresses.ask(spot(1), ALICE)).toBe(
      '600 Grant St, Pittsburgh, PA 15219, USA',
    );
    const near = spot(1, { lat: spot(1).lat + 0.000072 });
    // Without Google, the neighbor's answer is what it shows, as every reader shows it.
    made.geo.enabled = false;
    expect(await made.addresses.ask(near, ALICE)).toBe('600 Grant St, Pittsburgh, PA 15219, USA');
    expect(made.geo.questions('geocode')).toHaveLength(1);
    // Its own point was never asked: it is, and keeps its own answer.
    made.geo.enabled = true;
    expect(await made.addresses.ask(near, BOB)).toBe('Test Road, Pinewood');
    expect(made.geo.questions('geocode')).toEqual([
      { what: 'geocode', point: { lat: spot(1).lat, lon: spot(1).lon } },
      { what: 'geocode', point: { lat: near.lat, lon: near.lon } },
    ]);
    expect(made.answers.ownAt('address', near)?.answer).toContain('Test Road');
    expect(await made.addresses.ask(spot(1), BOB)).toBe('600 Grant St, Pittsburgh, PA 15219, USA');
  });
});
