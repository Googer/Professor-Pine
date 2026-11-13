import { gymStop } from '../domain/party/stops.js';
import { describe, expect, it } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import { FAKE_ADDRESS, FakeGeoGateway } from '../../test/support/geo.js';
import { gymDirectoryWith, MemoryGyms } from '../../test/support/gym-store.js';
import { testGyms } from '../../test/support/gyms.js';
import { testMeetup, testRaid, testTrain } from '../../test/support/parties.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import { NO_REGION_RANK } from '../domain/geo/google-line.js';
import { nearestBlockChanges } from '../domain/gyms/nearest.js';
import type { Party, TrainParty } from '../domain/party/party.js';
import { MemoryGoogleUse } from './google-use.js';
import { MemoryGymLookups } from './gym-lookups.js';
import { GymUpkeep, MAX_TIMER_MS, type GymUpkeepOptions } from './gym-upkeep.js';

/** Gym 10 (Lakeview Trailhead) lies far from every other gym: what is put beside it is its nearest. */
const LONELY = 10;
const BESIDE_LONELY = { lat: 40.5009, lon: -80.05 };

async function upkeepWith(
  options: Partial<Omit<GymUpkeepOptions, 'parties'>> & { parties?: Party[] } = {},
) {
  const { gyms, directory } = await gymDirectoryWith();
  const geo = new FakeGeoGateway();
  const { log, entries } = createTestLogger();
  const changed: string[] = [];
  const timers: (() => void)[] = [];
  /** How long each timer of the line was set for, in order. */
  const waits: number[] = [];
  const { parties = [], ...rest } = options;
  const upkeep = new GymUpkeep({
    gyms,
    directory,
    geo,
    parties: { active: () => parties },
    posts: { changed: (partyId) => changed.push(partyId) },
    log,
    // A test fires the timer of the line by hand, or calls `flush`.
    setTimer: (run, ms) => {
      timers.push(run);
      waits.push(ms);
      return () => {
        const index = timers.indexOf(run);
        if (index >= 0) timers.splice(index, 1);
      };
    },
    ...rest,
  });
  /** A gym as gym administration adds one: the row, then the directory. */
  const add = async (lat: number, lon: number, name = 'New Gym') => {
    const created = await gyms.create({ name, lat, lon }, 1);
    await directory.refreshGym(created.id);
    return created.id;
  };
  return { upkeep, gyms, directory, geo, entries, changed, timers, waits, add };
}

const onRoute = (train: TrainParty, route: number[]): TrainParty => ({
  ...train,
  train: { ...train.train, route: route.map(gymStop) },
});
const background = watchEachTest();

describe('GymUpkeep.gymChanged', () => {
  it('reads the gym again and has every party that shows it rendered anew', async () => {
    const raidThere = testRaid({ id: '00000000-0000-4000-8000-000000000011', gymId: 2 });
    const raidElsewhere = testRaid({ id: '00000000-0000-4000-8000-000000000012', gymId: 3 });
    const trainThrough = onRoute(testTrain({ id: '00000000-0000-4000-8000-000000000013' }), [1, 2]);
    const trainElsewhere = onRoute(testTrain({ id: '00000000-0000-4000-8000-000000000014' }), [3]);
    // A meetup at the gym shows it as it is now; one at another gym, or a pin, does not.
    const place = {
      title: 'Old Stone Fountain',
      lat: 40.06,
      lon: -80.06,
      address: null,
      image: null,
    };
    const meetupThere = testMeetup({
      id: '00000000-0000-4000-8000-000000000015',
      place: { kind: 'gym', id: '2', ...place },
    });
    const meetupElsewhere = testMeetup({
      id: '00000000-0000-4000-8000-000000000016',
      place: { kind: 'gym', id: '3', ...place },
    });
    const meetupAtStop = testMeetup({
      id: '00000000-0000-4000-8000-000000000017',
      place: { kind: 'stop', id: '2', ...place },
    });
    const { upkeep, gyms, directory, changed } = await upkeepWith({
      parties: [
        raidThere,
        raidElsewhere,
        trainThrough,
        trainElsewhere,
        meetupThere,
        meetupElsewhere,
        meetupAtStop,
      ],
    });
    await gyms.update(2, { notice: 'Closed for repairs' });
    expect(directory.get(2)?.notice).toBeNull();

    const gym = await upkeep.gymChanged(2);

    expect(gym?.notice).toBe('Closed for repairs');
    expect(directory.get(2)?.notice).toBe('Closed for repairs');
    expect(changed).toEqual([raidThere.id, trainThrough.id, meetupThere.id]);
  });

  it('answers undefined for a gym that is gone, and still tells the posts', async () => {
    const raidThere = testRaid({ gymId: 2 });
    const { upkeep, gyms, directory, changed } = await upkeepWith({ parties: [raidThere] });
    await gyms.delete(2);
    await expect(upkeep.gymChanged(2)).resolves.toBeUndefined();
    expect(directory.get(2)).toBeUndefined();
    expect(changed).toEqual([raidThere.id]);
  });

  it('is not stopped by posts that cannot be told', async () => {
    const { upkeep, entries } = await upkeepWith({
      parties: [testRaid({ gymId: 2 })],
      posts: {
        changed: () => {
          throw new Error('no posts');
        },
      },
    });
    await expect(upkeep.gymChanged(2)).resolves.toMatchObject({ id: 2 });
    expect(entries.some((entry) => entry.level === 40)).toBe(true);
  });
});

