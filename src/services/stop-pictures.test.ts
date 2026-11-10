import { getEventListeners } from 'node:events';
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { bytesResponse } from '../../test/support/responses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
import { PINE_USER_AGENT } from './research-task-service.js';
import {
  FAILED_AGAIN_MS,
  MAX_PICTURE_BYTES,
  PREPARE_DEADLINE_MS,
  RENEW_MS,
  StopPictures,
  type FetchPicture,
} from './stop-pictures.js';

const PUBLIC = 'https://map.example.test';
const LARVITAR = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm246.icon.png';
const GIBLE = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm443.icon.png';
const CANDY = 'https://cdn.leekduck.com/assets/img/items/Rare%20Candy.png';
const DAY = 24 * 60 * 60_000;

/** A picture of this size, opaque red (or `colour`): what Leek Duck sends, not square. */
function png(width: number, height: number, red = 255): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: red, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

/** A download that answers a picture of this size. */
async function pngAnswer(width: number, height: number, red = 255) {
  return {
    ...bytesResponse(await png(width, height, red), { headers: { 'content-type': 'image/png' } }),
    ok: true,
  };
}

/** A download answering `status`, as Leek Duck answers a picture it does not have. */
function failing(status: number): ReturnType<FetchPicture> {
  return Promise.resolve({ ...bytesResponse(new Uint8Array(0), { status }), ok: false });
}

/**
 * A download held until `release()` (a picture of 40 by 60 by `red`), refused as `fetch` refuses
 * it when its signal aborts; `asked` resolves when it was asked for.
 */
function held(red = 255) {
  let release!: () => void;
  let wasAsked!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const asked = new Promise<void>((resolve) => {
    wasAsked = resolve;
  });
  const answer = (_url: string, signal: AbortSignal): ReturnType<FetchPicture> => {
    wasAsked();
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('This operation was aborted', 'AbortError'));
      });
      void released.then(() => resolve(pngAnswer(40, 60, red)));
    });
  };
  return { answer, release, asked };
}

/** `setTimeout` faked for this test (the deadline of `prepare`). */
function fakeTimers(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
}

/** A folder of its own, removed when the test is over. */
function folder(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'pine-pictures-'));
  onTestFinished(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  });
  return dir;
}

interface Asked {
  url: string;
  headers: Record<string, string>;
  redirect: string;
}

/**
 * A `StopPictures` over a folder, at `clock.now`, its downloads answered by `answer` (a picture
 * of 40 by 60 by default); `asked` the downloads it made.
 */
function picturesWith(
  options: {
    dir?: string;
    publicUrl?: string | undefined;
    answer?: (url: string, signal: AbortSignal) => ReturnType<FetchPicture>;
    maxPictures?: number;
    memoryBytes?: number;
  } = {},
) {
  const { log, entries } = createTestLogger();
  const clock = { now: Date.UTC(2026, 9, 23, 12) };
  const asked: Asked[] = [];
  const dir = options.dir ?? folder();
  const answer = options.answer ?? (() => pngAnswer(40, 60));
  const publicUrl = 'publicUrl' in options ? options.publicUrl : PUBLIC;
  const pictures = new StopPictures({
    settings: {
      web:
        publicUrl === undefined
          ? undefined
          : { port: 8080, host: '127.0.0.1', publicUrl, trustProxy: false, tiles: 'osm' },
    },
    folder: dir,
    fetch: (url, init) => {
      asked.push({ url, headers: init.headers, redirect: init.redirect });
      return answer(url, init.signal);
    },
    log,
    now: () => clock.now,
    ...(options.maxPictures === undefined ? {} : { maxPictures: options.maxPictures }),
    ...(options.memoryBytes === undefined ? {} : { memoryBytes: options.memoryBytes }),
  });
  return { pictures, clock, asked, dir, entries };
}

const served = /^https:\/\/map\.example\.test\/pictures\/([0-9a-f]{32})\.png\?v=([0-9a-f]{8})$/;

