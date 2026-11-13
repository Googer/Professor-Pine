import { describe, expect, it } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import {
  EAST_CHANNEL,
  NORTH_CHANNEL,
  OTHER_GUILD_ROW,
  TEST_GUILD_ROW,
  WEST_CHANNEL,
  northRegion,
  testGyms,
  testLinks,
  testRegions,
} from '../../test/support/gyms.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { GymLink } from '../domain/gyms/gym-server.js';
import { GymDirectory } from './gym-directory.js';
import { GoogleAnswers, MemoryGoogleAnswerStorage } from './google-answers.js';

/** Gyms and regions in memory, with counters and a switch to make reading fail. */
function sources() {
  const state = {
    gyms: testGyms(),
    // Every gym is the test server's unless a test says otherwise.
    links: testLinks([...testGyms(), { id: 50 }, { id: 51 }]),
    regions: testRegions(),
    listed: 0,
    fetched: [] as number[],
    failing: false,
  };
  const fail = () => Promise.reject(new Error('database is down'));
  return {
    state,
    gyms: {
      listAll: (): Promise<Gym[]> => {
        state.listed += 1;
        return state.failing ? fail() : Promise.resolve(state.gyms.map((gym) => ({ ...gym })));
      },
      get: (id: number): Promise<Gym | undefined> => {
        state.fetched.push(id);
        return state.failing ? fail() : Promise.resolve(state.gyms.find((gym) => gym.id === id));
      },
      links: (): Promise<GymLink[]> =>
        state.failing ? fail() : Promise.resolve(state.links.map((link) => ({ ...link }))),
      linksOf: (gymId: number): Promise<number[]> =>
        state.failing
          ? fail()
          : Promise.resolve(
              state.links.filter((link) => link.gymId === gymId).map((link) => link.guildId),
            ),
    },
    regions: {
      listAll: (): Promise<Region[]> =>
        state.failing ? fail() : Promise.resolve(state.regions.map((region) => ({ ...region }))),
    },
  };
}

function directory(answers?: GoogleAnswers) {
  const source = sources();
  const { log, entries } = createTestLogger();
  const service = new GymDirectory({
    gyms: source.gyms,
    regions: source.regions,
    wordsOf: () => ['gym', 'raid'],
    log,
    // None asked yet, unless the test gives some.
    answers: answers ?? new GoogleAnswers({ storage: new MemoryGoogleAnswerStorage(), log }),
  });
  return { service, state: source.state, entries };
}

const ids = (service: GymDirectory, channelId: string | null, text: string) =>
  service
    .of(TEST_GUILD_ROW)
    .search(channelId, text)
    .map((hit) => hit.gym.id);
const background = watchEachTest();

