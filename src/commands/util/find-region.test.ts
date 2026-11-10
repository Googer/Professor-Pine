import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  asV2,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { galleryOf, textDisplays } from '../../../test/support/messages.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { ALICE } from '../../../test/support/parties.js';
import { FakePlaces } from '../../../test/support/places.js';
import { mapsFixture } from '../../../test/support/providers.js';
import { bytesResponse } from '../../../test/support/responses.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import { MemoryGoogleUse } from '../../services/google-use.js';
import { ImageCache } from '../../services/image-cache.js';
import { MapBudget } from '../../services/map-budget.js';
import { StaticMaps } from '../../services/static-maps.js';
import type { Region } from '../../db/repositories/region-repository.js';
import { InteractionRouter } from '../../discord/router.js';
import { widenedBox, type Shape } from '@pine/wayspot-core/shape';
import type { GymAdminService } from '../../services/gym-admin-service.js';
import type { RegionProvider } from '../../services/region-directory.js';
import { findRegion, shortName } from './find-region.js';

/** North: a region of another server, above West. */
const NORTH: Region = {
  id: 9,
  guildId: 2,
  channelId: '100000000000000009',
  description: null,
  bounds: [
    { lat: 40.2, lon: -80.1 },
    { lat: 40.3, lon: -80.1 },
    { lat: 40.3, lon: -80.0 },
    { lat: 40.2, lon: -80.0 },
    { lat: 40.2, lon: -80.1 },
  ],
  forumChannelId: null,
  summaryMessageId: null,
};

function regionsWith(regions: Region[]): RegionProvider {
  return {
    byId: (id) => regions.find((region) => region.id === id),
    byChannel: (channelId) => regions.find((region) => region.channelId === channelId),
    byForum: (forumId) => regions.find((region) => region.forumChannelId === forumId),
    all: () => regions,
  };
}

/** A park in West and East both, as OpenStreetMap might outline it. */
const PARK: Shape = {
  kind: 'area',
  areas: [
    {
      outer: [
        { lat: 40.04, lon: -80.02 },
        { lat: 40.06, lon: -80.02 },
        { lat: 40.06, lon: -79.98 },
        { lat: 40.04, lon: -79.98 },
        { lat: 40.04, lon: -80.02 },
      ],
      holes: [],
    },
  ],
};

function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
  const places = new FakePlaces();
  const pictures: { shape: Shape; outlines: number }[] = [];
  const maps = {
    ...mapsFixture(),
    enabled: true,
    place: (shape: Shape, outlines: readonly unknown[]) => {
      pictures.push({ shape, outlines: outlines.length });
      return Promise.resolve('var/images/places/abc.123.png');
    },
  };
  const { ctx, entries } = createTestContext({
    places,
    maps,
    regions: regionsWith([...testRegions(), NORTH]),
    ...overrides,
  });
  const router = new InteractionRouter(ctx, [findRegion], []);
  const run = async (location: string, extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'find-region',
      userId: ALICE,
      options: { location },
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ctx, entries, places, pictures, router, run };
}

function told(used: FakeInteraction): string | undefined {
  for (const mock of [used.followUp, used.editReply, used.reply]) {
    if (mock.mock.calls.length > 0) return sent(mock).content;
  }
  throw new Error('nothing was answered');
}

/**
 * The answer as a test reads it: its text, its map and its small print (the components-v2
 * message of plan 8B-4, read in the shape the embed had).
 */
function shownAnswer(used: FakeInteraction): {
  description?: string;
  image?: { url: string };
  footer?: { text: string };
} {
  const message = asV2(sent(used.editReply));
  expectV2Sendable(message);
  const [description, ...rest] = textDisplays(message);
  const [url] = galleryOf(message);
  const small = rest.find((text) => text.startsWith('-# '));
  return {
    ...(description === undefined ? {} : { description }),
    ...(url === undefined ? {} : { image: { url } }),
    ...(small === undefined ? {} : { footer: { text: small.slice(3) } }),
  };
}

describe('/find-region: the command', () => {
  it('exists only where place search is set up, for members of servers', () => {
    const { ctx } = createTestContext();
    expect(findRegion.enabled?.(ctx.config)).toBe(true);
    const { findRegion: _off, ...without } = ctx.config.settings;
    expect(findRegion.enabled?.({ ...ctx.config, settings: without })).toBe(false);
    const json = findRegion.data.toJSON();
    expect(json.default_member_permissions).toBeUndefined();
    expect(json.contexts).toBeUndefined();
    expect(findRegion.defer).toBe('ephemeral');
    expect(findRegion.throttle).toEqual({ uses: 5, perSeconds: 60 });
  });
});

