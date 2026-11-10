import { mkdtemp, readdir, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bytesResponse } from '../../test/support/responses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { ImageCache, type FetchImage } from './image-cache.js';
import {
  EmojiPictures,
  PLACE_PICTURE_KEEP_MS,
  PlacePictures,
  pictureType,
  prunePlacePictures,
} from './post-pictures.js';
import { StaticMaps } from './static-maps.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
const SERVED = '111111111111111111';
const WAYSPOT = '0123456789abcdef0123456789abcdef.16';

/** An image cache in a folder of its own over a fetch that answers these bytes, and its calls. */
async function cacheOf(bytes: Uint8Array, type: string) {
  const asked: string[] = [];
  const fetch: FetchImage = (url) => {
    asked.push(url);
    return Promise.resolve({
      ...bytesResponse(bytes, { headers: { 'content-type': type } }),
      ok: true,
    });
  };
  const dir = await mkdtemp(path.join(tmpdir(), 'pine-post-pictures-'));
  return { cache: new ImageCache({ dir, fetch, log: createTestLogger().log }), asked, dir };
}

describe('pictureType', () => {
  it('knows a PNG, a JPEG, a GIF and a WebP by their first bytes, and nothing else', () => {
    expect(pictureType(Buffer.from(PNG))).toBe('image/png');
    expect(pictureType(Buffer.from(JPEG))).toBe('image/jpeg');
    expect(pictureType(Buffer.from('GIF89a…'))).toBe('image/gif');
    expect(pictureType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(pictureType(Buffer.from('<svg onload=…>'))).toBeUndefined();
  });
});

describe('EmojiPictures (plan 8M-8A)', () => {
  it('serves the application’s emoji alone, each fetched from Discord’s CDN once', async () => {
    const { cache, asked } = await cacheOf(PNG, 'image/png');
    const pictures = new EmojiPictures({ emoji: { hasId: (id) => id === SERVED }, cache });
    expect(pictures.address(SERVED)).toBe(`/emoji/${SERVED}.png`);
    expect(pictures.address('222222222222222222')).toBeUndefined();
    expect(await pictures.read('222222222222222222')).toBeUndefined();
    expect(asked).toEqual([]);
    const first = await pictures.read(SERVED);
    expect(first).toEqual({ bytes: Buffer.from(PNG), type: 'image/png' });
    expect(await pictures.read(SERVED)).toEqual(first);
    expect(asked).toEqual([`https://cdn.discordapp.com/emojis/${SERVED}.png?size=96`]);
  });

  it('serves nothing that is not a picture', async () => {
    const { cache } = await cacheOf(new TextEncoder().encode('<html>'), 'image/png');
    const pictures = new EmojiPictures({ emoji: { hasId: () => true }, cache });
    expect(await pictures.read(SERVED)).toBeUndefined();
  });

  describe('its pictures in memory (plan 8Z-2)', () => {
    /** Emoji pictures over a cache and a file reader that count what they were asked for. */
    const counted = (options: { memoryBytes?: number } = {}) => {
      const fetched: string[] = [];
      const files: string[] = [];
      const clock = { now: 1_000_000 };
      const pictures = new EmojiPictures({
        emoji: { hasId: (id) => id !== '222222222222222222' },
        cache: {
          get: (request) => {
            fetched.push(request.id);
            return Promise.resolve(request.id.startsWith('9') ? undefined : `file-${request.id}`);
          },
        },
        read: (file) => {
          files.push(file);
          return Promise.resolve(Buffer.from(PNG));
        },
        now: () => clock.now,
        ...options,
      });
      return { pictures, fetched, files, clock };
    };
    /** A gate that says `allowed`, counting how often it was asked. */
    const gate = (allowed: boolean) => {
      const asked = { times: 0 };
      const mayCost = () => {
        asked.times += 1;
        return allowed;
      };
      return { asked, mayCost };
    };

    it('reads a picture once, and answers it from memory after, the gate not asked', async () => {
      const { pictures, fetched, files } = counted();
      const open = gate(true);
      const first = await pictures.read(SERVED, open.mayCost);
      expect(first).toEqual({ bytes: Buffer.from(PNG), type: 'image/png' });
      expect(open.asked.times).toBe(1);
      const shut = gate(false);
      expect(await pictures.read(SERVED, shut.mayCost)).toEqual(first);
      expect(await pictures.read(SERVED)).toEqual(first);
      expect(shut.asked.times).toBe(0);
      expect([fetched, files]).toEqual([[SERVED], [`file-${SERVED}`]]);
    });

    it('reads a picture asked for by many at once once, the gate asked once (F-B3)', async () => {
      const { pictures, fetched, files } = counted();
      const open = gate(true);
      const answers = await Promise.all(
        Array.from({ length: 300 }, () => pictures.read(SERVED, open.mayCost)),
      );
      expect(open.asked.times).toBe(1);
      expect([fetched, files]).toEqual([[SERVED], [`file-${SERVED}`]]);
      expect(answers.every((answer) => answer === answers[0])).toBe(true);
    });

    it('forgets a read on its way once it failed: the next one reads again (F-B3)', async () => {
      let reads = 0;
      const pictures = new EmojiPictures({
        emoji: { hasId: () => true },
        cache: { get: (request) => Promise.resolve(`file-${request.id}`) },
        read: () => {
          reads += 1;
          return reads === 1
            ? Promise.reject(new Error('disk'))
            : Promise.resolve(Buffer.from(PNG));
        },
      });
      const together = await Promise.all([1, 2].map(() => pictures.read(SERVED)));
      expect(together).toEqual([undefined, undefined]);
      expect(reads).toBe(1);
      expect(await pictures.read(SERVED)).toMatchObject({ type: 'image/png' });
      expect(reads).toBe(2);
    });

    it('does no work where the gate refuses, and asks it of no emoji that is not the application’s', async () => {
      const { pictures, fetched, files } = counted();
      const shut = gate(false);
      expect(await pictures.read('222222222222222222', shut.mayCost)).toBeUndefined();
      expect(await pictures.read('not-an-id', shut.mayCost)).toBeUndefined();
      expect(shut.asked.times).toBe(0);
      expect(await pictures.read(SERVED, shut.mayCost)).toBe('refused');
      expect(shut.asked.times).toBe(1);
      expect([fetched, files]).toEqual([[], []]);
      // Refused is not kept: the next one allowed reads it.
      expect(await pictures.read(SERVED, gate(true).mayCost)).toMatchObject({ type: 'image/png' });
    });

    it('answers a picture that could not be had lately from memory too, the gate not asked', async () => {
      const { pictures, fetched, clock } = counted();
      const FAILING = '911111111111111111';
      expect(await pictures.read(FAILING)).toBeUndefined();
      const shut = gate(false);
      clock.now += 59_000;
      expect(await pictures.read(FAILING, shut.mayCost)).toBeUndefined();
      expect(shut.asked.times).toBe(0);
      // A minute on it is tried again, which costs.
      clock.now += 2_000;
      expect(await pictures.read(FAILING, shut.mayCost)).toBe('refused');
      expect(fetched).toEqual([FAILING]);
    });

    it('keeps at most so many bytes, the oldest read first out', async () => {
      const { pictures, files } = counted({ memoryBytes: PNG.length * 2 });
      const ids = ['111111111111111111', '111111111111111112', '111111111111111113'];
      for (const id of ids) await pictures.read(id);
      // The third pushed the first out: it is read again, the third is not.
      await pictures.read(ids[2] ?? '');
      expect(files).toHaveLength(3);
      await pictures.read(ids[0] ?? '');
      expect(files).toHaveLength(4);
    });
  });
});

describe('a picture that could not be had (review 8A-6)', () => {
  /** A cache whose every download fails, counting what it was asked for. */
  const failing = () => {
    const asked: string[] = [];
    const cache = {
      get: (request: { url: string }) => {
        asked.push(request.url);
        return Promise.resolve(undefined);
      },
    };
    return { cache, asked };
  };

  it('is not asked for again for a minute, the emoji’s or a place’s', async () => {
    const clock = { now: 1_000_000 };
    const emojiCache = failing();
    const emoji = new EmojiPictures({
      emoji: { hasId: () => true },
      cache: emojiCache.cache,
      now: () => clock.now,
    });
    const placeCache = failing();
    const places = new PlacePictures({
      gyms: {
        generation: 1,
        all: () => [],
        get: () => ({ imageUrl: 'https://lh3.googleusercontent.com/g' }),
      },
      cache: placeCache.cache,
      now: () => clock.now,
    });
    expect(await emoji.read(SERVED)).toBeUndefined();
    expect(await places.read('gym', '1')).toBeUndefined();
    clock.now += 59_000;
    expect(await emoji.read(SERVED)).toBeUndefined();
    expect(await places.read('gym', '1')).toBeUndefined();
    expect(emojiCache.asked).toHaveLength(1);
    expect(placeCache.asked).toHaveLength(1);
    clock.now += 2_000;
    await emoji.read(SERVED);
    await places.read('gym', '1');
    expect(emojiCache.asked).toHaveLength(2);
    expect(placeCache.asked).toHaveLength(2);
  });
});

describe('PlacePictures (plan 8M-8A)', () => {
  const gyms = {
    generation: 1,
    all: () => [
      { id: 12, imageUrl: 'http://lh3.googleusercontent.com/gym12=s1600' },
      { id: 13, imageUrl: null },
    ],
    get: (id: number) =>
      id === 12 ? { imageUrl: 'http://lh3.googleusercontent.com/gym12=s1600' } : undefined,
  };
  const wayspots = {
    contentGeneration: 1,
    all: () => [{ id: WAYSPOT, image: 'https://lh3.googleusercontent.com/stop' }],
    byId: (id: string) =>
      id === WAYSPOT ? { image: 'https://lh3.googleusercontent.com/stop' } : undefined,
  };

  it('names a picture a post shows by its gym or Wayspot, never by its address', async () => {
    const { cache } = await cacheOf(JPEG, 'image/jpeg');
    const places = new PlacePictures({ gyms, wayspots, cache });
    expect(places.keyOf('https://lh3.googleusercontent.com/gym12=s400')).toBe('gym/12');
    expect(places.keyOf('https://lh3.googleusercontent.com/stop=s400')).toBe(`wayspot/${WAYSPOT}`);
    expect(places.keyOf('https://lh3.googleusercontent.com/other=s400')).toBeUndefined();
    expect(places.urlOf('gym', '12')).toBe('https://lh3.googleusercontent.com/gym12=s400');
    expect(places.urlOf('gym', '13')).toBeUndefined();
    expect(places.urlOf('wayspot', WAYSPOT)).toBe('https://lh3.googleusercontent.com/stop=s400');
    expect(places.urlOf('wayspot', 'nope')).toBeUndefined();
  });

  it('finds an address on a miss and keeps it, never indexing every place anew (review W-2)', async () => {
    const { cache } = await cacheOf(JPEG, 'image/jpeg');
    const pictures = new Map<number, string>([[12, 'https://lh3.googleusercontent.com/gym12']]);
    let scans = 0;
    const changing = {
      generation: 1,
      all: () => {
        scans += 1;
        return [...pictures].map(([id, imageUrl]) => ({ id, imageUrl }));
      },
      get: (id: number) => {
        const imageUrl = pictures.get(id);
        return imageUrl === undefined ? undefined : { imageUrl };
      },
    };
    const places = new PlacePictures({ gyms: changing, cache });
    expect(places.keyOf('https://lh3.googleusercontent.com/gym12=s400')).toBe('gym/12');
    expect(scans).toBe(1);
    // Another gym changes (the Google line refreshes one after each answer): a known address is
    // answered without looking at every gym again.
    pictures.set(14, 'https://lh3.googleusercontent.com/gym14');
    changing.generation += 1;
    expect(places.keyOf('https://lh3.googleusercontent.com/gym12=s400')).toBe('gym/12');
    expect(scans).toBe(1);
    // A new address is a miss, found once.
    expect(places.keyOf('https://lh3.googleusercontent.com/gym14=s400')).toBe('gym/14');
    expect(places.keyOf('https://lh3.googleusercontent.com/gym14=s400')).toBe('gym/14');
    expect(scans).toBe(2);
    // A gym's picture that changed is no longer its key.
    pictures.set(12, 'https://lh3.googleusercontent.com/gym12b');
    changing.generation += 1;
    expect(places.keyOf('https://lh3.googleusercontent.com/gym12=s400')).toBeUndefined();
    expect(places.keyOf('https://lh3.googleusercontent.com/gym12b=s400')).toBe('gym/12');
  });

  it('fetches a place’s picture once through the image cache', async () => {
    const { cache, asked } = await cacheOf(JPEG, 'image/jpeg');
    const places = new PlacePictures({ gyms, wayspots, cache });
    expect(await places.read('wayspot', WAYSPOT)).toEqual({
      bytes: Buffer.from(JPEG),
      type: 'image/jpeg',
    });
    expect(await places.read('wayspot', WAYSPOT)).toBeDefined();
    expect(await places.read('gym', '13')).toBeUndefined();
    expect(asked).toEqual(['https://lh3.googleusercontent.com/stop=s400']);
  });

  it('keeps its pictures out of the daily pruning of the maps of places (review W-1)', async () => {
    const { cache, asked, dir } = await cacheOf(JPEG, 'image/jpeg');
    const places = new PlacePictures({ gyms, wayspots, cache });
    await places.read('gym', '12');
    const dayAgo = (Date.now() - 86_400_000 - 60_000) / 1000;
    for (const folder of await readdir(dir)) {
      for (const file of await readdir(path.join(dir, folder))) {
        await utimes(path.join(dir, folder, file), dayAgo, dayAgo);
      }
    }
    expect(await new StaticMaps(undefined, cache).prunePlaces()).toBe(0);
    expect(await places.read('gym', '12')).toBeDefined();
    expect(asked).toEqual(['https://lh3.googleusercontent.com/gym12=s400']);
  });

  // Plan 8Z-2: nothing bounded the folder; a gym or Wayspot that is gone left its picture for good.
  it('has the pictures nobody asked for in a month removed, and no others', async () => {
    const { cache, asked, dir } = await cacheOf(JPEG, 'image/jpeg');
    const places = new PlacePictures({ gyms, wayspots, cache });
    const emoji = new EmojiPictures({ emoji: { hasId: () => true }, cache });
    await places.read('gym', '12');
    await places.read('wayspot', WAYSPOT);
    await emoji.read(SERVED);
    const longAgo = (Date.now() - PLACE_PICTURE_KEEP_MS - 60_000) / 1000;
    for (const folder of await readdir(dir)) {
      for (const file of await readdir(path.join(dir, folder))) {
        await utimes(path.join(dir, folder, file), longAgo, longAgo);
      }
    }
    // The gym's is asked for again: its month starts anew.
    await places.read('gym', '12');

    expect(await prunePlacePictures(cache)).toBe(1);
    expect(await readdir(path.join(dir, 'place-pictures'))).toEqual([
      expect.stringMatching(/^gym-12\./),
    ]);
    // An emoji's picture is not a place's.
    expect(await readdir(path.join(dir, 'emoji'))).toHaveLength(1);
    // The Wayspot's is fetched again when a post shows it.
    expect(await places.read('wayspot', WAYSPOT)).toBeDefined();
    expect(
      asked.filter((url) => url === 'https://lh3.googleusercontent.com/stop=s400'),
    ).toHaveLength(2);
  });
});