/** The key and version of a served address; throws for any other. */
function servedAs(url: string | undefined): { key: string; version: string } {
  const match = served.exec(url ?? '');
  if (!match?.[1] || !match[2]) throw new Error(`not a served picture: ${String(url)}`);
  return { key: match[1], version: match[2] };
}

describe('StopPictures (plan 8R-6)', () => {
  it('pads a feed’s picture to a square with transparent edges, unscaled, and names it once the web server listens', async () => {
    const { pictures, asked } = picturesWith();
    await pictures.start();
    await pictures.prepare([LARVITAR]);
    expect(asked).toEqual([
      {
        url: LARVITAR,
        headers: { Accept: 'image/*', 'User-Agent': PINE_USER_AGENT },
        redirect: 'error',
      },
    ]);
    // Before the web server listens: the feed's own address.
    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
    pictures.serving();
    const { key } = servedAs(pictures.url(LARVITAR));
    // The key is a hash of the source, never the address itself.
    expect(pictures.url(LARVITAR)).not.toContain('leekduck');
    const bytes = await pictures.read(key);
    if (!bytes) throw new Error('no picture');
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([60, 60, 4]);
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    // Ten columns of transparency each side of the 40 wide picture, which is whole.
    expect([alpha(0, 0), alpha(9, 30), alpha(50, 30), alpha(59, 59)]).toEqual([0, 0, 0, 0]);
    expect([alpha(10, 0), alpha(49, 59), alpha(30, 30)]).toEqual([255, 255, 255]);
  });

  it('gives the feed’s address while a picture is not ready, and for one never asked for', async () => {
    const { pictures } = picturesWith();
    pictures.serving();
    expect(pictures.url(GIBLE)).toBe(GIBLE);
    expect(pictures.url(ENCOUNTER_PICTURE)).toBe(ENCOUNTER_PICTURE);
    expect(await pictures.read('0'.repeat(32))).toBeUndefined();
  });

  it('fetches nothing and names the feed’s address without a public address', async () => {
    for (const publicUrl of [undefined, 'http://localhost:8080']) {
      const { pictures, asked } = picturesWith({ publicUrl });
      pictures.serving();
      await pictures.prepare([LARVITAR]);
      expect(asked, String(publicUrl)).toEqual([]);
      expect(pictures.url(LARVITAR)).toBe(LARVITAR);
    }
  });

  it('fetches only from the hosts the feeds’ checks allow', async () => {
    const { pictures, asked } = picturesWith();
    pictures.serving();
    const elsewhere = 'https://pictures.example.test/pm246.png';
    await pictures.prepare([elsewhere, 'http://cdn.leekduck.com/x.png', ENCOUNTER_PICTURE]);
    expect(asked.map((one) => one.url)).toEqual([ENCOUNTER_PICTURE]);
    expect(pictures.url(elsewhere)).toBe(elsewhere);
    servedAs(pictures.url(ENCOUNTER_PICTURE));
  });

  it('asks once for a picture asked for twice at once', async () => {
    const { pictures, asked } = picturesWith();
    await Promise.all([pictures.prepare([GIBLE, GIBLE]), pictures.prepare([GIBLE])]);
    expect(asked).toHaveLength(1);
  });

  it('refuses a picture too large, one that is no picture, and one of too many pixels, and remembers the failure for a while', async () => {
    const big = await png(10, 10);
    const answers: Record<string, () => ReturnType<FetchPicture>> = {
      [LARVITAR]: () =>
        Promise.resolve({
          ...bytesResponse(new Uint8Array(MAX_PICTURE_BYTES + 1), {
            headers: { 'content-type': 'image/png' },
          }),
          ok: true,
        }),
      [GIBLE]: () =>
        Promise.resolve({
          ...bytesResponse(new TextEncoder().encode('<html>'), {
            headers: { 'content-type': 'text/html' },
          }),
          ok: true,
        }),
      [CANDY]: async () => ({
        ...bytesResponse(await png(5_000, 5_000), { headers: { 'content-type': 'image/png' } }),
        ok: true,
      }),
      [ENCOUNTER_PICTURE]: () =>
        Promise.resolve({ ...bytesResponse(big, { status: 503 }), ok: false }),
    };
    const { pictures, asked, clock, entries } = picturesWith({
      answer: (url) => answers[url]!(),
    });
    pictures.serving();
    const all = [LARVITAR, GIBLE, CANDY, ENCOUNTER_PICTURE];
    await pictures.prepare(all);
    expect(all.map((url) => pictures.url(url))).toEqual(all);
    expect(asked).toHaveLength(4);
    expect(entries.filter((entry) => entry.msg === 'could not make a picture square')).toHaveLength(
      4,
    );
    // An outage of Leek Duck is not tried again on every redraw.
    clock.now += FAILED_AGAIN_MS - 1;
    await pictures.prepare(all);
    expect(asked).toHaveLength(4);
    clock.now += 1;
    await pictures.prepare([LARVITAR]);
    expect(asked).toHaveLength(5);
  });

  it('reads what it made back from its folder after a restart, without fetching it again', async () => {
    const first = picturesWith();
    await first.pictures.start();
    await first.pictures.prepare([LARVITAR]);
    first.pictures.serving();
    const before = first.pictures.url(LARVITAR);
    const again = picturesWith({ dir: first.dir });
    await again.pictures.start();
    again.pictures.serving();
    expect(again.pictures.url(LARVITAR)).toBe(before);
    await again.pictures.prepare([LARVITAR]);
    expect(again.asked).toEqual([]);
    expect(await again.pictures.read(servedAs(before).key)).toBeInstanceOf(Buffer);
  });

  it('leaves out what is no picture of its own in its folder', async () => {
    const dir = folder();
    writeFileSync(path.join(dir, 'notes.png'), 'not mine');
    writeFileSync(path.join(dir, `${'a'.repeat(32)}.png.123.tmp`), 'left over');
    const { pictures } = picturesWith({ dir });
    await pictures.start();
    expect(await pictures.read('notes')).toBeUndefined();
    expect(readdirSync(dir)).toEqual(['notes.png']);
  });

  it('fetches a picture again after seven days, a new version where it changed, and keeps the old one where the fetch fails', async () => {
    let red = 255;
    let fails = false;
    const { pictures, asked, clock, dir } = picturesWith({
      answer: async () =>
        fails
          ? Promise.reject(new Error('Leek Duck is down'))
          : {
              ...bytesResponse(await png(40, 60, red), {
                headers: { 'content-type': 'image/png' },
              }),
              ok: true,
            },
    });
    pictures.serving();
    await pictures.prepare([GIBLE]);
    const first = servedAs(pictures.url(GIBLE));
    clock.now += RENEW_MS - 1;
    await pictures.prepare([GIBLE]);
    expect(asked).toHaveLength(1);
    clock.now += 1;
    red = 128;
    // Fetched again in the background: the old one is served meanwhile.
    await pictures.prepare([GIBLE]);
    await pictures.idle();
    expect(asked).toHaveLength(2);
    const renewed = servedAs(pictures.url(GIBLE));
    expect(renewed.key).toBe(first.key);
    expect(renewed.version).not.toBe(first.version);
    clock.now += RENEW_MS;
    fails = true;
    await pictures.prepare([GIBLE]);
    await pictures.idle();
    expect(asked).toHaveLength(3);
    expect(pictures.url(GIBLE)).toBe(`${PUBLIC}/pictures/${renewed.key}.png?v=${renewed.version}`);
    // After a restart, the file's time says when it was made.
    const file = path.join(dir, `${first.key}.png`);
    const old = new Date(clock.now - 2 * RENEW_MS);
    utimesSync(file, old, old);
    const again = picturesWith({ dir });
    again.clock.now = clock.now;
    await again.pictures.start();
    await again.pictures.prepare([GIBLE]);
    await again.pictures.idle();
    expect(again.asked).toHaveLength(1);
  });

  describe('its pictures in memory (plan 8Z-2)', () => {
    /** A gate that says `allowed`, counting how often it was asked. */
    const gate = (allowed: boolean) => {
      const asked = { times: 0 };
      const mayCost = () => {
        asked.times += 1;
        return allowed;
      };
      return { asked, mayCost };
    };

    it('reads a picture from its folder once, and answers it from memory after', async () => {
      const { pictures, dir } = picturesWith();
      pictures.serving();
      await pictures.prepare([LARVITAR]);
      const { key } = servedAs(pictures.url(LARVITAR));
      const open = gate(true);
      const first = await pictures.read(key, open.mayCost);
      expect(first).toBeInstanceOf(Buffer);
      expect(open.asked.times).toBe(1);
      // The file is gone: the bytes in memory answer, and nothing is asked of the gate.
      rmSync(path.join(dir, `${key}.png`));
      const shut = gate(false);
      expect(await pictures.read(key, shut.mayCost)).toEqual(first);
      expect(await pictures.read(key)).toEqual(first);
      expect(shut.asked.times).toBe(0);
    });

    it('reads nothing from its folder where the gate refuses, and asks it of no key it never made', async () => {
      const { pictures } = picturesWith();
      pictures.serving();
      await pictures.prepare([LARVITAR]);
      const { key } = servedAs(pictures.url(LARVITAR));
      const shut = gate(false);
      expect(await pictures.read('ab'.repeat(16), shut.mayCost)).toBeUndefined();
      expect(shut.asked.times).toBe(0);
      expect(await pictures.read(key, shut.mayCost)).toBe('refused');
      expect(shut.asked.times).toBe(1);
      // Refused is not kept: the next one allowed reads it.
      expect(await pictures.read(key, gate(true).mayCost)).toBeInstanceOf(Buffer);
    });

    it('forgets a picture made anew, and one that left the index', async () => {
      let red = 255;
      const { pictures, clock } = picturesWith({
        maxPictures: 1,
        answer: async () => ({
          ...bytesResponse(await png(40, 60, red), { headers: { 'content-type': 'image/png' } }),
          ok: true,
        }),
      });
      pictures.serving();
      await pictures.prepare([GIBLE]);
      const { key } = servedAs(pictures.url(GIBLE));
      const old = await pictures.read(key);
      clock.now += RENEW_MS;
      red = 128;
      await pictures.prepare([GIBLE]);
      await pictures.idle();
      const renewed = await pictures.read(key);
      expect(renewed).toBeInstanceOf(Buffer);
      expect(renewed).not.toEqual(old);
      // Another takes its place in the index: its key is none of the service's any more.
      clock.now += DAY;
      await pictures.prepare([CANDY]);
      await pictures.idle();
      expect(await pictures.read(key)).toBeUndefined();
    });

    it('keeps at most so many bytes in memory, the oldest read first out', async () => {
      const { pictures, dir } = picturesWith({ memoryBytes: 1 });
      pictures.serving();
      await pictures.prepare([LARVITAR]);
      const { key } = servedAs(pictures.url(LARVITAR));
      expect(await pictures.read(key)).toBeInstanceOf(Buffer);
      // Larger than the whole bound: not kept, so the folder is read again.
      rmSync(path.join(dir, `${key}.png`));
      expect(await pictures.read(key)).toBeUndefined();
    });
  });

  it('keeps at most so many pictures, the oldest deleted from its folder first', async () => {
    const { pictures, dir, clock } = picturesWith({ maxPictures: 2 });
    pictures.serving();
    await pictures.prepare([LARVITAR]);
    clock.now += DAY;
    await pictures.prepare([GIBLE]);
    clock.now += DAY;
    await pictures.prepare([CANDY]);
    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
    servedAs(pictures.url(GIBLE));
    servedAs(pictures.url(CANDY));
    await pictures.idle();
    expect(readdirSync(dir).filter((name) => name.endsWith('.png'))).toHaveLength(2);
    // Read back with the same bound, a fuller folder keeps its newest.
    const again = picturesWith({ dir, maxPictures: 1 });
    await again.pictures.start();
    again.pictures.serving();
    expect(readdirSync(dir).filter((name) => name.endsWith('.png'))).toHaveLength(1);
    servedAs(again.pictures.url(CANDY));
  });

  it('returns from prepare at its deadline while a fetch hangs, names the feed’s address meanwhile, and the picture once it lands', async () => {
    const download = held();
    const { pictures } = picturesWith({ answer: download.answer });
    pictures.serving();
    fakeTimers();
    let done = false;
    const preparing = pictures.prepare([LARVITAR]).then(() => {
      done = true;
    });
    await download.asked;
    await vi.advanceTimersByTimeAsync(PREPARE_DEADLINE_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    await preparing;
    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
    // It goes on in the background: the next redraw names the square picture.
    download.release();
    await pictures.idle();
    servedAs(pictures.url(LARVITAR));
  });

  it('serves a picture older than seven days at once while it is fetched again', async () => {
    const renewal = held(128);
    let renewing = false;
    const { pictures, clock } = picturesWith({
      answer: (url, signal) => (renewing ? renewal.answer(url, signal) : pngAnswer(40, 60)),
    });
    pictures.serving();
    await pictures.prepare([GIBLE]);
    const first = servedAs(pictures.url(GIBLE));
    clock.now += RENEW_MS;
    renewing = true;
    fakeTimers();
    let done = false;
    const preparing = pictures.prepare([GIBLE]).then(() => {
      done = true;
    });
    await renewal.asked;
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await preparing;
    expect(servedAs(pictures.url(GIBLE))).toEqual(first);
    renewal.release();
    await pictures.idle();
    expect(servedAs(pictures.url(GIBLE)).version).not.toBe(first.version);
  });

  it('aborts a fetch on its way when closed, without remembering it as failed, and prepares nothing afterwards', async () => {
    const download = held();
    const { pictures, asked, entries } = picturesWith({ answer: download.answer });
    pictures.serving();
    const preparing = pictures.prepare([LARVITAR]);
    await download.asked;
    await pictures.close();
    await preparing;
    expect(entries.filter((entry) => entry.msg === 'could not make a picture square')).toEqual([]);
    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
    // After the close: at once, and nothing asked.
    fakeTimers();
    let done = false;
    const after = pictures.prepare([GIBLE]).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await after;
    expect(asked.map((one) => one.url)).toEqual([LARVITAR]);
  });

  it('names no picture for a source that is gone (404 or 410), and the feed’s address for any other failure', async () => {
    const answers: Record<string, () => ReturnType<FetchPicture>> = {
      [LARVITAR]: () => failing(404),
      [GIBLE]: () => failing(410),
      [CANDY]: () => failing(500),
      [ENCOUNTER_PICTURE]: () => Promise.reject(new Error('Leek Duck is down')),
    };
    const { pictures } = picturesWith({ answer: (url) => answers[url]!() });
    const all = [LARVITAR, GIBLE, CANDY, ENCOUNTER_PICTURE];
    await pictures.prepare(all);
    // Before the web server listens the address is named as it is.
    expect(all.map((url) => pictures.url(url))).toEqual(all);
    pictures.serving();
    expect(all.map((url) => pictures.url(url))).toEqual([
      undefined,
      undefined,
      CANDY,
      ENCOUNTER_PICTURE,
    ]);
  });

  it('names no picture once a kept one is gone at its source, and names it again once it is back', async () => {
    let status = 200;
    const { pictures, clock } = picturesWith({
      answer: () => (status === 200 ? pngAnswer(40, 60) : failing(status)),
    });
    pictures.serving();
    await pictures.prepare([GIBLE]);
    servedAs(pictures.url(GIBLE));
    clock.now += RENEW_MS;
    status = 404;
    await pictures.prepare([GIBLE]);
    await pictures.idle();
    expect(pictures.url(GIBLE)).toBeUndefined();
    clock.now += FAILED_AGAIN_MS;
    status = 200;
    await pictures.prepare([GIBLE]);
    await pictures.idle();
    servedAs(pictures.url(GIBLE));
  });

  it('refuses a picture larger than 1024 on a side, and one that is no png, jpeg, webp or gif', async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>',
    );
    const answers: Record<string, () => ReturnType<FetchPicture>> = {
      [LARVITAR]: () => pngAnswer(1025, 10),
      [GIBLE]: () =>
        Promise.resolve({
          ...bytesResponse(svg, { headers: { 'content-type': 'image/svg+xml' } }),
          ok: true,
        }),
      [CANDY]: () => pngAnswer(1024, 10),
    };
    const { pictures, entries } = picturesWith({ answer: (url) => answers[url]!() });
    pictures.serving();
    await pictures.prepare([LARVITAR, GIBLE, CANDY]);
    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
    expect(pictures.url(GIBLE)).toBe(GIBLE);
    servedAs(pictures.url(CANDY));
    expect(
      entries
        .filter((entry) => entry.msg === 'could not make a picture square')
        .map((entry) => String(entry.source))
        .sort(),
    ).toEqual([LARVITAR, GIBLE].sort());
  });

  it('with the index full, makes room for a picture that lands by one picture only, never one being fetched again', async () => {
    const renewal = held(128);
    let renewing = false;
    const { pictures, clock, dir } = picturesWith({
      maxPictures: 2,
      answer: (url, signal) =>
        url === LARVITAR && renewing ? renewal.answer(url, signal) : pngAnswer(40, 60),
    });
    pictures.serving();
    await pictures.prepare([LARVITAR]);
    clock.now += DAY;
    await pictures.prepare([GIBLE]);
    const larvitar = servedAs(pictures.url(LARVITAR));
    // Larvitar is fetched again while Rare Candy lands: Gible makes room, not Larvitar.
    clock.now += RENEW_MS - DAY;
    renewing = true;
    await pictures.prepare([LARVITAR]);
    await renewal.asked;
    await pictures.prepare([CANDY]);
    expect(pictures.url(GIBLE)).toBe(GIBLE);
    expect(servedAs(pictures.url(LARVITAR))).toEqual(larvitar);
    servedAs(pictures.url(CANDY));
    renewal.release();
    await pictures.idle();
    expect(servedAs(pictures.url(LARVITAR)).version).not.toBe(larvitar.version);
    servedAs(pictures.url(CANDY));
    const files = readdirSync(dir).filter((name) => name.endsWith('.png'));
    expect(files.sort()).toEqual(
      [servedAs(pictures.url(LARVITAR)).key, servedAs(pictures.url(CANDY)).key]
        .map((key) => `${key}.png`)
        .sort(),
    );
  });

  it('with the index full, keeps exactly the two pictures that land together', async () => {
    const candy = held();
    const encounter = held();
    const { pictures, clock, dir } = picturesWith({
      maxPictures: 2,
      answer: (url, signal) =>
        url === CANDY
          ? candy.answer(url, signal)
          : url === ENCOUNTER_PICTURE
            ? encounter.answer(url, signal)
            : pngAnswer(40, 60),
    });
    pictures.serving();
    await pictures.prepare([LARVITAR]);
    clock.now += DAY;
    await pictures.prepare([GIBLE]);
    clock.now += DAY;
    const preparing = pictures.prepare([CANDY, ENCOUNTER_PICTURE]);
    await Promise.all([candy.asked, encounter.asked]);
    candy.release();
    encounter.release();
    await preparing;
    await pictures.idle();
    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
    expect(pictures.url(GIBLE)).toBe(GIBLE);
    const kept = [CANDY, ENCOUNTER_PICTURE].map((url) => `${servedAs(pictures.url(url)).key}.png`);
    expect(readdirSync(dir).sort()).toEqual(kept.sort());
  });

  it('leaves nothing listening on its shutdown signal once prepare returned, however often it is called', async () => {
    const { pictures, clock } = picturesWith();
    pictures.serving();
    // The shutdown signal is private: its listeners are what leaked (nodejs/node#17469).
    const { signal } = (pictures as unknown as { stopping: AbortController }).stopping;
    for (let call = 0; call < 50; call += 1) {
      // Every tenth call renews the pictures; the others find them kept.
      if (call % 10 === 0) clock.now += RENEW_MS;
      await pictures.prepare([LARVITAR, GIBLE]);
      await pictures.idle();
    }
    expect(getEventListeners(signal, 'abort')).toEqual([]);
  });

  it('returns from prepare at once when closed, though a fetch does not heed the abort', async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let wasAsked!: () => void;
    const asked = new Promise<void>((resolve) => {
      wasAsked = resolve;
    });
    const { pictures } = picturesWith({
      answer: () => {
        wasAsked();
        return released.then(() => pngAnswer(40, 60));
      },
    });
    pictures.serving();
    fakeTimers();
    let done = false;
    const preparing = pictures.prepare([LARVITAR]).then(() => {
      done = true;
    });
    await asked;
    const closing = pictures.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await preparing;
    release();
    await closing;
    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
  });

  // Branch review W5 of 8M-9B: a list's pictures made in the background (a task list read, the
  // lineups) never hold up the pictures a post or a DM waits for.
  describe('a list’s pictures made in the background', () => {
    /** Six pictures of a list, Leek Duck's. */
    const LIST = [1, 2, 3, 4, 5, 6].map(
      (dex) => `https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm${String(dex)}.icon.png`,
    );

    /**
     * Pictures whose list's downloads are held until `release()`, any other answered at once;
     * `asked(url)` resolves once that address was asked for, `wasAsked(url)` says whether it was.
     */
    function listHeld(free: ReadonlySet<string> = new Set()) {
      const download = held();
      const seen = new Set<string>();
      const waiters = new Map<string, () => void>();
      const made = picturesWith({
        answer: (url, signal) => {
          seen.add(url);
          waiters.get(url)?.();
          return LIST.includes(url) && !free.has(url)
            ? download.answer(url, signal)
            : pngAnswer(40, 60);
        },
      });
      made.pictures.serving();
      const asked = (url: string) =>
        seen.has(url)
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              waiters.set(url, resolve);
            });
      return { ...made, download, asked, wasAsked: (url: string) => seen.has(url) };
    }

    it('makes a post’s picture at once, within its deadline, while the list’s are on their way', async () => {
      const { pictures, download, asked, wasAsked } = listHeld();
      fakeTimers();
      void pictures.prepare(LIST, { background: true });
      await download.asked;
      let landed = false;
      const post = pictures.prepare([GIBLE]).then(() => {
        landed = true;
      });
      // Short of the deadline: the post's picture is asked for at once, not behind the list's.
      await Promise.race([asked(GIBLE), vi.advanceTimersByTimeAsync(PREPARE_DEADLINE_MS - 1)]);
      expect(wasAsked(GIBLE)).toBe(true);
      await post;
      expect(landed).toBe(true);
      servedAs(pictures.url(GIBLE));
      download.release();
      await pictures.idle();
      for (const source of LIST) servedAs(pictures.url(source));
    });

    it('moves a picture of the list a post waits for ahead of the rest of the list', async () => {
      const last = LIST.at(-1) ?? '';
      const { pictures, download, asked, wasAsked } = listHeld(new Set([last]));
      fakeTimers();
      void pictures.prepare(LIST, { background: true });
      await download.asked;
      const post = pictures.prepare([last]);
      await Promise.race([asked(last), vi.advanceTimersByTimeAsync(PREPARE_DEADLINE_MS - 1)]);
      expect(wasAsked(last)).toBe(true);
      await post;
      servedAs(pictures.url(last));
      download.release();
      await pictures.idle();
    });
  });
});