describe('/find-region: a place by name', () => {
  it('names the regions of this server it lies in, with a map and the attribution', async () => {
    const made = setup();
    made.places.found.set('big park', [
      { name: 'Little Garden', shape: { kind: 'point', point: { lat: 40.05, lon: -80.05 } } },
      { name: 'Big Park, Pinewood', shape: PARK },
    ]);
    const used = await made.run('Big Park');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    // Searched within the box of this server's regions (not North's), widened by 10 km.
    expect(made.places.asked).toEqual([
      {
        text: 'Big Park',
        box: widenedBox({ south: 40, north: 40.1, west: -80.1, east: -79.9 }, 10),
      },
    ]);
    expect(shownAnswer(used)).toEqual({
      description:
        '**Big Park, Pinewood** (the most likely of 2 places by that name) lies wholly or partly ' +
        `in <#${WEST_CHANNEL}>, <#${EAST_CHANNEL}>.`,
      image: { url: 'attachment://abc.123.png' },
      footer: { text: '© OpenStreetMap contributors' },
    });
    expect(sent(used.editReply).files).toEqual(['var/images/places/abc.123.png']);
    expect(made.pictures).toEqual([{ shape: PARK, outlines: 2 }]);
    expect(JSON.stringify(made.entries)).not.toContain('Big Park');
  });

  it('finds a town just outside the regions, and says it lies in none, a town before a road', async () => {
    const made = setup();
    made.places.found.set('bentleyville', [
      {
        name: 'Bentleyville Road',
        shape: {
          kind: 'line',
          lines: [
            [
              { lat: 40.05, lon: -80.05 },
              { lat: 40.11, lon: -80.05 },
            ],
          ],
        },
        standing: 'road',
      },
      {
        name: 'Bentleyville',
        shape: { kind: 'point', point: { lat: 40.117, lon: -80.05 } },
        standing: 'settlement',
      },
    ]);
    const used = await made.run('Bentleyville');
    expect(shownAnswer(used).description).toBe(
      '**Bentleyville** (the most likely of 2 places by that name) lies in none of this ' +
        'server’s regions.',
    );
  });

  it('names a place by the first three parts of its name', async () => {
    const made = setup();
    made.places.found.set('schenley park', [
      {
        name: 'Schenley Park, Squirrel Hill North, Pittsburgh, Allegheny County, Pennsylvania, 15213',
        shape: PARK,
      },
    ]);
    expect(shownAnswer(await made.run('Schenley Park')).description).toMatch(
      /^\*\*Schenley Park, Squirrel Hill North, Pittsburgh\*\* lies wholly or partly in /,
    );
  });

  it('says that a place whose outline is too detailed was taken by its point', async () => {
    const made = setup();
    made.places.found.set('big county', [
      {
        name: 'Big County',
        shape: { kind: 'point', point: { lat: 40.05, lon: -80.05 } },
        tooDetailed: true,
      },
    ]);
    expect(shownAnswer(await made.run('Big County')).description).toBe(
      `**Big County** lies in <#${WEST_CHANNEL}>. Its outline is too detailed for me to read, ` +
        'so this is where its center lies.',
    );
  });

  it('falls back to the whole name, then to "this place"', () => {
    expect(shortName('Big Park, Pinewood')).toBe('Big Park, Pinewood');
    expect(shortName(' , ,')).toBe(', ,');
    expect(shortName('   ')).toBe('this place');
    expect(shortName('')).toBe('this place');
  });

  it('says so when nothing is found, or it lies in no region', async () => {
    const made = setup();
    expect(told(await made.run('Nowhere Lane'))).toBe(
      'I found no place called **Nowhere Lane** in or near this server’s regions.',
    );
    made.places.found.set('edge', [
      { name: 'Edge', shape: { kind: 'point', point: { lat: 40.099, lon: -79.85 } } },
    ]);
    expect(shownAnswer(await made.run('Edge')).description).toBe(
      '**Edge** lies in none of this server’s regions.',
    );
  });

  it('says so when the search fails or is busy', async () => {
    const made = setup();
    made.places.failing = { ok: false, reason: 'busy' };
    expect(told(await made.run('Park'))).toBe(
      'Many places are being looked up just now. Please try again in a minute.',
    );
    made.places.failing = { ok: false, reason: 'paused' };
    expect(told(await made.run('Park'))).toBe(
      'Nominatim asked me to wait; please try again later.',
    );
    made.places.failing = { ok: false, reason: 'timeout' };
    expect(told(await made.run('Park'))).toBe(
      'The search for places did not answer just now. Please try again later.',
    );
  });
});

