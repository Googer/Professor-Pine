import { describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  NORTH_CHANNEL,
  OTHER_GUILD_ROW,
  WEST_CHANNEL,
  northRegion,
  testGym,
  testGyms,
  testRegions,
} from '../../test/support/gyms.js';
import type { GymLink } from '../domain/gyms/gym-server.js';
import type { Region } from '../db/repositories/region-repository.js';
import { ServerGyms } from './server-gyms.js';

const HOME = 1;
const AWAY = OTHER_GUILD_ROW;

/**
 * Away's region Wide lies over West and East, so the two servers' regions overlap; its gyms are
 * the Lighthouse (7, also Home's) and a gym of its own in West's square, the Watermill (40).
 */
function wideRegion(): Region {
  return {
    ...northRegion(),
    id: 5,
    channelId: NORTH_CHANNEL,
    bounds: [
      { lat: 40.0, lon: -80.1 },
      { lat: 40.1, lon: -80.1 },
      { lat: 40.1, lon: -79.9 },
      { lat: 40.0, lon: -79.9 },
      { lat: 40.0, lon: -80.1 },
    ],
  };
}

const WATERMILL = testGym(40, 'Old Watermill Mural', 40.051, -80.051);

function twoServers(
  wordsOf: (guildId: number) => readonly string[] = () => [],
  options: { maxViews?: number } = {},
) {
  const links: GymLink[] = [
    ...testGyms().map((gym) => ({ gymId: gym.id, guildId: HOME })),
    { gymId: 7, guildId: AWAY },
    { gymId: 40, guildId: AWAY },
  ];
  return new ServerGyms(
    [...testGyms(), WATERMILL],
    links,
    [...testRegions(), wideRegion()],
    wordsOf,
    options,
  );
}

const ids = (hits: readonly { gym: { id: number } }[]) => hits.map((hit) => hit.gym.id);

