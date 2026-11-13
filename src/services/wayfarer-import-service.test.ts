import { describe, expect, it } from 'vitest';
import {
  STAFF,
  OTHER_STAFF_PLACE,
  STAFF_PLACE,
  UPDATES_CHANNEL,
  withOtherServer,
} from '../../test/support/gym-admin.js';
import {
  EAST_CHANNEL,
  NORTH_PLACE,
  OTHER_GUILD_ROW,
  northRegion,
  testOutlines,
  WEST_CHANNEL,
} from '../../test/support/gyms.js';
import { testRaid } from '../../test/support/parties.js';
import { wayfarerImportWith } from '../../test/support/wayfarer-import.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import { addressLine } from '../domain/geo/google.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { wayfarerCellAt } from '@pine/wayspot-core/s2';
import type { ExportedWayspot, WayspotExport, WayspotKind } from '@pine/wayspot-core/export-file';
import { textOf } from '../../test/support/messages.js';
import { keptRowOf } from '../domain/wayspots/keep.js';
import { missingCells } from '@pine/wayspot-core/scan-area';
import { IMPORT_BLOCK, mayDeleteOutside, REFETCH_METRES } from './wayfarer-import-service.js';

type Made = Awaited<ReturnType<typeof wayfarerImportWith>>;

const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;

/** A point `north` and `east` metres from `from`. */
function at(from: LatLon, north: number, east = 0): LatLon {
  return {
    lat: from.lat + north / METRES_PER_DEGREE,
    lon: from.lon + east / (METRES_PER_DEGREE * Math.cos((from.lat * Math.PI) / 180)),
  };
}

const idOf = (n: number): string => `${n.toString(16).padStart(32, '0')}.16`;

function wayspot(
  n: number,
  title: string,
  place: LatLon,
  more: { kind?: WayspotKind; image?: string; address?: string } = {},
): ExportedWayspot {
  return {
    id: idOf(n),
    kind: more.kind ?? 'gym',
    status: 'ACTIVE',
    lat: place.lat,
    lon: place.lon,
    title,
    address: more.address ?? '',
    description: '',
    image: more.image ?? '',
  };
}

/** A Wayspot as an earlier import kept it. */
const keptOf = (one: ExportedWayspot) => keptRowOf(one, undefined);

/** An export of these Wayspots whose covered cells are theirs and those of `covering`. */
function exportOf(
  wayspots: readonly ExportedWayspot[],
  covering: readonly LatLon[] = [],
): WayspotExport {
  return {
    format: 'pine-wayspots',
    version: 1,
    script: '1.0.0',
    startedAt: '2026-10-13T08:00:00.000Z',
    finishedAt: '2026-10-13T09:30:00.000Z',
    regions: ['West', 'East'],
    outlines: testOutlines(),
    margin: 0,
    cells: [...new Set([...wayspots, ...covering].map(wayfarerCellAt))],
    bareCells: [],
    wayspots: [...wayspots],
  };
}

function gymOf(made: Made, id: number): Gym {
  const gym = made.directory.get(id);
  if (!gym) throw new Error(`no gym ${id}`);
  return gym;
}

/** Lets everything that is under way go out. */
async function settle(made: Made): Promise<void> {
  await made.upkeep.flush();
  await made.admin.flush();
  await made.service.flush();
}

const announced = (made: Made) =>
  made.gateway.messagesIn(UPDATES_CHANNEL).map((message) => message.message);

const PICTURE = 'https://lh3.googleusercontent.com/library';
/** Places in West far from every invented gym, where Wayfarer has new gyms. */
const CLOCK_TOWER = { lat: 40.015, lon: -80.015 };
const BELL_TOWER = { lat: 40.015, lon: -80.095 };

/**
 * The file most tests import, over the invented gyms:
 *
 * - the library (1): "The Pinewood Public Library" 30 metres away, with a picture: matched by
 *   name, renamed, moved (its address fetched again), its picture written;
 * - the fountain (2): its own name 2 metres away: matched by name, only its Wayfarer id written;
 * - the church (3): another title 4 metres away: matched by place, renamed and moved (no fetch);
 * - the mosaic (6): a stop 40 metres away and a Wayfarer gym 60 metres away, both with other
 *   titles: a question of which (the Wayfarer gym is offered for it, not added);
 * - the post office (12): its cell covered, nothing near: unknown;
 * - two Wayfarer gyms far from every gym: added;
 * - every other gym: its cell not covered.
 */
function cityFile(made: Made): { file: WayspotExport; wayspots: ExportedWayspot[] } {
  const library = gymOf(made, 1);
  const fountain = gymOf(made, 2);
  const church = gymOf(made, 3);
  const mosaic = gymOf(made, 6);
  const wayspots = [
    wayspot(1, 'The Pinewood Public Library', at(library, 30), { image: PICTURE }),
    wayspot(2, 'Old Stone Fountain', at(fountain, 2)),
    wayspot(3, 'Saint Mary Parish', at(church, 4)),
    wayspot(4, 'Bench', at(mosaic, 40), { kind: 'stop' }),
    wayspot(5, 'Mosaic Wall', at(mosaic, -60)),
    wayspot(6, 'Clock Tower', CLOCK_TOWER),
    wayspot(7, 'Bell Tower', BELL_TOWER),
  ];
  return { file: exportOf(wayspots, [gymOf(made, 12)]), wayspots };
}