describe('GymDirectory', () => {
  it('answers nothing before it has loaded', () => {
    const { service } = directory();
    expect(() => service.stored(1)).toThrow('Gyms have not been loaded yet');
    expect(() => service.of(TEST_GUILD_ROW).search(null, 'library')).toThrow(
      'Gyms have not been loaded yet',
    );
    expect(() => service.of(TEST_GUILD_ROW).isRegion(WEST_CHANNEL)).toThrow(
      'Gyms have not been loaded yet',
    );
  });

  it('loads every gym and region with one read each and says so', async () => {
    const { service, state, entries } = directory();
    await service.load();
    expect(state.listed).toBe(1);
    expect(service.size).toBe(12);
    expect(service.stored(1)?.name).toBe('Pinewood Public Library');
    expect(service.of(TEST_GUILD_ROW).isRegion(WEST_CHANNEL)).toBe(true);
    expect(service.of(TEST_GUILD_ROW).regionsOf(7)).toEqual([EAST_CHANNEL]);
    expect(ids(service, WEST_CHANNEL, 'mural')).toEqual([1, 7]);
    expect(ids(service, null, 'the library gym')).toEqual([1]);
    expect(entries.at(-1)).toMatchObject({ msg: 'gyms indexed', gyms: 12, regions: 3 });
  });

  it('fails to load when the database fails, and loads later', async () => {
    const { service, state } = directory();
    state.failing = true;
    await expect(service.load()).rejects.toThrow('database is down');
    expect(() => service.stored(1)).toThrow('Gyms have not been loaded yet');
    state.failing = false;
    await service.load();
    expect(service.size).toBe(12);
  });

  it('keeps serving the old state when a later load fails', async () => {
    const { service, state } = directory();
    await service.load();
    state.failing = true;
    await expect(service.load()).rejects.toThrow('database is down');
    expect(ids(service, null, 'library')).toEqual([1]);
  });

  it('takes up new regions on the next load', async () => {
    const { service, state } = directory();
    await service.load();
    expect(ids(service, WEST_CHANNEL, 'trailhead')).toEqual([]);
    state.regions = state.regions.filter((region) => region.channelId !== WEST_CHANNEL);
    await service.load();
    expect(service.of(TEST_GUILD_ROW).isRegion(WEST_CHANNEL)).toBe(false);
    // No longer a region: the whole directory is searched.
    expect(ids(service, WEST_CHANNEL, 'trailhead')).toEqual([10]);
  });

  it('re-reads one gym that changed', async () => {
    const { service, state } = directory();
    await service.load();
    state.gyms = state.gyms.map((gym) =>
      gym.id === 1 ? { ...gym, name: 'Pinewood Reading Room', lon: -79.95 } : gym,
    );
    expect((await service.refreshGym(1))?.name).toBe('Pinewood Reading Room');
    expect(state.fetched).toEqual([1]);
    expect(state.listed).toBe(1);
    expect(ids(service, EAST_CHANNEL, 'reading room')).toEqual([1]);
    expect(ids(service, WEST_CHANNEL, 'public library')).toEqual([]);
    expect(service.of(TEST_GUILD_ROW).regionsOf(1)).toEqual([EAST_CHANNEL]);
  });

  it('takes up a new gym and forgets a deleted one', async () => {
    const { service, state } = directory();
    await service.load();
    const template = state.gyms[0];
    if (!template) throw new Error('The fixture is empty');
    state.gyms.push({ ...template, id: 50, name: 'Clock Tower' });
    expect((await service.refreshGym(50))?.id).toBe(50);
    expect(ids(service, WEST_CHANNEL, 'clock')).toEqual([50]);

    state.gyms = state.gyms.filter((gym) => gym.id !== 50);
    expect(await service.refreshGym(50)).toBeUndefined();
    expect(service.stored(50)).toBeUndefined();
    expect(ids(service, null, 'clock')).toEqual([]);
    expect(await service.refreshGym(12345)).toBeUndefined();
  });

  it('re-reads the gyms of a block in one turn, and changes its generation once', async () => {
    const { service, state } = directory();
    await service.load();
    const template = state.gyms[0];
    if (!template) throw new Error('The fixture is empty');
    state.gyms.push({ ...template, id: 50, name: 'Zeppelin Clock', keywords: [] });
    state.gyms.push({ ...template, id: 51, name: 'Zeppelin Bell', keywords: [] });
    state.gyms = state.gyms.map((gym) => (gym.id === 2 ? { ...gym, nearestGym: 51 } : gym));
    const generation = service.generation;
    const read = await service.refreshGyms([50, 51, 2, 999]);
    expect(read.map((gym) => gym.id)).toEqual([50, 51, 2]);
    expect(service.generation).toBe(generation + 1);
    expect(ids(service, WEST_CHANNEL, 'zeppelin').sort()).toEqual([50, 51]);
    expect(service.stored(2)?.nearestGym).toBe(51);
    expect(state.fetched).toEqual([50, 51, 2, 999]);
  });

  it('keeps the gym as it was when re-reading it fails', async () => {
    const { service, state } = directory();
    await service.load();
    state.failing = true;
    await expect(service.refreshGym(1)).rejects.toThrow('database is down');
    expect(service.stored(1)?.name).toBe('Pinewood Public Library');
    state.failing = false;
    expect((await service.refreshGym(1))?.id).toBe(1);
  });

  it('applies changes in the order they were asked for', async () => {
    const { service, state } = directory();
    await service.load();
    state.gyms = state.gyms.map((gym) => (gym.id === 1 ? { ...gym, name: 'Reading Room' } : gym));
    const refreshed = service.refreshGym(1);
    const reloaded = service.load();
    await Promise.all([refreshed, reloaded]);
    expect(service.stored(1)?.name).toBe('Reading Room');
    expect(state.listed).toBe(2);
  });

  it('refuses to re-read a gym before the first load', async () => {
    const { service } = directory();
    await expect(service.refreshGym(1)).rejects.toThrow('Gyms have not been loaded yet');
  });

  it('forgets a gym at once, also while the database cannot be read', async () => {
    const { service, state } = directory();
    await service.load();
    state.failing = true;
    expect(service.forget(1)).toBe(true);
    expect(service.stored(1)).toBeUndefined();
    expect(service.of(TEST_GUILD_ROW).regionsOf(1)).toEqual([]);
    expect(ids(service, null, 'pinewood public library')).not.toContain(1);
    expect(service.forget(1)).toBe(false);
    expect(state.fetched).toEqual([]);
    // A read that fails afterwards does not bring it back.
    await expect(service.refreshGym(1)).rejects.toThrow('database is down');
    expect(service.stored(1)).toBeUndefined();
  });

  it('does not let a read that is on its way put a forgotten gym back', async () => {
    const { service, state } = directory();
    await service.load();
    // A re-read of the gym and a whole load, both of which see the row as it still was.
    const refreshing = service.refreshGym(1);
    const loading = service.load();
    // The row goes, and the gym is forgotten, before either has finished.
    expect(service.forget(1)).toBe(true);
    await Promise.all([refreshing, loading]);
    state.gyms = state.gyms.filter((gym) => gym.id !== 1);
    await background.settle();
    expect(service.stored(1)).toBeUndefined();
    expect(ids(service, null, 'pinewood public library')).not.toContain(1);
  });

  it('does not let a read that is on its way link an unlinked gym to its server again', async () => {
    const { service, state } = directory();
    // Gym 1 is both servers'.
    state.links.push({ gymId: 1, guildId: OTHER_GUILD_ROW });
    await service.load();
    // A re-read of the gym and a whole load, both of which see the links as they still were.
    const refreshing = service.refreshGym(1);
    const loading = service.load();
    // The first server's link goes, and the gym is unlinked, before either has finished.
    expect(service.unlink(1, TEST_GUILD_ROW)).toBe(true);
    await Promise.all([refreshing, loading]);
    state.links = state.links.filter((link) => link.gymId !== 1 || link.guildId !== TEST_GUILD_ROW);
    await background.settle();
    expect(service.of(TEST_GUILD_ROW).get(1)).toBeUndefined();
    expect(ids(service, null, 'pinewood public library')).not.toContain(1);
    // The other server keeps it, and so does a stored reference.
    expect(service.of(OTHER_GUILD_ROW).get(1)?.name).toBe('Pinewood Public Library');
    expect(service.stored(1)).toBeDefined();
    expect(service.unlink(1, TEST_GUILD_ROW)).toBe(false);
  });

  it('lists every gym, as a list of its own', async () => {
    const { service } = directory();
    await service.load();
    const all = service.all();
    expect(all.map((gym) => gym.id).sort((a, b) => a - b)).toEqual(testGyms().map((gym) => gym.id));
    all.length = 0;
    expect(service.all()).toHaveLength(testGyms().length);
  });

  it('gives each server its linked gyms in its own regions (plan 19B-2)', async () => {
    const { service, state } = directory();
    state.regions = [...testRegions(), northRegion()];
    // Gym 10 lies in no region; the second server has it, and the first keeps it too.
    state.links.push({ gymId: 10, guildId: OTHER_GUILD_ROW });
    await service.load();
    const away = service.of(OTHER_GUILD_ROW);
    expect(away.all().map((gym) => gym.id)).toEqual([10]);
    expect(away.get(1)).toBeUndefined();
    expect(away.isRegion(NORTH_CHANNEL)).toBe(true);
    expect(away.isRegion(WEST_CHANNEL)).toBe(false);
    expect(service.of(TEST_GUILD_ROW).isRegion(NORTH_CHANNEL)).toBe(false);
    expect(service.of(TEST_GUILD_ROW).get(10)?.name).toBe('Lakeview Trailhead');
    expect(service.serversOf(10)).toEqual([TEST_GUILD_ROW, OTHER_GUILD_ROW]);
    expect(service.stored(1)?.name).toBe('Pinewood Public Library');
  });

  it('re-reads the servers of a gym with the gym', async () => {
    const { service, state } = directory();
    await service.load();
    const away = service.of(OTHER_GUILD_ROW);
    expect(away.get(2)).toBeUndefined();
    state.links = [
      ...state.links.filter((link) => link.gymId !== 2),
      { gymId: 2, guildId: OTHER_GUILD_ROW },
    ];
    await service.refreshGym(2);
    expect(service.of(OTHER_GUILD_ROW).get(2)?.name).toBe('Old Stone Fountain');
    expect(service.of(TEST_GUILD_ROW).get(2)).toBeUndefined();
    // Still the gym of a stored reference.
    expect(service.stored(2)?.name).toBe('Old Stone Fountain');
    service.forget(2);
    expect(service.of(OTHER_GUILD_ROW).get(2)).toBeUndefined();
    expect(service.stored(2)).toBeUndefined();
  });

  it('counts every change, so that what is built from it knows when to build anew', async () => {
    const { service, state } = directory();
    const seen = [service.generation];
    await service.load();
    seen.push(service.generation);
    state.gyms = state.gyms.map((gym) => (gym.id === 2 ? { ...gym, name: 'New Fountain' } : gym));
    await service.refreshGym(2);
    seen.push(service.generation);
    service.forget(3);
    seen.push(service.generation);
    await service.load();
    seen.push(service.generation);
    expect(new Set(seen).size).toBe(seen.length);
    state.failing = true;
    await expect(service.load()).rejects.toThrow();
    await expect(service.refreshGym(2)).rejects.toThrow();
    expect(service.generation).toBe(seen.at(-1));
  });

  describe('the answers of Google (plan 19B-3)', () => {
    async function answered() {
      const answers = new GoogleAnswers({
        storage: new MemoryGoogleAnswerStorage(),
        log: createTestLogger().log,
      });
      await answers.load();
      // Gym 1's place has an address and places; gym 2's nothing yet.
      const one = testGyms()[0]!;
      await answers.save([
        { kind: 'address', lat: one.lat, lon: one.lon, answer: '{"a":"Point St"}', askedAt: 1 },
        { kind: 'places', lat: one.lat, lon: one.lon, answer: 'Point Cafe', askedAt: 1 },
      ]);
      const made = directory(answers);
      // Gym 1 is both servers'.
      made.state.links.push({ gymId: 1, guildId: OTHER_GUILD_ROW });
      await made.service.load();
      return { ...made, answers, one };
    }

    it('gives each gym its point’s address and places, the same in every server, never what the gym row holds', async () => {
      const { service } = await answered();
      for (const guildId of [TEST_GUILD_ROW, OTHER_GUILD_ROW]) {
        expect(service.of(guildId).get(1)).toMatchObject({
          geodata: '{"a":"Point St"}',
          places: 'Point Cafe',
        });
      }
      // Gym 2's row has an address of before, which no longer counts.
      expect(testGyms()[1]?.geodata).not.toBeNull();
      expect(service.stored(2)).toMatchObject({ geodata: null, places: null });
      // The places are searched.
      expect(ids(service, null, 'point cafe')).toEqual([1]);
    });

    it('shows an answer saved at once, for the gyms within ten meters of its point', async () => {
      const { service, answers } = await answered();
      const two = testGyms()[1]!;
      const before = service.generation;
      await answers.save([
        {
          kind: 'places',
          lat: two.lat + 0.00003,
          lon: two.lon,
          answer: 'Fountain Deli',
          askedAt: 2,
        },
      ]);
      expect(service.stored(2)?.places).toBe('Fountain Deli');
      expect(service.generation).not.toBe(before);
      expect(ids(service, null, 'fountain deli')).toEqual([2]);
      expect(service.stored(3)?.places).toBeNull();
    });

    it('looks at the gyms near a saved answer alone, never every gym', async () => {
      const { service, answers, state } = await answered();
      const two = testGyms()[1]!;
      const looked = service.gymsLookedAt;
      await answers.save([
        { kind: 'places', lat: two.lat, lon: two.lon, answer: 'Fountain Deli', askedAt: 2 },
      ]);
      expect(service.stored(2)?.places).toBe('Fountain Deli');
      // Gym 2 alone lies within a hundred meters or so of its point.
      expect(service.gymsLookedAt - looked).toBe(1);
      expect(service.all().length).toBeGreaterThan(5);
      // A gym moved beside it is looked at there after its move.
      state.gyms = state.gyms.map((gym) =>
        gym.id === 3 ? { ...gym, lat: two.lat + 0.0002, lon: two.lon } : gym,
      );
      await service.refreshGym(3);
      await answers.save([
        { kind: 'places', lat: two.lat + 0.0002, lon: two.lon, answer: 'Corner Deli', askedAt: 3 },
      ]);
      expect(service.stored(3)?.places).toBe('Corner Deli');
      expect(service.stored(2)?.places).toBe('Fountain Deli');
    });

    it('says whether a gym of any server lies within ten meters of a point (the sweep of the answers)', async () => {
      const { service, state, one } = await answered();
      const meter = 1 / 111_000;
      expect(service.anyNear({ lat: one.lat + 9 * meter, lon: one.lon })).toBe(true);
      expect(service.anyNear({ lat: one.lat + 11 * meter, lon: one.lon })).toBe(false);
      // Gym 2 is the second server's alone: it counts all the same.
      const two = testGyms()[1]!;
      state.links = [
        ...state.links.filter((link) => link.gymId !== 2),
        { gymId: 2, guildId: OTHER_GUILD_ROW },
      ];
      await service.load();
      expect(service.anyNear(two)).toBe(true);
      // A deleted gym is none.
      service.forget(2);
      expect(service.anyNear(two)).toBe(false);
    });

    it('takes the answers of where a gym is now, when it is read again', async () => {
      const { service, state, one } = await answered();
      state.gyms = state.gyms.map((gym) => (gym.id === 1 ? { ...gym, lat: one.lat + 0.001 } : gym));
      await service.refreshGym(1);
      expect(service.stored(1)).toMatchObject({ geodata: null, places: null });
    });
  });
});
