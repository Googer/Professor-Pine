import { describe, expect, it, vi } from 'vitest';
import {
  EAST_CHANNEL,
  NORTH_CHANNEL,
  northRegion,
  OTHER_GUILD_ID,
  OTHER_GUILD_ROW,
  TEST_GUILD_ROW,
  testRegions,
  WEST_CHANNEL,
  WIDE_CHANNEL,
  wideRegion,
} from '../../test/support/gyms.js';
import { regionsFixture } from '../../test/support/providers.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { geodataJson } from '../domain/geo/google.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { MemoryWayspots } from '../../test/support/wayspots.js';
import type { Region } from '../db/repositories/region-repository.js';
import { upgradeCopies, wayspotsInNoRegion } from '../domain/wayspots/server-copies.js';
import { RegionDirectory } from './region-directory.js';
import { WayspotDirectory } from './wayspot-directory.js';

const HOME = TEST_GUILD_ROW;
const AWAY = OTHER_GUILD_ROW;

/**
 * The test server's kept Wayspots in West, in East, in no region, and a directory over them and
 * the invented regions (with the second server's Wide over West and East). The second server
 * keeps its own copy of 1 (another title) and a stop 6 in West the test server does not have.
 */
async function directoryWith(regions: Region[] = [...testRegions(), wideRegion()]) {
  const storage = new MemoryWayspots();
  await storage.saveFromImport(
    HOME,
    {
      upsert: [
        keptRow(1, { lat: 40.05, lon: -80.05 }),
        keptRow(2, { lat: 40.0501, lon: -80.05, kind: 'powerspot' }),
        keptRow(3, { lat: 40.06, lon: -80.05, kind: 'gym' }),
        keptRow(4, { lat: 40.05, lon: -79.95 }),
        keptRow(5, { lat: 40.5, lon: -80.05 }),
      ],
      remove: [],
    },
    1_000,
  );
  await storage.saveFromImport(
    AWAY,
    {
      upsert: [
        keptRow(1, { lat: 40.05, lon: -80.05, title: 'Away’s name' }),
        keptRow(6, { lat: 40.0502, lon: -80.05 }),
      ],
      remove: [],
    },
    1_000,
  );
  const { log } = createTestLogger();
  const listed = { rows: regions };
  const regionDirectory = new RegionDirectory({
    regions: { listAll: () => Promise.resolve(listed.rows) },
    log,
  });
  await regionDirectory.load();
  const directory = new WayspotDirectory({ wayspots: storage, regions: regionDirectory, log });
  return { storage, listed, regionDirectory, directory };
}

const idsOf = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