describe('the area an export scanned', () => {
  /** An export of no Wayspots over West and East whose every cell came: a finished scan. */
  const finished = (margin: number) => {
    const cells = missingCells(testOutlines(), new Set(), margin);
    return { ...exportOf([]), margin, bareCells: cells };
  };

  it('lists the gyms in no region beyond the area, and lets them be deleted after a finished scan', async () => {
    const made = await wayfarerImportWith();
    const regionless = made.directory.all().filter((gym) => !made.admin.inRegionOf(gym.id, 1));
    expect(regionless.length).toBeGreaterThan(0);

    const preview = await made.wayfarer.preview(STAFF_PLACE, finished(500));
    expect(preview.deletable).toBe(true);
    const beyondIds = preview.beyond.map((gym) => gym.gymId);
    expect(beyondIds.length).toBeGreaterThan(0);
    for (const id of beyondIds) expect(regionless.map((gym) => gym.id)).toContain(id);
    expect(preview.beyondGyms.get(beyondIds[0]!)?.id).toBe(beyondIds[0]);
    // Without a margin, or with a cell missing, nothing may be deleted.
    expect((await made.wayfarer.preview(STAFF_PLACE, finished(0))).deletable).toBe(false);
    const unfinished = finished(500);
    unfinished.bareCells = unfinished.bareCells.slice(1);
    expect(mayDeleteOutside(unfinished)).toBe(false);
  });

  it('deletes the gyms beyond the area, but one with an active raid, and posts one summary', async () => {
    const first = await wayfarerImportWith();
    const beyond = first.wayfarer.outsideArea(1, finished(500)).map((gym) => gym.gymId);
    expect(beyond.length).toBeGreaterThan(0);
    const raided = beyond[0]!;
    const made = await wayfarerImportWith([testRaid({ gymId: raided })]);

    const outcome = await made.wayfarer.deleteOutside(STAFF_PLACE, finished(500), beyond, {
      id: STAFF,
    });
    await settle(made);

    expect(outcome).toMatchObject({ deleted: beyond.length - 1, notBeyond: 0, gone: 0, failed: 0 });
    expect(outcome.raidThere.map((gym) => gym.id)).toEqual([raided]);
    expect(made.directory.get(raided)).toBeDefined();
    for (const id of beyond.slice(1)) expect(made.directory.get(id)).toBeUndefined();
    expect(announced(made).map((message) => textOf(message))).toEqual(
      beyond.length > 1
        ? [
            '### The gym list changed\nDeleting the gyms outside the area a Wayfarer import ' +
              `scanned deleted ${beyond.length - 1} ${beyond.length === 2 ? 'gym' : 'gyms'}.`,
          ]
        : [],
    );
  });

  it('deletes only the gyms the question named, and only those still beyond', async () => {
    const made = await wayfarerImportWith();
    const beyond = made.wayfarer.outsideArea(1, finished(500)).map((gym) => gym.gymId);
    expect(beyond.length).toBeGreaterThan(0);
    const [named, ...unnamed] = beyond;
    // A gym in a region is never deleted, though somebody named it.
    const inside = made.directory.all().find((gym) => made.admin.inRegionOf(gym.id, 1))!;
    const outcome = await made.wayfarer.deleteOutside(
      STAFF_PLACE,
      finished(500),
      [named!, inside.id],
      { id: STAFF },
    );
    expect(outcome).toMatchObject({ deleted: 1, notBeyond: 1 });
    expect(made.directory.get(named!)).toBeUndefined();
    expect(made.directory.get(inside.id)).toBeDefined();
    for (const id of unnamed) expect(made.directory.get(id)).toBeDefined();
  });

  it('offers only this server’s own gyms, wherever another server’s regions lie (plan 19B-2)', async () => {
    const made = await wayfarerImportWith();
    const own = made.wayfarer.outsideArea(1, finished(500)).map((gym) => gym.gymId);
    expect(own.length).toBeGreaterThan(0);
    // Another server's region beside them: they stay this server's.
    await withOtherServer(made);
    const stray = made.directory.get(own[0]!)!;
    made.regions.rows.push({
      ...northRegion(),
      id: 9,
      channelId: '100000000000000009',
      bounds: [
        { lat: stray.lat + 0.001, lon: stray.lon - 0.001 },
        { lat: stray.lat + 0.002, lon: stray.lon - 0.001 },
        { lat: stray.lat + 0.002, lon: stray.lon + 0.001 },
        { lat: stray.lat + 0.001, lon: stray.lon + 0.001 },
        { lat: stray.lat + 0.001, lon: stray.lon - 0.001 },
      ],
    });
    await made.directory.load();
    const after = made.wayfarer.outsideArea(1, finished(500)).map((gym) => gym.gymId);
    expect(after).toContain(stray.id);
    // None of them is the other server's to delete.
    const theirs = made.wayfarer
      .outsideArea(OTHER_GUILD_ROW, finished(500))
      .map((gym) => gym.gymId);
    expect(theirs).not.toContain(stray.id);
    // Nor any for a server without regions.
    expect(made.wayfarer.outsideArea(OTHER_GUILD_ROW + 5, finished(500))).toEqual([]);
  });

  it('names the regions that are not as the scan found them', async () => {
    const made = await wayfarerImportWith();
    const file = { ...exportOf([]), outlines: [testOutlines()[0]!], regions: ['West'] };
    const preview = await made.wayfarer.preview(STAFF_PLACE, file);
    expect(preview.outlines).toEqual({ regionsNotScanned: [EAST_CHANNEL], areasNotRegions: 0 });
  });

  it('offers no gym to delete while a region of the server lies outside the scanned area', async () => {
    const made = await wayfarerImportWith();
    // A finished scan of West alone: the gyms around East were never looked at.
    const west = [testOutlines()[0]!];
    const file = {
      ...exportOf([]),
      outlines: west,
      regions: ['West'],
      margin: 500,
      bareCells: missingCells(west, new Set(), 500),
    };
    expect(mayDeleteOutside(file)).toBe(true);
    const preview = await made.wayfarer.preview(STAFF_PLACE, file);
    expect(preview.outlines.regionsNotScanned).toEqual([EAST_CHANNEL]);
    expect(preview.beyond).toEqual([]);
    expect(made.wayfarer.outsideArea(1, file)).toEqual([]);
    // With both regions inside the outlines it offers them as before.
    expect(made.wayfarer.outsideArea(1, finished(500)).length).toBeGreaterThan(0);
  });

  it('deletes nothing at the press when a region was added since the question', async () => {
    const made = await wayfarerImportWith();
    const beyond = made.wayfarer.outsideArea(1, finished(500)).map((gym) => gym.gymId);
    expect(beyond.length).toBeGreaterThan(0);
    // A new region of this server, far from the scanned ones.
    made.regions.rows.push({
      ...northRegion(),
      id: 9,
      guildId: 1,
      channelId: '100000000000000009',
    });
    await made.directory.load();
    const outcome = await made.wayfarer.deleteOutside(STAFF_PLACE, finished(500), beyond, {
      id: STAFF,
    });
    expect(outcome).toMatchObject({ deleted: 0, regionsNotScanned: 1, notBeyond: 0 });
    for (const id of beyond) expect(made.directory.get(id)).toBeDefined();
  });
});

describe('WayfarerImportService.preview', () => {
  it('says what an import would do, by region, and writes nothing', async () => {
    const made = await wayfarerImportWith();
    await made.wayfarerStore.markNotInWayfarer(5, STAFF, 1);
    const { file } = cityFile(made);
    const writes = made.wayfarerStore.gymRecords.size;

    const preview = await made.wayfarer.preview(STAFF_PLACE, file);

    expect(preview.counts).toEqual({
      matched: 3,
      unchanged: 0,
      renamed: 2,
      tidied: 0,
      moved: 2,
      pictures: 1,
      unmarked: 0,
      added: 2,
      untitled: 0,
      reviewMatch: 1,
      reviewMissing: 0,
      reviewUnknown: 1,
      notInWayfarer: 1,
      notCovered: 5,
      answered: 0,
      ignored: 0,
      outside: 0,
      held: 0,
    });
    expect(preview.plan.matched.map((match) => [match.gymId, match.by])).toEqual([
      [1, 'name'],
      [2, 'name'],
      [3, 'place'],
    ]);
    expect(preview.regions).toBe(2);
    expect(preview.outlines).toEqual({ regionsNotScanned: [], areasNotRegions: 0 });
    expect(preview.lastImport).toBeUndefined();
    expect(preview.queuedAlready).toBe(0);
    // Gym 10 lies in no region, far from the regions and where the scan did not go.
    expect([...preview.gyms.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]);
    const regionCounts = preview.byRegion.map(({ channelId, counts }) => [
      channelId,
      counts.matched,
      counts.added,
      counts.reviewMatch + counts.reviewUnknown,
      counts.notInWayfarer,
      counts.notCovered,
    ]);
    expect(regionCounts).toEqual([
      [WEST_CHANNEL, 3, 2, 2, 1, 2],
      [EAST_CHANNEL, 0, 0, 0, 0, 3],
    ]);

    await settle(made);
    expect(made.gymStore.writes).toEqual([]);
    expect(made.wayfarerStore.reviews).toEqual([]);
    expect(made.wayfarerStore.imports).toEqual([]);
    expect(made.wayfarerStore.gymRecords.size).toBe(writes);
    expect(made.geo.asked).toEqual([]);
    expect(announced(made)).toEqual([]);
  });

  it('names the newest import of the server', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    await made.wayfarer.apply(STAFF_PLACE, file);
    const preview = await made.wayfarer.preview(STAFF_PLACE, file);
    expect(preview.lastImport).toMatchObject({
      id: 1,
      staffId: STAFF,
      startedAt: Date.parse(file.startedAt),
      finishedAt: Date.parse(file.finishedAt),
    });
    // Imported once, the same file finds every gym by its id now.
    expect(preview.counts).toMatchObject({ matched: 5, unchanged: 5, added: 0, renamed: 0 });
    // The mosaic and the post office are asked about already, with the same questions.
    expect(preview.counts).toMatchObject({ reviewMatch: 1, reviewUnknown: 1 });
    expect(preview.queuedAlready).toBe(2);
  });

  it('counts an item as queued already only with the same candidates', async () => {
    const made = await wayfarerImportWith();
    const { file, wayspots } = cityFile(made);
    await made.wayfarer.apply(STAFF_PLACE, file);
    // A stop appeared near the mosaic: its item is asked anew, with that stop among them.
    const more = [...wayspots, wayspot(8, 'Kiosk', at(gymOf(made, 6), 20), { kind: 'stop' })];
    const preview = await made.wayfarer.preview(STAFF_PLACE, exportOf(more, [gymOf(made, 12)]));
    expect(preview.counts).toMatchObject({ reviewMatch: 1, reviewUnknown: 1 });
    expect(preview.queuedAlready).toBe(1);
  });
});

