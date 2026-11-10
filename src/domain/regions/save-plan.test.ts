import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { Point, SaveRequest } from '../web/editor-data.js';
import type { ServerChannel } from './region-import.js';
import { outlinesWritten, planSave, type SaveRegion } from './save-plan.js';
import { regionVersion } from './version.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });
function square(south: number, west: number, north: number, east: number): LatLon[] {
  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
}
const points = (ring: LatLon[]): Point[] => ring.map(({ lat, lon }) => [lat, lon]);

const WEST = square(40, -80.1, 40.1, -80);
const EAST = square(40, -80, 40.1, -79.9);
const REGIONS: SaveRegion[] = [
  { id: 1, guildId: 1, channelId: '100000000000000001', description: null, bounds: WEST },
  { id: 2, guildId: 1, channelId: '100000000000000002', description: null, bounds: EAST },
  { id: 4, guildId: 2, channelId: '100000000000000004', description: null, bounds: null },
];
const CHANNELS: ServerChannel[] = [
  { id: '100000000000000041', name: 'Town', kind: 'category', categoryId: null },
  { id: '100000000000000001', name: 'west', kind: 'text', categoryId: '100000000000000041' },
  { id: '100000000000000002', name: 'east', kind: 'text', categoryId: '100000000000000041' },
  { id: '100000000000000005', name: 'south', kind: 'text', categoryId: null },
  { id: '100000000000000006', name: 'raid-forum', kind: 'forum', categoryId: null },
];
const version = (id: number): string => {
  const region = REGIONS.find((one) => one.id === id);
  return regionVersion(region?.bounds ?? null, region?.description ?? null);
};

const plan = (request: Partial<SaveRequest>) =>
  planSave(
    { changes: [], additions: [], removals: [], ...request },
    { guildId: 1, regions: REGIONS, channels: CHANNELS },
  );

