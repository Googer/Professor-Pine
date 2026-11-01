import { describe, expect, it } from 'vitest';
import type { KmlArea } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import {
  categoryNameFor,
  MAX_NEW_CHANNELS,
  planImport,
  type ImportInput,
  type ServerChannel,
} from './region-import.js';

function square(south: number, west: number, north: number, east: number): LatLon[] {
  return [
    { lat: south, lon: west },
    { lat: north, lon: west },
    { lat: north, lon: east },
    { lat: south, lon: east },
    { lat: south, lon: west },
  ];
}

/** A traced boundary of many corners around a point. */
function traced(corners: number, lat: number, lon: number, radius = 0.05): LatLon[] {
  const ring = Array.from({ length: corners }, (_unused, i) => {
    const angle = (2 * Math.PI * i) / corners;
    const r = radius * (1 + 0.05 * Math.sin(angle * 97));
    return { lat: lat + r * Math.sin(angle), lon: lon + r * Math.cos(angle) };
  });
  return [...ring, ring[0] ?? { lat: 0, lon: 0 }];
}

const WEST = square(40, -80.1, 40.1, -80);
const area = (name: string, outline = WEST, more: Partial<KmlArea> = {}): KmlArea => ({
  name,
  description: null,
  outline,
  holes: false,
  ...more,
});
const text = (id: string, name: string, categoryId: string | null = null): ServerChannel => ({
  id,
  name,
  kind: 'text',
  categoryId,
});

function plan(input: Partial<ImportInput> & Pick<ImportInput, 'areas'>) {
  return planImport({
    channels: [],
    regions: [],
    guildId: 1,
    gyms: [],
    raids: [],
    mayCreate: true,
    ...input,
  });
}

describe('categoryNameFor: the #', () => {
  it('strips one leading # only', () => {
    expect(categoryNameFor(area('##Odd'))).toBe('#Odd');
    expect(categoryNameFor(area('C#'))).toBe('C#');
  });
});

describe('planImport: what staff should look at twice', () => {
  it('flags a new channel whose name is close to an existing channel or another area', () => {
    const made = plan({
      areas: [
        area('Nort Hills'),
        area('South Side', square(41, -81, 41.1, -80.9)),
        area('Soth Sde', square(42, -81, 42.1, -80.9)),
        area('Far Away', square(43, -81, 43.1, -80.9)),
      ],
      channels: [text('c1', 'north-hills')],
    });
    expect(made.imports.map((one) => [one.channelName, one.nearMiss])).toEqual([
      ['nort-hills', 'north-hills'],
      ['south-side', 'soth-sde'],
      ['soth-sde', 'south-side'],
      ['far-away', undefined],
    ]);
  });

  it('marks an outline that is the same as before', () => {
    const made = plan({
      areas: [area('West'), area('East', square(40, -80, 40.1, -79.9))],
      channels: [text('c1', 'west'), text('c2', 'east')],
      regions: [
        { id: 1, guildId: 1, channelId: 'c1', forumChannelId: 'f1', bounds: WEST },
        { id: 2, guildId: 1, channelId: 'c2', forumChannelId: null, bounds: WEST },
      ],
    });
    expect(made.imports.map((one) => [one.name, one.unchanged])).toEqual([
      ['West', true],
      ['East', false],
    ]);
  });

  it('counts the forums an import would make: one for every region that has none', () => {
    const made = plan({
      areas: [area('West'), area('East'), area('New', square(41, -81, 41.1, -80.9))],
      channels: [
        text('c1', 'west'),
        text('c2', 'east'),
        { id: 'f1', name: 'raids-forum', kind: 'forum', categoryId: null },
      ],
      regions: [{ id: 1, guildId: 1, channelId: 'c1', forumChannelId: 'f1', bounds: null }],
    });
    // West has a forum; East is a new region, New a new channel: two forums.
    expect(made.imports.map((one) => one.hasForum)).toEqual([true, false, false]);
    expect(made.newForums).toBe(2);
  });

  it('never plans a category beyond what Discord allows: the rest goes into its overflow', () => {
    const channels: ServerChannel[] = [
      { id: 'k1', name: 'Full', kind: 'category', categoryId: null },
      ...Array.from({ length: 47 }, (_unused, i) => text(`c${i}`, `old-${i}`, 'k1')),
    ];
    const areas = [
      area('One', square(41, -81, 41.1, -80.9), { description: 'Full' }),
      area('Two', square(42, -81, 42.1, -80.9), { description: 'full' }),
      area('Three', square(43, -81, 43.1, -80.9), { description: 'Roomy' }),
    ];
    const made = plan({ areas, channels });
    // 47 there: room for one new channel and its forum, not for two.
    expect(made.imports.map((one) => one.channel)).toEqual([
      { create: { category: { id: 'k1', name: 'Full' } } },
      { create: { category: { create: 'Full 2', like: 'k1' } } },
      { create: { category: { create: 'Roomy' } } },
    ]);
    expect(made.overflow).toEqual([
      { category: 'Full', room: 3, forums: 0, channels: 1, into: ['Full 2'] },
    ]);
    expect(plan({ areas: areas.slice(1), channels }).overflow).toEqual([]);
  });

  it('plans an import of large outlines over many gyms in well under a second', () => {
    const gyms = Array.from({ length: 3_000 }, (_unused, i) => ({
      id: i + 1,
      lat: 40 + (i % 60) * 0.1,
      lon: -80 + Math.floor(i / 60) * 0.1,
    }));
    const regions = Array.from({ length: 30 }, (_unused, i) => ({
      id: i + 1,
      guildId: 1,
      channelId: `c${i}`,
      forumChannelId: null,
      bounds: traced(5_000, 40 + (i % 6), -80 + Math.floor(i / 6)),
    }));
    const channels = regions.map((region, i) => text(region.channelId, `r-${i}`));
    const areas = Array.from({ length: 4 }, (_unused, i) =>
      area(`r-${i}`, traced(5_000, 40.02 + (i % 6), -80 + Math.floor(i / 6))),
    );
    const started = performance.now();
    const made = plan({ areas, channels, regions, gyms });
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(made.imports).toHaveLength(4);
  });
});