describe('WayfarerImportService: what an import considers', () => {
  it('ignores Wayspots far outside the server’s regions and gyms only in another server’s', async () => {
    const made = await wayfarerImportWith();
    const theirs = await withOtherServer(made);
    const lakeview = gymOf(made, 10);
    const file = exportOf([
      // The gym of the other server is in its file, by its own name: not this server's.
      wayspot(1, 'Northgate Clock', at(NORTH_PLACE, 1)),
      // Beside the gym in no region, whose cell the scan covered: its Wayspot.
      wayspot(2, 'Lakeview Trailhead', at(lakeview, 1)),
      wayspot(3, 'Pinewood Public Library', at(gymOf(made, 1), 1)),
    ]);

    const preview = await made.wayfarer.preview(STAFF_PLACE, file);

    expect(preview.gyms.has(theirs.id)).toBe(false);
    expect(preview.gyms.has(10)).toBe(true);
    expect(preview.counts).toMatchObject({ ignored: 1, matched: 2, added: 0 });
    expect(preview.plan.matched.map((match) => match.gymId)).toEqual([1, 10]);
    expect(preview.plan.reviews).toEqual([]);

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);
    expect(outcome.counts).toMatchObject({ matched: 2, added: 0, ignored: 1 });
    expect(made.gymStore.row(theirs.id)?.pogoId).toBeNull();

    // The other server's staff import the same file for their own gym only.
    const other = await made.wayfarer.apply(
      { staffId: STAFF, guildId: OTHER_GUILD_ROW, channelIds: [] },
      file,
    );
    // Gym 10, in no region, is the first server's alone (plan 19B-2): its Wayspot lies outside
    // the second server's regions, as the Library's does.
    expect(other.counts).toMatchObject({ matched: 1, ignored: 2 });
    expect(made.gymStore.row(theirs.id)?.pogoId).toBe(idOf(1));
  });

  it('considers a gym in no region only near the regions or where the scan went', async () => {
    const made = await wayfarerImportWith();
    // Gym 10 lies in no region, far from the regions: considered only once its cell is covered.
    const lakeview = gymOf(made, 10);
    const none = await made.wayfarer.preview(STAFF_PLACE, exportOf([]));
    expect(none.gyms.has(10)).toBe(false);
    const covered = await made.wayfarer.preview(STAFF_PLACE, exportOf([], [lakeview]));
    expect(covered.gyms.has(10)).toBe(true);

    // A gym in no region 60 metres north of West's edge is considered without its cell, and is
    // not listed as not covered: it is no gym of the regions.
    const outside = await made.gymStore.create(
      { name: 'Edge Kiosk', lat: 40.10054, lon: -80.05 },
      1,
    );
    await made.directory.load();
    const near = await made.wayfarer.preview(STAFF_PLACE, exportOf([]));
    expect(near.gyms.has(outside.id)).toBe(true);
    expect(near.plan.notCovered.map((gap) => gap.gymId)).not.toContain(outside.id);
    expect(near.plan.notCovered.map((gap) => gap.gymId)).toContain(1);
  });

  it('matches a gym just inside the edge to its Wayspot just outside, and adds nothing there', async () => {
    const made = await wayfarerImportWith();
    const inside = await made.gymStore.create({ name: 'Rim Bench', lat: 40.09995, lon: -80.05 }, 1);
    await made.directory.load();
    const own = wayspot(1, 'Rim Bench', { lat: 40.10005, lon: -80.05 });
    const beyond = wayspot(2, 'Hill Mural', { lat: 40.1003, lon: -80.06 });
    const outcome = await made.wayfarer.apply(STAFF_PLACE, exportOf([own, beyond]));
    expect(outcome.counts).toMatchObject({ matched: 1, added: 0, ignored: 1 });
    expect(made.gymStore.row(inside.id)?.pogoId).toBe(own.id);
  });

  it('lists the Wayfarer gyms just outside the regions, within the file’s margin, and adds none', async () => {
    const made = await wayfarerImportWith();
    // About 334 metres north of West's northern edge, far from every gym.
    const mural = wayspot(1, 'Hill Mural', { lat: 40.103, lon: -80.06 });
    const bench = wayspot(2, 'Hill Bench', { lat: 40.1031, lon: -80.061 }, { kind: 'stop' });
    const far = wayspot(3, 'Ridge Mural', { lat: 40.12, lon: -80.06 });
    const file = { ...exportOf([mural, bench, far]), margin: 500 };

    const preview = await made.wayfarer.preview(STAFF_PLACE, file);
    expect(preview.counts).toMatchObject({ outside: 1, added: 0 });
    expect(preview.plan.outsideGyms).toEqual([
      { wayspot: mural, metres: expect.closeTo(334, 0) as number, channelId: WEST_CHANNEL },
    ]);
    expect(preview.byRegion.every(({ counts }) => counts.outside === 0)).toBe(true);

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);
    expect(outcome.counts).toMatchObject({ outside: 1, added: 0 });
    expect(made.directory.all().some((gym) => gym.pogoId === mural.id)).toBe(false);

    // A file made without a margin lists none.
    const bare = await made.wayfarer.preview(STAFF_PLACE, { ...file, margin: 0 });
    expect(bare.plan.outsideGyms).toEqual([]);
    expect(bare.counts.outside).toBe(0);
  });

  it('moves a gym to its Wayspot inside another server’s region, where it stays its own', async () => {
    const made = await wayfarerImportWith();
    await withOtherServer(made);
    // In no region, 17 metres south of North, whose Wayspot lies just inside North.
    const gym = await made.gymStore.create({ name: 'Gap Shrine', lat: 40.19995, lon: -80.05 }, 1);
    await made.directory.load();
    const own = wayspot(1, 'Gap Shrine', { lat: 40.2001, lon: -80.05 });
    const file = exportOf([own]);

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);
    expect(outcome.counts).toMatchObject({ matched: 1, failed: 0, reviewMatch: 0 });
    expect(made.gymStore.row(gym.id)).toMatchObject({ pogoId: own.id, lat: 40.2001 });
    expect(made.directory.serversOf(gym.id)).toEqual([1]);
  });

  it('never gives a gym the Wayspot a gym of another server holds', async () => {
    const made = await wayfarerImportWith();
    const theirs = await withOtherServer(made);
    const held = wayspot(1, 'Pinewood Public Library', at(gymOf(made, 1), 1));
    await made.gymStore.update(theirs.id, { pogoId: held.id });
    await made.directory.load();

    const outcome = await made.wayfarer.apply(STAFF_PLACE, exportOf([held]));

    expect(outcome.counts).toMatchObject({ matched: 0, added: 0 });
    expect(made.gymStore.row(1)?.pogoId).toBeNull();
  });

  it('considers nothing for a server without a row', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    const preview = await made.wayfarer.preview({ ...STAFF_PLACE, guildId: undefined }, file);
    expect(preview.regions).toBe(0);
    expect(preview.gyms.size).toBe(0);
    expect(preview.counts.ignored).toBe(file.wayspots.length);
    const outcome = await made.wayfarer.apply({ ...STAFF_PLACE, guildId: undefined }, file);
    expect(outcome.importId).toBeNull();
    expect(made.gymStore.writes).toEqual([]);
  });
});