describe('/find-region: coordinates and links', () => {
  it('reads coordinates without searching, and answers without the map when there is none', async () => {
    const made = setup({ maps: mapsFixture() });
    const used = await made.run('40.05, -80.05');
    expect(made.places.asked).toEqual([]);
    expect(shownAnswer(used)).toEqual({
      description: `**40.05, -80.05** lies in <#${WEST_CHANNEL}>.`,
    });
    expect(sent(used.editReply).files).toBeUndefined();
  });

  // Plan 8Z-2: Google bills each map of a place that is downloaded, and a member chooses the place.
  it('takes one of the month’s maps for each map it downloads, and answers without a map when none is left', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pine-find-region-'));
    try {
      const { log, entries } = createTestLogger();
      const asked: string[] = [];
      const cache = new ImageCache({
        dir,
        log,
        fetch: (url) => {
          asked.push(url);
          return Promise.resolve({
            ...bytesResponse(new TextEncoder().encode('png'), {
              headers: { 'content-type': 'image/png' },
            }),
            ok: true,
          });
        },
      });
      const use = new MemoryGoogleUse();
      const mapBudget = new MapBudget({ use, perMonth: 2, log });
      const made = setup({ maps: new StaticMaps('k', cache), mapBudget });
      const answer = async (location: string) => {
        const used = await made.run(location);
        return { text: shownAnswer(used).description, files: sent(used.editReply).files };
      };
      const spent = vi.spyOn(mapBudget, 'spend');
      const first = await answer('40.05, -80.05');
      expect(first.files).toHaveLength(1);
      expect(await mapBudget.used()).toBe(1);
      // Taken as the member's (fix round of 8Z-2: a member has twenty maps a day).
      expect(spent).toHaveBeenCalledWith(ALICE);
      // The same place again: its map is on disk, and nothing is taken.
      expect((await answer('40.05, -80.05')).files).toEqual(first.files);
      expect(await mapBudget.used()).toBe(1);
      expect((await answer('40.06, -80.05')).files).toHaveLength(1);
      expect(await mapBudget.used()).toBe(2);
      // The month's maps are used: the regions are said all the same, Google is not asked.
      expect(await answer('40.07, -80.05')).toEqual({
        text: `**40.07, -80.05** lies in <#${WEST_CHANNEL}>.`,
        files: undefined,
      });
      expect(asked).toHaveLength(2);
      expect(await mapBudget.used()).toBe(2);
      expect(entries.filter((entry) => entry.level === 40)).toEqual([
        expect.objectContaining({ maps: 2, perMonth: 2 }),
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('follows a short link of the Maps app', async () => {
    const gymAdmin = {
      readLocation: () =>
        Promise.resolve({ kind: 'point', point: { lat: 40.05, lon: -79.95 }, approximate: true }),
    } as unknown as GymAdminService;
    const made = setup({ gymAdmin });
    const used = await made.run('https://maps.app.goo.gl/abcdef');
    expect(shownAnswer(used).description).toBe(
      `**40.05, -79.95** (where the map of the link was centered) lies in <#${EAST_CHANNEL}>.`,
    );
  });

  it('refuses what is no place before anything is counted', async () => {
    const made = setup();
    expect(told(await made.run('95.5, 200.5'))).toMatch(
      /^Those coordinates are no place on earth\./,
    );
    expect(told(await made.run('https://example.test/somewhere'))).toMatch(
      /^I cannot read a place from that link\./,
    );
    expect(told(await made.run('   '))).toBe(
      'Say which place: its name, its coordinates or a link.',
    );
    expect(made.places.asked).toEqual([]);
  });

  it('refuses in a server without regions, and in a DM', async () => {
    const made = setup({ regions: regionsWith([NORTH]) });
    expect(told(await made.run('Park'))).toBe('This server has no regions with an outline.');
    expect(told(await made.run('Park', { isDm: true, guildId: null }))).toBe(
      'This only works in a server.',
    );
  });
});
