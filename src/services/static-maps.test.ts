import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WEST_CHANNEL, testRegions } from '../../test/support/gyms.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { ImageCache, type ImageResponse } from './image-cache.js';
import { mapOrNothing, StaticMaps } from './static-maps.js';
import { mapPicture } from '../render/v2.js';

let dir: string;
let urls: string[];
let headers: Record<string, string>;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pine-maps-'));
  urls = [];
  headers = { 'content-type': 'image/png' };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function maps(apiKey: string | undefined) {
  const { log, entries } = createTestLogger();
  const cache = new ImageCache({
    dir,
    log,
    fetch: (url) => {
      urls.push(url);
      const answer: ImageResponse = {
        ok: true,
        status: 200,
        headers: { get: (name) => headers[name.toLowerCase()] ?? null },
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode('png').buffer),
      };
      return Promise.resolve(answer);
    },
  });
  return { maps: new StaticMaps(apiKey, cache), entries };
}

const west = () => {
  const region = testRegions().find((candidate) => candidate.channelId === WEST_CHANNEL);
  if (!region) throw new Error('The fixture has no west region');
  return region;
};

describe('StaticMaps', () => {
  it('downloads the map of a gym with the key and keeps it', async () => {
    const { maps: service } = maps('test key/1');
    expect(service.enabled).toBe(true);
    const file = await service.gym({ id: 12, lat: 40.05, lon: -80.05 });
    expect(path.dirname(file ?? '')).toBe(path.resolve(dir, 'gyms'));
    expect(path.basename(file ?? '')).toMatch(/^12\.[0-9a-f]{12}\.png$/);
    expect(urls).toHaveLength(1);
    const url = new URL(urls[0] ?? '');
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/staticmap');
    expect(url.searchParams.get('key')).toBe('test key/1');
    expect(url.searchParams.get('markers')).toBe('size:small|color:red|40.05,-80.05');

    expect(await service.gym({ id: 12, lat: 40.05, lon: -80.05 })).toBe(file);
    expect(urls).toHaveLength(1);
  });

  it('downloads a new map when the gym has moved', async () => {
    const { maps: service } = maps('k');
    const before = await service.gym({ id: 12, lat: 40.05, lon: -80.05 });
    const after = await service.gym({ id: 12, lat: 40.06, lon: -80.05 });
    expect(after).not.toBe(before);
    expect(urls).toHaveLength(2);
  });

  it('downloads the map of a region and keeps it under the region’s id', async () => {
    const { maps: service } = maps('k');
    const file = await service.region(west());
    expect(path.dirname(file ?? '')).toBe(path.resolve(dir, 'regions'));
    expect(path.basename(file ?? '')).toMatch(/^1\.[0-9a-f]{12}\.png$/);
    expect(new URL(urls[0] ?? '').searchParams.get('path')).toMatch(/^fillcolor:0xAA000033\|/);
  });

  it('downloads the map of a place named by what it shows, one file per place', async () => {
    const { maps: service } = maps('k');
    const outline = west().bounds ?? [];
    const point = { kind: 'point', point: { lat: 40.05, lon: -80.05 } } as const;
    const first = await service.place(point, [outline]);
    expect(path.dirname(first ?? '')).toBe(path.resolve(dir, 'places'));
    expect(path.basename(first ?? '')).toMatch(/^[0-9a-f]{16}\.[0-9a-f]{12}\.png$/);
    const query = new URL(urls[0] ?? '').searchParams;
    expect(query.get('markers')).toBe('size:small|color:red|40.05,-80.05');
    expect(query.get('path')).toMatch(/^color:0x1E50D0\|/);
    expect(query.get('key')).toBe('k');
    const second = await service.place({ ...point, point: { lat: 40.06, lon: -80.05 } }, []);
    expect(second).not.toBe(first);
    expect(await service.place(point, [outline])).toBe(first);
    expect(urls).toHaveLength(2);
    expect(await service.clear()).toBe(2);
  });

  it('downloads nothing for a place it cannot draw', async () => {
    const { maps: service } = maps('k');
    expect(await service.place({ kind: 'area', areas: [] }, [])).toBeUndefined();
    expect(urls).toEqual([]);
  });

  it('deletes the pictures of places older than a day, and only those', async () => {
    const { maps: service } = maps('k');
    const point = { kind: 'point', point: { lat: 40.05, lon: -80.05 } } as const;
    const old = await service.place(point, []);
    const fresh = await service.place({ ...point, point: { lat: 40.06, lon: -80.05 } }, []);
    const gym = await service.gym({ id: 12, lat: 40.05, lon: -80.05 });
    const dayAgo = (Date.now() - 86_400_000 - 60_000) / 1000;
    for (const file of [old, gym]) await utimes(file ?? '', dayAgo, dayAgo);
    expect(await service.prunePlaces()).toBe(1);
    // A place asked for again is kept another day.
    await utimes(fresh ?? '', dayAgo, dayAgo);
    await service.place({ ...point, point: { lat: 40.06, lon: -80.05 } }, []);
    expect(await service.prunePlaces()).toBe(0);
    expect(await readdir(path.join(dir, 'places'))).toEqual([path.basename(fresh ?? '')]);
    expect(await readdir(path.join(dir, 'gyms'))).toHaveLength(1);
  });

  it('has no map for a region without an outline', async () => {
    const { maps: service } = maps('k');
    expect(await service.region({ id: 3, bounds: null })).toBeUndefined();
    expect(urls).toEqual([]);
  });

  it.each([[undefined], ['']])('has no maps without a key (%j)', async (apiKey) => {
    const { maps: service } = maps(apiKey);
    expect(service.enabled).toBe(false);
    expect(await service.gym({ id: 12, lat: 40.05, lon: -80.05 })).toBeUndefined();
    expect(await service.region(west())).toBeUndefined();
    // Nothing of a place is even looked at: its outlines are not simplified for nothing.
    const untouchable = {
      kind: 'line',
      get lines(): never {
        throw new Error('the place was drawn');
      },
    } as const;
    expect(await service.place(untouchable, [])).toBeUndefined();
    expect(urls).toEqual([]);
  });

  it('refuses the picture Google sends with a warning, and does not log the key', async () => {
    headers['x-staticmap-api-warning'] = 'Error geocoding: quota exceeded';
    const { maps: service, entries } = maps('SECRET-KEY');
    expect(await service.gym({ id: 12, lat: 40.05, lon: -80.05 })).toBeUndefined();
    expect(entries[0]?.reason).toBe('Google Static Maps warned: Error geocoding: quota exceeded');
    expect(JSON.stringify(entries)).not.toContain('SECRET-KEY');
  });

  it('deletes every picture it keeps and says how many, and downloads anew afterwards', async () => {
    const { maps: service } = maps('k');
    const gym = { id: 12, lat: 40.05, lon: -80.05 };
    await service.gym(gym);
    await service.gym({ id: 13, lat: 40.06, lon: -80.05 });
    await service.region(west());
    expect(await service.clear()).toBe(3);
    expect(await service.clear()).toBe(0);
    expect(urls).toHaveLength(3);
    await service.gym(gym);
    expect(urls).toHaveLength(4);
  });
});

describe('mapOrNothing and mapPicture', () => {
  it('gives the map as a gallery and its file, and nothing without one', async () => {
    const { log } = createTestLogger();
    const file = path.join('var', 'images', 'gyms', '1-abc.png');
    const map = mapPicture(await mapOrNothing(Promise.resolve(file), log, 'a gym'), 'Map');
    expect(map).toEqual({
      gallery: [
        {
          type: 12,
          items: [{ media: { url: 'attachment://1-abc.png' }, description: 'Map' }],
        },
      ],
      files: [file],
    });
    expect(mapPicture(undefined)).toEqual({ gallery: [], files: [] });
  });

  it('logs a map that failed and goes on without it', async () => {
    const { log, entries } = createTestLogger();
    const failed = Promise.reject(new Error('down'));
    expect(await mapOrNothing(failed, log, 'a gym', { gym: 7 })).toBeUndefined();
    expect(entries).toMatchObject([{ msg: 'could not get the map of a gym', gym: 7 }]);
  });
});