describe('WayfarerImportService.apply', () => {
  it('counts a rename in the summary as the outcome does when the regions change during the writes', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    const library = gymOf(made, 1);
    const destination = at(library, 30);
    // While the library is written, West shrinks away and another server's region appears where
    // the library's Wayspot lies: the library may no longer be put there.
    const update = made.gymStore.update.bind(made.gymStore);
    made.gymStore.update = (id, patch) => {
      if (id === 1 && patch.name !== undefined) {
        const west = made.regions.rows.find((region) => region.channelId === WEST_CHANNEL)!;
        west.bounds = [
          { lat: 10, lon: 10 },
          { lat: 10.001, lon: 10 },
          { lat: 10.001, lon: 10.001 },
          { lat: 10, lon: 10 },
        ];
        made.regions.rows.push({
          ...northRegion(),
          bounds: [
            at(destination, -5, -5),
            at(destination, 5, -5),
            at(destination, 5, 5),
            at(destination, -5, 5),
            at(destination, -5, -5),
          ],
        });
      }
      return update(id, patch);
    };

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);
    await settle(made);

    const [summary] = announced(made).map((message) => textOf(message));
    const renamed = /renamed (\d+)/.exec(summary ?? '')?.[1];
    expect(Number(renamed ?? 0)).toBe(outcome.counts.renamed);
    const moved = /moved (\d+)/.exec(summary ?? '')?.[1];
    expect(Number(moved ?? 0)).toBe(outcome.counts.moved);
  });

  it('writes the matches, adds the new gyms, queues the rest and records the import', async () => {
    const made = await wayfarerImportWith();
    await made.wayfarerStore.markNotInWayfarer(5, STAFF, 1);
    const { file } = cityFile(made);
    const library = gymOf(made, 1);
    await settle(made);
    made.geo.asked.length = 0;

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);

    expect(outcome).toEqual({
      counts: {
        matched: 3,
        unchanged: 0,
        renamed: 2,
        tidied: 0,
        moved: 2,
        pictures: 1,
        unmarked: 0,
        added: 2,
        untitled: 0,
        reviewMatch: 1,
        reviewMissing: 0,
        reviewUnknown: 1,
        notInWayfarer: 1,
        notCovered: 5,
        answered: 0,
        ignored: 0,
        outside: 0,
        failed: 0,
        held: 0,
      },
      importId: 1,
      unrecorded: [],
      // The bench is a stop kept; the mosaic wall a Wayfarer gym kept (it is asked about).
      wayspots: { added: 1, changed: 0, gone: 0, gyms: 1 },
    });
    // The library: its Wayfarer id, the title as its name, the picture, the Wayspot's place.
    expect(made.gymStore.row(1)).toMatchObject({
      pogoId: idOf(1),
      name: 'The Pinewood Public Library',
      imageUrl: PICTURE,
      nickname: 'The Stacks',
      ...at(library, 30),
    });
    expect(made.gymStore.row(2)).toMatchObject({ pogoId: idOf(2), name: 'Old Stone Fountain' });
    expect(made.gymStore.row(3)).toMatchObject({ pogoId: idOf(3), name: 'Saint Mary Parish' });
    expect(made.directory.search(WEST_CHANNEL, 'saint mary parish')[0]?.gym.id).toBe(3);
    // The new gyms, with their Wayfarer ids.
    expect(made.gymStore.row(13)).toMatchObject({ name: 'Clock Tower', pogoId: idOf(6) });
    expect(made.gymStore.row(14)).toMatchObject({ name: 'Bell Tower', pogoId: idOf(7) });

    // Google is asked about the library, moved 30 metres, and the new gyms: not the church.
    await settle(made);
    expect(30).toBeGreaterThan(REFETCH_METRES);
    expect(made.geo.questions('geocode').map((asked) => asked.point)).toEqual(
      expect.arrayContaining([CLOCK_TOWER, BELL_TOWER]),
    );
    const geocoded = made.geo.questions('geocode').map((asked) => asked.point);
    expect(geocoded).toHaveLength(3);
    expect(geocoded.some((point) => metresBetween(point, at(library, 30)) < 0.01)).toBe(true);
    // The nearest gyms followed every move.
    const all = made.directory.all();
    for (const gym of all) {
      const nearest = all
        .filter((other) => other.id !== gym.id)
        .sort((a, b) => metresBetween(gym, a) - metresBetween(gym, b))[0];
      expect([gym.id, gym.nearestGym]).toEqual([gym.id, nearest?.id]);
    }

    // One summary of what the import changed, the bench (a stop) kept.
    expect(announced(made).map((message) => textOf(message))).toEqual([
      '### The gym list changed\nProfessor Pine has added 2 gyms, renamed 2, and moved 2. It also ' +
        'added 1 PokéStop.',
    ]);

    // When each Wayfarer gym was seen; the mark of the sponsored gym is left.
    const records = await made.wayfarerStore.records([1, 2, 3, 5, 6, 13, 14]);
    expect(
      [...records.values()]
        .filter((record) => record.lastSeen === made.clock.now)
        .map((record) => record.gymId),
    ).toEqual([1, 2, 3, 13, 14]);
    expect(records.get(5)?.notInWayfarer).toBe(true);

    // The queue, tied to the import.
    const open = await made.wayfarerStore.openReviews(1);
    expect(open.map((item) => [item.gymId, item.kind, item.importId])).toEqual([
      [6, 'match', 1],
      [12, 'unknown', 1],
    ]);
    expect(
      open[0]?.candidates.map((candidate) => [candidate.title, Math.round(candidate.metres)]),
    ).toEqual([
      ['Bench', 40],
      ['Mosaic Wall', 60],
    ]);
    expect(made.wayfarerStore.imports).toEqual([
      {
        id: 1,
        guildId: 1,
        staffId: STAFF,
        importedAt: made.clock.now,
        startedAt: Date.parse(file.startedAt),
        finishedAt: Date.parse(file.finishedAt),
        counts: {
          ...outcome.counts,
          wayspotsAdded: 1,
          wayspotsChanged: 0,
          wayspotsGone: 0,
          wayspotsGyms: 1,
        },
      },
    ]);
    expect(made.entries.filter((entry) => entry.msg === 'a Wayfarer export was imported')).toEqual([
      expect.objectContaining({ staff: STAFF, guild: 1, import: 1, matched: 3 }),
    ]);
  });

  it('plans again when staff press Import: a gym deleted since the preview is gone', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    const preview = await made.wayfarer.preview(STAFF_PLACE, file);
    expect(preview.counts).toMatchObject({ matched: 3, added: 2 });

    await made.admin.delete(2, { id: STAFF, name: 'Morgan' }, STAFF_PLACE);
    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);

    // The fountain's Wayspot is a Wayfarer gym nobody is: added anew.
    expect(outcome.counts).toMatchObject({ matched: 2, added: 3, failed: 0 });
    expect(made.gymStore.row(2)).toBeUndefined();
    // Added in the order of the Wayspots' ids: the fountain's first.
    expect(made.gymStore.row(13)).toMatchObject({ name: 'Old Stone Fountain', pogoId: idOf(2) });
  });

  it('closes the items of gyms it matched, refreshes the rest and leaves gyms it knows nothing of', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    const earlier = made.clock.now - 86_400_000;
    await made.wayfarerStore.saveReviews(
      1,
      null,
      [
        { gymId: 1, kind: 'match', candidates: [] },
        { gymId: 11, kind: 'unknown', candidates: [] },
        { gymId: 12, kind: 'unknown', candidates: [] },
      ],
      earlier,
    );

    await made.wayfarer.apply(STAFF_PLACE, file);

    const rows = made.wayfarerStore.reviews;
    // The library was found: its question answered itself.
    expect(rows.find((row) => row.gymId === 1)).toMatchObject({
      openGymId: null,
      decision: 'resolved',
      decidedBy: null,
      decidedAt: made.clock.now,
    });
    // The post office is asked about again, in its old place in the queue.
    expect(rows.find((row) => row.gymId === 12)).toMatchObject({
      id: 3,
      openGymId: 12,
      importId: 1,
      queuedAt: earlier,
    });
    // The park's cell was not covered: the import says nothing about it.
    expect(rows.find((row) => row.gymId === 11)).toMatchObject({ openGymId: 11, importId: null });
    expect(rows.find((row) => row.gymId === 6)).toMatchObject({
      openGymId: 6,
      queuedAt: made.clock.now,
    });
  });

  it('adds the Wayfarer gym a gym answered None of these about, and asks what the gym is', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    await made.wayfarer.apply(STAFF_PLACE, file);
    const [mosaicItem] = await made.wayfarerStore.openReviews(1);
    expect(mosaicItem?.gymId).toBe(6);
    await made.wayfarerStore.decide(1, mosaicItem?.id ?? 0, 'none-of-these', STAFF, 5);

    // The same file: the Wayfarer gym the mosaic was offered is none of it, so it is added as a
    // gym of its own, and is no candidate of the mosaic any more: the mosaic is a gym never found
    // in Wayfarer, another question (the answer sticks only while the question is the same).
    const again = await made.wayfarer.preview(STAFF_PLACE, file);
    expect(again.counts).toMatchObject({ reviewMatch: 0, reviewUnknown: 2, answered: 0, added: 1 });
    expect((await made.wayfarer.apply(STAFF_PLACE, file)).counts).toMatchObject({ added: 1 });
    expect(made.directory.all().find((gym) => gym.pogoId === idOf(5))?.name).toBe('Mosaic Wall');
    const open = await made.wayfarerStore.openReviews(1);
    expect(open.map((item) => [item.gymId, item.kind])).toEqual([
      [12, 'unknown'],
      [6, 'unknown'],
    ]);
    expect(open[1]?.candidates.map((candidate) => candidate.id)).toEqual([idOf(4)]);
  });

  it('asks again about a gym whose question changed kind, or that was answered otherwise', async () => {
    const made = await wayfarerImportWith();
    const { file, wayspots } = cityFile(made);
    await made.wayfarer.apply(STAFF_PLACE, file);
    const open = await made.wayfarerStore.openReviews(1);
    const item = (gymId: number) => open.find((one) => one.gymId === gymId)?.id ?? 0;
    await made.wayfarerStore.decide(1, item(6), 'none-of-these', STAFF, 5);
    await made.wayfarerStore.decide(1, item(12), 'same-as', STAFF, 5);

    // The Wayfarer gym near the mosaic is gone: only the stop is left, another question.
    const without = exportOf(
      wayspots.filter((one) => one.title !== 'Mosaic Wall'),
      [gymOf(made, 12)],
    );
    const preview = await made.wayfarer.preview(STAFF_PLACE, without);
    expect(preview.counts).toMatchObject({ reviewUnknown: 2, answered: 0 });
  });

  it('takes the mark not in Wayfarer off a gym Wayfarer has after all', async () => {
    const made = await wayfarerImportWith();
    const starbucks = gymOf(made, 5);
    await made.wayfarerStore.markNotInWayfarer(5, STAFF, 1);
    await made.wayfarerStore.saveReviews(
      1,
      null,
      [{ gymId: 5, kind: 'unknown', candidates: [] }],
      1,
    );
    const file = exportOf([wayspot(1, 'Starbucks', at(starbucks, 2))]);

    expect((await made.wayfarer.preview(STAFF_PLACE, file)).counts).toMatchObject({
      matched: 1,
      unmarked: 1,
      notInWayfarer: 0,
    });
    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);

    expect(outcome.counts).toMatchObject({ matched: 1, unmarked: 1 });
    expect((await made.wayfarerStore.records([5])).get(5)).toMatchObject({
      notInWayfarer: false,
      notInWayfarerBy: null,
      lastSeen: made.clock.now,
    });
    expect(made.gymStore.row(5)?.pogoId).toBe(idOf(1));
    expect(await made.wayfarerStore.openReviews(1)).toEqual([]);
  });

  it("takes Wayfarer's address for a gym it adds or moves far, and asks Google only for places", async () => {
    const made = await wayfarerImportWith();
    await settle(made);
    made.geo.asked.length = 0;
    const library = gymOf(made, 1);
    const street = '1 Clock Tower Way, Pinewood, PA 15000, USA, Pinewood, 15000, US';
    const file = exportOf([
      wayspot(1, 'Pinewood Public Library', at(library, 30), {
        address: '30 Library Lane, Pinewood, PA 15000, USA',
      }),
      wayspot(6, 'Clock Tower', CLOCK_TOWER, { address: street }),
      wayspot(7, 'Bell Tower', BELL_TOWER, { address: 'Pinewood, PA 15000, USA' }),
    ]);

    await made.wayfarer.apply(STAFF_PLACE, file);
    await settle(made);

    expect(addressLine(made.gymStore.row(13)?.geodata ?? null)).toBe(
      '1 Clock Tower Way, Pinewood, PA 15000, USA',
    );
    expect(addressLine(made.gymStore.row(1)?.geodata ?? null)).toBe(
      '30 Library Lane, Pinewood, PA 15000, USA',
    );
    // Only the Bell Tower, whose address names no street, is geocoded; every gym gets its places.
    expect(made.geo.questions('geocode').map((asked) => asked.point)).toEqual([BELL_TOWER]);
    const placed = made.geo.questions('places').map((asked) => asked.point);
    for (const point of [CLOCK_TOWER, BELL_TOWER]) expect(placed).toContainEqual(point);
  });

  it('writes a name that only differs in capitals, counted as tidied and not as a rename', async () => {
    const made = await wayfarerImportWith();
    const church = gymOf(made, 3);
    const file = exportOf([wayspot(1, "ST. MARY'S CHURCH", at(church, 1))]);

    const preview = await made.wayfarer.preview(STAFF_PLACE, file);
    expect(preview.counts).toMatchObject({ matched: 1, renamed: 0, tidied: 1, unchanged: 0 });
    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);

    expect(outcome.counts).toMatchObject({ matched: 1, renamed: 0, tidied: 1 });
    expect(made.gymStore.row(3)?.name).toBe("ST. MARY'S CHURCH");
  });

  it('keeps the name when the title is too long for it, matches all the same and logs that', async () => {
    const made = await wayfarerImportWith();
    const church = gymOf(made, 3);
    const file = exportOf([wayspot(1, 'Ö'.repeat(120), at(church, 1))]);

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);

    expect(outcome.counts).toMatchObject({ matched: 1, renamed: 0 });
    expect(made.gymStore.row(3)).toMatchObject({ name: "St. Mary's Church", pogoId: idOf(1) });
    const noted = made.entries.filter(
      (entry) => entry.msg === 'a Wayfarer title was not taken as the name of a gym',
    );
    expect(noted).toEqual([
      expect.objectContaining({ gym: 3, wayspot: idOf(1), problem: 'too-long' }),
    ]);
    // Never the text itself.
    expect(JSON.stringify(made.entries)).not.toContain('ÖÖÖ');
  });

  it('adds a Wayfarer gym with a name cut to fit, and none without a title', async () => {
    const made = await wayfarerImportWith();
    const file = exportOf([wayspot(1, 'Ö'.repeat(120), CLOCK_TOWER), wayspot(2, ' ', BELL_TOWER)]);
    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);
    expect(outcome.counts).toMatchObject({ added: 1, untitled: 1 });
    // `Ö` is `&Ouml;` once stored: 42 of them fill 252 of the 255 characters.
    expect(made.gymStore.row(13)?.name).toBe('Ö'.repeat(42));
  });

  it('goes on past a gym whose write fails, and counts it', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    await made.wayfarerStore.saveReviews(1, null, [{ gymId: 2, kind: 'match', candidates: [] }], 1);
    const update = made.gymStore.update.bind(made.gymStore);
    made.gymStore.update = (id, patch) =>
      id === 2 && patch.pogoId !== undefined
        ? Promise.reject(new Error('lock wait timeout'))
        : update(id, patch);

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);

    expect(outcome.counts).toMatchObject({ matched: 2, failed: 1, added: 2 });
    expect(made.gymStore.row(2)?.pogoId).toBeNull();
    expect(made.gymStore.row(3)?.pogoId).toBe(idOf(3));
    // Not seen, and its question stays open.
    expect((await made.wayfarerStore.records([2])).get(2)).toBeUndefined();
    expect(made.wayfarerStore.reviews.find((row) => row.gymId === 2)?.openGymId).toBe(2);
    expect(made.entries.some((entry) => entry.msg === 'could not write a Wayfarer match')).toBe(
      true,
    );
  });

  it('promotion: adds a Wayfarer gym 8 metres from a gym it matched, both being real', async () => {
    const made = await wayfarerImportWith();
    const fountain = gymOf(made, 2);
    const own = wayspot(1, 'Old Stone Fountain', at(fountain, 1));
    const promoted = wayspot(2, 'Park Sign', at(fountain, -7));
    const outcome = await made.wayfarer.apply(STAFF_PLACE, exportOf([own, promoted]));
    expect(outcome.counts).toMatchObject({ matched: 1, added: 1, held: 0 });
    expect(made.gymStore.row(13)).toMatchObject({ name: 'Park Sign', pogoId: promoted.id });
  });

  it('holds a Wayfarer gym beside a gym of another server, and logs it', async () => {
    const made = await wayfarerImportWith();
    // A region of the other server just west of West, with a gym 8 metres from West's edge.
    made.regions.rows.push({
      id: 5,
      guildId: OTHER_GUILD_ROW,
      channelId: '100000000000000005',
      description: null,
      bounds: [
        { lat: 40.0, lon: -80.2 },
        { lat: 40.1, lon: -80.2 },
        { lat: 40.1, lon: -80.1 },
        { lat: 40.0, lon: -80.1 },
        { lat: 40.0, lon: -80.2 },
      ],
      forumChannelId: null,
      summaryMessageId: null,
    });
    const edge = { lat: 40.05, lon: -80.1 };
    const theirs = await made.gymStore.create(
      { name: 'Border Stone', ...at(edge, 0, -4) },
      OTHER_GUILD_ROW,
    );
    await made.directory.load();
    const file = exportOf([wayspot(1, 'Border Stone', at(edge, 0, 4))]);

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);

    expect(outcome.counts).toMatchObject({ added: 0, held: 1 });
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        msg: 'a Wayfarer gym was not added: a gym nearby may be it',
        near: [theirs.id],
      }),
    );
  });

  it('adds a Wayfarer gym that a gym of another server refused, and counts the held ones', async () => {
    const made = await wayfarerImportWith();
    made.regions.rows.push({
      id: 5,
      guildId: OTHER_GUILD_ROW,
      channelId: '100000000000000005',
      description: null,
      bounds: [
        { lat: 40.0, lon: -80.2 },
        { lat: 40.1, lon: -80.2 },
        { lat: 40.1, lon: -80.1 },
        { lat: 40.0, lon: -80.1 },
        { lat: 40.0, lon: -80.2 },
      ],
      forumChannelId: null,
      summaryMessageId: null,
    });
    const edge = { lat: 40.05, lon: -80.1 };
    const theirs = await made.gymStore.create(
      { name: 'Border Stone', ...at(edge, 0, -15) },
      OTHER_GUILD_ROW,
    );
    await made.directory.load();
    const stone = wayspot(1, 'Old Border Stone', at(edge, 0, 15));
    const file = exportOf([stone]);
    const before = await made.wayfarer.preview(STAFF_PLACE, file);
    expect(before.counts).toMatchObject({ added: 0, held: 1 });
    expect(before.plan.held).toEqual([{ wayspot: stone, gymId: theirs.id }]);

    // The other server's staff said their gym is none of these: it holds the Wayspot back no more.
    await made.wayfarerStore.saveReviews(
      OTHER_GUILD_ROW,
      null,
      [
        {
          gymId: theirs.id,
          kind: 'match',
          candidates: [
            { id: stone.id, kind: 'gym', title: stone.title, ...at(edge, 0, 15), metres: 30 },
          ],
        },
      ],
      1,
    );
    await made.wayfarerStore.closeReviews(OTHER_GUILD_ROW, [theirs.id], 'none-of-these', STAFF, 2);
    const after = await made.wayfarer.preview(STAFF_PLACE, file);
    expect(after.counts).toMatchObject({ added: 1, held: 0 });
  });

  it('holds a Wayfarer gym that a never matched gym of another server 30 metres off may be', async () => {
    const made = await wayfarerImportWith();
    made.regions.rows.push({
      id: 5,
      guildId: OTHER_GUILD_ROW,
      channelId: '100000000000000005',
      description: null,
      bounds: [
        { lat: 40.0, lon: -80.2 },
        { lat: 40.1, lon: -80.2 },
        { lat: 40.1, lon: -80.1 },
        { lat: 40.0, lon: -80.1 },
        { lat: 40.0, lon: -80.2 },
      ],
      forumChannelId: null,
      summaryMessageId: null,
    });
    const edge = { lat: 40.05, lon: -80.1 };
    const theirs = await made.gymStore.create(
      { name: 'Border Stone', ...at(edge, 0, -15) },
      OTHER_GUILD_ROW,
    );
    await made.directory.load();
    const outcome = await made.wayfarer.apply(
      STAFF_PLACE,
      exportOf([wayspot(1, 'Old Border Stone', at(edge, 0, 15))]),
    );
    expect(outcome.counts).toMatchObject({ added: 0, held: 1 });
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        msg: 'a Wayfarer gym was not added: a gym nearby may be it',
        wayspot: idOf(1),
        near: [theirs.id],
      }),
    );
  });

  it('records what it can when the import row cannot be written', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    made.wayfarerStore.addImport = () => Promise.reject(new Error('database is down'));

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);

    expect(outcome.importId).toBeNull();
    expect(outcome.unrecorded).toEqual(['import']);
    expect(outcome.counts).toMatchObject({ matched: 3, added: 2 });
    expect((await made.wayfarerStore.openReviews(1)).map((item) => item.importId)).toEqual([
      null,
      null,
    ]);
  });
});