describe('planImport: how many channels one import creates', () => {
  it('creates at most MAX_NEW_CHANNELS, and lets the areas after them wait', () => {
    const areas = Array.from({ length: MAX_NEW_CHANNELS + 3 }, (_unused, i) =>
      area(`Town ${i}`, square(40 + i, -80, 40.1 + i, -79.9)),
    );
    // An area of a channel that exists is never kept waiting.
    const made = plan({
      areas: [...areas, area('Old Town')],
      channels: [text('c1', 'old-town')],
    });
    const created = made.imports.filter((one) => 'create' in one.channel);
    expect(created).toHaveLength(MAX_NEW_CHANNELS);
    expect(made.newChannels).toHaveLength(MAX_NEW_CHANNELS);
    expect(made.imports.map((one) => one.channelName)).toContain('old-town');
    expect(made.leftOut).toEqual([
      {
        name: `Town ${MAX_NEW_CHANNELS}`,
        channelName: `town-${MAX_NEW_CHANNELS}`,
        reason: 'waits',
      },
      {
        name: `Town ${MAX_NEW_CHANNELS + 1}`,
        channelName: `town-${MAX_NEW_CHANNELS + 1}`,
        reason: 'waits',
      },
      {
        name: `Town ${MAX_NEW_CHANNELS + 2}`,
        channelName: `town-${MAX_NEW_CHANNELS + 2}`,
        reason: 'waits',
      },
    ]);
    // The categories of the areas that wait are not created either.
    expect(made.newCategories).toHaveLength(MAX_NEW_CHANNELS);
  });
});

describe('planImport: forums', () => {
  const category = (id: string, name: string): ServerChannel => ({
    id,
    name,
    kind: 'category',
    categoryId: null,
  });
  const forum = (id: string, name: string, categoryId: string | null): ServerChannel => ({
    id,
    name,
    kind: 'forum',
    categoryId,
  });
  const region = (id: number, channelId: string, forumChannelId: string | null) => ({
    id,
    guildId: 1,
    channelId,
    forumChannelId,
    bounds: WEST,
  });

  it('plans a new forum for a region whose forum is gone', () => {
    const made = plan({
      areas: [area('Old Town', square(41, -81, 41.1, -80.9))],
      channels: [text('c1', 'old-town')],
      regions: [region(5, 'c1', 'f-gone')],
    });
    expect(made.imports.map((one) => one.hasForum)).toEqual([false]);
    expect(made.newForums).toBe(1);
  });

  it('takes back the one forum of the channel that no region has, named and placed as its own', () => {
    const channels = [
      category('k1', 'Town'),
      text('c1', 'old-town', 'k1'),
      forum('f1', 'old-town-meetups', 'k1'),
      // Of another category, or of another name: neither of these.
      forum('f2', 'old-town-meetups', null),
      forum('f3', 'other-meetups', 'k1'),
      forum('f4', 'new-town-meetups', 'k1'),
    ];
    const made = plan({
      areas: [
        area('Old Town', square(41, -81, 41.1, -80.9)),
        // A channel to create in the category of a forum named after it.
        area('New Town', square(42, -81, 42.1, -80.9), { description: 'Town' }),
      ],
      channels,
      orphanForums: ['f1', 'f2', 'f3', 'f4'],
      forumSuffix: '-meetups',
    });
    expect(made.imports.map((one) => [one.channelName, one.adoptForum])).toEqual([
      ['old-town', { id: 'f1', name: 'old-town-meetups' }],
      ['new-town', { id: 'f4', name: 'new-town-meetups' }],
    ]);
    expect(made.newForums).toBe(0);
    // A forum that no party names is no forum of a removed region: it is left alone.
    const unnamed = plan({
      areas: [area('Old Town', square(41, -81, 41.1, -80.9))],
      channels,
      orphanForums: ['f2'],
      forumSuffix: '-meetups',
    });
    expect(unnamed.imports[0]?.adoptForum).toBeUndefined();
    expect(unnamed.newForums).toBe(1);
  });

  it('takes back none of two that would fit', () => {
    const made = plan({
      areas: [area('Old Town', square(41, -81, 41.1, -80.9))],
      channels: [
        text('c1', 'old-town'),
        forum('f1', 'old-town-meetups', null),
        forum('f2', 'Old Town-meetups', null),
      ],
      orphanForums: ['f1', 'f2'],
      forumSuffix: '-meetups',
    });
    expect(made.imports[0]?.adoptForum).toBeUndefined();
    expect(made.newForums).toBe(1);
  });
});

describe('planImport: staff who may not create channels', () => {
  it('leaves out what would need a channel, and keeps what has one', () => {
    const made = plan({
      areas: [area('Old Town'), area('New Town', square(42, -81, 42.1, -80.9))],
      channels: [text('c1', 'old-town')],
      staffMayCreate: false,
    });
    expect(made.imports.map((one) => one.channelName)).toEqual(['old-town']);
    expect(made.leftOut).toEqual([
      { name: 'New Town', channelName: 'new-town', reason: 'not-allowed' },
    ]);
    expect(made.newChannels).toEqual([]);
  });
});