describe('ServerGyms', () => {
  it('gives each server its own gyms only, wherever they lie', () => {
    const gyms = twoServers();
    const home = gyms.of(HOME);
    const away = gyms.of(AWAY);
    expect(home.get(40)).toBeUndefined();
    expect(away.get(1)).toBeUndefined();
    expect(away.get(7)?.name).toBe('Harbor Lighthouse Mural');
    expect(
      away
        .all()
        .map((gym) => gym.id)
        .sort((a, b) => a - b),
    ).toEqual([7, 40]);
    expect(home.all()).toHaveLength(12);
  });

  it('searches only the server’s gyms, from any channel', () => {
    const gyms = twoServers();
    expect(ids(gyms.of(HOME).search(null, 'mural')).sort()).toEqual([1, 7]);
    expect(ids(gyms.of(AWAY).search(null, 'mural')).sort((a, b) => a - b)).toEqual([7, 40]);
    // A region of another server is no region here: its channel is searched as none.
    expect(ids(gyms.of(AWAY).search(WEST_CHANNEL, 'library'))).toEqual([]);
    expect(ids(gyms.of(HOME).search(NORTH_CHANNEL, 'watermill'))).toEqual([]);
  });

  it('places the server’s gyms in the server’s regions only', () => {
    const gyms = twoServers();
    expect(gyms.of(AWAY).regionsOf(7)).toEqual([NORTH_CHANNEL]);
    expect(gyms.of(HOME).regionsOf(7)).toEqual([EAST_CHANNEL]);
    expect(gyms.of(AWAY).regionsOf(1)).toEqual([]);
    expect(gyms.of(AWAY).isRegion(WEST_CHANNEL)).toBe(false);
    expect(gyms.of(HOME).isRegion(NORTH_CHANNEL)).toBe(false);
    expect(gyms.of(HOME).inRegion(NORTH_CHANNEL)).toEqual([]);
    expect(
      gyms
        .of(AWAY)
        .inRegion(NORTH_CHANNEL)
        .map((gym) => gym.id)
        .sort((a, b) => a - b),
    ).toEqual([7, 40]);
  });

  it('says which of a server’s regions hold one of its gyms without building a view', () => {
    const gyms = twoServers(() => [], { maxViews: 1 });
    expect(gyms.regionsIn(AWAY, 7)).toEqual([NORTH_CHANNEL]);
    expect(gyms.regionsIn(HOME, 7)).toEqual([EAST_CHANNEL]);
    // Not Away's gym, though Away's region holds it; in no region; a server without gyms.
    expect(gyms.regionsIn(AWAY, 1)).toEqual([]);
    expect(gyms.regionsIn(HOME, 10)).toEqual([]);
    expect(gyms.regionsIn(3, 1)).toEqual([]);
    expect(gyms.built).toBe(0);
    // What the server's view says of it.
    expect(gyms.regionsIn(HOME, 1)).toEqual(gyms.of(HOME).regionsOf(1));
    expect(gyms.regionsIn(AWAY, 40)).toEqual(gyms.of(AWAY).regionsOf(40));
  });

  it('builds a view of what the links say after gyms were linked, unlinked or removed', () => {
    const gyms = twoServers();
    // No view is built yet: each is built from the links as they are when it is asked for.
    gyms.put({ ...WATERMILL, name: 'Old Watermill Gallery' }, [HOME]);
    gyms.unlink(7, AWAY);
    gyms.remove(3);
    expect(gyms.of(HOME).get(40)?.name).toBe('Old Watermill Gallery');
    expect(gyms.of(HOME).get(3)).toBeUndefined();
    expect(gyms.of(HOME).all()).toHaveLength(12);
    expect(gyms.of(AWAY).all()).toEqual([]);
    expect(gyms.serversOf(7)).toEqual([HOME]);
  });

  it('gives a server without a row no gyms', () => {
    const gyms = twoServers();
    expect(gyms.of(undefined).get(1)).toBeUndefined();
    expect(gyms.of(undefined).search(null, 'library')).toEqual([]);
    expect(gyms.of(3).all()).toEqual([]);
  });

  it('reads a stored reference by its id, whoever it belongs to', () => {
    const gyms = twoServers();
    expect(gyms.stored(40)?.name).toBe('Old Watermill Mural');
    expect(gyms.stored(1)?.name).toBe('Pinewood Public Library');
    expect(gyms.serversOf(7)).toEqual([HOME, AWAY]);
    expect(gyms.serversOf(40)).toEqual([AWAY]);
  });

  it('ignores the words each server’s search ignores', () => {
    let homeWords: readonly string[] = ['mural'];
    const gyms = twoServers((guildId) => (guildId === HOME ? homeWords : []));
    expect(ids(gyms.of(HOME).search(null, 'mural'))).toEqual([]);
    expect(ids(gyms.of(AWAY).search(null, 'mural'))).toHaveLength(2);
    // Its staff change them: the server's index is built anew at the next ask.
    homeWords = [];
    expect(ids(gyms.of(HOME).search(null, 'mural')).sort()).toEqual([1, 7]);
  });

  it('follows a gym changed, linked anew or gone in every server’s view', () => {
    const gyms = twoServers();
    // Both views are built before the change.
    expect(gyms.of(HOME).get(40)).toBeUndefined();
    expect(gyms.of(AWAY).get(1)).toBeUndefined();
    gyms.put({ ...WATERMILL, name: 'Old Watermill Gallery' }, [HOME, AWAY]);
    expect(ids(gyms.of(HOME).search(null, 'gallery'))).toEqual([40]);
    expect(ids(gyms.of(AWAY).search(null, 'gallery'))).toEqual([40]);
    // Unlinked from Home: gone there, kept in Away.
    gyms.put({ ...WATERMILL, name: 'Old Watermill Gallery' }, [AWAY]);
    expect(gyms.of(HOME).get(40)).toBeUndefined();
    expect(gyms.of(AWAY).get(40)?.name).toBe('Old Watermill Gallery');
    expect(gyms.remove(40)).toBe(true);
    expect(gyms.of(AWAY).get(40)).toBeUndefined();
    expect(gyms.stored(40)).toBeUndefined();
    expect(gyms.remove(40)).toBe(false);
  });

  it('builds a view only once while nothing changes, and as many as it may keep', () => {
    let asked = 0;
    const gyms = new ServerGyms(
      testGyms(),
      testGyms().map((gym) => ({ gymId: gym.id, guildId: HOME })),
      testRegions(),
      () => {
        asked += 1;
        return [];
      },
      { maxViews: 1 },
    );
    const first = gyms.of(HOME);
    expect(gyms.of(HOME)).toBe(first);
    expect(gyms.built).toBe(1);
    gyms.of(AWAY);
    gyms.of(HOME);
    // Home's view went for Away's and was built again.
    expect(gyms.built).toBe(3);
    expect(asked).toBeGreaterThan(0);
  });
});