describe('WayfarerImportService: a first import adds its gyms in blocks', () => {
  /** Wayfarer gyms on a grid over West, 300 m apart, starting far from the invented gyms. */
  function grid(count: number): ExportedWayspot[] {
    const start = { lat: 40.004, lon: -80.096 };
    return Array.from({ length: count }, (_, n) =>
      wayspot(1_000 + n, `Grid Gym ${n}`, at(start, (n % 30) * 300, Math.floor(n / 30) * 300)),
    );
  }

  it('writes a block of 250 gyms in one transaction, and the rest of the import as before', async () => {
    const made = await wayfarerImportWith();
    const outcome = await made.wayfarer.apply(STAFF_PLACE, exportOf(grid(600)));
    expect(outcome.counts.added).toBeGreaterThan(500);
    expect(outcome.counts.failed).toBe(0);
    expect(made.gymStore.blocks).toBe(Math.ceil(outcome.counts.added / IMPORT_BLOCK));
    // Every gym is there, with its Wayfarer id, in the line for its places.
    const added = made.directory.all().filter((gym) => gym.name.startsWith('Grid Gym'));
    expect(added).toHaveLength(outcome.counts.added);
    expect(added.every((gym) => gym.pogoId !== null && gym.nearestGym !== null)).toBe(true);
    expect(await made.upkeep.waiting()).toBeGreaterThanOrEqual(outcome.counts.added);
    // A line in the log per block, with how far the import has come.
    const blocks = made.entries.filter(
      (entry) => entry.msg === 'a block of Wayfarer gyms was added',
    );
    expect(blocks).toHaveLength(made.gymStore.blocks);
    expect(blocks[0]).toMatchObject({ level: 30, block: 1, blocks: blocks.length, added: 250 });
    expect(blocks.at(-1)).toMatchObject({ block: blocks.length, held: 0, failed: 0 });
    // One summary, as before.
    await settle(made);
    expect(announced(made).map((message) => textOf(message))).toEqual([
      `### The gym list changed\nProfessor Pine has added ${outcome.counts.added} gyms.`,
    ]);
  });

  it('adds the gyms of a block that fails one by one, so that a bad gym fails alone', async () => {
    const made = await wayfarerImportWith();
    const gyms = grid(3);
    made.gymStore.refuseNames.add('Grid Gym 1');
    const outcome = await made.wayfarer.apply(STAFF_PLACE, exportOf(gyms));
    expect(outcome.counts).toMatchObject({ added: 2, failed: 1 });
    expect(made.gymStore.blocks).toBe(0);
    expect(made.directory.all().filter((gym) => gym.name.startsWith('Grid Gym'))).toHaveLength(2);
  });
});

