import { describe, expect, it } from 'vitest';
import { FakeGeoGateway } from '../../test/support/geo.js';
import { gymDirectoryWith, MemoryGyms } from '../../test/support/gym-store.js';
import {
  northRegion,
  OTHER_GUILD_ROW,
  TEST_GUILD_ROW,
  testRegions,
  WEST_CHANNEL,
} from '../../test/support/gyms.js';
import { regionsFixture } from '../../test/support/providers.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { watchEachTest } from '../../test/support/timers.js';
import { keptRow } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import type { WayspotRow } from '../domain/wayspots/kept.js';
import { GoogleAnswers, MemoryGoogleAnswerStorage } from './google-answers.js';
import { MemoryGoogleUse } from './google-use.js';
import { GoogleRanks } from './google-ranks.js';
import { MemoryGymLookups } from './gym-lookups.js';
import { GymUpkeep, type GymUpkeepOptions } from './gym-upkeep.js';
import { RegionDirectory, type RegionProvider } from './region-directory.js';
import { MemoryWayspotLookups } from './wayspot-lookups.js';
import { WayspotPlaces } from './wayspot-places.js';

const background = watchEachTest();

/** In West (40.00 to 40.10 north, -80.10 to -80.00): a stop and a Power Spot 100 m apart. */
const STOP = keptRow(1, { title: 'Mural', lat: 40.0301, lon: -80.0801 });
const SPOT = keptRow(2, { title: 'Bench', kind: 'powerspot', lat: 40.031, lon: -80.0801 });
/** Outside every region of every server. */
const AWAY = keptRow(3, { title: 'Far Away', lat: 41, lon: -81 });
/** A Wayfarer gym Pine did not take: never asked about as a Wayspot. */
const WAYFARER_GYM = keptRow(4, { title: 'Hall', kind: 'gym', lat: 40.04, lon: -80.08 });

/**
 * The line over no gyms (so that the Wayspots' turn comes at once) and kept Wayspots in the
 * invented regions, ranked by `GoogleRanks` over no history.
 */
async function lineWith(
  rows: readonly WayspotRow[],
  options: Partial<Omit<GymUpkeepOptions, 'parties'>> = {},
  regions: RegionDirectory | RegionProvider = regionsFixture(),
  others: readonly { guildId: number; rows: readonly WayspotRow[] }[] = [],
) {
  const { gyms, directory } = await gymDirectoryWith(new MemoryGyms([]));
  const { log } = createTestLogger();
  // Google's answers by the point (plan 19B-3).
  const answerStorage = new MemoryGoogleAnswerStorage();
  const answers = new GoogleAnswers({ storage: answerStorage, log });
  const { storage, wayspots } = await wayspotsWith(rows, regions, undefined, others, answers);
  const geo = new FakeGeoGateway();
  const spots = new MemoryWayspotLookups();
  const use = new MemoryGoogleUse();
  const places = new WayspotPlaces({ answers, log, setTimer: () => () => undefined });
  /** The servers whose search was told of new places, in order. */
  const told: number[] = [];
  places.whenChanged((guildId) => told.push(guildId));
  /** The answer about the places where a Wayspot is. */
  const placesAt = (wayspot: { lat: number; lon: number }) => answers.at('places', wayspot);
  const ranks = new GoogleRanks({
    regions,
    gymRegions: (guildId, id) => directory.regionsIn(guildId, id),
    wayspotRegions: (guildId, id) => wayspots.regionsIn(guildId, id),
    servers: () => Promise.resolve([]),
    activity: { raidsByRegion: () => Promise.resolve(new Map()) },
  });
  const timers: (() => void)[] = [];
  const waits: number[] = [];
  const upkeep = new GymUpkeep({
    gyms,
    directory,
    geo,
    parties: { active: () => [] },
    posts: { changed: () => undefined },
    log,
    setTimer: (run, ms) => {
      timers.push(run);
      waits.push(ms);
      return () => {
        const index = timers.indexOf(run);
        if (index >= 0) timers.splice(index, 1);
      };
    },
    lookups: new MemoryGymLookups(),
    use,
    ranks,
    wayspots,
    wayspotLookups: spots,
    answers,
    places,
    ...(regions instanceof RegionDirectory ? { outlineChanges: regions } : {}),
    ...options,
  });
  return {
    upkeep,
    geo,
    storage,
    wayspots,
    spots,
    use,
    places,
    answers,
    answerStorage,
    placesAt,
    told,
    timers,
    waits,
  };
}