describe('a save of the region editor', () => {
  it('is the areas of an import, named after their channels, and the removals', () => {
    const moved = square(40, -80.1, 40.1, -80.01);
    const fresh = square(39.9, -80.1, 40, -80);
    const planned = plan({
      changes: [{ regionId: 1, outline: points(moved), version: version(1) }],
      additions: [
        { channel: { id: '100000000000000005' }, description: null, outline: points(fresh) },
        {
          channel: { name: 'North Hills' },
          description: 'Suburbs',
          outline: points(square(40.1, -80.1, 40.2, -80)),
        },
      ],
      removals: [{ regionId: 2, forum: 'delete', version: version(2) }],
    });
    expect(planned.problems).toEqual([]);
    expect(planned.conflicts).toEqual([]);
    expect(planned.areas.map((area) => [area.name, area.description, area.outline])).toEqual([
      ['west', null, moved],
      ['south', null, fresh],
      ['North Hills', 'Suburbs', square(40.1, -80.1, 40.2, -80)],
    ]);
    expect(planned.removals).toEqual([{ regionId: 2, forum: 'delete' }]);
    expect(planned.before.map((one) => one.key)).toEqual(['r1', 'r2']);
    expect(planned.after.map((one) => [one.key, one.outline])).toEqual([
      ['r1', moved],
      ['a0', fresh],
      ['a1', square(40.1, -80.1, 40.2, -80)],
    ]);
    // What the import leaves out is not written: a changed region keeps its outline, a new
    // one is none, and the removal stays.
    expect(
      outlinesWritten(planned, new Set(['west', 'North Hills'])).map((one) => [
        one.key,
        one.outline,
      ]),
    ).toEqual([
      ['r1', WEST],
      ['a0', fresh],
    ]);
    expect(outlinesWritten(planned, new Set())).toBe(planned.after);
  });

  it('names the regions changed or removed since the page loaded them, and those gone', () => {
    const planned = plan({
      changes: [{ regionId: 1, outline: points(WEST), version: 'older-version-x' }],
      removals: [
        { regionId: 9, forum: 'keep', version: 'x' },
        // Another server's region is none of this server's.
        { regionId: 4, forum: 'keep', version: version(4) },
      ],
    });
    expect(planned.conflicts).toEqual([
      { regionId: 1, gone: false },
      { regionId: 9, gone: true },
      { regionId: 4, gone: true },
    ]);
  });

  it('refuses outlines that are no outline, as the page would', () => {
    const crossing: Point[] = [
      [40, -80.1],
      [40.1, -80],
      [40.1, -80.1],
      [40, -80],
      [40, -80.1],
    ];
    const planned = plan({
      changes: [{ regionId: 1, outline: crossing, version: version(1) }],
      additions: [
        {
          channel: { name: 'x' },
          description: null,
          outline: [
            [40, -80],
            [40.1, -80],
          ],
        },
      ],
    });
    expect(planned.problems).toEqual([
      { kind: 'outline', target: { regionId: 1 }, problem: { kind: 'crosses-itself' } },
      { kind: 'outline', target: { addition: 0 }, problem: { kind: 'too-few' } },
    ]);
    expect(planned.areas).toEqual([]);
  });

  it('refuses a channel that cannot be a new region, and a region named twice', () => {
    const outline = points(square(39.9, -80.1, 40, -80));
    const planned = plan({
      changes: [
        { regionId: 1, outline: points(WEST), version: version(1) },
        { regionId: 1, outline: points(WEST), version: version(1) },
      ],
      additions: [
        { channel: { id: '100000000000000002' }, description: null, outline },
        { channel: { id: '100000000000000006' }, description: null, outline },
        { channel: { id: '100000000000000099' }, description: null, outline },
        { channel: { name: '!!!' }, description: null, outline },
      ],
      removals: [{ regionId: 2, forum: 'keep', version: version(2) }],
    });
    expect(planned.problems).toEqual([
      { kind: 'twice', regionId: 1 },
      { kind: 'already-region', addition: 0, name: 'east' },
      { kind: 'not-a-channel', addition: 1 },
      { kind: 'not-a-channel', addition: 2 },
      { kind: 'no-name', addition: 3 },
    ]);
  });

  it('refuses a new channel named as a channel the server has, region or not', () => {
    const outline = points(square(39.9, -80.1, 40, -80));
    const planned = plan({
      additions: [
        { channel: { name: 'West' }, description: null, outline },
        { channel: { name: '#South' }, description: null, outline },
        { channel: { name: 'Raid Forum' }, description: null, outline },
        // A category of the name is no channel a region could be.
        { channel: { name: 'town' }, description: null, outline },
      ],
    });
    expect(planned.problems).toEqual([
      { kind: 'channel-exists', addition: 0, name: 'west', listed: false },
      { kind: 'channel-exists', addition: 1, name: 'south', listed: true },
      { kind: 'channel-exists', addition: 2, name: 'raid-forum', listed: false },
    ]);
    expect(planned.areas.map((area) => area.name)).toEqual(['town']);
  });

  it('refuses a new channel whose name or category is longer than Discord and the page take', () => {
    const outline = points(square(39.9, -80.1, 40, -80));
    const planned = plan({
      additions: [
        { channel: { name: 'h'.repeat(101) }, description: null, outline },
        { channel: { name: 'Dales' }, description: 'c'.repeat(201), outline },
        { channel: { name: 'h'.repeat(100) }, description: 'c'.repeat(200), outline },
      ],
    });
    expect(planned.problems).toEqual([
      { kind: 'name-too-long', addition: 0, length: 101 },
      { kind: 'category-too-long', addition: 1, length: 201 },
    ]);
    expect(planned.areas).toHaveLength(1);
  });

  it('takes a category as a file would give it, and none for an empty one', () => {
    const outline = points(square(39.9, -80.1, 40, -80));
    const planned = plan({
      additions: [
        { channel: { name: 'Hills' }, description: '<b>Suburbs</b>  north<br>more', outline },
        { channel: { name: 'Dales' }, description: '   ', outline },
      ],
    });
    expect(planned.areas.map((area) => area.description)).toEqual(['Suburbs north', null]);
  });

  it('takes outlines at six decimals, without a corner repeated by the rounding', () => {
    const planned = plan({
      additions: [
        {
          channel: { name: 'Hills' },
          description: null,
          outline: [
            [39.90000001, -80.1],
            [39.90000004, -80.1],
            [40.0000004, -80.1],
            [40, -80.0000001],
            [39.9, -80],
            [39.9, -80.1],
          ],
        },
      ],
    });
    expect(planned.areas[0]?.outline).toEqual(square(39.9, -80.1, 40, -80));
  });

  it('refuses a new outline for a region whose channel is gone: its name would make a new one', () => {
    const planned = planSave(
      {
        changes: [{ regionId: 2, outline: points(EAST), version: version(2) }],
        additions: [],
        removals: [],
      },
      { guildId: 1, regions: REGIONS, channels: CHANNELS.filter((one) => one.name !== 'east') },
    );
    expect(planned.problems).toEqual([{ kind: 'channel-gone', regionId: 2 }]);
  });
});