describe('WayfarerImportService: the kept Wayspots', () => {
  const ids = async (made: Made) => (await made.wayspotStore.all()).map((row) => row.id);

  it('keeps every Wayspot of the file but those Pine gyms are, and counts them in the preview', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    const far = wayspot(8, 'Water Tower', { lat: 41, lon: -81 }, { kind: 'powerspot' });
    const withFar = { ...file, wayspots: [...file.wayspots, far] };

    const preview = await made.wayfarer.preview(STAFF_PLACE, withFar);
    expect(preview.wayspots).toEqual({ added: 2, changed: 0, gone: 0, gyms: 1 });
    expect(await ids(made)).toEqual([]);

    const outcome = await made.wayfarer.apply(STAFF_PLACE, withFar);
    expect(outcome.wayspots).toEqual({ added: 2, changed: 0, gone: 0, gyms: 1 });
    await settle(made);
    expect(announced(made).map((message) => textOf(message))).toEqual([
      '### The gym list changed\nProfessor Pine has added 2 gyms, renamed 2, and moved 2. It also ' +
        'added 1 PokéStop and 1 Power Spot.',
    ]);
    // The bench (a stop), the mosaic wall (a Wayfarer gym asked about) and the water tower far
    // outside every region; never the Wayfarer gyms the gyms are now.
    expect(await ids(made)).toEqual([idOf(4), idOf(5), idOf(8)]);
    // The directory has read them again.
    expect(made.wayspots.byId(idOf(4))).toMatchObject({ title: 'Bench' });
    expect(made.wayspots.regionsOf(idOf(4))).toEqual([WEST_CHANNEL]);
    expect(made.wayspots.regionsOf(idOf(8))).toEqual([]);
    expect((await made.wayspotStore.all())[0]).toMatchObject({
      kind: 'stop',
      title: 'Bench',
      firstSeen: made.clock.now,
      // When the scan was made, not when it was imported.
      lastSeen: Date.parse(file.finishedAt),
    });
  });

  it('deletes a stop gone from a covered cell, keeps one whose cell the file did not cover', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    await made.wayfarer.apply(STAFF_PLACE, file);
    const unseen = wayspot(9, 'Shelter', { lat: 40.5, lon: -80.5 }, { kind: 'stop' });
    await made.wayspotStore.saveFromImport({ upsert: [keptOf(unseen)], remove: [] }, 1);
    await settle(made);
    const before = announced(made).length;

    const without = { ...file, wayspots: file.wayspots.filter((one) => one.id !== idOf(4)) };
    const preview = await made.wayfarer.preview(STAFF_PLACE, without);
    expect(preview.wayspots).toEqual({ added: 0, changed: 0, gone: 1, gyms: 0 });
    const outcome = await made.wayfarer.apply(STAFF_PLACE, without);
    expect(outcome.wayspots).toEqual({ added: 0, changed: 0, gone: 1, gyms: 0 });
    // The second import changes no gym: it posts nothing (8W-3).
    await settle(made);
    expect(announced(made)).toHaveLength(before);
    expect(await ids(made)).toEqual([idOf(5), idOf(9)]);
  });

  it('posts no summary when only the address or picture of a stop changed', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    await made.wayfarer.apply(STAFF_PLACE, file);
    await settle(made);
    const before = announced(made).length;

    const redone = {
      ...file,
      wayspots: file.wayspots.map((one) =>
        one.id === idOf(4)
          ? { ...one, address: '7 Oak Street', image: 'https://lh3.googleusercontent.com/new' }
          : one,
      ),
    };
    const outcome = await made.wayfarer.apply(STAFF_PLACE, redone);
    expect(outcome.wayspots).toEqual({ added: 0, changed: 1, gone: 0, gyms: 0 });
    await settle(made);
    expect(announced(made)).toHaveLength(before);
    expect((await made.wayspotStore.all()).find((row) => row.id === idOf(4))).toMatchObject({
      address: '7 Oak Street',
      image: 'https://lh3.googleusercontent.com/new',
    });
  });

  it('leaves alone what a newer scan of another server kept, when an older file comes after it', async () => {
    const made = await wayfarerImportWith();
    await withOtherServer(made);
    const mosaic = gymOf(made, 6);
    const bench = wayspot(4, 'Bench', at(mosaic, 40), { kind: 'stop' });
    const swing = wayspot(8, 'Swing', at(mosaic, 45), { kind: 'stop' });
    const newer = exportOf([{ ...bench, title: 'Bench by the Mosaic' }, swing]);
    // A week older, over the same cells (the swing's too), without the swing.
    const older = {
      ...exportOf([bench], [swing]),
      startedAt: '2026-10-06T08:00:00.000Z',
      finishedAt: '2026-10-06T09:30:00.000Z',
    };
    await made.wayfarer.apply(STAFF_PLACE, newer);

    expect((await made.wayfarer.preview(OTHER_STAFF_PLACE, older)).wayspots).toEqual({
      added: 0,
      changed: 0,
      gone: 0,
      gyms: 0,
    });
    const outcome = await made.wayfarer.apply(OTHER_STAFF_PLACE, older);

    expect(outcome.wayspots).toEqual({ added: 0, changed: 0, gone: 0, gyms: 0 });
    expect(await made.wayspotStore.all()).toEqual([
      expect.objectContaining({
        id: bench.id,
        title: 'Bench by the Mosaic',
        lastSeen: Date.parse(newer.finishedAt),
      }),
      expect.objectContaining({ id: swing.id, title: 'Swing' }),
    ]);
  });

  it('does not bring back a stop a newer scan found gone, when an older file comes after it', async () => {
    const made = await wayfarerImportWith();
    const mosaic = gymOf(made, 6);
    const bench = wayspot(4, 'Bench', at(mosaic, 40), { kind: 'stop' });
    const swing = wayspot(8, 'Swing', at(mosaic, 45), { kind: 'stop' });
    const dated = (file: WayspotExport, day: string) => ({
      ...file,
      startedAt: `2026-10-${day}T08:00:00.000Z`,
      finishedAt: `2026-10-${day}T09:30:00.000Z`,
    });
    await made.wayfarer.apply(STAFF_PLACE, dated(exportOf([bench, swing]), '01'));
    await made.wayfarer.apply(STAFF_PLACE, dated(exportOf([bench], [swing]), '13'));
    expect(await ids(made)).toEqual([bench.id]);

    // A file of a scan between the two still has the swing.
    const older = dated(exportOf([bench, swing]), '06');
    expect((await made.wayfarer.preview(STAFF_PLACE, older)).wayspots).toEqual({
      added: 0,
      changed: 0,
      gone: 0,
      gyms: 0,
    });
    const outcome = await made.wayfarer.apply(STAFF_PLACE, older);
    expect(outcome.wayspots).toEqual({ added: 0, changed: 0, gone: 0, gyms: 0 });
    expect(await ids(made)).toEqual([bench.id]);
    // A newer one that has it brings it back.
    await made.wayfarer.apply(STAFF_PLACE, dated(exportOf([bench, swing]), '15'));
    expect(await ids(made)).toEqual([bench.id, swing.id]);
  });

  it('keeps no Wayspot that a gym of another server is, and drops a row kept of it before', async () => {
    const made = await wayfarerImportWith();
    const theirs = await withOtherServer(made);
    const clock = wayspot(9, 'Northgate Clock', at(NORTH_PLACE, 1));
    await made.gymStore.update(theirs.id, { pogoId: clock.id });
    await made.directory.load();
    await made.wayspotStore.saveFromImport({ upsert: [keptOf(clock)], remove: [] }, 1);

    const outcome = await made.wayfarer.apply(STAFF_PLACE, exportOf([clock]));

    expect(outcome.wayspots).toEqual({ added: 0, changed: 0, gone: 0, gyms: 1 });
    expect(await ids(made)).toEqual([]);
  });

  it('keeps a Wayfarer gym whose adding failed as a Wayfarer gym Pine did not take', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    // The database refuses its row: its block fails, and then it alone.
    made.gymStore.refuseNames.add('Clock Tower');

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);

    expect(outcome.counts).toMatchObject({ added: 1, failed: 1 });
    expect((await made.wayspotStore.all()).find((row) => row.id === idOf(6))).toMatchObject({
      kind: 'gym',
      title: 'Clock Tower',
    });
    // The bell tower, added, is a gym and no kept row.
    expect(await ids(made)).not.toContain(idOf(7));
  });

  it('adds the gyms when the kept Wayspots cannot be read, without saying which were PokéStops', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    const clockTower = file.wayspots.find((one) => one.id === idOf(6))!;
    await made.wayspotStore.saveFromImport(
      { upsert: [keptOf({ ...clockTower, kind: 'stop' })], remove: [] },
      1,
    );
    made.wayspotStore.all = () => Promise.reject(new Error('database is down'));

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);
    await settle(made);

    expect(outcome.unrecorded).toEqual(['wayspots']);
    expect(outcome.wayspots).toEqual({ added: 0, changed: 0, gone: 0, gyms: 0 });
    expect(outcome.counts).toMatchObject({ matched: 3, added: 2 });
    expect(announced(made).map((message) => textOf(message))).toEqual([
      '### The gym list changed\nProfessor Pine has added 2 gyms, renamed 2, and moved 2.',
    ]);
  });

  it('previews without the kept Wayspots when they cannot be read, and logs it', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    made.wayspotStore.all = () => Promise.reject(new Error('database is down'));

    const preview = await made.wayfarer.preview(STAFF_PLACE, file);

    expect(preview.wayspots).toBeUndefined();
    expect(preview.counts).toMatchObject({ matched: 3, added: 2 });
    expect(
      made.entries.filter((entry) => entry.msg === 'could not read the kept Wayspots'),
    ).toEqual([expect.objectContaining({ level: 50 })]);
  });

  it('says in the summary how many of the gyms it added were PokéStops, and drops their rows', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    const clockTower = file.wayspots.find((one) => one.id === idOf(6))!;
    await made.wayspotStore.saveFromImport(
      { upsert: [keptOf({ ...clockTower, kind: 'stop' })], remove: [] },
      1,
    );

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);
    await settle(made);

    expect(outcome.wayspots).toMatchObject({ gone: 1 });
    expect(announced(made).map((message) => textOf(message))).toEqual([
      '### The gym list changed\nProfessor Pine has added 2 gyms (1 of them was a PokéStop), ' +
        'renamed 2, and moved 2. It also added 1 PokéStop.',
    ]);
    expect(await ids(made)).not.toContain(idOf(6));
  });

  it('says a gym it added was a PokéStop also when an older import had found that stop gone', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    const clockTower = file.wayspots.find((one) => one.id === idOf(6))!;
    await made.wayspotStore.saveFromImport(
      { upsert: [keptOf({ ...clockTower, kind: 'stop' })], remove: [] },
      1,
    );
    await made.wayspotStore.saveFromImport({ upsert: [], remove: [], gone: [idOf(6)] }, 2, 2, 1);
    expect(await ids(made)).not.toContain(idOf(6));

    await made.wayfarer.apply(STAFF_PLACE, file);
    await settle(made);

    expect(announced(made).map((message) => textOf(message))[0]).toMatch(
      /^### The gym list changed\nProfessor Pine has added 2 gyms \(1 of them was a PokéStop\)/u,
    );
    expect(await made.wayspotStore.gone()).toEqual(new Map());
  });

  it('notes a write of the Wayspots that failed, and the gyms stand', async () => {
    const made = await wayfarerImportWith();
    const { file } = cityFile(made);
    made.wayspotStore.saveFromImport = () => Promise.reject(new Error('database is down'));

    const outcome = await made.wayfarer.apply(STAFF_PLACE, file);

    expect(outcome.unrecorded).toEqual(['wayspots']);
    expect(outcome.wayspots).toEqual({ added: 0, changed: 0, gone: 0, gyms: 0 });
    expect(outcome.counts).toMatchObject({ matched: 3, added: 2 });
  });

  it('drops the row of a Wayspot a gym becomes by a match of the review', async () => {
    const made = await wayfarerImportWith();
    const mosaic = gymOf(made, 6);
    const wall = wayspot(5, 'Mosaic Wall', at(mosaic, -60));
    await made.wayspotStore.saveFromImport({ upsert: [keptOf(wall)], remove: [] }, 1);
    await made.wayspots.load();

    expect(await made.wayfarer.applyMatch(STAFF_PLACE, 6, wall)).toMatchObject({ kind: 'matched' });
    expect(await ids(made)).toEqual([]);
    expect(made.wayspots.byId(wall.id)).toBeUndefined();
  });
});

