import { describe, expect, it } from 'vitest';
import { FakeGeoGateway } from '../../test/support/geo.js';
import { gymDirectoryWith, MemoryGyms } from '../../test/support/gym-store.js';
import { testRegions, WEST_CHANNEL } from '../../test/support/gyms.js';
import { regionsFixture } from '../../test/support/providers.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { watchEachTest } from '../../test/support/timers.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import type { WayspotRow } from '../domain/wayspots/kept.js';
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
) {
  const { gyms, directory } = await gymDirectoryWith(new MemoryGyms([]));
  const { storage, wayspots } = await wayspotsWith(rows, regions);
  const geo = new FakeGeoGateway();
  const { log } = createTestLogger();
  const spots = new MemoryWayspotLookups();
  const use = new MemoryGoogleUse();
  const places = new WayspotPlaces({ storage: spots, log, setTimer: () => () => undefined });
  await places.load();
  const ranks = new GoogleRanks({
    regions,
    gymRegions: (id) => directory.regionsOf(id),
    wayspotRegions: (id) => wayspots.regionsOf(id),
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
    places,
    ...(regions instanceof RegionDirectory ? { outlineChanges: regions } : {}),
    ...options,
  });
  return { upkeep, geo, storage, wayspots, spots, use, places, timers, waits };
}

describe('GymUpkeep: PokéStops and Power Spots in the line', () => {
  it('queues the stops and Power Spots of the regions, stops first, and keeps their places', async () => {
    const { upkeep, geo, spots, places } = await lineWith([STOP, SPOT, AWAY, WAYFARER_GYM]);
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
    expect(places.get(STOP.id)).toMatchObject({
      kind: 'stop',
      lat: STOP.lat,
      lon: STOP.lon,
      places: 'Corner Bakery Maple Dental',
    });
    expect(await spots.count()).toBe(0);
    // Asked once: not queued again at the next start.
    await upkeep.resume();
    expect(await spots.count()).toBe(0);
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
      budget: { places: 23, reserve: 2, geocodes: 100 },
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
      budget: { places: 23, reserve: 2, geocodes: 100 },
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
    const gym = await gyms.create({ name: 'New Gym', lat: 40.05, lon: -80.05 });
    await directory.refreshGym(gym.id);
    await made.upkeep.placed(gym.id, { places: 'later' });
    expect(made.timers).toHaveLength(1);
    expect(made.waits.at(-1)).toBe(5_000);
    made.timers.shift()?.();
    await background.settle();
    expect(made.geo.questions('places').at(-1)?.point).toEqual({ lat: 40.05, lon: -80.05 });
    expect(await made.upkeep.waiting()).toBe(0);
  });

  it('asks again a Wayspot that moved or became a Power Spot, and forgets one that became a gym', async () => {
    const made = await lineWith([STOP, SPOT]);
    await made.upkeep.resume();
    await made.upkeep.flush();
    expect(made.places.ids().sort()).toEqual([STOP.id, SPOT.id].sort());
    // A later import: the stop moved 50 m and is a Power Spot now; the spot a few meters only;
    // a new stop came.
    const fresh = keptRow(5, { title: 'Fresh', lat: 40.06, lon: -80.06 });
    await made.storage.saveFromImport(
      {
        upsert: [
          { ...STOP, kind: 'powerspot', lat: STOP.lat + 0.00045 },
          { ...SPOT, lat: SPOT.lat + 0.00001 },
          fresh,
        ],
        remove: [],
      },
      2_000,
    );
    await made.wayspots.load();
    await made.upkeep.flush();
    expect(made.geo.questions('places').map((question) => question.point.lat)).toEqual([
      STOP.lat,
      SPOT.lat,
      fresh.lat,
      STOP.lat + 0.00045,
    ]);
    expect(made.places.get(STOP.id)?.kind).toBe('powerspot');
    // The spot becomes a gym: its places go, and it is not queued.
    await made.storage.saveFromImport({ upsert: [], remove: [SPOT.id] }, 3_000);
    await made.wayspots.load();
    await made.upkeep.flush();
    expect(made.places.get(SPOT.id)).toBeUndefined();
    expect(made.places.get(wayspotId(5))).toBeDefined();
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
    const stuck = await gyms.create({ name: 'Stuck', lat: 40.05, lon: -80.05 });
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
    expect(made.places.get(STOP.id)).toBeDefined();
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
    expect(made.places.get(other.id)).toBeDefined();
    expect((await made.spots.list()).map((row) => row.wayspotId)).toEqual([STOP.id]);
    now += 24 * 3_600_000;
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    expect(stuckAsked).toBe(2);
  });

  it('sets a stop whose places cannot be written aside until the next day, as a failed question', async () => {
    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
    const other = keptRow(6, { title: 'Other Mural', lat: 40.032, lon: -80.0801 });
    const made = await lineWith([STOP, other], { now: () => now });
    const saveAsked = made.spots.saveAsked.bind(made.spots);
    made.spots.saveAsked = (row) =>
      row.wayspotId === STOP.id ? Promise.reject(new Error('database is down')) : saveAsked(row);
    await made.upkeep.resume();
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    const atStop = () =>
      made.geo.questions('places').filter((question) => question.point.lat === STOP.lat).length;
    expect(atStop()).toBe(1);
    expect(made.places.get(other.id)).toBeDefined();
    expect(await made.spots.count()).toBe(1);
    now += 24 * 3_600_000;
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    expect(atStop()).toBe(2);
  });

  it('does not ask again a stop whose places were written, though its turn failed after', async () => {
    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
    const made = await lineWith([STOP], { now: () => now });
    await made.upkeep.resume();
    // The places are kept and the stop leaves the line; the count after it fails once.
    const count = made.spots.count.bind(made.spots);
    let failing = true;
    made.spots.count = () => {
      if (!failing) return count();
      failing = false;
      return Promise.reject(new Error('database is down'));
    };
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    now += 24 * 3_600_000;
    for (let turn = 0; turn < 4; turn++) await made.upkeep.flush();
    expect(made.geo.questions('places')).toHaveLength(1);
    expect(made.places.get(STOP.id)).toBeDefined();
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