describe('GymUpkeep: PokéStops and Power Spots in the line', () => {
  it('queues the stops and Power Spots of the regions, stops first, and keeps their places', async () => {
    const { upkeep, geo, spots, placesAt, told } = await lineWith([STOP, SPOT, AWAY, WAYFARER_GYM]);
    await upkeep.resume();
    expect((await spots.list()).map((row) => [row.wayspotId, row.kind])).toEqual([
      [STOP.id, 'stop'],
      [SPOT.id, 'powerspot'],
    ]);
    expect(await upkeep.waitingWayspots()).toBe(2);
    await upkeep.flush();
    const asked = geo.questions('places');
    expect(asked.map((question) => question.point.lat)).toEqual([STOP.lat, SPOT.lat]);
    // Half the way to the nearest stop or Power Spot: each gets its own businesses.
    expect(asked[0]?.radius).toBeCloseTo(metresBetween(STOP, SPOT) / 2, 5);
    // No address is ever asked for a Wayspot.
    expect(geo.questions('geocode')).toEqual([]);
    // Kept as the point's answer, and the server's search told (once within the hour).
    expect(placesAt(STOP)).toMatchObject({
      kind: 'places',
      lat: STOP.lat,
      lon: STOP.lon,
      answer: 'Corner Bakery Maple Dental',
    });
    expect(told).toEqual([TEST_GUILD_ROW]);
    expect(await spots.count()).toBe(0);
    // Asked once: not queued again at the next start.
    await upkeep.resume();
    expect(await spots.count()).toBe(0);
  });

  it('asks a stop’s places in the circle of its own server’s gyms, never another server’s', async () => {
    const { gyms, directory } = await gymDirectoryWith(new MemoryGyms([]));
    // The second server's gym 30 m from the stop, the test server's own 80 m off.
    const theirs = await gyms.create(
      { name: 'Theirs', lat: STOP.lat + 0.00027, lon: STOP.lon },
      OTHER_GUILD_ROW,
    );
    const ours = await gyms.create(
      { name: 'Ours', lat: STOP.lat - 0.00072, lon: STOP.lon },
      TEST_GUILD_ROW,
    );
    await directory.refreshGyms([theirs.id, ours.id]);
    const made = await lineWith([STOP, SPOT], { gyms, directory });
    await made.upkeep.resume();
    await made.upkeep.flush();
    const asked = made.geo.questions('places').find((one) => one.point.lat === STOP.lat);
    expect(asked?.radius).toBeCloseTo(metresBetween(STOP, directory.stored(ours.id)!) / 2, 5);
  });

  it('comes after every gym', async () => {
    const { gyms, directory } = await gymDirectoryWith();
    const made = await lineWith([STOP], { gyms, directory });
    await made.upkeep.resume();
    expect(await made.upkeep.waiting()).toBeGreaterThan(0);
    await made.upkeep.flush();
    const lats = made.geo.questions('places').map((question) => question.point.lat);
    expect(lats.at(-1)).toBe(STOP.lat);
    expect(lats.indexOf(STOP.lat)).toBe(lats.length - 1);
  });

  it('asks stops and Power Spots at an even share of each day', async () => {
    // October 11 at 8 p.m. in California: 21 days left with today, a share of 1 a day; the next
    // day begins in four hours (within the longest timer the line sets).
    let now = new Date('2026-10-11T20:00:00-07:00').getTime();
    const made = await lineWith([STOP, SPOT], {
      budget: { places: 23, reserve: 2, geocodes: 100, geocodesReserve: 0 },
      now: () => now,
    });
    await made.upkeep.resume();
    await made.upkeep.flush();
    expect(made.use.days.get('2026-10-11')?.places).toBe(1);
    expect(await made.spots.count()).toBe(1);
    // The line waits for tomorrow.
    made.timers.splice(0);
    made.waits.splice(0);
    await made.upkeep.resume();
    made.timers.shift()?.();
    await background.settle();
    expect(made.waits.at(-1)).toBe(new Date('2026-10-12T00:00:00-07:00').getTime() - now);
    now = new Date('2026-10-12T00:05:00-07:00').getTime();
    await made.upkeep.flush();
    expect(made.use.days.get('2026-10-12')?.places).toBe(1);
    expect(await made.spots.count()).toBe(0);
  });

  it('asks a gym queued while the line waits for tomorrow at the usual pace', async () => {
    // The day's share of stops used (as above): the line waits four hours for tomorrow.
    const now = new Date('2026-10-11T20:00:00-07:00').getTime();
    const { gyms, directory } = await gymDirectoryWith(new MemoryGyms([]));
    const made = await lineWith([STOP, SPOT], {
      gyms,
      directory,
      budget: { places: 23, reserve: 2, geocodes: 100, geocodesReserve: 0 },
      now: () => now,
    });
    await made.upkeep.resume();
    await made.upkeep.flush();
    made.timers.splice(0);
    made.waits.splice(0);
    await made.upkeep.resume();
    made.timers.shift()?.();
    await background.settle();
    expect(made.waits.at(-1)).toBe(4 * 3_600_000);
    // A gym an import adds: the month's budget allows it, so it does not wait for tomorrow.
    const gym = await gyms.create({ name: 'New Gym', lat: 40.05, lon: -80.05 }, 1);
    await directory.refreshGym(gym.id);
    await made.upkeep.placed(gym.id, { places: 'later' });
    expect(made.timers).toHaveLength(1);
    expect(made.waits.at(-1)).toBe(5_000);
    made.timers.shift()?.();
    await background.settle();
    expect(made.geo.questions('places').at(-1)?.point).toEqual({ lat: 40.05, lon: -80.05 });
    expect(await made.upkeep.waiting()).toBe(0);
  });

  it('asks again a Wayspot that moved farther than ten meters, and keeps the places of a place', async () => {
    const made = await lineWith([STOP, SPOT]);
    await made.upkeep.resume();
    await made.upkeep.flush();
    expect(made.placesAt(STOP)).toBeDefined();
    expect(made.placesAt(SPOT)).toBeDefined();
    // A later import: the stop moved 50 m and is a Power Spot now; the spot a few meters only;
    // a new stop came.
    const fresh = keptRow(5, { title: 'Fresh', lat: 40.06, lon: -80.06 });
    await made.storage.saveFromImport(
      TEST_GUILD_ROW,
      {
        upsert: [
          { ...STOP, kind: 'powerspot', lat: STOP.lat + 0.00045 },
          { ...SPOT, kind: 'stop', lat: SPOT.lat + 0.00001 },
          fresh,
        ],
        remove: [],
      },
      2_000,
    );
    await made.wayspots.load();
    await made.upkeep.flush();
    // The places around a place are its point's, whatever stands there (plan 19B-3): another
    // kind a few meters off is not asked again.
    expect(made.geo.questions('places').map((question) => question.point.lat)).toEqual([
      STOP.lat,
      SPOT.lat,
      fresh.lat,
      STOP.lat + 0.00045,
    ]);
    // The spot becomes a gym: it is not queued, and its place keeps its answer.
    await made.storage.saveFromImport(TEST_GUILD_ROW, { upsert: [], remove: [SPOT.id] }, 3_000);
    await made.wayspots.load();
    await made.upkeep.flush();
    expect(made.geo.questions('places')).toHaveLength(4);
    expect(made.placesAt(SPOT)).toBeDefined();
    expect(made.placesAt(fresh)).toBeDefined();
  });

  it('keeps a stop of two servers waiting once per server, by each one’s regions, and asks its place once', async () => {
    // North (the second server's) over West: both servers keep the stop, each its own copy (at
    // one place, as two imports of one Wayspot put it, under another title).
    const regions = regionsFixture([
      ...testRegions(),
      { ...northRegion(), bounds: testRegions()[0]!.bounds },
    ]);
    const away = { ...STOP, title: 'Away’s Mural' };
    const made = await lineWith([STOP], {}, regions, [{ guildId: OTHER_GUILD_ROW, rows: [away] }]);
    await made.upkeep.resume();
    expect((await made.spots.list()).map((row) => [row.guildId, row.wayspotId])).toEqual([
      [TEST_GUILD_ROW, STOP.id],
      [OTHER_GUILD_ROW, STOP.id],
    ]);
    await made.upkeep.flush();
    // One question, for both: the second row found its place answered, and left unasked.
    expect(made.geo.questions('places')).toHaveLength(1);
    expect(await made.spots.count()).toBe(0);
    // Each server's search is told of its own.
    expect([...made.told].sort()).toEqual([TEST_GUILD_ROW, OTHER_GUILD_ROW]);
    expect(made.placesAt(away)?.answer).toBe(made.placesAt(STOP)?.answer);
    // Asked once: neither server's copy waits again.
    await made.upkeep.resume();
    expect(await made.spots.count()).toBe(0);
  });

  it('brings only the changed server’s part of the line up to date after its import', async () => {
    const regions = regionsFixture([
      ...testRegions(),
      { ...northRegion(), bounds: testRegions()[0]!.bounds },
    ]);
    const away = { ...SPOT, title: 'Away’s Bench' };
    const made = await lineWith([STOP], {}, regions, [{ guildId: OTHER_GUILD_ROW, rows: [away] }]);
    await made.upkeep.resume();
    const read: (number | 'all')[] = [];
    const list = made.spots.list.bind(made.spots);
    made.spots.list = () => {
      read.push('all');
      return list();
    };
    const ofServer = made.spots.ofServer.bind(made.spots);
    made.spots.ofServer = (guildId) => {
      read.push(guildId);
      return ofServer(guildId);
    };
    // The test server's import adds a stop; the other server's is as it was.
    const fresh = keptRow(5, { title: 'Fresh', lat: 40.06, lon: -80.06 });
    await made.storage.saveFromImport(TEST_GUILD_ROW, { upsert: [STOP, fresh], remove: [] }, 2_000);
    await made.wayspots.load(TEST_GUILD_ROW);
    await background.settle();
    expect(read).toEqual([TEST_GUILD_ROW]);
    expect((await made.spots.list()).map((row) => [row.guildId, row.wayspotId])).toEqual([
      [TEST_GUILD_ROW, STOP.id],
      [TEST_GUILD_ROW, fresh.id],
      [OTHER_GUILD_ROW, away.id],
    ]);
  });

  it('queues a server’s copy in a region of its own alone', async () => {
    // The second server keeps the stop too, but has no region over it.
    const made = await lineWith([STOP], {}, regionsFixture(), [
      { guildId: OTHER_GUILD_ROW, rows: [STOP] },
    ]);
    await made.upkeep.resume();
    expect((await made.spots.list()).map((row) => [row.guildId, row.wayspotId])).toEqual([
      [TEST_GUILD_ROW, STOP.id],
    ]);
  });

  it('queues the stops a region newly covers when the regions change, with nothing else waiting', async () => {
    // West is not there yet: the stop and the Power Spot lie in no region.
    let listed = testRegions().filter((region) => region.channelId !== WEST_CHANNEL);
    const regions = new RegionDirectory({
      regions: { listAll: () => Promise.resolve(listed) },
      log: createTestLogger().log,
    });
    await regions.load();
    const made = await lineWith([STOP, SPOT], {}, regions);
    await made.upkeep.resume();
    expect(await made.spots.count()).toBe(0);
    // A region saved (`/region import`, the editor): its stops wait for Google at once.
    listed = testRegions();
    await regions.load();
    await background.settle();
    expect((await made.spots.list()).map((row) => row.wayspotId)).toEqual([STOP.id, SPOT.id]);
    expect(made.timers).toHaveLength(1);
  });

  it('brings the line up to date one run at a time: an older run never undoes a newer one', async () => {
    let listed = testRegions().filter((region) => region.channelId !== WEST_CHANNEL);
    const regions = new RegionDirectory({
      regions: { listAll: () => Promise.resolve(listed) },
      log: createTestLogger().log,
    });
    await regions.load();
    const made = await lineWith([STOP, SPOT], {}, regions);
    await made.upkeep.resume();
    // The first run's write of the line waits until the test lets it through.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const add = made.spots.add.bind(made.spots);
    let held = false;
    made.spots.add = async (rows, at) => {
      if (rows.length > 0 && !held) {
        held = true;
        await gate;
      }
      return add(rows, at);
    };
    // West saved: a run queues its stops, held at its write.
    listed = testRegions();
    await regions.load();
    await background.settle();
    expect(held).toBe(true);
    // West removed again before that write landed.
    listed = testRegions().filter((region) => region.channelId !== WEST_CHANNEL);
    await regions.load();
    await background.settle();
    release();
    await background.settle();
    // The stops of a region that is gone do not wait.
    expect(await made.spots.count()).toBe(0);
  });

  it('brings only the line of the server whose outlines changed up to date', async () => {
    // North (the second server's) over West, where both servers keep a stop.
    const north = { ...northRegion(), bounds: testRegions()[0]!.bounds };
    let listed = [...testRegions(), north];
    const regions = new RegionDirectory({
      regions: { listAll: () => Promise.resolve(listed) },
      log: createTestLogger().log,
    });
    await regions.load();
    const away = { ...SPOT, title: 'Away’s Bench' };
    const made = await lineWith([STOP], {}, regions, [{ guildId: OTHER_GUILD_ROW, rows: [away] }]);
    await made.upkeep.resume();
    const read: (number | 'all')[] = [];
    const list = made.spots.list.bind(made.spots);
    made.spots.list = () => {
      read.push('all');
      return list();
    };
    const ofServer = made.spots.ofServer.bind(made.spots);
    made.spots.ofServer = (guildId) => {
      read.push(guildId);
      return ofServer(guildId);
    };
    // The second server saves its outline anew (its corners in another order).
    listed = [...testRegions(), { ...north, bounds: north.bounds?.slice().reverse() ?? null }];
    await regions.load();
    await background.settle();
    expect(read).toEqual([OTHER_GUILD_ROW]);
  });

  it('leaves the line alone at a load of the regions that changes no outline', async () => {
    let listed = testRegions();
    const regions = new RegionDirectory({
      regions: { listAll: () => Promise.resolve(listed) },
      log: createTestLogger().log,
    });
    await regions.load();
    const made = await lineWith([STOP, SPOT], {}, regions);
    await made.upkeep.resume();
    let read = 0;
    const list = made.spots.list.bind(made.spots);
    made.spots.list = () => {
      read++;
      return list();
    };
    // `/admin setup-forums` records a forum and a board: many loads, no outline changed.
    listed = testRegions().map((region) => ({ ...region, summaryMessageId: '900000000000000001' }));
    await regions.load();
    await regions.load();
    await background.settle();
    expect(read).toBe(0);
  });

  it('queues the stops of Pine’s own as PokéStops', async () => {
    const made = await lineWith([]);
    made.wayspots.setPineStops([
      {
        stop: {
          id: 7,
          serverId: '1',
          name: 'Sponsored Cafe',
          lat: 40.02,
          lon: -80.02,
          address: null,
          createdBy: '1',
          createdAt: 1,
          updatedBy: '1',
          updatedAt: 1,
        },
        guildRow: 1,
      },
    ]);
    await made.upkeep.resume();
    expect((await made.spots.list()).map((row) => [row.wayspotId, row.kind])).toEqual([
      ['pine-7', 'stop'],
    ]);
  });

  it('asks the stops while a gym whose question keeps failing waits for the next day', async () => {
    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
    const { gyms, directory } = await gymDirectoryWith(new MemoryGyms([]));
    const stuck = await gyms.create({ name: 'Stuck', lat: 40.05, lon: -80.05 }, 1);
    await directory.refreshGym(stuck.id);
    const made = await lineWith([STOP], { gyms, directory, now: () => now });
    let stuckAsked = 0;
    const placesNear = made.geo.placesNear.bind(made.geo);
    made.geo.placesNear = (point, radius) => {
      if (point.lat !== 40.05) return placesNear(point, radius);
      stuckAsked++;
      return Promise.resolve({ ok: false, reason: 'failed' });
    };
    await made.upkeep.resume();
    expect(await made.upkeep.waiting()).toBe(1);
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    expect(stuckAsked).toBe(1);
    expect(made.placesAt(STOP)).toBeDefined();
    expect(await made.upkeep.waiting()).toBe(1);
    now += 24 * 3_600_000;
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    expect(stuckAsked).toBe(2);
  });

  it('sets a stop whose question keeps failing aside until the next day, and asks the others', async () => {
    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
    const other = keptRow(6, { title: 'Other Mural', lat: 40.032, lon: -80.0801 });
    const made = await lineWith([STOP, other], { now: () => now });
    let stuckAsked = 0;
    const placesNear = made.geo.placesNear.bind(made.geo);
    made.geo.placesNear = (point, radius) => {
      if (point.lat !== STOP.lat) return placesNear(point, radius);
      stuckAsked++;
      return Promise.resolve({ ok: false, reason: 'failed' });
    };
    await made.upkeep.resume();
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    expect(stuckAsked).toBe(1);
    expect(made.placesAt(other)).toBeDefined();
    expect((await made.spots.list()).map((row) => row.wayspotId)).toEqual([STOP.id]);
    now += 24 * 3_600_000;
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    expect(stuckAsked).toBe(2);
  });

  it('sets a stop whose places cannot be written aside until the next day, as a failed question', async () => {
    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
    const other = keptRow(6, { title: 'Other Mural', lat: 40.032, lon: -80.0801 });
    const made = await lineWith([STOP, other], { now: () => now });
    const save = made.answerStorage.save.bind(made.answerStorage);
    made.answerStorage.save = (rows) =>
      rows.some((row) => row.lat === STOP.lat)
        ? Promise.reject(new Error('database is down'))
        : save(rows);
    await made.upkeep.resume();
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    const atStop = () =>
      made.geo.questions('places').filter((question) => question.point.lat === STOP.lat).length;
    expect(atStop()).toBe(1);
    expect(made.placesAt(other)).toBeDefined();
    expect(await made.spots.count()).toBe(1);
    now += 24 * 3_600_000;
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    expect(atStop()).toBe(2);
  });

  it('does not ask again a stop whose places were written, though its turn failed after', async () => {
    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
    const made = await lineWith([STOP], { now: () => now });
    await made.upkeep.resume();
    // The places are kept and the stop leaves the line; the read of the line after it fails once.
    const any = made.spots.any.bind(made.spots);
    let failing = true;
    made.spots.any = () => {
      if (!failing) return any();
      failing = false;
      return Promise.reject(new Error('database is down'));
    };
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    now += 24 * 3_600_000;
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    expect(made.geo.questions('places')).toHaveLength(1);
    expect(made.placesAt(STOP)).toBeDefined();
    expect(await made.spots.count()).toBe(0);
  });

  it('keeps a stop whose question failed, after the other stops, and the line waits longer', async () => {
    const other = keptRow(6, { title: 'Other Mural', lat: 40.032, lon: -80.0801 });
    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
    const made = await lineWith([STOP, other], { now: () => now });
    await made.upkeep.resume();
    made.geo.failing = { places: 'failed' };
    await made.upkeep.flush();
    expect(made.use.total('places')).toBe(1);
    expect((await made.spots.list()).map((row) => row.wayspotId)).toEqual([other.id, STOP.id]);
    made.geo.failing = {};
    await made.upkeep.flush();
    // The other stop is asked; the one that failed waits for the next day.
    expect((await made.spots.list()).map((row) => row.wayspotId)).toEqual([STOP.id]);
    now += 24 * 3_600_000;
    await made.upkeep.flush();
    expect(await made.spots.count()).toBe(0);
  });
});
