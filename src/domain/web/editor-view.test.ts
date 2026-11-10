import { describe, expect, it } from 'vitest';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { ringContains } from '@pine/wayspot-core/region-membership';
import type { ServerChannel } from '../regions/region-import.js';
import { regionVersion } from '../regions/version.js';
import { editorView, type EditorInput } from './editor-view.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });
function square(south: number, west: number, north: number, east: number): LatLon[] {
  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
}

const WEST = square(40, -80.1, 40.1, -80);
const EAST = square(40, -80, 40.1, -79.9);
/** Another server's region a kilometre north of east, and one far away. */
const NEAR = square(40.11, -80, 40.2, -79.9);
const FAR = square(41, -80.1, 41.1, -80);

const CHANNELS: ServerChannel[] = [
  { id: '100000000000000041', name: 'Town', kind: 'category', categoryId: null },
  { id: '100000000000000001', name: 'west', kind: 'text', categoryId: '100000000000000041' },
  { id: '100000000000000002', name: 'east', kind: 'text', categoryId: null },
  { id: '100000000000000005', name: 'south', kind: 'text', categoryId: null },
  { id: '100000000000000006', name: 'forum', kind: 'forum', categoryId: null },
  { id: '100000000000000008', name: 'north', kind: 'text', categoryId: null },
];

function input(more: Partial<EditorInput> = {}): EditorInput {
  const regions = [
    { id: 1, guildId: 1, channelId: '100000000000000001', description: null, bounds: WEST },
    { id: 2, guildId: 1, channelId: '100000000000000002', description: 'Old', bounds: EAST },
    { id: 3, guildId: 1, channelId: '100000000000000009', description: null, bounds: null },
    { id: 4, guildId: 2, channelId: '100000000000000008', description: null, bounds: NEAR },
    { id: 5, guildId: 2, channelId: '100000000000000007', description: null, bounds: FAR },
  ];
  const gyms = [
    { id: 1, name: 'Library', lat: 40.05, lon: -80.05 },
    { id: 2, name: 'Bridge', lat: 40.0500001234, lon: -79.95 },
    // In no region, half a kilometre west of west.
    { id: 3, name: 'Trailhead', lat: 40.05, lon: -80.105 },
    // In no region, far away.
    { id: 4, name: 'Lakeview', lat: 40.5, lon: -80.05 },
    // Only in the other server's region near east.
    { id: 5, name: 'Mill', lat: 40.15, lon: -79.95 },
  ];
  return {
    guildRow: 1,
    regions,
    channels: CHANNELS,
    gyms,
    regionsOf: (gymId) => {
      const gym = gyms.find((one) => one.id === gymId);
      return regions.flatMap((region) =>
        gym && region.bounds && ringContains(region.bounds, gym) ? [region.channelId] : [],
      );
    },
    wayspots: [
      { kind: 'stop', lat: 40.01, lon: -80.01, title: 'Mural' },
      { kind: 'powerspot', lat: 40.115, lon: -80.05, title: 'Kiosk' },
      { kind: 'gym', lat: 40.9, lon: -80.05, title: 'Far gym' },
    ],
    ...more,
  };
}

describe('what the region editor loads', () => {
  it("is the server's regions with their channels, categories and versions", () => {
    const view = editorView(input());
    expect(view.regions.map((region) => [region.id, region.name, region.category])).toEqual([
      [1, 'west', 'Town'],
      [2, 'east', null],
      [3, 'Region 3', null],
    ]);
    expect(view.regions[0]?.outline).toEqual(WEST.map(({ lat, lon }) => [lat, lon]));
    expect(view.regions[1]?.version).toBe(regionVersion(EAST, 'Old'));
    expect(view.regions[2]).toMatchObject({ outline: null, version: regionVersion(null, null) });
  });

  it("shows other servers' regions near its own by their outlines alone", () => {
    const view = editorView(input());
    expect(view.others).toEqual([{ id: 4, outline: NEAR.map(({ lat, lon }) => [lat, lon]) }]);
  });

  it('has the gyms in its regions and those in no region near them, at six decimals', () => {
    const view = editorView(input());
    expect(view.gyms).toEqual([
      [1, 40.05, -80.05, 'Library'],
      [2, 40.05, -79.95, 'Bridge'],
      [3, 40.05, -80.105, 'Trailhead'],
    ]);
  });

  it('has the Wayspots within two kilometres of its regions', () => {
    expect(editorView(input()).wayspots).toEqual([
      ['stop', 40.01, -80.01, 'Mural'],
      ['powerspot', 40.115, -80.05, 'Kiosk'],
    ]);
  });

  it('offers the text channels that are no region of any server', () => {
    expect(editorView(input()).channels).toEqual([{ id: '100000000000000005', name: 'south' }]);
  });

  it('is empty around a server without outlines', () => {
    const view = editorView(input({ guildRow: 9 }));
    expect(view).toMatchObject({ regions: [], others: [], gyms: [], wayspots: [] });
    expect(editorView(input({ guildRow: undefined })).regions).toEqual([]);
  });
});