describe('GymUpkeep.placed', () => {
  it('writes the nearest gyms of the gyms concerned, and of no others', async () => {
    const { upkeep, gyms, directory, add } = await upkeepWith();
    const before = directory.get(LONELY)?.nearestGym;
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    gyms.writes.length = 0;

    await upkeep.placed(id);

    expect(before).not.toBe(id);
    expect(gyms.written('nearestGym')).toEqual([
      [LONELY, id],
      [id, LONELY],
    ]);
    expect(directory.get(id)?.nearestGym).toBe(LONELY);
    expect(directory.get(LONELY)?.nearestGym).toBe(id);
    await upkeep.flush();
  });

  it('asks about the new gym on the side and lets the gym beside it wait for its places', async () => {
    const { upkeep, gyms, directory, geo, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);

    await upkeep.placed(id);
    // The line: the lonely gym, whose circle is now half the way to the new one.
    expect(await upkeep.waiting()).toBe(1);

    await upkeep.flush();
    expect(await upkeep.waiting()).toBe(0);
    const lonely = directory.get(LONELY);
    if (!lonely) throw new Error('no gym');
    const half = metresBetween(lonely, BESIDE_LONELY) / 2;
    expect(half).toBeGreaterThan(25);
    expect(geo.questions('geocode').map((asked) => asked.point)).toEqual([BESIDE_LONELY]);
    // Each is asked about once, in a circle of half the way to the other.
    const places = geo.questions('places');
    expect(places).toHaveLength(2);
    expect(places).toEqual(
      expect.arrayContaining([
        { what: 'places', point: BESIDE_LONELY, radius: half },
        { what: 'places', point: { lat: lonely.lat, lon: lonely.lon }, radius: half },
      ]),
    );
    expect(gyms.row(id)).toMatchObject({
      geodata: JSON.stringify({ addressComponents: FAKE_ADDRESS }),
      places: 'Corner Bakery Maple Dental',
    });
    // The directory has what was written: the gym is found by it.
    expect(directory.search(null, 'corner bakery').map((hit) => hit.gym.id)).toContain(id);
    expect(directory.get(LONELY)?.places).toBe('Corner Bakery Maple Dental');
  });

  it('asks about one gym of the line at every turn of the timer', async () => {
    const { upkeep, geo, timers, add } = await upkeepWith();
    // Two gyms get a nearer neighbour: the lonely one and the one put beside it first.
    const first = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(first);
    await upkeep.flush();
    geo.asked.length = 0;
    const second = await add(40.50045, -80.05, 'Between');
    await upkeep.placed(second);
    expect(await upkeep.waiting()).toBe(2);
    expect(timers).toHaveLength(1);

    const places = (): number => geo.questions('places').length;
    // The new gym itself is asked about at once; the line waits for the timer.
    await background.settle();
    expect(places()).toBe(1);
    timers.shift()?.();
    await background.settle();
    expect(places()).toBe(2);
    await background.settle();
    expect(timers.length).toBe(1);
    expect(await upkeep.waiting()).toBe(1);
    timers.shift()?.();
    await background.settle();
    expect(places()).toBe(3);
    await upkeep.flush();
    // The line is empty: no timer is left.
    expect(timers).toHaveLength(0);
    expect(places()).toBe(3);
  });

  it('lets the gyms that keep a moved gym as their nearest wait for their places too', async () => {
    const { upkeep, gyms, directory, geo, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await upkeep.flush();
    geo.asked.length = 0;
    gyms.writes.length = 0;

    // A little further away: each is still the other's nearest, but the circles are larger.
    await gyms.update(id, { lat: 40.502 });
    await directory.refreshGym(id);
    await upkeep.placed(id);
    await upkeep.flush();

    expect(gyms.written('nearestGym')).toEqual([]);
    const asked = geo.questions('places').map((question) => question.point.lat);
    expect(asked.sort()).toEqual([40.5, 40.502]);
    expect(geo.questions('geocode').map((question) => question.point.lat)).toEqual([40.502]);
  });

  it('without places, writes the nearest gyms and asks Google about nothing', async () => {
    const { upkeep, gyms, directory, geo, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await upkeep.flush();
    geo.asked.length = 0;

    // Moved by a few metres: neither its address nor its circle of places is asked about.
    await gyms.update(id, { lat: 40.50093 });
    await directory.refreshGym(id);
    await upkeep.placed(id, { places: false });
    expect(await upkeep.waiting()).toBe(0);

    // A gym put beside it, placed without places, still gets its nearest gym and gives its own.
    const beside = await add(40.5011, -80.05, 'Beside');
    await upkeep.placed(beside, { places: false });
    expect(directory.get(beside)?.nearestGym).toBe(id);
    expect(directory.get(id)?.nearestGym).toBe(beside);
    expect(await upkeep.waiting()).toBe(0);
    await upkeep.flush();
    expect(geo.asked).toEqual([]);
  });

  it('later, puts the gym in the slow line for its address and places instead of asking at once', async () => {
    const { upkeep, gyms, directory, geo, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await upkeep.flush();
    geo.asked.length = 0;

    await gyms.update(id, { lat: 40.5009 });
    await directory.refreshGym(id);
    await upkeep.placed(id, { places: 'later' });
    // Nothing is asked on the side: the gym waits in the line, one every few seconds.
    await background.settle();
    expect(geo.asked).toEqual([]);
    expect(await upkeep.waiting()).toBeGreaterThanOrEqual(1);

    await upkeep.flush();
    expect(geo.questions('geocode').map((question) => question.point.lat)).toEqual([40.5009]);
    expect(geo.questions('places').map((question) => question.point.lat)).toContain(40.5009);
  });

  it('writes the nearest gyms without an API key, and asks nothing', async () => {
    const { upkeep, gyms, geo, add } = await upkeepWith();
    geo.enabled = false;
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    expect(upkeep.fetches).toBe(false);
    expect(await upkeep.waiting()).toBe(0);
    await upkeep.flush();
    expect(gyms.row(id)).toMatchObject({ nearestGym: LONELY, geodata: null, places: null });
    expect(geo.asked).toEqual([]);
  });

  it('notes in the log when one change gives more than ten gyms another nearest gym', async () => {
    // A database whose gyms have no nearest gym yet: the first gym that is placed settles all.
    const unsettled = await gymDirectoryWith(new MemoryGyms(testGyms()));
    const { upkeep, entries } = await upkeepWith(unsettled);
    const place = async (lat: number, lon: number): Promise<number> => {
      const created = await unsettled.gyms.create({ name: 'New Gym', lat, lon }, 1);
      await unsettled.directory.refreshGym(created.id);
      await upkeep.placed(created.id);
      return created.id;
    };
    const noted = () =>
      entries.filter((entry) => entry.msg === 'many gyms got another nearest gym');

    const first = await place(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    expect(noted()).toMatchObject([{ level: 30, count: 13, placed: first }]);
    // The usual change, of a gym or two, is not worth a line.
    await place(40.5018, -80.05);
    expect(noted()).toHaveLength(1);
  });

  it('never rejects: a write that fails is logged', async () => {
    const { upkeep, gyms, entries, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    gyms.failing = new Error('database is down');
    await expect(upkeep.placed(id)).resolves.toBeUndefined();
    await upkeep.flush();
    expect(
      entries.some((entry) => entry.msg === 'could not bring the nearest gyms up to date'),
    ).toBe(true);
  });
});

describe('GymUpkeep.placedBlock', () => {
  it('puts a block of new gyms in the line once, and the gyms whose nearest gym it changed', async () => {
    const lookups = new MemoryGymLookups();
    const { upkeep, gyms, directory, geo } = await upkeepWith({ lookups });
    await upkeep.flush();
    const block = await gyms.createBlock(
      [
        // Beside the lonely gym, with Wayfarer's address: it waits for its places only.
        { name: 'Beside', ...BESIDE_LONELY, geodata: '{"addressComponents":{"route":"Lake"}}' },
        { name: 'Elsewhere', lat: 40.08, lon: -80.02 },
      ],
      1,
      (made) =>
        nearestBlockChanges([...directory.all(), ...made], new Set(made.map((gym) => gym.id))),
    );
    const ids = block.map((gym) => gym.id);
    const changed = gyms.writes.flatMap((write) =>
      write.what === 'update' && 'nearestGym' in write.patch ? [write.id] : [],
    );
    expect(changed).toContain(LONELY);
    await directory.refreshGyms([...ids, ...changed]);
    await upkeep.placedBlock(ids, changed);
    expect(lookups.rows.get(ids[0]!)?.address).toBe(false);
    expect(lookups.rows.get(ids[1]!)?.address).toBe(true);
    // The lonely gym's circle follows its new nearest gym.
    expect(lookups.rows.get(LONELY)?.address).toBe(false);
    // Nothing is asked at once: the line asks one every few seconds.
    expect(geo.asked).toEqual([]);
    await upkeep.flush();
    expect(gyms.row(ids[0]!)?.places).not.toBeNull();
    const lonely = geo.questions('places').find((question) => question.point.lat === 40.5);
    expect(lonely?.radius).toBeCloseTo(metresBetween(directory.get(LONELY)!, BESIDE_LONELY) / 2, 5);
  });
});

describe('GymUpkeep.removed', () => {
  it('gives the gyms that pointed at a deleted gym another nearest one', async () => {
    const { upkeep, gyms, directory, geo, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await upkeep.flush();
    const others = directory.all().filter((gym) => gym.id !== LONELY && gym.id !== id);
    const lonely = directory.get(LONELY);
    if (!lonely) throw new Error('no gym');
    const expected = others.sort((a, b) => metresBetween(lonely, a) - metresBetween(lonely, b))[0]
      ?.id;
    gyms.writes.length = 0;
    geo.asked.length = 0;

    await gyms.delete(id);
    await directory.refreshGym(id);
    await upkeep.removed(id);

    expect(gyms.written('nearestGym')).toEqual([[LONELY, expected]]);
    expect(directory.get(LONELY)?.nearestGym).toBe(expected);
    expect(await upkeep.waiting()).toBe(1);
    await upkeep.flush();
    // Far from everything again: the largest circle.
    expect(geo.questions('places')).toEqual([
      { what: 'places', point: { lat: lonely.lat, lon: lonely.lon }, radius: 500 },
    ]);
  });

  it('takes a deleted gym out of the line', async () => {
    const { upkeep, gyms, directory, geo, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    expect(await upkeep.waiting()).toBe(1);
    await gyms.delete(LONELY);
    await directory.refreshGym(LONELY);
    await upkeep.removed(LONELY);
    await upkeep.flush();
    expect(geo.questions('places').some((asked) => asked.point.lat === 40.5)).toBe(false);
  });
});

describe('the cap of lookups by hand (plan 8Z)', () => {
  /** Pacific noon on a day of the fixtures' choosing: the month and the day it counts in. */
  const NOW = new Date('2026-10-11T12:00:00-07:00').getTime();
  const TODAY = '2026-10-11';
  const capped = async (cap: number, used = 0) => {
    const use = new MemoryGoogleUse();
    for (let n = 0; n < used; n += 1) await use.use(TODAY, 'hand');
    const lookups = new MemoryGymLookups();
    const made = await upkeepWith({ use, lookups, byHandPerMonth: cap, now: () => NOW });
    return { ...made, use, lookups };
  };
  const byHand = (use: MemoryGoogleUse) => use.days.get(TODAY)?.byHand ?? 0;

  it('counts one lookup for a refresh that reached Google, on top of its questions', async () => {
    const { upkeep, use } = await capped(500);
    await upkeep.refresh(2);
    expect(byHand(use)).toBe(1);
    expect(use.total('places')).toBe(1);
    expect(use.total('geocode')).toBe(1);
  });

  it.each(['no-key', 'denied'] as const)(
    'counts none for %s: nothing reached Google',
    async (reason) => {
      const { upkeep, use, geo } = await capped(500);
      geo.failing = { geocode: reason, places: reason };
      await upkeep.refresh(2);
      expect(byHand(use)).toBe(0);
    },
  );

  it('asks nothing at the cap, and says so', async () => {
    const { upkeep, geo, gyms } = await capped(3, 3);
    gyms.writes.length = 0;
    const refused = await upkeep.refresh(2);
    expect(refused).toMatchObject({ geodata: 'capped', places: 'capped', gym: { id: 2 } });
    expect(geo.asked).toEqual([]);
    expect(gyms.writes).toEqual([]);
  });

  it('leaves a gym in the line when a refresh is capped: nobody asked about it', async () => {
    const { upkeep, lookups } = await capped(3, 3);
    await lookups.add([{ gymId: 2, address: false, rank: 1 }], 1);
    await upkeep.refresh(2);
    expect((await lookups.list()).map((one) => one.gymId)).toEqual([2]);
  });

  it('takes a gym out of the line when a refresh below the cap answers', async () => {
    const { upkeep, lookups } = await capped(3, 2);
    await lookups.add([{ gymId: 2, address: false, rank: 1 }], 1);
    await upkeep.refresh(2);
    expect(await lookups.list()).toEqual([]);
  });

  it('lets at most the cap through among lookups at once', async () => {
    const { upkeep, use } = await capped(2, 1);
    const answers = await Promise.all([upkeep.refresh(2), upkeep.refresh(3), upkeep.refresh(4)]);
    const asked = answers.filter((one) => one?.places !== 'capped');
    expect(asked.length).toBeLessThanOrEqual(1);
    expect(byHand(use)).toBeLessThanOrEqual(2);
  });

  it('asks nothing when it cannot read the count, and says that apart from the cap; logged', async () => {
    const { upkeep, use, geo, entries, lookups } = await capped(500);
    await lookups.add([{ gymId: 2, address: false, rank: 1 }], 1);
    use.usedOn = () => Promise.reject(new Error('the database is away'));
    await expect(upkeep.refresh(2)).resolves.toMatchObject({
      geodata: 'count-unread',
      places: 'count-unread',
    });
    expect(geo.asked).toEqual([]);
    expect(entries.map((entry) => entry.msg)).toContain('could not read the lookups by hand');
    expect((await lookups.list()).map((one) => one.gymId)).toEqual([2]);
  });

  it('counts a lookup whose gym went while Google was asked: Google was asked', async () => {
    const { upkeep, use, geo, gyms, directory } = await capped(500);
    const held = Promise.withResolvers<undefined>();
    geo.hold = held.promise.then(() => undefined);
    const refreshing = upkeep.refresh(2);
    await background.settle();
    expect(geo.asked).toHaveLength(1);
    await gyms.delete(2);
    await directory.refreshGym(2);
    held.resolve(undefined);
    await expect(refreshing).resolves.toBeUndefined();
    expect(byHand(use)).toBe(1);
  });

  it('counts a lookup whose answer could not be written: Google was asked', async () => {
    const { upkeep, use, gyms } = await capped(500);
    gyms.failingOn.update = new Error('the database is away');
    await expect(upkeep.refresh(2)).rejects.toThrow('the database is away');
    expect(byHand(use)).toBe(1);
  });

  it('puts a gym added or moved at the cap in the line, without failing and without asking', async () => {
    const { upkeep, geo, lookups, add } = await capped(1, 1);
    const id = await add(40.5, -80.5);
    await upkeep.placed(id);
    expect(geo.asked).toEqual([]);
    expect((await lookups.list()).map((one) => one.gymId)).toContain(id);
  });

  it('asks about a gym added below the cap at once, and counts it', async () => {
    const { upkeep, geo, use, add } = await capped(5);
    const id = await add(40.5, -80.5);
    await upkeep.placed(id);
    await upkeep.flush();
    expect(geo.asked.slice(0, 2).map((one) => one.what)).toEqual(['geocode', 'places']);
    expect(byHand(use)).toBe(1);
  });

  it("leaves the line's own questions out of the cap", async () => {
    const { upkeep, geo, use, lookups, add } = await capped(0);
    const id = await add(40.5, -80.5);
    await lookups.add([{ gymId: id, address: false, rank: 1 }], 1);
    await upkeep.resume();
    await upkeep.flush();
    expect(geo.asked.some((one) => one.what === 'places')).toBe(true);
    expect(byHand(use)).toBe(0);
  });
});

describe('GymUpkeep.refresh', () => {
  it('asks about a gym now and says what it got', async () => {
    const { upkeep, gyms, geo } = await upkeepWith();
    geo.addresses.set('40.06,-80.06', { route: 'Market St', locality: 'Pinewood' });
    geo.placesAt.set('40.06,-80.06', ['Riverside Plaza', 'Cafe Luna']);

    const first = await upkeep.refresh(2);
    expect(first).toMatchObject({ geodata: 'updated', places: 'updated' });
    expect(first?.gym).toMatchObject({
      id: 2,
      geodata: '{"addressComponents":{"route":"Market St","locality":"Pinewood"}}',
      places: 'Riverside Plaza Cafe Luna',
    });
    expect(gyms.row(2)?.places).toBe('Riverside Plaza Cafe Luna');

    gyms.writes.length = 0;
    await expect(upkeep.refresh(2)).resolves.toMatchObject({
      geodata: 'unchanged',
      places: 'unchanged',
    });
    expect(gyms.writes).toEqual([]);
  });

  it('writes nothing for a place Google knows nothing of', async () => {
    const { upkeep, gyms, geo } = await upkeepWith();
    geo.addresses.set('40.06,-80.06', {});
    geo.placesAt.set('40.06,-80.06', []);
    await expect(upkeep.refresh(2)).resolves.toMatchObject({
      geodata: 'updated',
      places: 'updated',
    });
    expect(gyms.row(2)).toMatchObject({ geodata: null, places: null });
  });

  it.each(['no-key', 'denied', 'failed'] as const)(
    'keeps what the gym had when Google answers %s',
    async (reason) => {
      const { upkeep, gyms, geo } = await upkeepWith();
      const before = gyms.row(2);
      geo.failing = { geocode: reason, places: reason };
      gyms.writes.length = 0;
      await expect(upkeep.refresh(2)).resolves.toMatchObject({ geodata: reason, places: reason });
      expect(gyms.writes).toEqual([]);
      expect(gyms.row(2)).toEqual(before);
    },
  );

  it('says each of the two by itself', async () => {
    const { upkeep, geo } = await upkeepWith();
    geo.failing = { places: 'denied' };
    await expect(upkeep.refresh(2)).resolves.toMatchObject({
      geodata: 'updated',
      places: 'denied',
    });
  });

  it('answers undefined for a gym that is not there, or goes while Google is asked', async () => {
    const { upkeep, gyms, directory, geo } = await upkeepWith();
    await expect(upkeep.refresh(999)).resolves.toBeUndefined();
    let release: () => void = () => undefined;
    geo.hold = new Promise((resolve) => {
      release = resolve;
    });
    const refreshing = upkeep.refresh(2);
    await gyms.delete(2);
    await directory.refreshGym(2);
    release();
    await expect(refreshing).resolves.toBeUndefined();
    expect(gyms.written('geodata')).toEqual([]);
  });

  it('does not write the address of the place a gym has left meanwhile', async () => {
    const { upkeep, gyms, directory, geo } = await upkeepWith();
    geo.addresses.set('40.06,-80.06', { route: 'Old St' });
    geo.addresses.set('40.061,-80.06', { route: 'New St' });
    let release: () => void = () => undefined;
    geo.hold = new Promise((resolve) => {
      release = resolve;
    });
    // Asked about where it is, then moved (as gym administration moves it) before the answer.
    const refreshing = upkeep.refresh(2);
    await gyms.update(2, { lat: 40.061 });
    await directory.refreshGym(2);
    await upkeep.placed(2);
    release();
    geo.hold = undefined;
    await expect(refreshing).resolves.toMatchObject({ geodata: 'unchanged' });
    await upkeep.flush();
    expect(gyms.written('geodata')).toEqual([[2, '{"addressComponents":{"route":"New St"}}']]);
  });

  it('rejects when what it got cannot be written', async () => {
    const { upkeep, gyms } = await upkeepWith();
    gyms.failing = new Error('database is down');
    await expect(upkeep.refresh(2)).rejects.toThrow('database is down');
  });
});

describe('GymUpkeep: answers that come late, and an API that is denied', () => {
  it('does not let an older answer about places overwrite a newer one', async () => {
    const { upkeep, gyms, geo } = await upkeepWith();
    geo.placesAt.set('40.06,-80.06', ['Old Cafe']);
    let release: () => void = () => undefined;
    geo.holdPlaces.push(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    // The first question is on its way, with the answer of that moment.
    const older = upkeep.refresh(2);
    await background.settle();
    expect(geo.questions('places').length).toBe(1);
    geo.placesAt.set('40.06,-80.06', ['New Cafe']);
    await expect(upkeep.refresh(2)).resolves.toMatchObject({ places: 'updated' });
    expect(gyms.row(2)?.places).toBe('New Cafe');

    release();
    await expect(older).resolves.toMatchObject({ places: 'unchanged' });
    expect(gyms.row(2)?.places).toBe('New Cafe');
    expect(gyms.written('places')).toEqual([[2, 'New Cafe']]);
  });

  it('drops an answer about places that was asked for before the nearest gym changed', async () => {
    const { upkeep, gyms, geo, add } = await upkeepWith();
    let release: () => void = () => undefined;
    geo.holdPlaces.push(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    geo.placesAt.set('40.5,-80.05', ['Wide Circle Cafe']);
    // Asked while the lonely gym has no gym near it: the largest circle.
    const early = upkeep.refresh(LONELY);
    await background.settle();
    expect(geo.questions('places').length).toBe(1);
    geo.placesAt.set('40.5,-80.05', ['Small Circle Cafe']);
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    // The gym is asked about again, in its new circle, and that answer comes first.
    const flushing = upkeep.flush();
    await background.settle();
    expect(gyms.row(LONELY)?.places).toBe('Small Circle Cafe');
    release();
    await flushing;
    await expect(early).resolves.toMatchObject({ places: 'unchanged' });
    expect(gyms.row(LONELY)?.places).toBe('Small Circle Cafe');
  });

  it('keeps the line while the API is denied, and waits until it may be asked again', async () => {
    const { upkeep, gyms, geo, timers, waits, add } = await upkeepWith({ placesEveryMs: 5_000 });
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await background.settle();
    expect(geo.questions('places').length).toBe(1);
    expect(waits).toEqual([5_000]);
    geo.failing = { places: 'denied' };
    geo.retryInMs = 1_800_000;

    timers.shift()?.();
    await background.settle();
    expect(timers.length).toBe(1);
    // The gym still waits, and the next look is when the denial is over.
    expect(await upkeep.waiting()).toBe(1);
    expect(waits).toEqual([5_000, 1_800_000]);
    expect(gyms.row(LONELY)?.places).toBeNull();

    geo.failing = {};
    timers.shift()?.();
    await background.settle();
    expect(await upkeep.waiting()).toBe(0);
    await upkeep.flush();
    expect(gyms.row(LONELY)?.places).toBe('Corner Bakery Maple Dental');
  });

  it('keeps the wait of a denied API when more gyms come into the line', async () => {
    const { upkeep, geo, timers, waits, add } = await upkeepWith({ placesEveryMs: 5_000 });
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id, { places: 'later' });
    geo.failing = { places: 'denied' };
    geo.retryInMs = 1_800_000;
    timers.shift()?.();
    await background.settle();
    expect(waits.at(-1)).toBe(1_800_000);
    // An import adds a gym meanwhile: Google said when to ask again, and the line keeps to it.
    await upkeep.placed(await add(40.01, -80.09, 'Another'), { places: 'later' });
    expect(timers).toHaveLength(1);
    expect(waits.at(-1)).toBe(1_800_000);
  });

  it('keeps the wait of a denied API when a gym comes into the line during the turn that met it', async () => {
    const { upkeep, geo, timers, waits, add } = await upkeepWith({ placesEveryMs: 5_000 });
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id, { places: 'later', address: false });
    // Google answers the turn's question only once the test says so: denied, for half an hour.
    let answer: (value: Awaited<ReturnType<FakeGeoGateway['placesNear']>>) => void = () => {};
    geo.placesNear = () =>
      new Promise((resolve) => {
        answer = resolve;
      });
    timers.shift()?.();
    await background.settle();
    // While the turn waits for Google, an import adds a gym.
    await upkeep.placed(await add(40.01, -80.09, 'Another'), { places: 'later', address: false });
    answer({ ok: false, reason: 'denied', retryInMs: 1_800_000 });
    await background.settle();
    expect(timers).toHaveLength(1);
    expect(waits.at(-1)).toBe(1_800_000);
  });

  it('does not spin on a denied API when everything is flushed', async () => {
    const { upkeep, geo, add } = await upkeepWith();
    geo.failing = { places: 'denied' };
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await upkeep.flush();
    expect(await upkeep.waiting()).toBe(2);
    await upkeep.stop();
  });

  it('lets the new gym itself wait for its places when the API is denied', async () => {
    const { upkeep, gyms, geo, add } = await upkeepWith();
    geo.failing = { places: 'denied' };
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await upkeep.flush();
    // Its address came; its places wait in the line with those of the gym beside it.
    expect(gyms.row(id)?.geodata).not.toBeNull();
    expect(gyms.row(id)?.places).toBeNull();
    expect(await upkeep.waiting()).toBe(2);
    geo.failing = {};
    await upkeep.flush();
    expect(await upkeep.waiting()).toBe(0);
    expect(gyms.row(id)?.places).toBe('Corner Bakery Maple Dental');
    expect(gyms.row(LONELY)?.places).toBe('Corner Bakery Maple Dental');
  });
});

describe('the line of gyms that wait for Google', () => {
  /** Every question counted, of either kind, over every day. */
  const counted = (use: MemoryGoogleUse): number => use.total('places') + use.total('geocode');

  /** Three gyms put in the line as an import puts them: each for its address and places. */
  async function threeQueued(options: Partial<Omit<GymUpkeepOptions, 'parties'>>) {
    const made = await upkeepWith(options);
    await made.upkeep.flush();
    made.geo.asked.length = 0;
    const ids = [
      await made.add(40.01, -80.09, 'One'),
      await made.add(40.02, -80.09, 'Two'),
      await made.add(40.03, -80.09, 'Three'),
    ];
    for (const id of ids) await made.upkeep.placed(id, { places: 'later' });
    return { ...made, ids };
  }

  it('asks gyms until only the reserve of the month is left, then waits for the next month', async () => {
    // Noon in California on October 16: the month resets on November 1 at midnight there.
    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
    const lookups = new MemoryGymLookups();
    const use = new MemoryGoogleUse();
    const { upkeep, geo, waits, timers } = await threeQueued({
      lookups,
      use,
      budget: { places: 4, reserve: 2, geocodes: 100, geocodesReserve: 0 },
      now: () => now,
    });
    const queued = await upkeep.waiting();
    expect(queued).toBeGreaterThan(2);
    await upkeep.flush();
    // Two places questions above the reserve this month, each counted on its Pacific day.
    expect(use.days.get('2026-10-16')?.places).toBe(2);
    expect(await upkeep.waiting()).toBe(queued - 2);
    // The line waits for the month to reset, half a month away: it looks again in six hours.
    timers.splice(0);
    waits.splice(0);
    await upkeep.resume();
    timers.shift()?.();
    await background.settle();
    expect(timers.length).toBe(1);
    expect(waits.at(-1)).toBe(MAX_TIMER_MS);
    // Late on the last day the timer is set for the reset itself.
    now = new Date('2026-10-31T22:00:00-07:00').getTime();
    timers.shift()?.();
    await background.settle();
    expect(waits.at(-1)).toBe(2 * 3_600_000);
    now = new Date('2026-10-16T12:00:00-07:00').getTime();
    // Nothing more this month, however many days pass.
    now += 10 * 24 * 3_600_000;
    await upkeep.flush();
    expect(use.total('places')).toBe(2);
    // November: two more.
    now = new Date('2026-11-01T00:10:00-07:00').getTime();
    await upkeep.flush();
    expect(use.days.get('2026-11-01')?.places).toBe(2);
    expect(geo.questions('places')).toHaveLength(4);
  });

  it('sets no timer beyond six hours while the month is used up: the turn looks again', async () => {
    // Early on the 1st, the month's budget used: the reset is a month away, beyond what a timer
    // of Node holds (2^31 - 1 ms, about 24.8 days), which would fire at once, again and again.
    let now = new Date('2026-10-01T01:00:00-07:00').getTime();
    const use = new MemoryGoogleUse();
    const { upkeep, geo, waits, timers } = await threeQueued({
      lookups: new MemoryGymLookups(),
      use,
      budget: { places: 0, reserve: 0, geocodes: 100, geocodesReserve: 0 },
      now: () => now,
    });
    await upkeep.flush();
    timers.splice(0);
    waits.splice(0);
    await upkeep.resume();
    for (let turn = 0; turn < 3; turn++) {
      timers.shift()?.();
      await background.settle();
      now += MAX_TIMER_MS;
    }
    expect(waits.length).toBeGreaterThan(1);
    expect(waits.every((ms) => ms <= MAX_TIMER_MS)).toBe(true);
    expect(waits.at(-1)).toBe(MAX_TIMER_MS);
    expect(geo.asked).toEqual([]);
    expect(use.total('places')).toBe(0);
  });

  it('counts every question, by hand too, which may use the reserve and go past the budget', async () => {
    const lookups = new MemoryGymLookups();
    const use = new MemoryGoogleUse();
    const { upkeep, geo, add } = await upkeepWith({
      lookups,
      use,
      budget: { places: 1, reserve: 1, geocodes: 100, geocodesReserve: 0 },
    });
    const id = await add(40.01, -80.09, 'One');
    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
    // Only the reserve is left: the line asks nothing.
    await upkeep.flush();
    expect(geo.asked).toEqual([]);
    // An admin asks: the reserve, then past the budget, each counted.
    await upkeep.refresh(id);
    await upkeep.refresh(id);
    expect(use.total('places')).toBe(2);
    expect(use.total('geocode')).toBe(2);
    // A gym added by hand is asked about at once, and counted.
    await upkeep.placed(await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon), {});
    await upkeep.flush();
    expect(use.total('places')).toBe(3);
  });

  it('asks no address once the month’s geocodes are used, and goes on with gyms for their places', async () => {
    const lookups = new MemoryGymLookups();
    const { upkeep, geo, gyms, add } = await upkeepWith({
      lookups,
      budget: { places: 100, reserve: 0, geocodes: 0, geocodesReserve: 0 },
    });
    const one = await add(40.01, -80.09, 'One');
    const two = await add(40.03, -80.09, 'Two');
    await lookups.add([{ gymId: one, address: true, rank: 1 }], 1);
    await lookups.add([{ gymId: two, address: false, rank: 0 }], 2);
    await upkeep.flush();
    expect(geo.questions('geocode')).toEqual([]);
    expect(gyms.row(two)?.places).not.toBeNull();
    // The gym that waits for its address keeps waiting, its places not asked without it.
    expect(gyms.row(one)?.places).toBeNull();
    expect(lookups.rows.get(one)?.address).toBe(true);
  });

  it('waits longer after each question in a row that did not answer, and asks those gyms the next day', async () => {
    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
    const lookups = new MemoryGymLookups();
    const use = new MemoryGoogleUse();
    // Three gyms alone, never asked: the start puts them in the line.
    const alone = await gymDirectoryWith(new MemoryGyms([]));
    const { upkeep, geo, timers, waits } = await upkeepWith({
      ...alone,
      lookups,
      use,
      now: () => now,
    });
    geo.failing = { places: 'failed' };
    for (const [n, name] of ['One', 'Two', 'Three'].entries()) {
      const made = await alone.gyms.create({ name, lat: 40.01 + n / 100, lon: -80.09 }, 1);
      await alone.directory.refreshGym(made.id);
    }
    await upkeep.resume();
    expect(await upkeep.waiting()).toBe(3);
    // The month's budget is not spent on gyms that fail every few seconds.
    for (let turn = 0; turn < 3; turn++) {
      timers.shift()?.();
      await background.settle();
    }
    expect(use.total('places')).toBe(3);
    expect(waits).toEqual([5_000, 10_000, 20_000, 40_000]);
    // Each waits after every other gym now, whatever its region, until the line is ranked anew.
    expect([...lookups.rows.values()].every((row) => row.rank < NO_REGION_RANK)).toBe(true);
    // Google answers again: the gyms that failed today wait for tomorrow.
    geo.failing = {};
    await upkeep.flush();
    expect(use.total('places')).toBe(3);
    expect(await upkeep.waiting()).toBe(3);
    now += 24 * 3_600_000;
    await upkeep.flush();
    expect(await upkeep.waiting()).toBe(0);
  });

  it('sets a gym whose question keeps failing aside until the next day, and goes on with the others', async () => {
    let now = new Date('2026-10-16T12:00:00-07:00').getTime();
    const lookups = new MemoryGymLookups();
    const { upkeep, geo, add } = await upkeepWith({ lookups, now: () => now });
    const stuck = await add(40.01, -80.09, 'Stuck');
    const fine = await add(40.03, -80.09, 'Fine');
    const later = await add(40.05, -80.09, 'Later');
    await lookups.add([{ gymId: stuck, address: false, rank: 1 }], 1);
    await lookups.add([{ gymId: fine, address: false, rank: 0 }], 2);
    let stuckAsked = 0;
    const placesNear = geo.placesNear.bind(geo);
    geo.placesNear = (point, radius) => {
      if (point.lat !== 40.01) return placesNear(point, radius);
      stuckAsked++;
      return Promise.resolve({ ok: false, reason: 'failed' });
    };
    for (let turn = 0; turn < 4; turn++) await upkeep.flush();
    expect(stuckAsked).toBe(1);
    expect(lookups.rows.has(fine)).toBe(false);
    expect(lookups.rows.has(stuck)).toBe(true);
    // Only an answer notes a gym as asked: a start puts the stuck one in the line again.
    expect(lookups.askedAt.has(stuck)).toBe(false);
    expect(lookups.askedAt.has(fine)).toBe(true);
    // A gym queued later that day is asked; the stuck one still waits.
    await lookups.add([{ gymId: later, address: false, rank: 1 }], 3);
    await upkeep.flush();
    expect(lookups.rows.has(later)).toBe(false);
    expect(stuckAsked).toBe(1);
    // The next day it is asked once more.
    now += 24 * 3_600_000;
    for (let turn = 0; turn < 4; turn++) await upkeep.flush();
    expect(stuckAsked).toBe(2);
    expect(lookups.rows.has(stuck)).toBe(true);
  });

  it('leaves a gym moved during a turn that failed in its place in the line, and asks it again', async () => {
    const lookups = new MemoryGymLookups();
    const { upkeep, geo, add } = await upkeepWith({ lookups });
    await upkeep.flush();
    const id = await add(40.01, -80.09, 'One');
    await lookups.add([{ gymId: id, address: false, rank: 0 }], 1);
    geo.failing = { places: 'failed' };
    let release: () => void = () => undefined;
    geo.holdPlaces.push(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const flushing = upkeep.flush();
    await background.settle();
    expect(geo.failing.places).toBe('failed');
    // Moved while the question that fails is on its way: it waits for its new place.
    await upkeep.placed(id, { places: 'later' });
    geo.failing = {};
    release();
    await flushing;
    expect(lookups.rows.get(id)).toEqual({ address: true, rank: 0, queuedAt: 1 });
    // Not set aside: its new place is asked about.
    await upkeep.flush();
    expect(lookups.rows.has(id)).toBe(false);
    expect(lookups.askedAt.has(id)).toBe(true);
  });

  it('asks about the gyms of the best-ranked region first, the ranks worked out at the start', async () => {
    const lookups = new MemoryGymLookups();
    let refreshed = 0;
    const busy = new Set<number>();
    const { upkeep, geo, add } = await upkeepWith({
      lookups,
      ranks: {
        refresh: () => {
          refreshed++;
          return Promise.resolve();
        },
        ofGym: (id) => (busy.has(id) ? 1 : 0),
        ofWayspot: () => undefined,
      },
    });
    const quiet = await add(40.01, -80.09, 'Quiet');
    const lively = await add(40.03, -80.09, 'Lively');
    busy.add(lively);
    await upkeep.placed(quiet, { places: 'later' });
    await upkeep.placed(lively, { places: 'later' });
    expect((await lookups.list()).slice(0, 1).map((gym) => gym.gymId)).toEqual([lively]);
    // The busy region quietens: at the start the line is ranked anew.
    busy.clear();
    busy.add(quiet);
    await upkeep.resume();
    expect(refreshed).toBe(1);
    expect(lookups.rows.get(quiet)?.rank).toBe(1);
    expect(lookups.rows.get(lively)?.rank).toBe(0);
    await upkeep.flush();
    const asked = geo.questions('geocode').map((question) => question.point.lat);
    expect(asked.indexOf(40.01)).toBeLessThan(asked.indexOf(40.03));
  });

  it('keeps a gym in the line that was put in it again while it was asked about', async () => {
    const lookups = new MemoryGymLookups();
    const { upkeep, geo, add, directory } = await upkeepWith({ lookups });
    await upkeep.flush();
    const id = await add(40.01, -80.09, 'One');
    await upkeep.placed(id, { places: 'later' });
    await upkeep.flush();
    lookups.rows.clear();
    geo.asked.length = 0;
    await lookups.add([{ gymId: id, address: false, rank: 0 }], 1);
    let release: () => void = () => undefined;
    geo.holdPlaces.push(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const flushing = upkeep.flush();
    await background.settle();
    expect(geo.questions('places').length).toBeGreaterThan(0);
    // A gym is put beside it while the question is on its way: its nearest gym changes, so it
    // is put in the line again, and asked about again (the answer on its way is dropped).
    await upkeep.placed(await add(40.0101, -80.09, 'Beside'), { places: 'later' });
    release();
    await flushing;
    await upkeep.flush();
    const at = directory.get(id)!;
    const asked = geo
      .questions('places')
      .filter((question) => question.point.lat === at.lat && question.point.lon === at.lon);
    expect(asked).toHaveLength(2);
    expect(lookups.rows.has(id)).toBe(false);
  });

  it('counts only the gyms Google was asked about, and puts one whose question failed at the end', async () => {
    const lookups = new MemoryGymLookups();
    const use = new MemoryGoogleUse();
    // Two questions' worth: the failing gyms are not asked again and again.
    const { upkeep, geo, ids } = await threeQueued({
      lookups,
      use,
      budget: { places: 2, reserve: 0, geocodes: 100, geocodesReserve: 0 },
    });
    geo.failing = { geocode: 'denied', places: 'denied' };
    await upkeep.flush();
    expect(counted(use)).toBe(0);
    geo.failing = { places: 'failed' };
    const first = await lookups.next();
    await upkeep.flush();
    // Failed questions are counted (Google was asked) and their gyms wait at the end, not gone.
    expect(counted(use)).toBeGreaterThan(0);
    expect(lookups.rows.has(first!.gymId)).toBe(true);
    expect(ids).toHaveLength(3);
  });

  it('keeps a gym in the line for its address when only its places came', async () => {
    const lookups = new MemoryGymLookups();
    const use = new MemoryGoogleUse();
    const { upkeep, geo, gyms, add } = await upkeepWith({
      lookups,
      use,
      // One gym's worth: the gym is not asked again and again for the address that fails.
      budget: { places: 1, reserve: 0, geocodes: 100, geocodesReserve: 0 },
    });
    const id = await add(40.01, -80.09, 'One');
    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
    geo.failing = { geocode: 'failed' };
    await upkeep.flush();
    expect(gyms.row(id)?.places).not.toBeNull();
    expect(gyms.row(id)?.geodata).toBeNull();
    expect(lookups.rows.get(id)?.address).toBe(true);
    // Each question counts by itself: the failed geocode reached Google too.
    expect(use.total('places')).toBe(1);
    expect(use.total('geocode')).toBe(1);
  });

  it('counts a gym whose address was asked about though its places were refused', async () => {
    const lookups = new MemoryGymLookups();
    const use = new MemoryGoogleUse();
    const { upkeep, geo, gyms, add } = await upkeepWith({ lookups, use });
    const id = await add(40.01, -80.09, 'One');
    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
    geo.failing = { places: 'denied' };
    await upkeep.flush();
    expect(gyms.row(id)?.geodata).not.toBeNull();
    expect(lookups.rows.get(id)?.address).toBe(false);
    expect(counted(use)).toBe(1);
    // Neither came: the gym still waits for its address.
    const other = await add(40.02, -80.09, 'Two');
    await lookups.add([{ gymId: other, address: true, rank: 0 }], 2);
    geo.failing = { geocode: 'failed', places: 'denied' };
    await upkeep.flush();
    expect(lookups.rows.get(other)?.address).toBe(true);
  });

  it('asks no places of a gym that waits for its address while Geocoding is refused, and goes on with the others', async () => {
    const lookups = new MemoryGymLookups();
    const use = new MemoryGoogleUse();
    let clock = 1_000_000;
    const { upkeep, geo, gyms, add } = await upkeepWith({
      use,
      lookups,
      placesEveryMs: 5_000,
      now: () => clock,
    });
    const id = await add(40.01, -80.09, 'One');
    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
    geo.failing = { geocode: 'denied' };
    geo.retryInMs = 1_800_000;
    await upkeep.flush();
    // Places are billed: none is asked while the address cannot come.
    expect(geo.questions('places')).toEqual([]);
    expect(gyms.row(id)?.places).toBeNull();
    expect(lookups.rows.get(id)?.address).toBe(true);
    expect(counted(use)).toBe(0);
    // A gym behind it that waits for its places alone gets them meanwhile.
    const two = await add(40.03, -80.09, 'Two');
    await lookups.add([{ gymId: two, address: false, rank: 0 }], 2);
    await upkeep.flush();
    expect(gyms.row(two)?.places).not.toBeNull();
    expect(geo.questions('places').map((question) => question.point.lat)).toEqual([40.03]);
    expect(lookups.rows.get(id)?.address).toBe(true);
    // With only gyms that wait for their address left, the line waits out the refusal: Google
    // is not asked again until it is over.
    let geocodes = 0;
    const reverseGeocode = geo.reverseGeocode.bind(geo);
    geo.reverseGeocode = (point) => {
      geocodes++;
      return reverseGeocode(point);
    };
    geo.failing = {};
    clock += 1_799_000;
    await upkeep.flush();
    expect(geocodes).toBe(0);
    expect(gyms.row(id)?.geodata).toBeNull();
    clock += 1_000;
    await upkeep.flush();
    expect(gyms.row(id)?.geodata).not.toBeNull();
    expect(gyms.row(id)?.places).not.toBeNull();
  });

  it('keeps the address a gym was put in the line for while its places were refused', async () => {
    const lookups = new MemoryGymLookups();
    const { upkeep, geo, add } = await upkeepWith({ lookups });
    const id = await add(40.01, -80.09, 'One');
    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
    geo.failing = { places: 'denied' };
    let release: () => void = () => undefined;
    geo.holdPlaces.push(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const flushing = upkeep.flush();
    await background.settle();
    expect(geo.questions('geocode')).toHaveLength(1);
    // Moved while its places are asked about: its new place needs an address again.
    await upkeep.placed(id, { places: 'later' });
    release();
    await flushing;
    expect(lookups.rows.get(id)?.address).toBe(true);
  });

  it('does not count a gym that was gone before Google was asked', async () => {
    const lookups = new MemoryGymLookups();
    const use = new MemoryGoogleUse();
    const { upkeep, geo } = await upkeepWith({ lookups, use });
    await lookups.add([{ gymId: 999, address: true, rank: 0 }], 1);
    await upkeep.flush();
    expect(geo.asked).toEqual([]);
    expect(counted(use)).toBe(0);
    expect(lookups.rows.has(999)).toBe(false);
  });

  it('keeps a gym put in the line again while its turn is being written down', async () => {
    const lookups = new MemoryGymLookups();
    const { upkeep, geo, add, directory } = await upkeepWith({ lookups });
    await upkeep.flush();
    const id = await add(40.01, -80.09, 'One');
    await lookups.add([{ gymId: id, address: false, rank: 0 }], 1);
    geo.asked.length = 0;
    // Taking it out of the line waits until the gym was put in the line again.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let removing = false;
    const remove = lookups.remove.bind(lookups);
    lookups.remove = async (gymId) => {
      removing = true;
      await held;
      return remove(gymId);
    };
    const flushing = upkeep.flush();
    await background.settle();
    expect(removing).toBe(true);
    await upkeep.placed(id, { places: 'later' });
    release();
    await flushing;
    await upkeep.flush();
    const at = directory.get(id)!;
    const asked = geo
      .questions('places')
      .filter((question) => question.point.lat === at.lat && question.point.lon === at.lon);
    expect(asked).toHaveLength(2);
  });

  it('puts in the line, when it is taken up, the gyms that lack places', async () => {
    const lookups = new MemoryGymLookups();
    const { upkeep, gyms, directory } = await upkeepWith({
      lookups,
      setTimer: () => () => undefined,
    });
    const lacking = directory.all().filter((gym) => gym.places === null);
    await upkeep.resume();
    expect(await upkeep.waiting()).toBe(lacking.length);
    const bare = await gyms.create({ name: 'Bare', lat: 40.05, lon: -80.05 }, 1);
    await directory.refreshGym(bare.id);
    // A gym of before with places counts as asked, though it has no address.
    const placed = await gyms.create({ name: 'Placed', lat: 40.051, lon: -80.05 }, 1);
    await gyms.update(placed.id, { places: 'Corner Bakery' });
    await directory.refreshGym(placed.id);
    await upkeep.resume();
    expect(lookups.rows.get(bare.id)?.address).toBe(true);
    expect(lookups.rows.has(placed.id)).toBe(false);
  });

  it('puts in the line at a start no gym Google found nothing for, until it moves', async () => {
    const lookups = new MemoryGymLookups();
    const { upkeep, gyms, geo, directory, add } = await upkeepWith({
      lookups,
      setTimer: () => () => undefined,
    });
    const id = await add(40.01, -80.09, 'Nowhere');
    geo.addresses.set('40.01,-80.09', {});
    geo.placesAt.set('40.01,-80.09', []);
    await upkeep.placed(id, { places: 'later' });
    await upkeep.flush();
    // Asked, and nothing found: the gym looks as one never asked.
    expect(gyms.row(id)).toMatchObject({ geodata: null, places: null });
    expect(lookups.rows.has(id)).toBe(false);
    await upkeep.resume();
    expect(lookups.rows.has(id)).toBe(false);
    // Moved, and its place in the line lost: the next start puts it in again.
    await gyms.update(id, { lat: 40.011 });
    await directory.refreshGym(id);
    await upkeep.placed(id, { places: 'later' });
    lookups.rows.delete(id);
    await upkeep.resume();
    expect(lookups.rows.get(id)?.address).toBe(true);
  });

  it('takes a gym asked about by hand out of the line', async () => {
    const lookups = new MemoryGymLookups();
    const { upkeep, add } = await upkeepWith({ lookups });
    const id = await add(40.01, -80.09, 'One');
    await lookups.add([{ gymId: id, address: true, rank: 0 }], 1);
    await upkeep.refresh(id);
    expect(lookups.rows.has(id)).toBe(false);
  });

  it('takes up after a restart the gyms that waited, which a deletion takes out', async () => {
    const lookups = new MemoryGymLookups();
    const first = await threeQueued({ lookups });
    await first.upkeep.stop();
    expect(first.geo.questions('geocode')).toEqual([]);
    await first.upkeep.removed(first.ids[2]!);
    // Another upkeep over the same line, as after a restart.
    const again = new GymUpkeep({
      gyms: first.gyms,
      directory: first.directory,
      geo: first.geo,
      parties: { active: () => [] },
      posts: { changed: () => undefined },
      log: createTestLogger().log,
      setTimer: () => () => undefined,
      lookups,
    });
    expect(await again.waiting()).toBeGreaterThanOrEqual(2);
    await again.flush();
    const geocoded = first.geo.questions('geocode').map((question) => question.point.lat);
    expect(geocoded).toEqual([40.01, 40.02]);
    expect(await again.waiting()).toBe(0);
  });
});

describe('GymUpkeep.stop', () => {
  it('keeps the line for the next start and waits for what is on its way', async () => {
    const { upkeep, gyms, geo, timers, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    let release: () => void = () => undefined;
    geo.hold = new Promise((resolve) => {
      release = resolve;
    });
    await upkeep.placed(id);
    expect(await upkeep.waiting()).toBe(1);

    let stopped = false;
    const stopping = upkeep.stop().then(() => {
      stopped = true;
    });
    await background.settle();
    expect(stopped).toBe(false);
    expect(await upkeep.waiting()).toBe(1);
    expect(timers).toHaveLength(0);
    release();
    await stopping;
    // The gym that was being asked about got its answer; the one in the line was not asked.
    expect(gyms.row(id)?.places).toBe('Corner Bakery Maple Dental');
    expect(geo.questions('places')).toHaveLength(1);

    // And nothing is queued or asked from now on.
    geo.asked.length = 0;
    await upkeep.placed(id);
    expect(await upkeep.waiting()).toBe(1);
    await upkeep.stop();
    await background.settle();
    expect(geo.asked).toEqual([]);
  });
});

describe('MemoryGyms', () => {
  it('starts with the invented gyms, each with its nearest', async () => {
    const gyms = new MemoryGyms();
    const all = await gyms.listAll();
    expect(all).toHaveLength(12);
    expect(all.every((gym) => gym.nearestGym !== null && gym.nearestGym !== gym.id)).toBe(true);
  });
});
