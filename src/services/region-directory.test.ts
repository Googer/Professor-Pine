import { describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  testRegions,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { Region } from '../db/repositories/region-repository.js';
import {
  gymInGuild,
  gymRegionsInGuild,
  RegionDirectory,
  regionsAtPoint,
  regionsAtPoints,
} from './region-directory.js';

function directory(list: () => Promise<Region[]> = () => Promise.resolve(testRegions())) {
  const { log, entries } = createTestLogger();
  return { regions: new RegionDirectory({ regions: { listAll: list }, log }), entries };
}

describe('gymRegionsInGuild', () => {
  const UNOWNED = 'unowned-channel';
  const FOREIGN = 'foreign-channel';
  const all: Region[] = [
    ...testRegions(),
    { ...testRegions()[0]!, id: 8, guildId: null, channelId: UNOWNED },
    { ...testRegions()[0]!, id: 9, guildId: 2, channelId: FOREIGN },
  ];
  const regions = { byChannel: (id: string) => all.find((region) => region.channelId === id) };
  const lying: Record<number, string[]> = {
    1: [FOREIGN, EAST_CHANNEL, 'gone-channel', UNOWNED, WEST_CHANNEL],
    2: [UNOWNED],
    3: [],
    4: [FOREIGN, WEST_CHANNEL],
  };
  /** The servers of the gyms (plan 19B-2): gym 4, in regions of both, is the first's alone. */
  const servers: Record<number, number[]> = { 1: [1, 2], 2: [1, 2], 3: [1, 2], 4: [1] };
  const gyms = {
    of: (guildId: number | undefined) => ({
      regionsOf: (gymId: number) =>
        guildId !== undefined && (servers[gymId] ?? []).includes(guildId)
          ? (lying[gymId] ?? [])
          : [],
    }),
  };

  it('gives a gym of another server no region of this one, though one holds it', () => {
    expect(gymRegionsInGuild(gyms, regions, 4, 1).map((region) => region.id)).toEqual([1]);
    expect(gymRegionsInGuild(gyms, regions, 4, 2)).toEqual([]);
    expect(gymInGuild(gyms, regions, 4, 2)).toBe(false);
  });

  it('gives the regions of that server the gym lies in, in the order of their channels', () => {
    expect(gymRegionsInGuild(gyms, regions, 1, 1).map((region) => region.id)).toEqual([2, 1]);
    expect(gymRegionsInGuild(gyms, regions, 1, 2).map((region) => region.id)).toEqual([9]);
    expect(gymRegionsInGuild(gyms, regions, 1, 3)).toEqual([]);
    expect(gymInGuild(gyms, regions, 1, 1)).toBe(true);
    expect(gymInGuild(gyms, regions, 1, 3)).toBe(false);
  });

  it('counts a region without a server for no server, and a gym in no region for none', () => {
    for (const guildId of [1, 2]) {
      expect(gymRegionsInGuild(gyms, regions, 2, guildId)).toEqual([]);
      expect(gymInGuild(gyms, regions, 2, guildId)).toBe(false);
      expect(gymInGuild(gyms, regions, 3, guildId)).toBe(false);
    }
  });
});

describe('regionsAtPoint', () => {
  const inWest = { lat: 40.05, lon: -80.05 };
  const inEast = { lat: 40.05, lon: -79.95 };
  /** An outline over West and East together. */
  const both = testRegions()[0]!.bounds!.map((corner) => ({
    ...corner,
    lon: corner.lon === -80 ? -79.9 : corner.lon,
  }));

  it("gives this server's regions whose outlines hold the point, never another server's or one without an outline", () => {
    const all: Region[] = [
      { ...testRegions()[0]!, id: 9, guildId: 2, channelId: 'foreign-channel', bounds: both },
      ...testRegions(),
      { ...testRegions()[2]!, id: 8, channelId: 'outline-less-channel', bounds: null },
    ];
    expect(regionsAtPoint(all, 1, inWest).map((region) => region.id)).toEqual([1]);
    expect(regionsAtPoint(all, 1, inEast).map((region) => region.id)).toEqual([2]);
    expect(regionsAtPoint(all, 2, inEast).map((region) => region.id)).toEqual([9]);
    expect(regionsAtPoint(all, 1, { lat: 41, lon: -81 })).toEqual([]);
  });

  it('takes the first row of a channel that has several, whether or not it holds the point', () => {
    const all: Region[] = [
      ...testRegions(),
      // A later row of West's channel over both squares, and one of a new channel likewise.
      { ...testRegions()[0]!, id: 7, bounds: both },
      { ...testRegions()[0]!, id: 8, channelId: 'second-channel', bounds: both },
    ];
    expect(regionsAtPoint(all, 1, inWest).map((region) => region.id)).toEqual([1, 8]);
    // West's first row does not hold a point of East: its later row is not asked.
    expect(regionsAtPoint(all, 1, inEast).map((region) => region.id)).toEqual([2, 8]);
  });

  it('places many points of a server as it places each (plan 8R-3: the map’s reports)', () => {
    const all: Region[] = [
      { ...testRegions()[0]!, id: 9, guildId: 2, channelId: 'foreign-channel', bounds: both },
      ...testRegions(),
      { ...testRegions()[0]!, id: 7, bounds: both },
      { ...testRegions()[0]!, id: 8, channelId: 'second-channel', bounds: both },
      { ...testRegions()[2]!, id: 6, channelId: 'outline-less-channel', bounds: null },
      // A triangle: half of its box lies outside it.
      {
        ...testRegions()[0]!,
        id: 5,
        channelId: 'triangle-channel',
        bounds: [
          { lat: 40.2, lon: -80.1 },
          { lat: 40.3, lon: -80.1 },
          { lat: 40.2, lon: -80.0 },
        ],
      },
    ];
    const inTriangle = { lat: 40.21, lon: -80.09 };
    const inTrianglesBoxOnly = { lat: 40.29, lon: -80.01 };
    const points = [
      inWest,
      inEast,
      { lat: 41, lon: -81 },
      { lat: 40.05, lon: -80 },
      inTriangle,
      inTrianglesBoxOnly,
    ];
    for (const guild of [1, 2, 3]) {
      const at = regionsAtPoints(all, guild);
      for (const point of points) expect(at(point)).toEqual(regionsAtPoint(all, guild, point));
    }
    expect(regionsAtPoints(all, 1)(inEast).map((region) => region.id)).toEqual([2, 8]);
    expect(regionsAtPoints(all, 1)(inTriangle).map((region) => region.id)).toEqual([5]);
    expect(regionsAtPoint(all, 1, inTrianglesBoxOnly)).toEqual([]);
    expect(regionsAtPoints(all, 1)(inTrianglesBoxOnly)).toEqual([]);
  });
});

describe('RegionDirectory', () => {
  it('refuses to be read before it was loaded', () => {
    const { regions } = directory();
    expect(() => regions.all()).toThrow('Regions have not been loaded yet');
    expect(() => regions.byId(1)).toThrow('Regions have not been loaded yet');
  });

  it('finds a region by id, by its channel and by its forum', async () => {
    const { regions, entries } = directory();
    await regions.load();
    expect(regions.all().map((region) => region.id)).toEqual([1, 2, 3]);
    expect(regions.byId(2)?.channelId).toBe(EAST_CHANNEL);
    expect(regions.byChannel(WEST_CHANNEL)?.id).toBe(1);
    expect(regions.byForum(EAST_FORUM)?.id).toBe(2);
    expect(regions.byForum(WEST_FORUM)?.channelId).toBe(WEST_CHANNEL);
    expect(regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId).toBeNull();
    expect(regions.byId(9)).toBeUndefined();
    expect(regions.byChannel(WEST_FORUM)).toBeUndefined();
    expect(regions.byForum(WEST_CHANNEL)).toBeUndefined();
    expect(entries.at(-1)).toMatchObject({ msg: 'regions loaded', regions: 3, forums: 2 });
  });

  it('keeps the last complete state when a later load fails, and takes the next one', async () => {
    let answer: () => Promise<Region[]> = () => Promise.resolve(testRegions());
    const { regions } = directory(() => answer());
    await regions.load();
    answer = () => Promise.reject(new Error('connection lost'));
    await expect(regions.load()).rejects.toThrow('connection lost');
    expect(regions.all()).toHaveLength(3);
    answer = () => Promise.resolve(testRegions().slice(0, 1));
    await regions.load();
    expect(regions.all()).toHaveLength(1);
  });

  it('counts its loads, so that what is built from it knows when to build anew', async () => {
    let answer: () => Promise<Region[]> = () => Promise.resolve(testRegions());
    const { regions } = directory(() => answer());
    const before = regions.generation;
    await regions.load();
    const loaded = regions.generation;
    expect(loaded).not.toBe(before);
    answer = () => Promise.reject(new Error('connection lost'));
    await expect(regions.load()).rejects.toThrow('connection lost');
    expect(regions.generation).toBe(loaded);
    answer = () => Promise.resolve(testRegions());
    await regions.load();
    expect(regions.generation).not.toBe(loaded);
  });

  it('tells its listeners after a load that changed the outlines, and only then', async () => {
    let answer: () => Promise<Region[]> = () => Promise.resolve(testRegions());
    const { regions } = directory(() => answer());
    let told = 0;
    regions.whenOutlinesChanged(() => told++);
    // The first load is a change.
    await regions.load();
    expect(told).toBe(1);
    // A forum and a board recorded, a description written: no place changes region.
    answer = () =>
      Promise.resolve(
        testRegions().map((region) => ({
          ...region,
          forumChannelId: '900000000000000002',
          summaryMessageId: '900000000000000001',
          description: 'Along the river',
        })),
      );
    await regions.load();
    expect(told).toBe(1);
    // A failed load tells nothing.
    answer = () => Promise.reject(new Error('connection lost'));
    await expect(regions.load()).rejects.toThrow('connection lost');
    expect(told).toBe(1);
    // An outline saved, a region removed, a region given to another server or channel: each is.
    const moved = testRegions().map((region) =>
      region.id === 1 ? { ...region, bounds: region.bounds?.slice().reverse() ?? null } : region,
    );
    for (const next of [
      moved,
      moved.slice(0, 2),
      moved.slice(0, 2).map((region) => (region.id === 2 ? { ...region, guildId: 2 } : region)),
      moved
        .slice(0, 2)
        .map((region) =>
          region.id === 2 ? { ...region, guildId: 2, channelId: '900000000000000003' } : region,
        ),
    ]) {
      answer = () => Promise.resolve(next);
      await regions.load();
    }
    expect(told).toBe(5);
  });

  it('logs a listener that throws, and still tells the others', async () => {
    const { regions, entries } = directory();
    let told = 0;
    regions.whenOutlinesChanged(() => {
      throw new Error('broken listener');
    });
    regions.whenOutlinesChanged(() => told++);
    await regions.load();
    expect(told).toBe(1);
    expect(regions.all()).toHaveLength(3);
    expect(entries).toContainEqual(
      expect.objectContaining({ msg: 'could not follow a change of the regions' }),
    );
  });
});
