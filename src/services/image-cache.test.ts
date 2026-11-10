import { mkdtemp, readFile, readdir, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bytesResponse } from '../../test/support/responses.js';
import { fakeTimeoutSignals } from '../../test/support/timers.js';
import { Tally } from '../../test/support/tally.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  ImageCache,
  type FetchImage,
  type ImageRequest,
  type ImageResponse,
} from './image-cache.js';

const SECRET_URL = 'https://maps.example/staticmap?size=1&key=SECRET-KEY';

/**
 * An answer of a server as the cache reads it: its body in pieces (`bytesResponse`: how much of
 * it was read, and whether the rest was let go of), a `content-length` only when given.
 */
function response(
  body: Uint8Array | string = 'png-bytes',
  init: { status?: number; headers?: Record<string, string> } = {},
): ImageResponse & { cancelled: () => boolean; readBytes: () => number } {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  const { 'content-length': length, ...headers } = {
    'content-type': 'image/png',
    ...init.headers,
  } as Record<string, string>;
  const status = init.status ?? 200;
  const answer = bytesResponse(bytes, {
    status,
    headers,
    ...(length === undefined ? {} : { contentLength: Number(length) }),
  });
  return Object.assign(answer, { ok: status >= 200 && status < 300 });
}

let dir: string;
let calls: string[];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pine-images-'));
  calls = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function cacheWith(answer: FetchImage, options: { timeoutMs?: number; maxBytes?: number } = {}) {
  const { log, entries } = createTestLogger();
  const fetch: FetchImage = (url, init) => {
    calls.push(url);
    return answer(url, init);
  };
  return { cache: new ImageCache({ dir, fetch, log, ...options }), entries };
}

const request = (more: Partial<ImageRequest> = {}): ImageRequest => ({
  folder: 'gyms',
  id: '12',
  variant: 'zoom=15&markers=1,2',
  url: SECRET_URL,
  ...more,
});

