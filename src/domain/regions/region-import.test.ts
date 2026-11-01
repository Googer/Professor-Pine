import { describe, expect, it } from 'vitest';
import type { KmlArea } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import {
  categoryNameFor,
  channelKey,
  channelNameFor,
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

const WEST = square(40, -80.1, 40.1, -80);
const EAST = square(40, -80, 40.1, -79.9);
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
const category = (id: string, name: string): ServerChannel => ({
  id,
  name,
  kind: 'category',
  categoryId: null,
});

const GYMS = [
  { id: 1, lat: 40.05, lon: -80.05 },
  { id: 2, lat: 40.06, lon: -80.06 },
  { id: 3, lat: 40.05, lon: -79.95 },
  { id: 4, lat: 41, lon: -79 },
];

function plan(input: Partial<ImportInput> & Pick<ImportInput, 'areas'>) {
  return planImport({
    channels: [],
    regions: [],
    guildId: 1,
    gyms: GYMS,
    raids: [],
    mayCreate: true,
    ...input,
  });
}

describe('channelNameFor', () => {
  it.each([
    ['West End', 'west-end'],
    ['#west-end', 'west-end'],
    ['  North  Side ', 'north-side'],
    ['Mt. Lebanon / Dormont', 'mt-lebanon-dormont'],
    ['snake_case_99', 'snake_case_99'],
    ['Café Zürich', 'café-zürich'],
    ['東京 タワー', '東京-タワー'],
    ['--Odd--Name--', 'odd-name'],
    ['!!!', ''],
    ['', ''],
  ])('makes %j the channel name %j', (name, channel) => {
    expect(channelNameFor(name)).toBe(channel);
  });

  it('never gives a name longer than Discord takes', () => {
    expect(channelNameFor('a'.repeat(300))).toHaveLength(100);
  });

  it('compares names as the rule writes them, whatever else a channel is called', () => {
    expect(channelKey('🔥-West-End')).toBe(channelKey('west end'));
    expect(channelKey('west_end')).not.toBe(channelKey('west-end'));
  });
});

describe('categoryNameFor', () => {
  it('is the description, or else the name of the area without its #', () => {
    expect(categoryNameFor(area('#West End', WEST, { description: '  North Hills ' }))).toBe(
      'North Hills',
    );
    expect(categoryNameFor(area(' #West End '))).toBe('West End');
    expect(categoryNameFor(area('x', WEST, { description: 'c'.repeat(150) }))).toHaveLength(100);
    expect(categoryNameFor(area('#'))).toBeNull();
  });
});

describe('planImport', () => {
  it('matches every area to the text channel its name stands for', () => {
    const made = plan({
      areas: [area('West End'), area('East Side', EAST, { holes: true })],
      channels: [
        text('c1', 'west-end'),
        text('c2', 'east-side'),
        text('c3', 'general'),
        { id: 'f1', name: 'raids-forum', kind: 'forum', categoryId: null },
      ],
      regions: [{ id: 7, guildId: 1, channelId: 'c1', forumChannelId: 'f1', bounds: EAST }],
    });
    expect(made.leftOut).toEqual([]);
    expect(made.imports).toMatchObject([
      {
        name: 'West End',
        channelName: 'west-end',
        channel: { id: 'c1' },
        regionId: 7,
        hasForum: true,
        // The Library and the Fountain lie in the new outline; before, it held gym 3.
        gyms: 2,
        gymsBefore: 1,
        holes: false,
      },
      {
        name: 'East Side',
        channelName: 'east-side',
        channel: { id: 'c2' },
        regionId: null,
        hasForum: false,
        gyms: 1,
        gymsBefore: null,
        holes: true,
      },
    ]);
    expect(made.newChannels).toEqual([]);
    expect(made.newCategories).toEqual([]);
    // Gym 3 lay in West End and now lies in East Side: nothing is left without a region.
    expect(made.stranded).toBe(0);
  });

  it('plans a new channel for a name no channel has, in the category the area names', () => {
    const made = plan({
      areas: [
        area('West End', WEST, { description: 'north hills' }),
        area('East Side', EAST, { description: 'North Hills' }),
        area('Downtown', EAST, { description: 'City' }),
        area('Lone Pine'),
      ],
      channels: [category('k1', 'North Hills'), category('k2', 'lone pine'), text('c9', 'general')],
    });
    expect(made.leftOut).toEqual([]);
    expect(made.imports.map((planned) => [planned.channelName, planned.channel])).toEqual([
      ['west-end', { create: { category: { id: 'k1', name: 'North Hills' } } }],
      ['east-side', { create: { category: { id: 'k1', name: 'North Hills' } } }],
      ['downtown', { create: { category: { create: 'City' } } }],
      // Without a description: a category named after the area, and the one that exists is used.
      ['lone-pine', { create: { category: { id: 'k2', name: 'lone pine' } } }],
    ]);
    expect(made.newChannels).toEqual(['west-end', 'east-side', 'downtown', 'lone-pine']);
    expect(made.newCategories).toEqual(['City']);
  });

  it('lets two new areas share one new category, named as the first of them writes it', () => {
    const made = plan({
      areas: [
        area('A', WEST, { description: 'South Side' }),
        area('B', EAST, { description: 'south side' }),
        area('Solo', EAST),
      ],
    });
    expect(made.imports.map((planned) => planned.channel)).toEqual([
      { create: { category: { create: 'South Side' } } },
      { create: { category: { create: 'South Side' } } },
      { create: { category: { create: 'Solo' } } },
    ]);
    expect(made.newCategories).toEqual(['South Side', 'Solo']);
  });

  it('leaves out what needs a channel when it may not create one', () => {
    const made = plan({
      areas: [area('West End'), area('New Place', EAST)],
      channels: [text('c1', 'west-end')],
      mayCreate: false,
    });
    expect(made.imports.map((planned) => planned.name)).toEqual(['West End']);
    expect(made.leftOut).toEqual([
      { name: 'New Place', channelName: 'new-place', reason: 'cannot-create' },
    ]);
    expect(made.newChannels).toEqual([]);
  });

  it('leaves out an area whose name is not one channel’s, each with its reason', () => {
    const made = plan({
      areas: [
        area('Twice'),
        area('Double'),
        area('double'),
        area('Voice'),
        area('!!!'),
        area(''),
        area('Theirs'),
        area('Fine', EAST),
      ],
      channels: [
        text('c1', 'twice'),
        text('c2', 'Twice'),
        text('c3', 'double'),
        { id: 'v1', name: 'voice', kind: 'other', categoryId: null },
        text('c5', 'theirs'),
        text('c6', 'fine'),
      ],
      regions: [{ id: 3, guildId: 2, channelId: 'c5', forumChannelId: null, bounds: null }],
    });
    expect(made.imports.map((planned) => planned.name)).toEqual(['Fine']);
    expect(made.leftOut).toEqual([
      { name: 'Twice', channelName: 'twice', reason: 'several-channels' },
      { name: 'Double', channelName: 'double', reason: 'several-areas' },
      { name: 'double', channelName: 'double', reason: 'several-areas' },
      { name: 'Voice', channelName: 'voice', reason: 'not-text' },
      { name: '!!!', channelName: '', reason: 'no-name' },
      { name: '', channelName: '', reason: 'no-name' },
      { name: 'Theirs', channelName: 'theirs', reason: 'foreign' },
    ]);
  });

  it('leaves out two new areas of one name, and creates nothing for them', () => {
    const made = plan({ areas: [area('New'), area('new', EAST)] });
    expect(made.imports).toEqual([]);
    expect(made.leftOut.map((left) => left.reason)).toEqual(['several-areas', 'several-areas']);
    expect(made.newChannels).toEqual([]);
    expect(made.newCategories).toEqual([]);
  });

  it('does not take a category or a forum of the name for the channel', () => {
    const made = plan({
      areas: [area('West End')],
      channels: [
        category('k1', 'west-end'),
        { id: 'f1', name: 'west-end', kind: 'forum', categoryId: null },
      ],
    });
    // A forum of that name stands in the way; a category does not.
    expect(made.leftOut).toEqual([
      { name: 'West End', channelName: 'west-end', reason: 'not-text' },
    ]);
    const free = plan({ areas: [area('West End')], channels: [category('k1', 'WEST END')] });
    expect(free.imports[0]?.channel).toEqual({
      create: { category: { id: 'k1', name: 'WEST END' } },
    });
  });

  describe('for one channel', () => {
    const channels = [text('c1', 'west-end'), text('c2', 'east-side')];
    const target = { id: 'c1', name: 'west-end' };

    it('takes the one area of a file, whatever its name', () => {
      const made = plan({ areas: [area('Anything at all')], channels, target });
      expect(made.problem).toBeUndefined();
      expect(made.imports).toMatchObject([{ name: 'Anything at all', channel: { id: 'c1' } }]);
      expect(made.leftOut).toEqual([]);
    });

    it('takes the one area whose name stands for the channel, and leaves the others out', () => {
      const made = plan({
        areas: [area('East Side', EAST), area('West End'), area('Elsewhere')],
        channels,
        target,
      });
      expect(made.imports).toMatchObject([{ name: 'West End', channel: { id: 'c1' } }]);
      expect(made.leftOut).toEqual([
        { name: 'East Side', channelName: 'east-side', reason: 'other-channel' },
        { name: 'Elsewhere', channelName: 'elsewhere', reason: 'other-channel' },
      ]);
      // Nothing is ever created for one channel.
      expect(made.newChannels).toEqual([]);
    });

    it('says when none or several of several areas stand for the channel', () => {
      expect(plan({ areas: [area('A'), area('B')], channels, target })).toMatchObject({
        imports: [],
        problem: 'none-for-channel',
      });
      expect(
        plan({ areas: [area('West End'), area('west end', EAST)], channels, target }),
      ).toMatchObject({ imports: [], problem: 'several-for-channel' });
    });

    it('does not take a channel that is another server’s region', () => {
      const made = plan({
        areas: [area('x')],
        channels,
        target,
        regions: [{ id: 3, guildId: 2, channelId: 'c1', forumChannelId: null, bounds: null }],
      });
      expect(made.imports).toEqual([]);
      expect(made.leftOut).toEqual([{ name: 'x', channelName: 'west-end', reason: 'foreign' }]);
    });
  });

  it('counts the gyms that would lie in no region of this server any more', () => {
    // West End shrinks to a corner without gyms; East Side stays as it is and keeps gym 3.
    const made = plan({
      areas: [area('West End', square(40.09, -80.1, 40.1, -80.09))],
      channels: [text('c1', 'west-end'), text('c2', 'east-side')],
      regions: [
        { id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: WEST },
        { id: 2, guildId: 1, channelId: 'c2', forumChannelId: null, bounds: EAST },
        // Another server's region over the same ground does not keep a gym in this server.
        { id: 9, guildId: 2, channelId: 'x9', forumChannelId: null, bounds: WEST },
      ],
    });
    expect(made.imports).toMatchObject([{ gyms: 0, gymsBefore: 2, stranded: 2 }]);
    expect(made.stranded).toBe(2);
  });

  it('counts the gyms of the regions removed with it as lying in no region afterwards', () => {
    // East (gym 3) is removed in the same save that gives West End a new outline: west's gyms
    // stay, east's would lie in no region.
    const regions = [
      { id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: WEST },
      { id: 2, guildId: 1, channelId: 'c2', forumChannelId: null, bounds: EAST },
    ];
    const made = plan({
      areas: [area('West End', square(40, -80.1, 40.1, -80.01))],
      channels: [text('c1', 'west-end'), text('c2', 'east-side')],
      regions,
      removing: [2],
    });
    expect(made.stranded).toBe(1);
    // A change that gives east's gym to west keeps it in the server.
    expect(
      plan({
        areas: [area('West End', square(40, -80.1, 40.1, -79.9))],
        channels: [text('c1', 'west-end'), text('c2', 'east-side')],
        regions,
        removing: [2],
      }).stranded,
    ).toBe(0);
  });

  it('counts the raids of a changed region whose gym would lie outside it', () => {
    const made = plan({
      areas: [area('West End', square(40.055, -80.1, 40.1, -80))],
      channels: [text('c1', 'west-end')],
      regions: [{ id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: WEST }],
      raids: [
        { regionId: 1, gymId: 1 },
        { regionId: 1, gymId: 2 },
        { regionId: 2, gymId: 1 },
        { regionId: 1, gymId: 99 },
      ],
    });
    // Gym 1 (latitude 40.05) falls out; gym 2 stays in; the raid of another region does not
    // count, nor one at a gym that is gone.
    expect(made.raidsOutside).toBe(1);
  });
});

describe('planImport: full categories', () => {
  const forum = (id: string, name: string, categoryId: string | null): ServerChannel => ({
    id,
    name,
    kind: 'forum',
    categoryId,
  });
  /** A category holding `count` channels and forums, half of each (regions with their forums). */
  const filled = (id: string, name: string, count: number): ServerChannel[] => [
    category(id, name),
    ...Array.from({ length: count }, (_unused, i) =>
      i % 2 === 0 ? text(`${id}-t${i}`, `${id}-old-${i}`, id) : forum(`${id}-f${i}`, `f-${i}`, id),
    ),
  ];
  const away = (i: number) => square(41 + i * 0.01, -81, 41.005 + i * 0.01, -80.9);
  const areasIn = (description: string, count: number, from = 0): KmlArea[] =>
    Array.from({ length: count }, (_unused, i) =>
      area(`Place ${i + from}`, away(i + from), { description }),
    );

  it('puts new channels into an overflow category when theirs is full, as staging met it', () => {
    // 25 regions and their 25 forums fill the category; the file's last 3 areas are new.
    const made = plan({
      areas: areasIn('Pittsburgh staging', 3),
      channels: filled('k1', 'Pittsburgh staging', 50),
    });
    expect(made.leftOut).toEqual([]);
    expect(made.imports.map((planned) => planned.channel)).toEqual([
      { create: { category: { create: 'Pittsburgh staging 2', like: 'k1' } } },
      { create: { category: { create: 'Pittsburgh staging 2', like: 'k1' } } },
      { create: { category: { create: 'Pittsburgh staging 2', like: 'k1' } } },
    ]);
    expect(made.newCategories).toEqual(['Pittsburgh staging 2']);
    expect(made.overflow).toEqual([
      {
        category: 'Pittsburgh staging',
        room: 0,
        forums: 0,
        channels: 3,
        into: ['Pittsburgh staging 2'],
      },
    ]);
  });

  it('fills a category to the last pair of places, and puts the rest into the overflow', () => {
    const made = plan({ areas: areasIn('town', 3), channels: filled('k1', 'Town', 45) });
    // 5 places: two new regions with their forums; the third would need 2 of the 1 left.
    expect(made.imports.map((planned) => planned.channel)).toEqual([
      { create: { category: { id: 'k1', name: 'Town' } } },
      { create: { category: { id: 'k1', name: 'Town' } } },
      { create: { category: { create: 'Town 2', like: 'k1' } } },
    ]);
    expect(made.overflow).toEqual([
      { category: 'Town', room: 5, forums: 0, channels: 1, into: ['Town 2'] },
    ]);
  });

  it('takes an overflow category that exists and has room, by name without case', () => {
    const made = plan({
      areas: areasIn('Town', 2),
      channels: [...filled('k1', 'Town', 50), ...filled('k2', 'town 2', 40)],
    });
    expect(made.imports.map((planned) => planned.channel)).toEqual([
      { create: { category: { id: 'k2', name: 'town 2', like: 'k1' } } },
      { create: { category: { id: 'k2', name: 'town 2', like: 'k1' } } },
    ]);
    expect(made.newCategories).toEqual([]);
    expect(made.overflow).toEqual([
      { category: 'Town', room: 0, forums: 0, channels: 2, into: ['town 2'] },
    ]);
  });

  it('goes on to the next number when the overflow category is full too', () => {
    const made = plan({
      areas: areasIn('Town', 3),
      channels: [...filled('k1', 'Town', 50), ...filled('k2', 'Town 2', 48)],
    });
    expect(made.imports.map((planned) => planned.channel)).toEqual([
      { create: { category: { id: 'k2', name: 'Town 2', like: 'k1' } } },
      { create: { category: { create: 'Town 3', like: 'k1' } } },
      { create: { category: { create: 'Town 3', like: 'k1' } } },
    ]);
    expect(made.newCategories).toEqual(['Town 3']);
    expect(made.overflow).toEqual([
      { category: 'Town', room: 0, forums: 0, channels: 3, into: ['Town 2', 'Town 3'] },
    ]);
  });

  it('keeps the name of an overflow category within what Discord takes', () => {
    const long = 'L'.repeat(100);
    const made = plan({ areas: areasIn(long, 1), channels: filled('k1', long, 50) });
    expect(made.newCategories).toEqual([`${'L'.repeat(98)} 2`]);
  });

  it('leaves out a new region on a channel whose full category has no room for its forum', () => {
    const channels = [...filled('k1', 'Town', 49), text('c1', 'west-end', 'k1')];
    const made = plan({ areas: [area('West End')], channels });
    expect(made.imports).toEqual([]);
    expect(made.leftOut).toEqual([
      { name: 'West End', channelName: 'west-end', reason: 'category-full', category: 'Town' },
    ]);
    expect(made.newForums).toBe(0);
  });

  it('gives a region that is one already its new outline, its forum blocked by the full category', () => {
    const channels = [...filled('k1', 'Town', 49), text('c1', 'west-end', 'k1')];
    const made = plan({
      areas: [area('West End')],
      channels,
      regions: [{ id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: null }],
    });
    expect(made.leftOut).toEqual([]);
    expect(made.imports).toMatchObject([
      { name: 'West End', regionId: 1, hasForum: false, forumBlocked: { category: 'Town' } },
    ]);
    expect(made.newForums).toBe(0);
    // One that has its forum, or takes back the one it had, needs no room.
    const withForum = plan({
      areas: [area('West End')],
      channels: [...channels.slice(0, -2), forum('f9', 'west-end-raids', 'k1'), channels[50]!],
      regions: [{ id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: null }],
      orphanForums: ['f9'],
      forumSuffix: '-raids',
    });
    expect(withForum.leftOut).toEqual([]);
    expect(withForum.imports[0]?.adoptForum).toEqual({ id: 'f9', name: 'west-end-raids' });
  });

  it('keeps the room of an existing channel’s forum before a new channel takes it', () => {
    const made = plan({
      areas: [area('New One', away(1), { description: 'Town' }), area('West End')],
      channels: [...filled('k1', 'Town', 47), text('c1', 'west-end', 'k1')],
      regions: [{ id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: null }],
    });
    // 2 places left: West End's forum takes 1, so New One goes into Town 2.
    expect(made.leftOut).toEqual([]);
    expect(made.imports.map((planned) => [planned.name, planned.channel])).toEqual([
      ['New One', { create: { category: { create: 'Town 2', like: 'k1' } } }],
      ['West End', { id: 'c1' }],
    ]);
    expect(made.newForums).toBe(2);
    // The room the category had, and how much of it the forums of its regions take.
    expect(made.overflow).toEqual([
      { category: 'Town', room: 2, forums: 1, channels: 1, into: ['Town 2'] },
    ]);
  });

  it('makes no copy of a category that did not exist: a new one has nothing to copy', () => {
    const made = plan({ areas: areasIn('Fresh', 26) });
    // 25 channels at most in one import: one new category, no overflow, no copy.
    expect(made.newCategories).toEqual(['Fresh']);
    expect(made.imports[0]?.channel).toEqual({ create: { category: { create: 'Fresh' } } });
  });

  it('leaves out what would take the server beyond its 500 channels', () => {
    const many = Array.from({ length: 497 }, (_unused, i) => text(`m${i}`, `many-${i}`));
    const made = plan({
      areas: [area('New One', away(1)), area('New Two', away(2), { description: 'many-0' })],
      channels: [...many, category('k1', 'Lots')],
    });
    // New One needs its channel, its forum and its category (3 of the 2 left); so does New Two.
    expect(made.imports).toEqual([]);
    expect(made.leftOut.map((left) => [left.name, left.reason])).toEqual([
      ['New One', 'server-full'],
      ['New Two', 'server-full'],
    ]);
    const roomy = plan({
      areas: [area('New One', away(1), { description: 'Lots' })],
      channels: [...many, category('k1', 'Lots')],
    });
    // In a category that exists: its channel and its forum, the last two places.
    expect(roomy.leftOut).toEqual([]);
  });
});
