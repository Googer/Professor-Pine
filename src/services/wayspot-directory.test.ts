import { describe, expect, it, vi } from 'vitest';
import {
  EAST_CHANNEL,
  NORTH_CHANNEL,
  northRegion,
  OTHER_GUILD_ID,
  OTHER_GUILD_ROW,
  testRegions,
  WEST_CHANNEL,
} from '../../test/support/gyms.js';
import { regionsFixture } from '../../test/support/providers.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { geodataJson } from '../domain/geo/google.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { MemoryWayspots } from '../../test/support/wayspots.js';
import type { Region } from '../db/repositories/region-repository.js';
import { RegionDirectory } from './region-directory.js';
import { WayspotDirectory } from './wayspot-directory.js';

/** Kept Wayspots in West, in East, on no region, and a directory over them and the invented regions. */
async function directoryWith(regions: Region[] = testRegions()) {
  const storage = new MemoryWayspots();
  await storage.saveFromImport(
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
  it('finds the Wayspots by id and by region, from their outlines', async () => {
    const { directory } = await directoryWith();
    await directory.load();
    expect(directory.byId(wayspotId(1))).toMatchObject({ title: 'Stop 1', kind: 'stop' });
    expect(directory.byId(wayspotId(9))).toBeUndefined();
    expect(idsOf(directory.inRegion(WEST_CHANNEL)).sort()).toEqual(
      [wayspotId(1), wayspotId(2), wayspotId(3)].sort(),
    );
    expect(idsOf(directory.inRegion(EAST_CHANNEL))).toEqual([wayspotId(4)]);
    expect(directory.regionsOf(wayspotId(5))).toEqual([]);
    expect(directory.regionsOf(wayspotId(4))).toEqual([EAST_CHANNEL]);
    expect(directory.all()).toHaveLength(5);
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
    const [stop, spot] = [directory.byId(wayspotId(1)), directory.byId(wayspotId(2))];
    if (!stop || !spot) throw new Error('kept Wayspots missing');
    expect(directory.addressOf(stop)).toBe('1 Main St, Pittsburgh, PA 15213, USA');
    expect(directory.addressOf({ ...spot, address: null })).toBe(
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
    const near = directory.near({ lat: 40.0502, lon: -80.05 }, 100);
    expect(near.map(({ wayspot, metres }) => [wayspot.id, Math.round(metres)])).toEqual([
      [wayspotId(2), 11],
      [wayspotId(1), 22],
    ]);
    expect(
      idsOf(directory.near({ lat: 40.05, lon: -80.05 }, 2_000, ['gym']).map((n) => n.wayspot)),
    ).toEqual([wayspotId(3)]);
  });

  it('reads them again on load, and works the regions out again when the regions changed', async () => {
    const { storage, listed, regionDirectory, directory } = await directoryWith();
    await directory.load();
    const first = directory.generation;
    await storage.saveFromImport(
      { upsert: [keptRow(6, { lat: 40.07, lon: -80.07 })], remove: [wayspotId(1)] },
      2_000,
    );
    await directory.load();
    expect(directory.generation).toBeGreaterThan(first);
    expect(directory.byId(wayspotId(1))).toBeUndefined();
    expect(directory.regionsOf(wayspotId(6))).toEqual([WEST_CHANNEL]);

    // West is gone from the regions: its Wayspots lie in none, without a load of the Wayspots.
    const loaded = directory.generation;
    listed.rows = testRegions().filter((region) => region.channelId !== WEST_CHANNEL);
    await regionDirectory.load();
    expect(directory.regionsOf(wayspotId(6))).toEqual([]);
    expect(directory.inRegion(WEST_CHANNEL)).toEqual([]);
    expect(directory.generation).toBeGreaterThan(loaded);
  });

  it('forgets Wayspots that became gyms at once', async () => {
    const { directory } = await directoryWith();
    await directory.load();
    const before = directory.generation;
    directory.forget([wayspotId(3), wayspotId(9)]);
    expect(directory.byId(wayspotId(3))).toBeUndefined();
    expect(idsOf(directory.inRegion(WEST_CHANNEL))).not.toContain(wayspotId(3));
    expect(directory.generation).toBeGreaterThan(before);
  });

  it('does not bring back a Wayspot forgotten while a load was reading', async () => {
    const { storage, directory } = await directoryWith();
    await directory.load();
    const all = storage.all.bind(storage);
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let reading = (): void => undefined;
    const read = new Promise<void>((resolve) => (reading = resolve));
    // The load reads the rows before the gym's write deleted its row, and finishes after.
    storage.all = async () => {
      const rows = await all();
      reading();
      await held;
      return rows;
    };
    const loading = directory.load();
    await read;
    directory.forget([wayspotId(3)]);
    release();
    await loading;
    expect(directory.byId(wayspotId(3))).toBeUndefined();
    expect(idsOf(directory.inRegion(WEST_CHANNEL))).not.toContain(wayspotId(3));
    // A later load reads what storage holds.
    storage.all = all;
    await directory.load();
    expect(directory.byId(wayspotId(3))).toBeDefined();
  });

  it('counts changes of what the Wayspots are, apart from the regions, and says when they changed', async () => {
    const { listed, regionDirectory, directory } = await directoryWith();
    const changed = vi.fn();
    directory.whenChanged(changed);
    const first = directory.contentGeneration;
    await directory.load();
    expect(directory.contentGeneration).toBeGreaterThan(first);
    expect(changed).toHaveBeenCalledTimes(1);

    // A change of the regions changes where the Wayspots lie, not what they are.
    const loaded = directory.contentGeneration;
    listed.rows = testRegions().filter((region) => region.channelId !== WEST_CHANNEL);
    await regionDirectory.load();
    expect(directory.inRegion(WEST_CHANNEL)).toEqual([]);
    expect(directory.contentGeneration).toBe(loaded);
    // Nor does a Wayspot that became a Pine gym, a Wayfarer gym or a stop: what is built of
    // them passes over a forgotten one through where they lie (the search, `inRegion`).
    const placed = directory.generation;
    directory.forget([wayspotId(3)]);
    directory.forget([wayspotId(1)]);
    expect(directory.contentGeneration).toBe(loaded);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(directory.generation).toBeGreaterThan(placed);
  });

  it('holds the stops of Pine’s own beside the kept Wayspots, each in its own server’s regions', async () => {
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
      { stop: sponsored(1, '412345678901234567'), guildRow: 1 },
      { stop: sponsored(2, OTHER_GUILD_ID), guildRow: OTHER_GUILD_ROW },
      { stop: sponsored(3, '412345678901234569'), guildRow: undefined },
    ]);
    expect(directory.byId('pine-1')).toEqual({
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
    // North lies over West and is another server's: each stop is in its own server's regions.
    expect(directory.regionsOf('pine-1')).toEqual([WEST_CHANNEL]);
    expect(directory.regionsOf('pine-2')).toEqual([NORTH_CHANNEL]);
    expect(directory.regionsOf('pine-3')).toEqual([]);
    expect(idsOf(directory.inRegion(WEST_CHANNEL))).toContain('pine-1');
    expect(idsOf(directory.inRegion(WEST_CHANNEL))).not.toContain('pine-2');
    expect(
      idsOf(directory.near({ lat: 40.0505, lon: -80.05 }, 10, ['stop']).map((n) => n.wayspot)),
    ).toEqual(['pine-1', 'pine-2', 'pine-3']);
    expect(directory.all()).toHaveLength(8);
    expect(directory.generation).toBeGreaterThan(before.all);
    expect(directory.contentGeneration).toBeGreaterThan(before.content);
    expect(changed).toHaveBeenCalledTimes(2);

    // A load of the kept Wayspots leaves them; a forget of a kept one does not touch them.
    await directory.load();
    directory.forget(['pine-1']);
    expect(directory.byId('pine-1')).toBeDefined();
    directory.setPineStops([]);
    expect(directory.byId('pine-1')).toBeUndefined();
    expect(directory.all()).toHaveLength(5);
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
        guildRow: 1,
      },
    ]);
    expect(directory.byId('pine-1')).toBeDefined();
    expect(directory.size).toBe(0);
    await directory.load();
    expect(directory.size).toBe(5);
  });

  it('is empty until loaded, and keeps the last state when a load fails', async () => {
    const { storage, directory } = await directoryWith();
    expect(directory.all()).toEqual([]);
    await directory.load();
    storage.all = () => Promise.reject(new Error('database is down'));
    await expect(directory.load()).rejects.toThrow('database is down');
    expect(directory.all()).toHaveLength(5);
  });
});