describe('WayfarerImportService.applyMatch', () => {
  it('makes a gym a Wayspot as an import does', async () => {
    const made = await wayfarerImportWith();
    const mosaic = gymOf(made, 6);
    const bench = wayspot(4, 'Bench Mosaic', at(mosaic, 40), { image: PICTURE });
    await made.wayfarerStore.markNotInWayfarer(6, STAFF, 1);

    const outcome = await made.wayfarer.applyMatch(STAFF_PLACE, 6, bench);

    expect(outcome).toMatchObject({
      kind: 'matched',
      change: { rename: 'Bench Mosaic', move: true, picture: PICTURE, unmark: true },
      gym: { id: 6, name: 'Bench Mosaic', pogoId: idOf(4), imageUrl: PICTURE },
    });
    expect((await made.wayfarerStore.records([6])).get(6)).toMatchObject({
      lastSeen: made.clock.now,
      notInWayfarer: false,
    });
  });

  it('refuses a Wayspot another gym already is, and a gym that is not there', async () => {
    const made = await wayfarerImportWith();
    const theirs = await withOtherServer(made);
    await made.gymStore.update(1, { pogoId: idOf(4) });
    await made.directory.refreshGym(1);
    const bench = wayspot(4, 'Bench', at(gymOf(made, 6), 40));

    expect(await made.wayfarer.applyMatch(STAFF_PLACE, 6, bench)).toMatchObject({
      kind: 'taken',
      gym: { id: 1 },
    });
    expect(await made.wayfarer.applyMatch(STAFF_PLACE, 99, bench)).toEqual({ kind: 'gone' });
    expect(await made.wayfarer.applyMatch(STAFF_PLACE, theirs.id, bench)).toEqual({
      kind: 'gone',
    });
    expect(made.gymStore.row(6)?.pogoId).toBeNull();
  });
});