describe('ImageCache.get', () => {
  it('downloads a picture once and serves it from disk afterwards', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response('first')));
    const file = await cache.get(request());
    expect(file).toBeDefined();
    expect(path.dirname(file ?? '')).toBe(path.resolve(dir, 'gyms'));
    expect(path.basename(file ?? '')).toMatch(/^12\.[0-9a-f]{12}\.png$/);
    expect(await readFile(file ?? '', 'utf8')).toBe('first');
    expect(await cache.get(request())).toBe(file);
    expect(calls).toHaveLength(1);
  });

  it('serves a picture saved by an earlier run', async () => {
    const first = cacheWith(() => Promise.resolve(response()));
    const file = await first.cache.get(request());
    const second = cacheWith(() => Promise.reject(new Error('must not download')));
    expect(await second.cache.get(request())).toBe(file);
  });

  it('shares one download between requests made at the same time', async () => {
    let release: (value: ImageResponse) => void = () => undefined;
    const asked = new Tally('the downloads');
    const { cache } = cacheWith(
      () =>
        new Promise<ImageResponse>((resolve) => {
          release = resolve;
          asked.add();
        }),
    );
    const both = Promise.all([cache.get(request()), cache.get(request())]);
    await asked.reached(1);
    expect(calls).toHaveLength(1);
    release(response());
    const [a, b] = await both;
    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
  });

  it('downloads a new variant and deletes the old one, leaving other pictures alone', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    const other = await cache.get(request({ id: '120' }));
    const old = await cache.get(request());
    const moved = await cache.get(request({ variant: 'zoom=15&markers=3,4' }));
    expect(moved).not.toBe(old);
    expect((await readdir(path.join(dir, 'gyms'))).sort()).toEqual(
      [path.basename(other ?? ''), path.basename(moved ?? '')].sort(),
    );
  });

  it('keeps pictures of different folders apart', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    const gym = await cache.get(request());
    const region = await cache.get(request({ folder: 'regions' }));
    expect(path.dirname(region ?? '')).toBe(path.resolve(dir, 'regions'));
    expect(gym).not.toBe(region);
    expect(calls).toHaveLength(2);
  });

  it('replaces an empty file left by a crash', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response('good')));
    const file = (await cache.get(request())) ?? '';
    await writeFile(file, '');
    expect(await cache.get(request())).toBe(file);
    expect(await readFile(file, 'utf8')).toBe('good');
    expect(calls).toHaveLength(2);
  });

  it.each([
    ['a failed request', () => Promise.reject(new TypeError('fetch failed')), /fetch failed/],
    ['an error status', () => Promise.resolve(response('', { status: 403 })), /answered 403/],
    [
      'something that is not a picture',
      () => Promise.resolve(response('<html>', { headers: { 'content-type': 'text/html' } })),
      /text\/html, not a picture/,
    ],
    ['an empty picture', () => Promise.resolve(response('')), /empty/],
    [
      'a picture announced as too large',
      () => Promise.resolve(response('x', { headers: { 'content-length': '999999' } })),
      /too large/,
    ],
    [
      'a picture that turns out too large',
      () => Promise.resolve(response('x'.repeat(2000))),
      /too large/,
    ],
  ] as [string, FetchImage, RegExp][])(
    'answers undefined and saves nothing after %s',
    async (_what, answer, reason) => {
      const { cache, entries } = cacheWith(answer, { maxBytes: 1000 });
      expect(await cache.get(request())).toBeUndefined();
      expect(await readdir(dir)).toEqual([]);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ level: 40, folder: 'gyms', id: '12' });
      expect(String(entries[0]?.reason)).toMatch(reason);
    },
  );

  // Plan 8Z-2: a picture comes only from the address asked, and costs at most its limit.
  it('follows no redirect, and says plainly when the server sends one', async () => {
    const told: unknown[] = [];
    const { cache, entries } = cacheWith((_url, init) => {
      told.push((init as { redirect?: unknown }).redirect);
      // As `fetch` refuses a redirect it was told not to follow.
      return Promise.reject(
        new TypeError('fetch failed', { cause: new Error('unexpected redirect') }),
      );
    });
    expect(await cache.get(request())).toBeUndefined();
    expect(told).toEqual(['error']);
    expect(entries).toEqual([
      expect.objectContaining({
        level: 40,
        msg: 'could not download a picture',
        folder: 'gyms',
        id: '12',
        reason:
          'the server answered with a redirect, which is not followed: a picture is taken ' +
          'only from the address it was asked at',
      }),
    ]);
    expect(await readdir(dir)).toEqual([]);
  });

  it('gives a body up the moment it passes the limit, whatever was said of its length', async () => {
    // Four megabytes in pieces of 64 KB, and no content-length.
    const large = response(new Uint8Array(4_000_000));
    const { cache, entries } = cacheWith(() => Promise.resolve(large), { maxBytes: 1000 });
    expect(await cache.get(request())).toBeUndefined();
    expect(large.readBytes()).toBeLessThanOrEqual(64 * 1024);
    expect(large.cancelled()).toBe(true);
    expect(String(entries[0]?.reason)).toMatch(/too large \(more than 1000 bytes\)/);
    expect(await readdir(dir)).toEqual([]);
  });

  it('saves a picture of exactly the limit', async () => {
    const { cache, entries } = cacheWith(() => Promise.resolve(response('x'.repeat(1000))), {
      maxBytes: 1000,
    });
    const file = await cache.get(request());
    expect((await readFile(file ?? '', 'utf8')).length).toBe(1000);
    expect(entries).toEqual([]);
  });

  it('lets go of the body of an answer it does not take', async () => {
    for (const refused of [
      response('<html>a long page</html>', { status: 403 }),
      response('<html>', { headers: { 'content-type': 'text/html' } }),
      response('error picture', { headers: { 'x-warning': 'over quota' } }),
    ]) {
      const { cache } = cacheWith(() => Promise.resolve(refused));
      const refuse = (answer: ImageResponse) => answer.headers.get('x-warning') ?? undefined;
      expect(await cache.get(request({ refuse }))).toBeUndefined();
      expect(refused.readBytes()).toBe(0);
      expect(refused.cancelled()).toBe(true);
    }
  });

  it('asks what a download costs before it, never for a picture on disk, and downloads none that is refused', async () => {
    const { cache, entries } = cacheWith(() => Promise.resolve(response()));
    let asked = 0;
    let allowed = true;
    const spend = (): Promise<boolean> => {
      asked += 1;
      return Promise.resolve(allowed);
    };
    const file = await cache.get(request({ spend }));
    expect(file).toBeDefined();
    expect(asked).toBe(1);
    // Served from disk: nothing is spent.
    expect(await cache.get(request({ spend }))).toBe(file);
    expect(asked).toBe(1);
    // Refused: no download, no file, and nothing to warn of (the refusal is the spender's).
    allowed = false;
    expect(await cache.get(request({ id: '13', spend }))).toBeUndefined();
    expect(asked).toBe(2);
    expect(calls).toHaveLength(1);
    expect(entries).toEqual([]);
    // Two requests for one picture at once share its download, and what it costs.
    allowed = true;
    await Promise.all([
      cache.get(request({ id: '14', spend })),
      cache.get(request({ id: '14', spend })),
    ]);
    expect(asked).toBe(3);
  });

  it('tries again after a failure', async () => {
    let attempt = 0;
    const { cache } = cacheWith(() =>
      ++attempt === 1 ? Promise.reject(new Error('down')) : Promise.resolve(response()),
    );
    expect(await cache.get(request())).toBeUndefined();
    expect(await cache.get(request())).toBeDefined();
  });

  it('gives up on a download that takes too long', async () => {
    const timeouts = fakeTimeoutSignals();
    const { cache, entries } = cacheWith(
      (_url, init) =>
        new Promise<ImageResponse>((_resolve, reject) => {
          if (init.signal.aborted) reject(new Error('aborted'));
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      { timeoutMs: 20 },
    );
    const getting = cache.get(request());
    await timeouts.made.reached(1);
    timeouts.expire();
    expect(await getting).toBeUndefined();
    expect(String(entries[0]?.reason)).toBe('timed out after 20 ms');
  });

  it('lets the caller refuse a response', async () => {
    const { cache, entries } = cacheWith(() =>
      Promise.resolve(response('error picture', { headers: { 'x-warning': 'over quota' } })),
    );
    const refuse = (answer: ImageResponse) => answer.headers.get('x-warning') ?? undefined;
    expect(await cache.get(request({ refuse }))).toBeUndefined();
    expect(entries[0]?.reason).toBe('over quota');
    expect(await readdir(dir)).toEqual([]);
  });

  it('never logs the address, not even when the failure quotes it', async () => {
    const { cache, entries } = cacheWith(() =>
      Promise.reject(new Error(`request to ${SECRET_URL} failed`)),
    );
    expect(await cache.get(request())).toBeUndefined();
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain('SECRET-KEY');
    expect(entries[0]?.reason).toBe('request to (address) failed');
  });

  it('strips a key from a failure that quotes only part of the address', async () => {
    const { cache, entries } = cacheWith(() =>
      Promise.reject(new Error('bad request: size=1&key=SECRET&zoom=3')),
    );
    expect(await cache.get(request())).toBeUndefined();
    expect(JSON.stringify(entries)).not.toContain('SECRET');
    expect(entries[0]?.reason).toBe('bad request: size=1&key=…&zoom=3');
  });

  it('answers undefined and warns once when the picture cannot be saved', async () => {
    const blocker = path.join(dir, 'not-a-folder');
    await writeFile(blocker, 'a file where the cache folder should be');
    const log = createTestLogger();
    const cache = new ImageCache({
      dir: blocker,
      fetch: () => Promise.resolve(response()),
      log: log.log,
    });
    expect(await cache.get(request())).toBeUndefined();
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ level: 40, msg: 'could not save a picture' });
  });

  /** A rename that is refused with these codes, in turn, before it is really done. */
  function refusing(codes: string[]) {
    const attempts: string[] = [];
    const log = createTestLogger();
    const cache = new ImageCache({
      dir,
      fetch: () => Promise.resolve(response('saved')),
      log: log.log,
      // The pause between tries is a real timer: none here.
      renamePauseMs: 0,
      rename: async (from, to) => {
        const code = codes[attempts.length];
        attempts.push(path.basename(to));
        if (code !== undefined) throw Object.assign(new Error(`${code}: rename`), { code });
        await rename(from, to);
      },
    });
    return { cache, attempts, entries: log.entries };
  }

  it.each(['EPERM', 'EBUSY', 'EACCES'])(
    'tries the rename again when Windows refuses it with %s',
    async (code) => {
      const { cache, attempts, entries } = refusing([code, code]);
      const file = (await cache.get(request())) ?? '';
      expect(await readFile(file, 'utf8')).toBe('saved');
      expect(attempts).toHaveLength(3);
      expect(entries).toEqual([]);
      expect(await readdir(path.join(dir, 'gyms'))).toEqual([path.basename(file)]);
    },
  );

  it('gives up on a rename that is refused every time, and leaves no temporary file', async () => {
    const { cache, attempts, entries } = refusing(Array<string>(20).fill('EPERM'));
    expect(await cache.get(request())).toBeUndefined();
    expect(attempts).toHaveLength(5);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 40, msg: 'could not save a picture' });
    expect(await readdir(path.join(dir, 'gyms'))).toEqual([]);
  });

  it('does not try a rename again that fails for another reason', async () => {
    const { cache, attempts, entries } = refusing(['ENOSPC']);
    expect(await cache.get(request())).toBeUndefined();
    expect(attempts).toHaveLength(1);
    expect(entries).toHaveLength(1);
  });

  it('keeps the variant out of the file name', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    const file = await cache.get(request({ variant: '../../etc/passwd?key=abc' }));
    expect(path.dirname(file ?? '')).toBe(path.resolve(dir, 'gyms'));
    expect(path.basename(file ?? '')).toMatch(/^12\.[0-9a-f]{12}\.png$/);
  });

  it.each([
    ['folder', { folder: '../gyms' }],
    ['folder', { folder: 'Gyms' }],
    ['folder', { folder: '' }],
    ['id', { id: '../12' }],
    ['id', { id: '1/2' }],
    ['id', { id: '12.png' }],
    ['id', { id: '' }],
  ] as [string, Partial<ImageRequest>][])(
    'refuses a %s that is not a plain name',
    (_what, more) => {
      const { cache } = cacheWith(() => Promise.resolve(response()));
      expect(() => cache.get(request(more))).toThrow(RangeError);
      expect(calls).toEqual([]);
    },
  );
});

