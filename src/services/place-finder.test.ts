import { describe, expect, it } from 'vitest';
import { EAST_CHANNEL, NORTH_PLACE, testGym, WEST_CHANNEL } from '../../test/support/gyms.js';
import { gymsFixture, regionsFixture } from '../../test/support/providers.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { WayspotRow } from '../domain/wayspots/kept.js';
import { clearOf, PlaceFinder, placeValue, readPlaceValue } from './place-finder.js';
import { MemoryWayspotLookups } from './wayspot-lookups.js';
import { WayspotPlaces } from './wayspot-places.js';

/**
 * Kept Wayspots over the invented gyms: in West a stop called Fountain without an address, a
 * power spot by the library, a stop on Maple Avenue; in East a stop called Fountain Square; one
 * far outside every region. The finder has built its indexes.
 */
async function finderWith(extra: { rows?: WayspotRow[]; gyms?: Gym[] } = {}) {
  const { storage, wayspots } = await wayspotsWith([
    keptRow(1, { title: 'Fountain', lat: 40.0601, lon: -80.0601, address: null }),
    keptRow(2, { title: 'Library Garden', kind: 'powerspot', lat: 40.0502, lon: -80.0502 }),
    keptRow(3, {
      title: 'Reading Bench',
      lat: 40.051,
      lon: -80.051,
      address: '14 Maple Avenue, Pinewood, PA 15999, USA',
    }),
    keptRow(4, { title: 'Fountain Square', lat: 40.05, lon: -79.95 }),
    keptRow(5, { title: 'Fountain Far Away', lat: 41, lon: -81 }),
    ...(extra.rows ?? []),
  ]);
  const finder = new PlaceFinder({
    gyms: gymsFixture(extra.gyms),
    wayspots,
    regions: regionsFixture(),
    log: createTestLogger().log,
  });
  await finder.built();
  return { finder, storage, wayspots };
}