describe('WayspotDirectory', () => {
  it('finds a server’s Wayspots by id and by its regions, from their outlines', async () => {
    const { directory } = await directoryWith();
    await directory.load();
    const home = directory.of(HOME);
    expect(home.byId(wayspotId(1))).toMatchObject({ title: 'Stop 1', kind: 'stop' });
    expect(home.byId(wayspotId(9))).toBeUndefined();
    expect(idsOf(home.inRegion(WEST_CHANNEL)).sort()).toEqual(
      [wayspotId(1), wayspotId(2), wayspotId(3)].sort(),
    );
    expect(idsOf(home.inRegion(EAST_CHANNEL))).toEqual([wayspotId(4)]);
    expect(home.regionsOf(wayspotId(5))).toEqual([]);
    expect(home.regionsOf(wayspotId(4))).toEqual([EAST_CHANNEL]);
    expect(home.all()).toHaveLength(5);
    // A stored reference reads the server's own row, without a view.
    expect(directory.stored(HOME, wayspotId(1))).toMatchObject({ title: 'Stop 1' });
    expect(directory.servers()).toEqual([HOME, AWAY]);
    expect(directory.size).toBe(7);
  });

  it('keeps another server’s Wayspots out of a server’s view, wherever they lie', async () => {
    const { directory } = await directoryWith();
    await directory.load();
    const [home, away] = [directory.of(HOME), directory.of(AWAY)];
    // Stop 6 lies in West: it is the second server's alone.
    expect(home.byId(wayspotId(6))).toBeUndefined();
    expect(home.regionsOf(wayspotId(6))).toEqual([]);
    expect(idsOf(home.inRegion(WEST_CHANNEL))).not.toContain(wayspotId(6));
    expect(idsOf(home.near({ lat: 40.0502, lon: -80.05 }, 100).map((n) => n.wayspot))).toEqual([
      wayspotId(2),
      wayspotId(1),
    ]);
    expect(directory.stored(HOME, wayspotId(6))).toBeUndefined();
    // Each server's copy of 1 is its own; the second server's lies in its own region alone.
    expect(away.byId(wayspotId(1))).toMatchObject({ title: 'Away’s name' });
    expect(away.regionsOf(wayspotId(1))).toEqual([WIDE_CHANNEL]);
    expect(idsOf(away.inRegion(WEST_CHANNEL))).toEqual([]);
    expect(idsOf(away.inRegion(WIDE_CHANNEL)).sort()).toEqual([wayspotId(1), wayspotId(6)]);
    expect(directory.regionsIn(AWAY, wayspotId(6))).toEqual([WIDE_CHANNEL]);
    expect(directory.regionsIn(HOME, wayspotId(6))).toEqual([]);
    // A server without a row has none.
    expect(directory.of(undefined).all()).toEqual([]);
    expect(directory.stored(undefined, wayspotId(1))).toBeUndefined();
  });

  it("gives a Wayspot's address line: Wayfarer's, else a Power Spot's looked-up one (one path)", async () => {
    const { storage } = await directoryWith();
    const looked = new Map([
      [
        wayspotId(2),
        {
          lat: 40.0501,
          lon: -80.05,
          geodata: geodataJson({ formatted_address: '600 Grant St, Pittsburgh, PA 15219, USA' }),
          askedAt: 1,
        },
      ],
    ]);
    const directory = new WayspotDirectory({
      wayspots: storage,
      regions: regionsFixture(),
      log: createTestLogger().log,
      addresses: { lookedUp: (id) => looked.get(id) },
    });
    await directory.load();
    const home = directory.of(HOME);
    const [stop, spot] = [home.byId(wayspotId(1)), home.byId(wayspotId(2))];
    if (!stop || !spot) throw new Error('kept Wayspots missing');
    expect(home.addressOf(stop)).toBe('1 Main St, Pittsburgh, PA 15213, USA');
    expect(home.addressOf({ ...spot, address: null })).toBe(
      '600 Grant St, Pittsburgh, PA 15219, USA',
    );
    // Without looked-up addresses, Wayfarer's alone.
    const plain = (await directoryWith()).directory;
    await plain.load();
    expect(plain.addressOf({ ...spot, address: null })).toBe('');
  });

  it('gives the Wayspots near a point, nearest first, of the kinds asked for', async () => {
    const { directory } = await directoryWith();
    await directory.load();
    const home = directory.of(HOME);
    const near = home.near({ lat: 40.0502, lon: -80.05 }, 100);
    expect(near.map(({ wayspot, metres }) => [wayspot.id, Math.round(metres)])).toEqual([
      [wayspotId(2), 11],
      [wayspotId(1), 22],
    ]);
    expect(
      idsOf(home.near({ lat: 40.05, lon: -80.05 }, 2_000, ['gym']).map((n) => n.wayspot)),
    ).toEqual([wayspotId(3)]);
  });

  it('reads them again on load, and works the regions out again when the regions changed', async () => {
    const { storage, listed, regionDirectory, directory } = await directoryWith();
    await directory.load();
    const first = directory.generation;
    await storage.saveFromImport(
      HOME,
      { upsert: [keptRow(7, { lat: 40.07, lon: -80.07 })], remove: [wayspotId(1)] },
      2_000,
    );
    await directory.load();
    expect(directory.generation).toBeGreaterThan(first);
    expect(directory.of(HOME).byId(wayspotId(1))).toBeUndefined();
    expect(directory.of(AWAY).byId(wayspotId(1))).toBeDefined();
    expect(directory.of(HOME).regionsOf(wayspotId(7))).toEqual([WEST_CHANNEL]);

    // West is gone from the regions: its Wayspots lie in none, without a load of the Wayspots.
    const loaded = directory.generation;
    listed.rows = [...testRegions(), wideRegion()].filter(
      (region) => region.channelId !== WEST_CHANNEL,
    );
    await regionDirectory.load();
    expect(directory.of(HOME).regionsOf(wayspotId(7))).toEqual([]);
    expect(directory.of(HOME).inRegion(WEST_CHANNEL)).toEqual([]);
    expect(directory.generation).toBeGreaterThan(loaded);
  });

  it('forgets a server’s Wayspots that became its gyms at once, the other server’s copies kept', async () => {
    const { directory } = await directoryWith();
    await directory.load();
    const before = directory.generation;
    directory.forget(HOME, [wayspotId(1), wayspotId(3), wayspotId(9)]);
    const home = directory.of(HOME);
    expect(home.byId(wayspotId(3))).toBeUndefined();
    expect(idsOf(home.inRegion(WEST_CHANNEL))).toEqual([wayspotId(2)]);
    expect(directory.of(AWAY).byId(wayspotId(1))).toBeDefined();
    expect(directory.generation).toBeGreaterThan(before);
  });

  it('does not bring back a Wayspot forgotten while a load was reading', async () => {
    const { storage, directory } = await directoryWith();
    await directory.load();
    const every = storage.everyServer.bind(storage);
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let reading = (): void => undefined;
    const read = new Promise<void>((resolve) => (reading = resolve));
    // The load reads the rows before the gym's write deleted its row, and finishes after.
    storage.everyServer = async () => {
      const rows = await every();
      reading();
      await held;
      return rows;
    };
    const loading = directory.load();
    await read;
    directory.forget(HOME, [wayspotId(1)]);
    release();
    await loading;
    expect(directory.of(HOME).byId(wayspotId(1))).toBeUndefined();
    expect(idsOf(directory.of(HOME).inRegion(WEST_CHANNEL))).not.toContain(wayspotId(1));
    // Forgotten for its server alone.
    expect(directory.of(AWAY).byId(wayspotId(1))).toBeDefined();
    // A later load reads what storage holds.
    storage.everyServer = every;
    await directory.load();
    expect(directory.of(HOME).byId(wayspotId(1))).toBeDefined();
  });

  it('counts changes of what the Wayspots are, apart from the regions, and says when they changed', async () => {
    const { listed, regionDirectory, directory } = await directoryWith();
    const changed = vi.fn();
    directory.whenChanged(changed);
    const first = directory.contentGeneration;
    await directory.load();
    expect(directory.contentGeneration).toBeGreaterThan(first);
    // The load at start reads every server: each is told, once.
    expect(changed.mock.calls).toEqual([[HOME], [AWAY]]);

    // A change of the regions changes where the Wayspots lie, not what they are.
    const loaded = directory.contentGeneration;
    listed.rows = testRegions().filter((region) => region.channelId !== WEST_CHANNEL);
    await regionDirectory.load();
    expect(directory.of(HOME).inRegion(WEST_CHANNEL)).toEqual([]);
    expect(directory.contentGeneration).toBe(loaded);
    // Nor does a Wayspot that became a Pine gym, a Wayfarer gym or a stop: what is built of
    // them passes over a forgotten one through where they lie (the search, `inRegion`).
    const placed = directory.generation;
    directory.forget(HOME, [wayspotId(3)]);
    directory.forget(HOME, [wayspotId(1)]);
    expect(directory.contentGeneration).toBe(loaded);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(directory.generation).toBeGreaterThan(placed);
  });

  it('holds the stops of Pine’s own beside the kept Wayspots, each its own server’s', async () => {
    const regions = [...testRegions(), { ...northRegion(), bounds: testRegions()[0]!.bounds }];
    const { directory } = await directoryWith(regions);
    const changed = vi.fn();
    directory.whenChanged(changed);
    await directory.load();
    const before = { all: directory.generation, content: directory.contentGeneration };
    const sponsored = (id: number, serverId: string) => ({
      id,
      serverId,
      name: `Coffee Corner ${String(id)}`,
      lat: 40.0505,
      lon: -80.05,
      address: '12 Market Street',
      createdBy: '200000000000000051',
      createdAt: 5_000,
      updatedBy: '200000000000000051',
      updatedAt: 6_000,
    });
    directory.setPineStops([
      { stop: sponsored(1, '412345678901234567'), guildRow: HOME },
      { stop: sponsored(2, OTHER_GUILD_ID), guildRow: AWAY },
      { stop: sponsored(3, '412345678901234569'), guildRow: undefined },
    ]);
    const [home, away] = [directory.of(HOME), directory.of(AWAY)];
    expect(home.byId('pine-1')).toEqual({
      id: 'pine-1',
      kind: 'stop',
      formerKind: null,
      lat: 40.0505,
      lon: -80.05,
      title: 'Coffee Corner 1',
      address: '12 Market Street',
      image: null,
      firstSeen: 5_000,
      lastSeen: 6_000,
      pineServer: '412345678901234567',
    });
    expect(home.byId('pine-2')).toBeUndefined();
    // North lies over West and is another server's: each stop is in its own server's regions.
    expect(home.regionsOf('pine-1')).toEqual([WEST_CHANNEL]);
    expect(away.regionsOf('pine-2')).toEqual([NORTH_CHANNEL]);
    expect(idsOf(home.inRegion(WEST_CHANNEL))).toContain('pine-1');
    expect(idsOf(away.inRegion(NORTH_CHANNEL))).toEqual([wayspotId(1), wayspotId(6), 'pine-2']);
    expect(
      idsOf(home.near({ lat: 40.0505, lon: -80.05 }, 10, ['stop']).map((n) => n.wayspot)),
    ).toEqual(['pine-1']);
    expect(home.all()).toHaveLength(6);
    expect(directory.generation).toBeGreaterThan(before.all);
    expect(directory.contentGeneration).toBeGreaterThan(before.content);
    // The load told both servers; the stops, each server that has one.
    expect(changed.mock.calls).toEqual([[HOME], [AWAY], [HOME], [AWAY]]);

    // A load of the kept Wayspots leaves them; a forget of a kept one does not touch them.
    await directory.load();
    directory.forget(HOME, ['pine-1']);
    expect(directory.of(HOME).byId('pine-1')).toBeDefined();
    directory.setPineStops([]);
    expect(directory.of(HOME).byId('pine-1')).toBeUndefined();
    expect(directory.of(HOME).all()).toHaveLength(5);
  });

  it('counts only the kept Wayspots as its size, not the stops of Pine’s own', async () => {
    // A train's sweep of gone power spots waits for kept Wayspots (`size`): stops of Pine's own,
    // set before the first load, must not let it run against an empty list.
    const { directory } = await directoryWith();
    directory.setPineStops([
      {
        stop: {
          id: 1,
          serverId: '412345678901234567',
          name: 'Coffee Corner',
          lat: 40.0505,
          lon: -80.05,
          address: null,
          createdBy: '200000000000000051',
          createdAt: 5_000,
          updatedBy: '200000000000000051',
          updatedAt: 6_000,
        },
        guildRow: HOME,
      },
    ]);
    expect(directory.of(HOME).byId('pine-1')).toBeDefined();
    expect(directory.size).toBe(0);
    await directory.load();
    expect(directory.size).toBe(7);
  });

  it('keeps as many servers’ placements as it may, and works one out again when asked', async () => {
    const { storage, regionDirectory } = await directoryWith();
    const directory = new WayspotDirectory({
      wayspots: storage,
      regions: regionDirectory,
      log: createTestLogger().log,
      maxPlacements: 1,
    });
    await directory.load();
    expect(directory.of(HOME).regionsOf(wayspotId(4))).toEqual([EAST_CHANNEL]);
    expect(directory.of(AWAY).regionsOf(wayspotId(6))).toEqual([WIDE_CHANNEL]);
    expect(directory.of(HOME).regionsOf(wayspotId(4))).toEqual([EAST_CHANNEL]);
    expect(directory.placementsBuilt).toBe(3);
  });

  it('reloads one server alone: its rows read, its placement worked out again, it alone told', async () => {
    const { storage, directory } = await directoryWith();
    await directory.load();
    const told: number[] = [];
    directory.whenChanged((guildId) => told.push(guildId));
    expect(directory.of(HOME).regionsOf(wayspotId(1))).toEqual([WEST_CHANNEL]);
    expect(directory.of(AWAY).regionsOf(wayspotId(6))).toEqual([WIDE_CHANNEL]);
    const built = directory.placementsBuilt;
    const before = {
      home: directory.contentGenerationOf(HOME),
      away: directory.contentGenerationOf(AWAY),
    };
    // Both servers' rows change in storage; only the test server's import reloads.
    await storage.saveFromImport(
      HOME,
      { upsert: [keptRow(7, { lat: 40.07, lon: -80.07 })], remove: [wayspotId(1)] },
      2_000,
    );
    await storage.saveFromImport(AWAY, { upsert: [], remove: [wayspotId(6)] }, 2_000);
    const everyServer = vi.spyOn(storage, 'everyServer');
    const read = vi.spyOn(storage, 'all');
    await directory.load(HOME);
    expect(everyServer).not.toHaveBeenCalled();
    expect(read.mock.calls).toEqual([[HOME]]);
    expect(directory.of(HOME).byId(wayspotId(1))).toBeUndefined();
    expect(directory.of(HOME).regionsOf(wayspotId(7))).toEqual([WEST_CHANNEL]);
    // The other server is as it was loaded: not read, not worked out again, not told.
    expect(directory.of(AWAY).byId(wayspotId(6))).toBeDefined();
    expect(directory.of(AWAY).regionsOf(wayspotId(6))).toEqual([WIDE_CHANNEL]);
    expect(directory.placementsBuilt).toBe(built + 1);
    expect(told).toEqual([HOME]);
    expect(directory.contentGenerationOf(HOME)).toBeGreaterThan(before.home);
    expect(directory.contentGenerationOf(AWAY)).toBe(before.away);
    expect(directory.size).toBe(7);
  });

  it('does not bring back a server’s Wayspot forgotten while that server’s load was reading', async () => {
    const { storage, directory } = await directoryWith();
    await directory.load();
    const all = storage.all.bind(storage);
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let reading = (): void => undefined;
    const read = new Promise<void>((resolve) => (reading = resolve));
    storage.all = async (guildId) => {
      const rows = await all(guildId);
      reading();
      await held;
      return rows;
    };
    const loading = directory.load(HOME);
    await read;
    directory.forget(HOME, [wayspotId(1)]);
    release();
    await loading;
    expect(directory.of(HOME).byId(wayspotId(1))).toBeUndefined();
    expect(directory.of(AWAY).byId(wayspotId(1))).toBeDefined();
    storage.all = all;
    await directory.load(HOME);
    expect(directory.of(HOME).byId(wayspotId(1))).toBeDefined();
  });

  it('tells only the servers whose stops of Pine’s own changed', async () => {
    const { directory } = await directoryWith();
    await directory.load();
    const told: number[] = [];
    directory.whenChanged((guildId) => told.push(guildId));
    const stop = (id: number, name: string) => ({
      id,
      serverId: '412345678901234567',
      name,
      lat: 40.0505,
      lon: -80.05,
      address: null,
      createdBy: '200000000000000051',
      createdAt: 5_000,
      updatedBy: '200000000000000051',
      updatedAt: 6_000,
    });
    directory.setPineStops([
      { stop: stop(1, 'Coffee Corner'), guildRow: HOME },
      { stop: { ...stop(2, 'Tea Corner'), serverId: OTHER_GUILD_ID }, guildRow: AWAY },
    ]);
    expect(told.sort()).toEqual([HOME, AWAY]);
    told.length = 0;
    const away = directory.contentGenerationOf(AWAY);
    // The test server's stop renamed; the other server's as it was.
    directory.setPineStops([
      { stop: stop(1, 'Coffee Corner Cafe'), guildRow: HOME },
      { stop: { ...stop(2, 'Tea Corner'), serverId: OTHER_GUILD_ID }, guildRow: AWAY },
    ]);
    expect(told).toEqual([HOME]);
    expect(directory.contentGenerationOf(AWAY)).toBe(away);
    expect(directory.of(HOME).byId('pine-1')?.title).toBe('Coffee Corner Cafe');
  });

  it('places a Wayspot in the servers’ regions as the upgrade gives it its servers (one rule)', async () => {
    // West twice (an old second row of its channel, of the second server, over North's place), a
    // region of no server over West, and the second server's Wide over West and East.
    const [west, east] = testRegions();
    const regions: Region[] = [
      west!,
      { ...west!, id: 7, guildId: AWAY, bounds: northRegion().bounds },
      { ...east!, id: 8, channelId: '100000000000000088', guildId: null, bounds: west!.bounds },
      wideRegion(),
    ];
    const { storage, regionDirectory } = await directoryWith(regions);
    const places = [
      { id: wayspotId(1), lat: 40.05, lon: -80.05 },
      { id: wayspotId(4), lat: 40.05, lon: -79.95 },
      // Only in the old second row of West.
      { id: wayspotId(5), lat: 40.25, lon: -80.05 },
    ];
    await storage.saveFromImport(
      AWAY,
      { upsert: places.map((place) => keptRow(Number(place.id.slice(0, 32)), place)), remove: [] },
      2_000,
    );
    const directory = new WayspotDirectory({
      wayspots: storage,
      regions: regionDirectory,
      log: createTestLogger().log,
    });
    await directory.load();
    const input = {
      wayspots: places,
      regions: regions.map(({ guildId, channelId, bounds }) => ({ guildId, channelId, bounds })),
    };
    const copies = upgradeCopies({ ...input, usedBy: new Map(), servers: [HOME, AWAY] });
    const inNoRegion = new Set(wayspotsInNoRegion(input));
    expect([...inNoRegion]).toEqual([wayspotId(5)]);
    for (const { id } of places) {
      // In a region: the servers the upgrade gives it are those whose regions place it.
      const upgraded = inNoRegion.has(id)
        ? []
        : copies.filter((copy) => copy.id === id).map((copy) => copy.guildId);
      const placed = [HOME, AWAY].filter((guildId) => directory.regionsIn(guildId, id).length > 0);
      expect(placed, id).toEqual(upgraded);
    }
  });

  it('is empty until loaded, and keeps the last state when a load fails', async () => {
    const { storage, directory } = await directoryWith();
    expect(directory.of(HOME).all()).toEqual([]);
    await directory.load();
    storage.everyServer = () => Promise.reject(new Error('database is down'));
    await expect(directory.load()).rejects.toThrow('database is down');
    expect(directory.of(HOME).all()).toHaveLength(5);
  });
});