describe('ImageCache.removeOlder', () => {
  it('writes the time anew of a picture asked for with touch, so that it is not removed', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    const ask = request({ folder: 'places', id: 'a', touch: true });
    const file = await cache.get(ask);
    const dayAgo = (Date.now() - 86_400_000 - 60_000) / 1000;
    await utimes(file ?? '', dayAgo, dayAgo);
    expect(await cache.get(ask)).toBe(file);
    expect(calls).toHaveLength(1);
    expect(await cache.removeOlder('places', Date.now() - 86_400_000)).toBe(0);
    // Without touch a picture served from disk keeps its time.
    await utimes(file ?? '', dayAgo, dayAgo);
    await cache.get({ ...ask, touch: undefined });
    expect(await cache.removeOlder('places', Date.now() - 86_400_000)).toBe(1);
  });

  it('deletes the pictures of a folder last written before the time given, and no others', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    const old = await cache.get(request({ folder: 'places', id: 'a' }));
    const fresh = await cache.get(request({ folder: 'places', id: 'b' }));
    const gym = await cache.get(request({ id: 'c' }));
    const dayAgo = (Date.now() - 86_400_000 - 60_000) / 1000;
    for (const file of [old, gym]) await utimes(file ?? '', dayAgo, dayAgo);
    expect(await cache.removeOlder('places', Date.now() - 86_400_000)).toBe(1);
    expect(await readdir(path.join(dir, 'places'))).toEqual([path.basename(fresh ?? '')]);
    expect(await readdir(path.join(dir, 'gyms'))).toEqual([path.basename(gym ?? '')]);
    expect(await cache.removeOlder('missing', Date.now())).toBe(0);
    await expect(cache.removeOlder('../x', Date.now())).rejects.toThrow(RangeError);
  });
});