describe('PlaceFinder', () => {
  it('makes a pin in the server’s regions, named by the nearest place within 50 metres', async () => {
    const { finder } = await finderWith();
    // The power spot by the library is nearer than the library itself (gym 1, 40.05, -80.05).
    expect(finder.pin(1, { lat: 40.0503, lon: -80.0503 }, null)).toEqual({
      kind: 'pin',
      lat: 40.0503,
      lon: -80.0503,
      near: { kind: 'powerspot', title: 'Library Garden' },
      linkName: null,
    });
    // On the other side the gym is nearer, named as its post names it (its nickname).
    expect(finder.pin(1, { lat: 40.0499, lon: -80.0499 }, 'Blue Tent')).toEqual({
      kind: 'pin',
      lat: 40.0499,
      lon: -80.0499,
      near: { kind: 'gym', title: 'The Stacks' },
      linkName: 'Blue Tent',
    });
    // Nothing within 50 metres: no name of a place.
    expect(finder.pin(1, { lat: 40.03, lon: -80.09 }, null)?.near).toBeNull();
    // Outside every region of the server: no pin.
    expect(finder.pin(1, { lat: 41, lon: -81 }, null)).toBeUndefined();
    expect(finder.pin(1, NORTH_PLACE, null)).toBeUndefined();
    expect(finder.pin(2, { lat: 40.0503, lon: -80.0503 }, null)).toBeUndefined();
  });

  it('offers no Wayspot without a title, neither by its street nor by its value', async () => {
    const { finder } = await finderWith({
      rows: [
        keptRow(8, {
          title: '  ',
          lat: 40.052,
          lon: -80.052,
          address: '16 Maple Avenue, Pinewood, PA 15999, USA',
        }),
      ],
    });
    expect(finder.find(1, WEST_CHANNEL, 'maple avenue').map((one) => one.id)).not.toContain(
      wayspotId(8),
    );
    expect(finder.chosen(1, `stop:${wayspotId(8)}`)).toBeUndefined();
  });

  it('names a pin by no Wayspot outside the server’s regions, nor one without a title', async () => {
    const { finder } = await finderWith({
      rows: [
        // Just across West's northern edge (40.10), some 33 metres from the pin.
        keptRow(6, { title: 'Beyond the Border', lat: 40.1002, lon: -80.05 }),
        // Nearer still, in the region, but called nothing.
        keptRow(7, { title: '', lat: 40.0999, lon: -80.0501 }),
      ],
    });
    expect(finder.pin(1, { lat: 40.0999, lon: -80.05 }, null)?.near).toBeNull();
  });

  it('merges gyms, stops and Power Spots by fit, the member’s region first, then the kind', async () => {
    const { finder } = await finderWith();
    const found = finder.find(1, WEST_CHANNEL, 'fountain');
    expect(found.map((one) => [one.title, one.kind, one.fit, one.local])).toEqual([
      ['Fountain', 'stop', 'exact', true],
      ['Old Stone Fountain', 'gym', 'word', true],
      ['Fountain Square', 'stop', 'word', false],
    ]);
    // From East its own stop comes first among the words.
    expect(finder.find(1, EAST_CHANNEL, 'fountain').map((one) => one.title)).toEqual([
      'Fountain',
      'Fountain Square',
      'Old Stone Fountain',
    ]);
  });

  it('offers the libraries for libary beside the stop of that title, and Vicary House after them', async () => {
    const { finder } = await finderWith({
      gyms: [testGym(41, 'Vicary House', 40.055, -80.055)],
      rows: [
        keptRow(11, { title: 'Little Free Libary', lat: 40.052, lon: -80.052 }),
        keptRow(12, { title: 'Little Free Library on Elm', lat: 40.053, lon: -80.053 }),
        keptRow(13, { title: 'Little Free Library on Oak', lat: 40.054, lon: -80.054 }),
        keptRow(14, { title: 'Little Free Library on Ash', lat: 40.0545, lon: -80.0545 }),
      ],
    });
    const found = finder.find(1, WEST_CHANNEL, 'libary').map((one) => [one.title, one.fit]);
    expect(found[0]).toEqual(['Little Free Libary', 'word']);
    expect(found.at(-1)).toEqual(['Vicary House', 'guess']);
    expect(found.slice(1, -1).map(([title]) => title)).toEqual([
      'Pinewood Public Library',
      ...['Little Free Library on Ash', 'Little Free Library on Elm', 'Little Free Library on Oak'],
      'Library Garden',
    ]);
  });

  it('offers the nearer of places that fit alike first, near the anchors given (Matt, 2026-10-27)', async () => {
    const { finder } = await finderWith({
      rows: [
        keptRow(11, { title: 'Little Free Libary', lat: 40.052, lon: -80.052 }),
        keptRow(12, { title: 'Little Free Library on Elm', lat: 40.053, lon: -80.053 }),
        keptRow(13, { title: 'Little Free Library on Oak', lat: 40.054, lon: -80.054 }),
        keptRow(14, { title: 'Little Free Library on Ash', lat: 40.0545, lon: -80.0545 }),
        keptRow(15, { title: 'Bench North', lat: 40.09, lon: -80.09 }),
        keptRow(16, { title: 'Bench South', lat: 40.01, lon: -80.01 }),
      ],
    });
    const titles = (text: string, anchors?: { lat: number; lon: number }[]) =>
      finder.find(1, WEST_CHANNEL, text, ['stop'], anchors && { anchors }).map((one) => one.title);
    // Words as good alike: the nearer to the anchor first (Reading Bench lies between them).
    expect(titles('bench', [{ lat: 40.011, lon: -80.011 }])).toEqual([
      'Bench South',
      'Reading Bench',
      'Bench North',
    ]);
    expect(
      titles('bench', [
        { lat: 40.011, lon: -80.011 },
        { lat: 40.089, lon: -80.089 },
      ])[0],
    ).toBe('Bench North');
    // Guesses as plausible alike: by distance, not by title.
    expect(titles('libary', [{ lat: 40.054, lon: -80.054 }]).slice(1)).toEqual([
      'Little Free Library on Oak',
      'Little Free Library on Ash',
      'Little Free Library on Elm',
    ]);
    // No anchor: as before, by title.
    expect(titles('libary', [])).toEqual(titles('libary'));
    expect(titles('libary').slice(1)).toEqual([
      'Little Free Library on Ash',
      'Little Free Library on Elm',
      'Little Free Library on Oak',
    ]);
  });

  it('lists the places nearest the anchors, nearest first, within a radius, some left out', async () => {
    const { finder } = await finderWith();
    const fountain = { lat: 40.0601, lon: -80.0601 };
    // The server's PokéStops within 2 km: not the Power Spot, not East's Fountain Square.
    const stops = finder.nearest(1, ['stop'], [fountain], { within: 2_000 });
    expect(stops.map(({ choice }) => choice.title)).toEqual(['Fountain', 'Reading Bench']);
    expect(stops[1]?.choice.where).toBe('Maple Avenue');
    expect(stops[1]?.metres).toBeGreaterThan(1_000);
    expect(
      finder
        .nearest(1, ['stop'], [fountain], {
          within: 2_000,
          except: new Set([`stop:${wayspotId(1)}`]),
        })
        .map(({ choice }) => choice.title),
    ).toEqual(['Reading Bench']);
    // Gyms and Power Spots without a radius, as many as asked; another server's none.
    const lighthouse = { lat: 40.05, lon: -79.99 };
    const near = finder.nearest(1, ['gym', 'powerspot'], [lighthouse], {
      count: 3,
      except: new Set(['gym:7']),
    });
    expect(near.map(({ choice }) => placeValue(choice))).toEqual(['gym:4', 'gym:6', 'gym:12']);
    expect(finder.nearest(2, ['gym'], [lighthouse], {})).toEqual([]);
    // No anchor: nothing.
    expect(finder.nearest(1, ['stop'], [], {})).toEqual([]);
  });

  it('makes choices of the places it keeps only, not of every place of the server', async () => {
    // A choice reads a gym's geodata and a Wayspot's address (its street, its address line): a
    // city's thousands of places read for every list would hold up the bot.
    const read = new Set<string>();
    const watched = <T extends object>(item: T, key: keyof T & string, value: string): T =>
      new Proxy(item, {
        get(target, name, receiver) {
          if (name === key) read.add(value);
          return Reflect.get(target, name, receiver) as unknown;
        },
      });
    const gyms = gymsFixture();
    const { wayspots } = await wayspotsWith([
      keptRow(1, { title: 'Fountain', lat: 40.0601, lon: -80.0601, address: null }),
      keptRow(2, { title: 'Library Garden', kind: 'powerspot', lat: 40.0502, lon: -80.0502 }),
      keptRow(3, { title: 'Reading Bench', lat: 40.051, lon: -80.051 }),
    ]);
    const finder = new PlaceFinder({
      gyms: {
        search: (...args) => gyms.search(...args),
        get: (id) => gyms.get(id),
        regionsOf: (id) => gyms.regionsOf(id),
        inRegion: (channelId) =>
          gyms.inRegion(channelId).map((gym) => watched(gym, 'geodata', `gym:${gym.id}`)),
      },
      wayspots: new Proxy(wayspots, {
        get(target, name) {
          if (name === 'inRegion') {
            return (channelId: string) =>
              target
                .inRegion(channelId)
                .map((one) => watched(one, 'address', `${one.kind}:${one.id}`));
          }
          const value = Reflect.get(target, name, target) as unknown;
          return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
        },
      }),
      regions: regionsFixture(),
      log: createTestLogger().log,
    });
    await finder.built();
    const lighthouse = { lat: 40.05, lon: -79.99 };
    const near = finder.nearest(1, ['gym', 'powerspot'], [lighthouse], {
      count: 2,
      except: new Set(['gym:7']),
    });
    expect(near.map(({ choice }) => placeValue(choice))).toEqual(['gym:4', 'gym:6']);
    expect([...read].sort()).toEqual(['gym:4', 'gym:6']);
    read.clear();
    const stops = finder.nearest(1, ['stop'], [{ lat: 40.0601, lon: -80.0601 }], {
      within: 2_000,
      except: new Set([`stop:${wayspotId(1)}`]),
    });
    expect(stops.map(({ choice }) => choice.title)).toEqual(['Reading Bench']);
    expect([...read]).toEqual([`stop:${wayspotId(3)}`]);
  });

  it('offers only what lies in a region of the server', async () => {
    const { finder } = await finderWith();
    // The stop far outside every region is no hit, not even of every word.
    expect(finder.find(1, undefined, 'fountain far away').map((one) => one.title)).not.toContain(
      'Fountain Far Away',
    );
    expect(finder.find(1, undefined, 'fountain far away').every((one) => one.fit === 'guess')).toBe(
      true,
    );
    // Gym 10, the Lakeview Trailhead, lies in no region.
    expect(finder.find(1, undefined, 'lakeview trailhead')).toEqual([]);
    expect(finder.find(2, undefined, 'fountain')).toEqual([]);
    expect(finder.chosen(1, `stop:${wayspotId(5)}`)).toBeUndefined();
  });

  it('guesses among the server’s gyms though a gym elsewhere has every word', async () => {
    // A gym in no region of this server whose name holds both words.
    const elsewhere = testGym(40, 'Northgate Fountain', NORTH_PLACE.lat, NORTH_PLACE.lon);
    const { finder } = await finderWith({ gyms: [elsewhere] });
    const found = finder.find(1, WEST_CHANNEL, 'northgate fountain');
    expect(found.map((one) => one.title)).not.toContain('Northgate Fountain');
    expect(found.filter((one) => one.kind === 'gym').map((one) => [one.title, one.fit])).toEqual([
      ['Old Stone Fountain', 'guess'],
    ]);
  });

  it('says where each choice is: the street, else the server’s gym nearest to it', async () => {
    const { finder } = await finderWith({
      rows: [
        // More than a kilometre from every gym, without an address.
        keptRow(6, { title: 'Lonely Bench', lat: 40.095, lon: -80.02, address: null }),
      ],
    });
    const [bench] = finder.find(1, WEST_CHANNEL, 'reading bench');
    expect(bench).toMatchObject({ kind: 'stop', where: 'Maple Avenue' });
    const [fountain] = finder.find(1, WEST_CHANNEL, 'fountain');
    expect(fountain).toMatchObject({ where: 'near Old Stone Fountain' });
    const gym = finder.find(1, WEST_CHANNEL, 'old stone fountain')[0];
    expect(gym).toMatchObject({ kind: 'gym', id: '2', where: 'Market Street' });
    // No gym within a kilometre: it says nothing of where it is.
    const [lonely] = finder.find(1, WEST_CHANNEL, 'lonely bench');
    expect(lonely).toMatchObject({ title: 'Lonely Bench', where: undefined });
  });

  it('names no gym of another server as the one a Wayspot is near', async () => {
    // A stop just inside West's northern edge, a gym in no region 30 metres from it across the
    // edge; the server's gyms are kilometres away.
    const nearby = testGym(40, 'Border Kiosk', 40.1002, -80.05);
    const { finder } = await finderWith({
      gyms: [nearby],
      rows: [keptRow(6, { title: 'Rim Bench', lat: 40.0999, lon: -80.05, address: null })],
    });
    const [bench] = finder.find(1, WEST_CHANNEL, 'rim bench');
    expect(bench).toMatchObject({ title: 'Rim Bench', where: undefined });
  });

  it('finds a choice by its value again, and a clear hit of typed text', async () => {
    const { finder } = await finderWith();
    const [garden] = finder.find(1, WEST_CHANNEL, 'library garden');
    expect(placeValue(garden!)).toBe(`powerspot:${wayspotId(2)}`);
    expect(finder.chosen(1, placeValue(garden!))).toMatchObject({ title: 'Library Garden' });
    expect(finder.chosen(1, 'gym:2')).toMatchObject({ title: 'Old Stone Fountain' });
    expect(finder.chosen(1, 'gym:10')).toBeUndefined();
    expect(readPlaceValue('stop:abc')).toEqual({ kind: 'stop', id: 'abc' });
    expect(readPlaceValue('library garden')).toBeUndefined();
    expect(clearOf(finder.find(1, WEST_CHANNEL, 'library garden'))?.title).toBe('Library Garden');
    // Of three hits that hold the word, one names it outright: no clear hit.
    expect(clearOf(finder.find(1, WEST_CHANNEL, 'fountain'))).toBeUndefined();
    expect(clearOf(finder.find(1, WEST_CHANNEL, 'stone'))?.title).toBe('Old Stone Fountain');
    expect(clearOf(finder.find(1, WEST_CHANNEL, 'garde'))).toBeUndefined();
  });

  it('offers no Wayspot that became a gym, at once and without building anew', async () => {
    const { log, entries } = createTestLogger();
    const { wayspots } = await wayspotsWith([
      keptRow(1, { title: 'Fountain', lat: 40.0601, lon: -80.0601, address: null }),
      keptRow(2, { title: 'Library Garden', kind: 'powerspot', lat: 40.0502, lon: -80.0502 }),
    ]);
    const finder = new PlaceFinder({
      gyms: gymsFixture(),
      wayspots,
      regions: regionsFixture(),
      log,
    });
    await finder.built();
    const builds = () =>
      entries.filter((entry) => entry.msg === 'the search of the Wayspots was built').length;
    expect(builds()).toBe(1);
    const fountain = finder.find(1, WEST_CHANNEL, 'fountain').find((one) => one.kind === 'stop');
    expect(fountain?.title).toBe('Fountain');

    wayspots.forget([wayspotId(1), wayspotId(2)]);
    expect(finder.find(1, WEST_CHANNEL, 'fountain').map((one) => one.kind)).toEqual(['gym']);
    expect(finder.find(1, WEST_CHANNEL, 'library garden').map((one) => one.kind)).toEqual(['gym']);
    expect(finder.chosen(1, placeValue(fountain!))).toBeUndefined();
    await finder.built();
    expect(builds()).toBe(1);
  });

  it('finds a stop by the places Google gave around it, once the places tell of them', async () => {
    const { wayspots } = await wayspotsWith([
      keptRow(1, { title: 'Fountain', lat: 40.0601, lon: -80.0601, address: null }),
    ]);
    const storage = new MemoryWayspotLookups();
    const places = new WayspotPlaces({ storage, log: createTestLogger().log });
    const finder = new PlaceFinder({
      gyms: gymsFixture(),
      wayspots,
      places,
      regions: regionsFixture(),
      log: createTestLogger().log,
    });
    await finder.built();
    const stops = () =>
      finder
        .find(1, WEST_CHANNEL, 'zeppelin bakery')
        .filter((one) => one.kind === 'stop')
        .map((one) => one.title);
    expect(stops()).toEqual([]);
    await places.save({
      wayspotId: wayspotId(1),
      kind: 'stop',
      lat: 40.0601,
      lon: -80.0601,
      places: 'Zeppelin Bakery',
      askedAt: 1,
    });
    await finder.built();
    expect(stops()).toEqual(['Fountain']);
  });

  it('builds the indexes of stops and Power Spots after each load, not while it searches', async () => {
    const { storage, wayspots } = await wayspotsWith([
      keptRow(1, { title: 'Fountain', lat: 40.0601, lon: -80.0601, address: null }),
    ]);
    const finder = new PlaceFinder({
      gyms: gymsFixture(),
      wayspots,
      regions: regionsFixture(),
      log: createTestLogger().log,
    });
    // Before the first build: the gyms alone.
    expect(finder.find(1, WEST_CHANNEL, 'fountain').map((one) => one.kind)).toEqual(['gym']);
    await finder.built();
    expect(finder.find(1, WEST_CHANNEL, 'fountain').map((one) => one.kind)).toEqual([
      'stop',
      'gym',
    ]);

    await storage.saveFromImport(
      {
        upsert: [keptRow(2, { title: 'Fountain Steps', lat: 40.0602, lon: -80.0602 })],
        remove: [],
      },
      2_000,
    );
    await wayspots.load();
    // Until the build after the load, what was built.
    expect(finder.find(1, WEST_CHANNEL, 'fountain')).toHaveLength(2);
    await finder.built();
    expect(finder.find(1, WEST_CHANNEL, 'fountain').map((one) => one.title)).toEqual([
      'Fountain',
      'Old Stone Fountain',
      'Fountain Steps',
    ]);
  });
});