describe('ImageCache.clear', () => {
  it('deletes the pictures of one folder or of all', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    await cache.get(request());
    await cache.get(request({ id: '13' }));
    await cache.get(request({ folder: 'regions' }));
    await writeFile(path.join(dir, 'gyms', 'notes.txt'), 'kept');

    expect(await cache.clear('gyms')).toBe(2);
    expect(await readdir(path.join(dir, 'gyms'))).toEqual(['notes.txt']);
    expect(await readdir(path.join(dir, 'regions'))).toHaveLength(1);

    expect(await cache.clear()).toBe(1);
    expect(await readdir(path.join(dir, 'regions'))).toEqual([]);
    expect(await cache.clear()).toBe(0);
  });

  it('answers 0 when nothing was ever cached, and refuses a folder that is not a plain name', async () => {
    const { log } = createTestLogger();
    const cache = new ImageCache({
      dir: path.join(dir, 'missing'),
      fetch: () => Promise.reject(new Error('unused')),
      log,
    });
    expect(await cache.clear()).toBe(0);
    expect(await cache.clear('gyms')).toBe(0);
    await expect(cache.clear('../gyms')).rejects.toThrow(RangeError);
  });

  it('downloads again after clearing', async () => {
    const { cache } = cacheWith(() => Promise.resolve(response()));
    await cache.get(request());
    await cache.clear();
    expect(await cache.get(request())).toBeDefined();
    expect(calls).toHaveLength(2);
  });
});
